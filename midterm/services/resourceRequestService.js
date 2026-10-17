// 자원 사용 신청 (FR-14, FR-17, BR-07, BR-08) — 신청, 목록·상세, 승인(구성원 자원 배정 생성)·거절, 취소
const { withTransaction } = require('../config/database');
const requestModel = require('../models/sql/resourceRequestModel');
const allocationModel = require('../models/sql/resourceAllocationModel');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const rules = require('./resourceRules');
const allocationService = require('./resourceAllocationService');
const { requireResource, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { ROLE_INFO, REQUEST_STATUS_INFO } = require('../config/constants');
const { forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { resourceTarget, userTarget } = auditService;

async function presentRequests(rows) {
  const allocations = await allocationModel.findByRequestIds(rows.map((q) => q.id));
  const byRequest = new Map(allocations.map((a) => [a.requestId, a.id]));
  const refs = await loadRefs({ resourceIds: rows.map((q) => q.resourceId), userIds: rows.flatMap((q) => [q.userId, q.decidedBy]) });
  return rows.map((q) => P.presentResourceRequest(q, refs, byRequest.get(q.id) ?? null));
}

const presentById = async (id) => (await presentRequests([await requestModel.findById(id)]))[0];

async function requireRequest(id, conn, options) {
  const q = await requestModel.findById(id, conn, options);
  if (!q) throw notFound(`자원 사용 신청(ID ${id})을 찾을 수 없습니다.`);
  return q;
}

function assertPending(q) {
  if (q.status !== 'PENDING') throw conflict(`이미 ${REQUEST_STATUS_INFO[q.status].label}된 신청입니다.`, { status: q.status });
}

// 신청을 처리할 수 있는지: Underboss·Boss, 또는 신청자가 자기 Crew 소속원인 Capo (BR-05). 본인 신청은 처리할 수 없다.
async function assertCanReview(actor, q, requester, conn) {
  if (q.userId === actor.id) throw forbidden('본인의 신청은 승인·거절할 수 없습니다.');
  await rules.assertCanManageMemberResources(actor, requester, conn);
}

const requestLog = (actor, action, resource, user, extra, ctx) => ({
  actor, action, target: resourceTarget(resource), related: [userTarget(user)], ...extra, ip: ctx.ip,
});

// #141 자원 사용 신청. 신청할 때도 이용 최소 역할(403), 자원 상태(409 BR-08), 시간 겹침(409 BR-07)을 먼저 확인한다.
async function create(actor, { resourceId, startAt, endAt, reason }, ctx) {
  rules.assertPeriod(startAt, endAt);
  rules.assertNotPast(endAt);
  const resource = await requireResource(resourceId);
  if (!rules.meetsMinRole(actor, resource)) {
    throw forbidden(`'${resource.name}'은 ${ROLE_INFO[resource.minRole].label} 이상만 이용할 수 있는 자원입니다.`, { resourceId, minRole: resource.minRole });
  }
  rules.assertAssignable(resource);
  await rules.assertNoConflict(undefined, resource, { startAt, endAt });
  let id;
  try {
    id = await requestModel.insert({ resourceId, userId: actor.id, startAt, endAt, reason });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('이 자원에 대해 이미 대기 중인 신청이 있습니다. 먼저 그 신청을 취소하세요.', { resourceId }, 'DUPLICATE');
    throw err;
  }
  await auditService.record(requestLog(actor, 'RESOURCE_REQUESTED', resource, actor, { after: { requestId: id, startAt, endAt }, reason }, ctx));
  return presentById(id);
}

// #142 신청 목록: 내 신청(box=mine), 내가 처리할 수 있는 신청(box=review: Capo는 자기 Crew 소속원, Underboss·Boss는 전체). 대기 중인 신청이 먼저 온다.
async function list(actor, { box, ...query }) {
  const reviewAll = access.isOrgManager(actor);
  const reviewCrewId = reviewAll ? null : await taskAccess.capoCrewId(actor);
  const { rows, total } = await requestModel.search({ ...query, box, userId: actor.id, reviewAll, reviewCrewId });
  return { data: await presentRequests(rows), meta: pageMeta(query, total) };
}

// #143 신청 상세 (신청자, 신청자 Crew의 책임자, Underboss·Boss)
async function get(actor, requestId) {
  const q = await requireRequest(requestId);
  if (q.userId !== actor.id && !access.isOrgManager(actor) && !(await access.isInCapoCrew(actor, q.userId))) {
    throw forbidden('신청자, 신청자 Crew의 책임자, Underboss·Boss만 볼 수 있습니다.');
  }
  return presentById(requestId);
}

// #144 승인. 승인 시점에 배정 규칙(최소 역할, BR-08, BR-07)을 다시 검사하고 구성원 자원 배정을 만든다.
async function approve(actor, requestId, { note }, ctx) {
  const { request, user, resource, allocationId } = await withTransaction(async (conn) => {
    const q = await requireRequest(requestId, conn, { forUpdate: true });
    assertPending(q);
    const requester = await requireUser(q.userId, conn, { forUpdate: true });
    await assertCanReview(actor, q, requester, conn);
    const r = await requireResource(q.resourceId, conn, { forUpdate: true });
    if (q.endAt <= new Date()) throw conflict('신청한 시간대가 이미 지났습니다. 거절하거나 신청자가 다시 신청하게 하세요.');
    const id = await allocationService.insertChecked(conn, {
      actor, user: requester, resource: r, startAt: q.startAt, endAt: q.endAt, purpose: q.reason, requestId,
    });
    await requestModel.decide(requestId, { status: 'APPROVED', decidedBy: actor.id, reason: note }, conn);
    return { request: q, user: requester, resource: r, allocationId: id };
  });
  await auditService.recordMany([
    requestLog(actor, 'RESOURCE_REQUEST_APPROVED', resource, user, { before: { status: 'PENDING' }, after: { status: 'APPROVED', allocationId }, reason: note }, ctx),
    requestLog(actor, 'RESOURCE_ALLOCATED', resource, user, { after: { allocationId, userId: user.id, startAt: request.startAt, endAt: request.endAt, requestId } }, ctx),
  ]);
  return presentById(requestId);
}

// #145 거절 (사유 필수)
async function reject(actor, requestId, { reason }, ctx) {
  const { user, resource } = await withTransaction(async (conn) => {
    const q = await requireRequest(requestId, conn, { forUpdate: true });
    assertPending(q);
    const requester = await requireUser(q.userId, conn);
    await assertCanReview(actor, q, requester, conn);
    await requestModel.decide(requestId, { status: 'REJECTED', decidedBy: actor.id, reason }, conn);
    return { user: requester, resource: await requireResource(q.resourceId, conn) };
  });
  await auditService.record(requestLog(actor, 'RESOURCE_REQUEST_REJECTED', resource, user, { before: { status: 'PENDING' }, after: { status: 'REJECTED' }, reason }, ctx));
  return presentById(requestId);
}

// #146 신청 취소 (신청자 본인, 대기 중인 신청만)
async function cancel(actor, requestId, ctx) {
  const { resource } = await withTransaction(async (conn) => {
    const q = await requireRequest(requestId, conn, { forUpdate: true });
    if (q.userId !== actor.id) throw forbidden('본인의 신청만 취소할 수 있습니다.');
    assertPending(q);
    await requestModel.decide(requestId, { status: 'CANCELLED', decidedBy: actor.id }, conn);
    return { resource: await requireResource(q.resourceId, conn) };
  });
  await auditService.record(requestLog(actor, 'RESOURCE_REQUEST_CANCELLED', resource, actor, { before: { status: 'PENDING' }, after: { status: 'CANCELLED' } }, ctx));
  return presentById(requestId);
}

module.exports = { create, list, get, approve, reject, cancel };
