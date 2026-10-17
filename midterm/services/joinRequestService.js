// Crew 소속 신청 (FR-06, BR-01, BR-05)
const { withTransaction } = require('../config/database');
const joinRequestModel = require('../models/sql/joinRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const enrollment = require('./enrollment');
const { requireUser, requireCrew } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { REQUEST_STATUS_INFO } = require('../config/constants');
const { forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { userTarget, crewTarget } = auditService;

async function presentMany(rows) {
  const refs = await loadRefs({ userIds: rows.flatMap((r) => [r.userId, r.decidedBy]), crewIds: rows.map((r) => r.crewId) });
  return rows.map((r) => P.presentJoinRequest(r, refs));
}

const presentOne = async (id) => (await presentMany([await joinRequestModel.findById(id)]))[0];

// 경로의 Crew에 속한 신청인지 확인하고, 처리 대기 중이어야 하는 작업이면 상태도 확인한다.
async function requireRequest(crew, requestId, conn, { pending = false } = {}) {
  const request = await joinRequestModel.findById(requestId, conn, { forUpdate: Boolean(conn) });
  if (!request || request.crewId !== crew.id) throw notFound(`'${crew.name}' Crew의 소속 신청(ID ${requestId})을 찾을 수 없습니다.`);
  if (pending && request.status !== 'PENDING') {
    throw conflict(`이미 처리된 신청입니다. (현재 상태: ${REQUEST_STATUS_INFO[request.status].label})`, { status: request.status });
  }
  return request;
}

// #45 소속 신청. 편성과 같은 기준(해산 Crew, 활동중, 소속 가능 역할, 이미 소속, BR-01)으로 미리 검사한다.
async function apply(actor, crewId, { type, message }, ctx) {
  const { crew, requestId } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    const user = await requireUser(actor.id, conn, { forUpdate: true });
    await enrollment.checkEnroll(conn, { crew: c, user, type });
    if (await joinRequestModel.findPending(crewId, actor.id, conn)) {
      throw conflict('이 Crew에 이미 처리 대기 중인 소속 신청이 있습니다.');
    }
    try {
      return { crew: c, requestId: await joinRequestModel.insert({ crewId, userId: actor.id, type, message }, conn) };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('이 Crew에 이미 처리 대기 중인 소속 신청이 있습니다.');
      throw err;
    }
  });
  await auditService.record({
    actor, action: 'JOIN_REQUEST_CREATED', target: userTarget(actor), related: [crewTarget(crew)],
    after: { requestId, crewId, type }, reason: message, ip: ctx.ip,
  });
  return presentOne(requestId);
}

// #46 Crew의 신청 목록 (Capo는 자신이 책임자인 Crew만)
async function listForCrew(actor, crewId, query) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  const { rows, total } = await joinRequestModel.search({ ...query, crewId });
  return { data: await presentMany(rows), meta: pageMeta(query, total) };
}

// #47 승인. 승인 시점에 편성 규칙(BR-01 포함)을 다시 검사한다.
async function approve(actor, crewId, requestId, ctx) {
  const { crew, user, membershipId, request } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    access.assertCanManageCrew(actor, c);
    const r = await requireRequest(c, requestId, conn, { pending: true });
    const u = await requireUser(r.userId, conn, { forUpdate: true });
    const id = await enrollment.enroll(conn, { crew: c, user: u, type: r.type, actor, joinMethod: 'JOIN_REQUEST', note: r.message });
    await joinRequestModel.decide(requestId, { status: 'APPROVED', decidedBy: actor.id, membershipId: id }, conn);
    return { crew: c, user: u, membershipId: id, request: r };
  });
  await auditService.recordMany([
    { actor, action: 'JOIN_REQUEST_APPROVED', target: userTarget(user), related: [crewTarget(crew)], after: { requestId, membershipId }, ip: ctx.ip },
    {
      actor, action: 'MEMBERSHIP_ADDED', target: userTarget(user), related: [crewTarget(crew)],
      after: { crewId: crew.id, type: request.type, joinMethod: 'JOIN_REQUEST' }, ip: ctx.ip,
    },
  ]);
  return presentOne(requestId);
}

// #48 거절 (사유 필수)
async function reject(actor, crewId, requestId, { reason }, ctx) {
  const { crew, request } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn);
    access.assertCanManageCrew(actor, c);
    const r = await requireRequest(c, requestId, conn, { pending: true });
    await joinRequestModel.decide(requestId, { status: 'REJECTED', decidedBy: actor.id, reason }, conn);
    return { crew: c, request: r };
  });
  await auditService.record({
    actor, action: 'JOIN_REQUEST_REJECTED', target: { entity: 'user', id: String(request.userId) }, related: [crewTarget(crew)],
    after: { requestId }, reason, ip: ctx.ip,
  });
  return presentOne(requestId);
}

// #49 신청 취소 (신청자 본인만)
async function cancel(actor, crewId, requestId, ctx) {
  const crew = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn);
    const r = await requireRequest(c, requestId, conn);
    if (r.userId !== actor.id) throw forbidden('본인이 한 신청만 취소할 수 있습니다.');
    if (r.status !== 'PENDING') {
      throw conflict(`이미 처리된 신청입니다. (현재 상태: ${REQUEST_STATUS_INFO[r.status].label})`, { status: r.status });
    }
    await joinRequestModel.decide(requestId, { status: 'CANCELLED', decidedBy: actor.id, reason: '신청자 취소' }, conn);
    return c;
  });
  await auditService.record({
    actor, action: 'JOIN_REQUEST_CANCELLED', target: userTarget(actor), related: [crewTarget(crew)], after: { requestId }, ip: ctx.ip,
  });
  return presentOne(requestId);
}

// #50 내 소속 신청 현황
async function listMine(actor, query) {
  const { rows, total } = await joinRequestModel.search({ ...query, userId: actor.id });
  return { data: await presentMany(rows), meta: pageMeta(query, total) };
}

module.exports = { apply, listForCrew, approve, reject, cancel, listMine };
