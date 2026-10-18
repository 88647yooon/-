// 감사 기록 조회 (FR-20, FR-23, BR-09, NFR-03) — 관리 활동·중요 상태 변경 기록 검색·상세·CSV 내보내기, 권한 거부 기록.
// 데이터는 단계 1부터 모든 서비스가 auditService로 남긴 MongoDB 기록이다.
const ActivityLog = require('../models/mongo/ActivityLog');
const SecurityEvent = require('../models/mongo/SecurityEvent');
const P = require('./presenters');
const { actionLabel } = require('../config/actions');
const { notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { isObjectId, contains, periodFilter, findPage } = require('../utils/mongo');

const EXPORT_LIMIT = 5000;

function filterOf({ actorId, action, targetEntity, targetId, from, to, q }) {
  return {
    ...(actorId && { 'actor.userId': actorId }),
    ...(action && { action }),
    ...(targetEntity && { 'target.entity': targetEntity }),
    ...(targetId && { 'target.id': targetId }),
    ...periodFilter('createdAt', from, to),
    ...(q && { $or: [{ 'target.label': contains(q) }, { reason: contains(q) }, { 'actor.username': contains(q) }] }),
  };
}

const sortOf = (sort) => (sort === 'createdAt' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 });

// #176 감사 기록 검색 (행위자, 행위, 대상 유형·ID, 기간, 검색어). 목록에는 변경 전후 값을 빼고 상세에서 보여 준다.
async function search(actor, { sort, ...query }) {
  const { docs, total } = await findPage(ActivityLog, filterOf(query), { ...query, sort: sortOf(sort) });
  return { data: docs.map((d) => P.presentActivityLog(d, { withChanges: false })), meta: pageMeta(query, total) };
}

// #177 감사 기록 상세 (변경 전후 값, IP)
async function get(actor, logId) {
  const d = isObjectId(logId) ? await ActivityLog.findById(logId).lean() : null;
  if (!d) throw notFound(`감사 기록(ID ${logId})을 찾을 수 없습니다.`);
  return P.presentActivityLog(d);
}

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const kst = (date) => new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

// #178 검색 결과를 CSV로 (최대 5000건, 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다)
async function exportCsv(actor, { sort, ...query }) {
  const docs = await ActivityLog.find(filterOf(query)).sort(sortOf(sort)).limit(EXPORT_LIMIT).lean();
  const header = ['시각(KST)', '행위 코드', '행위', '행위자', '행위자 역할', '대상 유형', '대상 ID', '대상', '사유', '변경 전', '변경 후', 'IP'];
  const lines = docs.map((d) => [
    kst(d.createdAt), d.action, actionLabel(d.action), d.actor?.username, d.actor?.role, d.target?.entity, d.target?.id, d.target?.label,
    d.reason, d.before, d.after, d.ip,
  ].map(csvCell).join(','));
  return { filename: `audit-logs-${kst(new Date()).slice(0, 10)}.csv`, count: docs.length, csv: `﻿${[header.join(','), ...lines].join('\r\n')}\r\n` };
}

// #179 권한 거부(403) 접근 시도 기록 (사용자, 기간, 경로 검색어)
async function securityEvents(actor, { userId, from, to, q, ...query }) {
  const filter = {
    ...(userId && { 'user.userId': userId }),
    ...periodFilter('createdAt', from, to),
    ...(q && { path: contains(q) }),
  };
  const { docs, total } = await findPage(SecurityEvent, filter, { ...query, sort: { createdAt: -1, _id: -1 } });
  return { data: docs.map(P.presentSecurityEvent), meta: pageMeta(query, total) };
}

module.exports = { search, get, exportCsv, securityEvents };
