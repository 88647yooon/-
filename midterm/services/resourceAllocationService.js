// 구성원 자원 배정 (FR-14, FR-17, BR-07, BR-08, BR-05) — 배정, 구성원별 배정 목록, 기간 변경, 배정 취소
const { withTransaction } = require('../config/database');
const allocationModel = require('../models/sql/resourceAllocationModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const auditService = require('./auditService');
const access = require('./accessService');
const rules = require('./resourceRules');
const { requireResource, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { resourceTarget, userTarget } = auditService;

async function presentAllocations(rows, db) {
  const usages = await resourceUsageModel.findOpenByResources(rows.map((a) => a.resourceId), db);
  const usageOf = (a) => {
    const u = usages.get(a.resourceId);
    return u && u.allocationId === a.id ? u : null;
  };
  const refs = await loadRefs({
    resourceIds: rows.map((a) => a.resourceId), userIds: rows.flatMap((a) => [a.userId, a.allocatedBy, a.releasedBy]),
  }, db);
  return rows.map((a) => P.presentAllocation(a, refs, usageOf(a)));
}

const presentById = async (id) => (await presentAllocations([await allocationModel.findById(id)]))[0];

// 배정을 바꾸기 전에 구성원 → 자원 → 배정 순서로 잠근다.
async function lockAllocation(conn, allocationId) {
  const found = await allocationModel.findById(allocationId, conn);
  if (!found) throw notFound(`자원 배정(ID ${allocationId})을 찾을 수 없습니다.`);
  const user = await requireUser(found.userId, conn, { forUpdate: true });
  const resource = await requireResource(found.resourceId, conn, { forUpdate: true });
  const allocation = await allocationModel.findById(allocationId, conn, { forUpdate: true });
  if (allocation.releasedAt) throw conflict('이미 끝난 배정입니다.', { allocationId, releaseReason: allocation.releaseReason });
  return { user, resource, allocation };
}

async function assertNotInUse(conn, allocation, message) {
  const usage = await resourceUsageModel.findOpenByResource(allocation.resourceId, conn);
  if (usage && usage.allocationId === allocation.id) throw conflict(message, { usageId: usage.id });
}

const allocationLog = (actor, action, resource, user, extra, ctx) => ({
  actor, action, target: resourceTarget(resource), related: [userTarget(user)], ...extra, ip: ctx.ip,
});

// 배정 규칙을 모두 검사하고 배정을 만든다 (사용 신청 승인도 이 함수를 쓴다). 호출하는 쪽이 구성원·자원 행을 잠근다.
async function insertChecked(conn, { actor, user, resource, startAt, endAt, purpose, requestId }) {
  await rules.assertCanManageMemberResources(actor, user, conn);
  rules.assertMemberCanUse(user, resource);
  rules.assertAssignable(resource);
  await rules.assertNoConflict(conn, resource, { startAt, endAt });
  return allocationModel.insert({ resourceId: resource.id, userId: user.id, startAt, endAt, purpose, requestId, allocatedBy: actor.id }, conn);
}

// #137 구성원에게 자원 배정 (시간대 지정). Capo는 자기 Crew 소속원에게만(403 BR-05), 점검중·사용불가면 409 BR-08, 겹치면 409 BR-07.
async function allocate(actor, resourceId, { userId, startAt, endAt, purpose }, ctx) {
  rules.assertPeriod(startAt, endAt);
  rules.assertNotPast(endAt);
  const { user, resource, id } = await withTransaction(async (conn) => {
    const u = await requireUser(userId, conn, { forUpdate: true });
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    const newId = await insertChecked(conn, { actor, user: u, resource: r, startAt, endAt, purpose });
    return { user: u, resource: r, id: newId };
  });
  await auditService.record(allocationLog(actor, 'RESOURCE_ALLOCATED', resource, user, { after: { allocationId: id, userId, startAt, endAt } }, ctx));
  return presentById(id);
}

// #138 구성원에게 배정된 자원 목록 (본인, 소속 Crew의 책임자, Underboss·Boss)
async function listByUser(actor, userId, query) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const { rows, total } = await allocationModel.searchByUser(userId, query);
  return { data: await presentAllocations(rows), meta: pageMeta(query, total) };
}

// #139 배정 기간 변경. 새 기간으로 BR-07·BR-08을 다시 검사한다. 사용 중인 배정은 반환 예정 연장으로 바꾼다.
async function update(actor, allocationId, { startAt, endAt }, ctx) {
  const { user, resource, before, window } = await withTransaction(async (conn) => {
    const locked = await lockAllocation(conn, allocationId);
    await rules.assertCanManageMemberResources(actor, locked.user, conn);
    await assertNotInUse(conn, locked.allocation, '사용 중인 배정입니다. 반환 예정 시각은 사용 기록에서 연장하세요.');
    const next = { startAt: startAt ?? locked.allocation.startAt, endAt: endAt ?? locked.allocation.endAt };
    rules.assertPeriod(next.startAt, next.endAt);
    rules.assertNotPast(next.endAt);
    rules.assertAssignable(locked.resource);
    await rules.assertNoConflict(conn, locked.resource, { ...next, excludeAllocationId: allocationId });
    await allocationModel.setWindow(allocationId, next, conn);
    return { ...locked, before: locked.allocation, window: next };
  });
  await auditService.record(allocationLog(actor, 'RESOURCE_ALLOCATION_CHANGED', resource, user, {
    before: { allocationId, startAt: before.startAt, endAt: before.endAt }, after: { allocationId, ...window },
  }, ctx));
  return presentById(allocationId);
}

// #140 배정 취소. 사용 중이면 먼저 반환해야 한다.
async function cancel(actor, allocationId, ctx) {
  const { user, resource, allocation } = await withTransaction(async (conn) => {
    const locked = await lockAllocation(conn, allocationId);
    await rules.assertCanManageMemberResources(actor, locked.user, conn);
    await assertNotInUse(conn, locked.allocation, '사용 중인 자원은 반환한 뒤에 배정을 취소할 수 있습니다.');
    await allocationModel.release(allocationId, { reason: 'CANCELLED', releasedBy: actor.id }, conn);
    return locked;
  });
  await auditService.record(allocationLog(actor, 'RESOURCE_ALLOCATION_CANCELLED', resource, user, {
    before: { allocationId, startAt: allocation.startAt, endAt: allocation.endAt }, after: { releaseReason: 'CANCELLED' },
  }, ctx));
  return presentById(allocationId);
}

module.exports = { presentAllocations, insertChecked, allocate, listByUser, update, cancel };
