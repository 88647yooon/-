// 업무 자원 할당 (FR-07, FR-17, BR-07, BR-08) — 할당·조정·해제, 후보, 일괄 반환과
// 업무 API(단계 3)에 붙는 자원 부분: 필요 자원 분류, 시작 준비 확인, 일정 변경 시 시간 충돌 검사, 취소 시 할당 해제.
const { withTransaction } = require('../config/database');
const taskResourceModel = require('../models/sql/taskResourceModel');
const resourceModel = require('../models/sql/resourceModel');
const resourceCategoryModel = require('../models/sql/resourceCategoryModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const scheduleModel = require('../models/sql/resourceScheduleModel');
const auditService = require('./auditService');
const taskAccess = require('./taskAccess');
const rules = require('./resourceRules');
const usageService = require('./resourceUsageService');
const resourceService = require('./resourceService');
const { requireTask, requireResource } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { RESOURCE_STATUS_INFO } = require('../config/constants');
const { badRequest, conflict, notFound, ruleViolation } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { taskTarget, resourceTarget } = auditService;

async function presentTaskResources(rows, db) {
  const usages = await resourceUsageModel.findOpenByResources(rows.map((a) => a.resourceId), db);
  const usageOf = (a) => {
    const u = usages.get(a.resourceId);
    return u && u.taskResourceId === a.id ? u : null;
  };
  const refs = await loadRefs({
    taskIds: rows.map((a) => a.taskId),
    resourceIds: rows.map((a) => a.resourceId),
    userIds: [...rows.flatMap((a) => [a.allocatedBy, a.releasedBy]), ...[...usages.values()].map((u) => u.userId)],
  }, db);
  return rows.map((a) => P.presentTaskResource(a, refs, usageOf(a)));
}

const listActive = async (taskId, db) => presentTaskResources(await taskResourceModel.listActiveByTask(taskId, db), db);

async function requireActiveAllocation(taskId, resourceId, conn, options) {
  const a = await taskResourceModel.findActive(taskId, resourceId, conn, options);
  if (!a) throw notFound(`자원(ID ${resourceId})은 이 업무에 할당되어 있지 않습니다.`);
  return a;
}

// 할당 시간대는 업무 일정 안이어야 한다. 생략하면 업무 일정 전체다.
function windowFor(task, { startAt, endAt }) {
  const s = startAt ?? task.startAt;
  const e = endAt ?? task.endAt;
  rules.assertPeriod(s, e);
  if (s < task.startAt || e > task.endAt) {
    throw badRequest('자원 할당 시간대는 업무 일정 안이어야 합니다.', [{ field: 'body.startAt', message: '업무 시작~종료 시각 사이로 지정하세요.' }]);
  }
  rules.assertNotPast(e);
  return { startAt: s, endAt: e };
}

const allocationLog = (actor, action, task, resource, extra, ctx) => ({
  actor, action, target: taskTarget(task), related: [resourceTarget(resource)], ...extra, ip: ctx.ip,
});

// ---------------------------------------------------------------------------
// 할당 관리

// #130 업무에 자원 할당 (기본: 업무 시간대). 점검중·사용불가면 409 BR-08, 같은 시간대에 다른 예약이 있으면 409 BR-07.
async function allocate(actor, taskId, { resourceId, startAt, endAt, note }, ctx) {
  const { task, resource, id } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const window = windowFor(current, { startAt, endAt });
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    rules.assertAssignable(r);
    if (await taskResourceModel.findActive(taskId, resourceId, conn)) throw conflict(`'${r.name}'은 이미 이 업무에 할당되어 있습니다.`, { resourceId });
    await rules.assertNoConflict(conn, r, window);
    const newId = await taskResourceModel.insert({ taskId, resourceId, ...window, note, allocatedBy: actor.id }, conn);
    return { task: current, resource: r, id: newId };
  });
  const a = await taskResourceModel.findById(id);
  await auditService.record(allocationLog(actor, 'TASK_RESOURCE_ALLOCATED', task, resource, { after: { resourceId, startAt: a.startAt, endAt: a.endAt } }, ctx));
  return (await presentTaskResources([a]))[0];
}

// #131 업무에 할당된 자원 목록 (참여자, 담당 Crew 책임자, Underboss·Boss)
async function list(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  return listActive(taskId);
}

// #132 할당 시간대 조정 (업무 일정 안에서). 새 시간대로 BR-07·BR-08을 다시 검사한다. 사용 중인 할당은 반환 예정 연장으로 바꾼다.
async function adjust(actor, taskId, resourceId, { startAt, endAt }, ctx) {
  const { task, resource, before, window } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    const a = await requireActiveAllocation(taskId, resourceId, conn, { forUpdate: true });
    const next = windowFor(current, { startAt: startAt ?? a.startAt, endAt: endAt ?? a.endAt });
    const usage = await resourceUsageModel.findOpenByResource(resourceId, conn);
    if (usage && usage.taskResourceId === a.id) throw conflict('사용 중인 자원입니다. 반환 예정 시각은 사용 기록에서 연장하세요.', { usageId: usage.id });
    rules.assertAssignable(r);
    await rules.assertNoConflict(conn, r, { ...next, excludeTaskResourceId: a.id });
    await taskResourceModel.setWindow(a.id, next, conn);
    return { task: current, resource: r, before: a, window: next };
  });
  await auditService.record(allocationLog(actor, 'TASK_RESOURCE_ADJUSTED', task, resource, {
    before: { startAt: before.startAt, endAt: before.endAt }, after: window,
  }, ctx));
  return (await presentTaskResources([await taskResourceModel.findById(before.id)]))[0];
}

// #133 할당 해제. 사용 중이면 먼저 반환해야 한다.
async function release(actor, taskId, resourceId, ctx) {
  const { task, resource, allocation } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    const a = await requireActiveAllocation(taskId, resourceId, conn, { forUpdate: true });
    const usage = await resourceUsageModel.findOpenByResource(resourceId, conn);
    if (usage && usage.taskResourceId === a.id) throw conflict('사용 중인 자원은 반환한 뒤에 할당을 해제할 수 있습니다.', { usageId: usage.id });
    await taskResourceModel.release(a.id, { reason: 'CANCELLED', releasedBy: actor.id }, conn);
    return { task: current, resource: r, allocation: a };
  });
  await auditService.record(allocationLog(actor, 'TASK_RESOURCE_RELEASED', task, resource, {
    before: { resourceId, startAt: allocation.startAt, endAt: allocation.endAt }, after: { releaseReason: 'CANCELLED' },
  }, ctx));
  return listActive(taskId);
}

// #134 할당 후보: 정상 상태(BR-08), 업무 시간대가 비어 있음(BR-07), 아직 할당되지 않음.
// categoryId를 주면 그 분류만, 생략하면 업무의 필요 자원 분류(있으면)로 좁힌다. matchRequirements=false면 분류 제한 없음.
async function candidates(actor, taskId, { categoryId, matchRequirements = true, ...query }) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  let categoryIds;
  if (categoryId) categoryIds = [categoryId];
  else if (matchRequirements) {
    const reqs = await taskResourceModel.listRequirements(taskId);
    if (reqs.length > 0) categoryIds = reqs.map((r) => r.categoryId);
  }
  const { rows, total } = await resourceModel.searchTaskCandidates({ ...query, taskId, startAt: task.startAt, endAt: task.endAt, categoryIds });
  return { data: await resourceService.presentResources(rows), meta: pageMeta(query, total) };
}

// #149 업무에 할당된 자원 일괄 반환. 이 업무로 사용 중인 자원을 모두 정상 반환한다 (업무 상태와 무관).
async function returnAll(actor, taskId, { note }, ctx) {
  const { task, returned } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    const open = await resourceUsageModel.listOpenByTask(taskId, conn);
    if (open.length === 0) throw conflict('이 업무로 사용 중인 자원이 없습니다.');
    const resources = await rules.lockResources(conn, open.map((u) => u.resourceId));
    const results = [];
    for (const u of open) {
      results.push(await usageService.returnUsage(conn, { usage: u, resource: resources.get(u.resourceId), condition: 'GOOD', note: note ?? '업무 자원 일괄 반환', actor }));
    }
    return { task: current, returned: results };
  });
  await auditService.recordMany(returned.flatMap((r) => usageService.returnEntries(actor, r, ctx, [taskTarget(task)])));
  const usages = await Promise.all(returned.map((r) => resourceUsageModel.findById(r.usage.id)));
  const refs = await loadRefs(P.usageRefIds(usages));
  return { taskId, returnedCount: usages.length, returned: usages.map((u) => P.presentUsage(u, refs)) };
}

// ---------------------------------------------------------------------------
// 업무 API(단계 3)에 붙는 자원 부분. 업무 서비스가 자기 트랜잭션 안에서 부른다.

// #69 필요 자원 분류 교체. 분류가 없으면 404, 같은 분류가 두 번 있으면 400.
async function replaceRequirements(conn, taskId, items) {
  const ids = items.map((i) => i.categoryId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('같은 자원 분류가 여러 번 들어 있습니다.', [{ field: 'body.resources', message: '분류마다 한 번씩만 보내세요.' }]);
  }
  const found = new Set((await resourceCategoryModel.findByIds(ids, conn)).map((c) => c.id));
  const missing = ids.find((id) => !found.has(id));
  if (missing) throw notFound(`자원 분류(ID ${missing})를 찾을 수 없습니다.`);
  await taskResourceModel.replaceRequirements(taskId, items, conn);
}

// #70·#92 필요 자원 분류별 충족 여부
async function requirementStatus(taskId, db) {
  const [reqs, counts] = await Promise.all([taskResourceModel.listRequirements(taskId, db), taskResourceModel.countActiveByCategory(taskId, db)]);
  const refs = await loadRefs({ categoryIds: reqs.map((r) => r.categoryId) }, db);
  return reqs.map((r) => {
    const allocated = counts.get(r.categoryId) ?? 0;
    return { category: P.categoryBrief(refs.categories.get(r.categoryId)), quantity: r.quantity, allocatedCount: allocated, satisfied: allocated >= r.quantity };
  });
}

// #92 자원 쪽 시작 준비 상태: 필요 자원 충족, 할당된 자원 가운데 점검중·사용불가인 것
async function readiness(taskId) {
  const [requirements, allocations] = await Promise.all([requirementStatus(taskId), listActive(taskId)]);
  const unusable = allocations.filter((a) => !RESOURCE_STATUS_INFO[a.resource.status].assignable).map((a) => a.resource);
  const issues = [];
  for (const r of requirements.filter((x) => !x.satisfied)) issues.push(`필요 자원 '${r.category.name}' ${r.quantity}개 중 ${r.allocatedCount}개만 할당되어 있습니다.`);
  for (const r of unusable) issues.push(`할당된 자원 '${r.name}'이 ${r.statusLabel} 상태입니다.`);
  return { requirements, allocatedCount: allocations.length, unusable, issues };
}

// #65 업무 일정 변경에 맞춰 할당 시간대를 옮기고 BR-07을 다시 검사한다.
// 업무 일정 전체를 쓰던 할당은 새 일정 전체로, 일부만 쓰던 할당은 시작 시각이 옮겨진 만큼 옮기고 새 일정 밖은 잘라 낸다.
async function rescheduleForTask(conn, task, { startAt, endAt }) {
  const allocations = await taskResourceModel.listActiveByTask(task.id, conn, { forUpdate: true });
  if (allocations.length === 0) return [];
  const resources = await rules.lockResources(conn, allocations.map((a) => a.resourceId));
  const delta = startAt.getTime() - task.startAt.getTime();
  const moves = allocations.map((a) => {
    if (a.startAt.getTime() === task.startAt.getTime() && a.endAt.getTime() === task.endAt.getTime()) return { a, startAt, endAt };
    let s = new Date(Math.max(a.startAt.getTime() + delta, startAt.getTime()));
    let e = new Date(Math.min(a.endAt.getTime() + delta, endAt.getTime()));
    if (e <= s) [s, e] = [startAt, endAt];
    return { a, startAt: s, endAt: e };
  });

  const conflicts = [];
  for (const m of moves) {
    const entries = await scheduleModel.findConflicts(m.a.resourceId, { startAt: m.startAt, endAt: m.endAt, excludeTaskResourceId: m.a.id }, conn);
    if (entries.length > 0) {
      const r = resources.get(m.a.resourceId);
      conflicts.push({ resourceId: r.id, code: r.code, name: r.name, reservations: await rules.presentConflicts(entries, conn) });
    }
  }
  if (conflicts.length > 0) {
    throw ruleViolation('BR-07',
      `새 일정에 다른 예약과 시간이 겹치는 할당 자원이 ${conflicts.length}개 있습니다. (${conflicts.map((c) => c.name).join(', ')})`,
      { conflicts });
  }
  for (const m of moves) await taskResourceModel.setWindow(m.a.id, { startAt: m.startAt, endAt: m.endAt }, conn);
  return moves.map((m) => ({ resourceId: m.a.resourceId, startAt: m.startAt, endAt: m.endAt }));
}

// #93 업무 취소: 진행 중인 할당을 모두 해제한다 (사용 중인 자원은 반환할 때까지 사용 기록이 남는다).
async function releaseAllForTask(conn, taskId, { reason, releasedBy }) {
  const allocations = await taskResourceModel.listActiveByTask(taskId, conn, { forUpdate: true });
  for (const a of allocations) await taskResourceModel.release(a.id, { reason, releasedBy }, conn);
  return allocations;
}

// #64 업무 삭제 전: 사용 기록이 있으면 409, 없으면 할당 기록을 지운다.
async function removeForTask(conn, taskId) {
  if ((await resourceUsageModel.countByTask(taskId, conn)) > 0) {
    throw conflict('자원 사용 기록이 있는 업무는 삭제할 수 없습니다. 업무를 취소하세요.');
  }
  await taskResourceModel.removeByTask(taskId, conn);
}

module.exports = {
  presentTaskResources,
  listActive,
  allocate,
  list,
  adjust,
  release,
  candidates,
  returnAll,
  replaceRequirements,
  requirementStatus,
  readiness,
  rescheduleForTask,
  releaseAllForTask,
  removeForTask,
};
