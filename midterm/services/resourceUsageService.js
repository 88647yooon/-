// 자원 사용·반환 (FR-15, FR-16, BR-07, DR-03) — 사용 시작, 반환, 사용 이력, 반환 예정 연장, 인계, 고장 신고, 미반환 목록.
// 사용은 업무 자원 할당 또는 구성원 자원 배정을 근거로만 시작할 수 있고, 시작하면 자원이 사용중이 된다.
const { withTransaction } = require('../config/database');
const resourceModel = require('../models/sql/resourceModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const allocationModel = require('../models/sql/resourceAllocationModel');
const taskResourceModel = require('../models/sql/taskResourceModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const maintenanceModel = require('../models/sql/maintenanceModel');
const userModel = require('../models/sql/userModel');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const rules = require('./resourceRules');
const resourceService = require('./resourceService');
const maintenanceService = require('./maintenanceService');
const { requireResource, requireTask, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { RESOURCE_STATUS_INFO, OPEN_TASK_STATUSES } = require('../config/constants');
const { badRequest, forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { resourceTarget, userTarget } = auditService;

async function presentUsages(rows, db) {
  const refs = await loadRefs(P.usageRefIds(rows), db);
  return rows.map((u) => P.presentUsage(u, refs));
}

const presentById = async (id, db) => (await presentUsages([await resourceUsageModel.findById(id, db)], db))[0];

// 사용 기록의 자원을 먼저 잠그고(잠금 순서: 자원 → 사용 기록) 사용 기록을 다시 읽는다.
async function lockUsage(conn, usageId) {
  const found = await resourceUsageModel.findById(usageId, conn);
  if (!found) throw notFound(`사용 기록(ID ${usageId})을 찾을 수 없습니다.`);
  const resource = await resourceModel.findById(found.resourceId, conn, { forUpdate: true });
  const usage = await resourceUsageModel.findById(usageId, conn, { forUpdate: true });
  return { resource, usage };
}

function assertOpen(usage) {
  if (usage.returnedAt) throw conflict('이미 반환된 사용 기록입니다.', { usageId: usage.id, returnedAt: usage.returnedAt });
}

// 다른 구성원의 사용을 관리(반환 처리·연장)할 수 있는지: Underboss·Boss, 또는 그 업무·구성원을 맡은 Capo (BR-05)
async function assertCanManageUsage(actor, usage, conn) {
  if (access.isOrgManager(actor)) return;
  if (actor.role === 'CAPO') {
    if (usage.taskId && (await taskAccess.canManageTask(actor, await requireTask(usage.taskId, conn), conn))) return;
    if (await access.isInCapoCrew(actor, usage.userId, conn)) return;
    throw forbidden('Capo는 자기 Crew의 업무나 소속원이 사용 중인 자원만 관리할 수 있습니다.', { rule: 'BR-05', usageId: usage.id });
  }
  throw forbidden('이 사용 기록을 관리할 권한이 없습니다.', { usageId: usage.id });
}

// ---------------------------------------------------------------------------
// 반환 (여러 API가 함께 쓰는 핵심 처리)

// 사용을 끝내고 반환 상태에 따라 자원 상태를 바꾼다. 호출하는 쪽이 자원 행을 잠근 트랜잭션 안에서 부른다.
// 정상: 사용중 → 사용가능 / 손상: 점검을 열고 점검중 / 분실: 사용불가 (진행 중 점검은 수리 불가로 닫는다).
// 구성원 배정으로 쓴 경우 배정도 '반환'으로 끝내 남은 시간대를 비운다.
async function returnUsage(conn, { usage, resource, condition, note = null, actor }) {
  await resourceUsageModel.markReturned(usage.id, { condition, note, returnedBy: actor.id }, conn);
  if (usage.allocationId) await allocationModel.release(usage.allocationId, { reason: 'RETURNED', releasedBy: actor.id }, conn);

  let to = resource.status;
  let maintenanceId = null;
  if (condition === 'LOST') {
    to = 'UNAVAILABLE';
    const open = await maintenanceModel.findOpenByResource(resource.id, conn);
    if (open) await maintenanceModel.complete(open.id, { result: 'UNREPAIRABLE', note: '사용 중 분실', completedBy: actor.id }, conn);
  } else if (condition === 'DAMAGED' && resource.status === 'IN_USE') {
    maintenanceId = await maintenanceService.openMaintenance(conn, {
      resource, source: 'RETURN_DAMAGE', reason: note ?? '반환 시 손상 확인', usageId: usage.id, actor,
    });
    to = 'MAINTENANCE';
  } else if (resource.status === 'IN_USE') {
    to = 'AVAILABLE';
  }
  if (to !== resource.status && !maintenanceId) await resourceModel.setStatus(resource.id, to, conn);
  return { usage, resource, condition, note, from: resource.status, to, maintenanceId };
}

// 반환 활동 기록 (반환, 상태 변경, 손상으로 열린 점검)
function returnEntries(actor, { usage, resource, condition, note, from, to, maintenanceId }, ctx, related = []) {
  const entries = [{
    actor, action: 'RESOURCE_RETURNED', target: resourceTarget(resource),
    related: [{ entity: 'user', id: String(usage.userId) }, ...related],
    before: { usageId: usage.id, userId: usage.userId }, after: { condition }, reason: note ?? undefined, ip: ctx.ip,
  }];
  if (maintenanceId) {
    entries.push({ actor, action: 'MAINTENANCE_STARTED', target: resourceTarget(resource), after: { maintenanceId, source: 'RETURN_DAMAGE' }, reason: note ?? undefined, ip: ctx.ip });
  }
  if (from !== to) entries.push(resourceService.statusChangeEntry({ actor, resource, from, to, cause: 'RETURN', reason: note ?? undefined, ip: ctx.ip }));
  return entries;
}

// ---------------------------------------------------------------------------
// 사용 시작·반환

// #147 사용 시작. 지금이 시간대 안에 있는 내 구성원 배정, 또는 내가 참여 중인 업무의 자원 할당이 있어야 한다.
// taskId를 주면 그 업무의 할당으로 시작한다. 자원이 사용가능 상태가 아니면 409.
async function checkout(actor, resourceId, { taskId }, ctx) {
  const { resource, usageId } = await withTransaction(async (conn) => {
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    const open = await resourceUsageModel.findOpenByResource(resourceId, conn);
    if (open) {
      const user = await userModel.findById(open.userId, conn);
      throw conflict(`'${r.name}'은 ${user.name}님이 사용 중입니다.`, { usageId: open.id, userId: open.userId });
    }
    if (r.status !== 'AVAILABLE') {
      throw conflict(`${RESOURCE_STATUS_INFO[r.status].label} 상태의 자원은 사용할 수 없습니다.`, { status: r.status });
    }

    let allocation = null;
    let taskAllocation = null;
    if (taskId) {
      const task = await requireTask(taskId, conn);
      if (!(await taskAssigneeModel.findActive(taskId, actor.id, conn))) throw forbidden('이 업무의 참여자만 업무에 할당된 자원을 사용할 수 있습니다.', { taskId });
      if (!OPEN_TASK_STATUSES.includes(task.status)) throw conflict('끝난 업무의 자원은 사용할 수 없습니다.', { taskId, status: task.status });
      taskAllocation = await taskResourceModel.findUsableByParticipant(resourceId, actor.id, { taskId }, conn);
      if (!taskAllocation) throw conflict('지금은 이 업무에 이 자원이 할당된 시간대가 아닙니다.', { taskId, resourceId });
    } else {
      allocation = await allocationModel.findUsable(resourceId, actor.id, conn);
      if (!allocation) taskAllocation = await taskResourceModel.findUsableByParticipant(resourceId, actor.id, {}, conn);
      if (!allocation && !taskAllocation) {
        throw conflict('지금 이 자원을 사용할 수 있는 배정이 없습니다. 자원 사용 신청을 하거나 업무 자원 할당을 확인하세요.', { resourceId });
      }
    }
    const basis = allocation ?? taskAllocation;
    let id;
    try {
      id = await resourceUsageModel.insert({
        resourceId, userId: actor.id, taskId: taskAllocation?.taskId, taskResourceId: taskAllocation?.id, allocationId: allocation?.id, dueAt: basis.endAt,
      }, conn);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict(`'${r.name}'은 이미 다른 구성원이 사용 중입니다.`);
      throw err;
    }
    await resourceModel.setStatus(resourceId, 'IN_USE', conn);
    return { resource: r, usageId: id };
  });
  const usage = await resourceUsageModel.findById(usageId);
  await auditService.recordMany([
    {
      actor, action: 'RESOURCE_CHECKED_OUT', target: resourceTarget(resource),
      related: usage.taskId ? [userTarget(actor), { entity: 'task', id: String(usage.taskId) }] : [userTarget(actor)],
      after: { usageId, dueAt: usage.dueAt, basis: usage.taskResourceId ? 'TASK' : 'MEMBER' }, ip: ctx.ip,
    },
    resourceService.statusChangeEntry({ actor, resource, from: resource.status, to: 'IN_USE', cause: 'CHECKOUT', ip: ctx.ip }),
  ]);
  return presentById(usageId);
}

// #148 반환. 사용자 본인 또는 그 업무·구성원을 맡은 Capo, Underboss·Boss가 처리한다.
async function returnResource(actor, resourceId, { condition, note }, ctx) {
  const result = await withTransaction(async (conn) => {
    const r = await requireResource(resourceId, conn, { forUpdate: true });
    const usage = await resourceUsageModel.findOpenByResource(resourceId, conn, { forUpdate: true });
    if (!usage) throw conflict(`'${r.name}'은 사용 중이 아닙니다.`, { status: r.status });
    if (usage.userId !== actor.id) await assertCanManageUsage(actor, usage, conn);
    return returnUsage(conn, { usage, resource: r, condition, note, actor });
  });
  await auditService.recordMany(returnEntries(actor, result, ctx));
  return { ...(await presentById(result.usage.id)), resourceStatus: result.to, resourceStatusLabel: RESOURCE_STATUS_INFO[result.to].label };
}

// #150 자원별 사용·반환 이력
async function listByResource(actor, resourceId, query) {
  await requireResource(resourceId);
  const { rows, total } = await resourceUsageModel.searchByResource(resourceId, query);
  return { data: await presentUsages(rows), meta: pageMeta(query, total) };
}

// ---------------------------------------------------------------------------
// 연장·인계·고장 신고·미반환

// #151 반환 예정 시각 연장. 늘어난 시간대에 다른 예약이 있으면 409 BR-07. 구성원 배정으로 쓰는 중이면 배정 종료 시각도 함께 늘린다.
async function extend(actor, usageId, { dueAt, reason }, ctx) {
  const { resource, usage } = await withTransaction(async (conn) => {
    const locked = await lockUsage(conn, usageId);
    assertOpen(locked.usage);
    await assertCanManageUsage(actor, locked.usage, conn);
    const now = new Date();
    if (dueAt <= locked.usage.dueAt || dueAt <= now) {
      throw badRequest('반환 예정 시각은 지금 예정 시각과 현재 시각보다 늦어야 합니다.', [{ field: 'body.dueAt', message: '더 늦은 시각을 지정하세요.' }]);
    }
    const from = locked.usage.dueAt > now ? locked.usage.dueAt : now;
    await rules.assertNoConflict(conn, locked.resource, {
      startAt: from, endAt: dueAt, excludeUsageId: usageId,
      excludeTaskResourceId: locked.usage.taskResourceId ?? 0, excludeAllocationId: locked.usage.allocationId ?? 0,
    });
    await resourceUsageModel.setDueAt(usageId, dueAt, conn);
    if (locked.usage.allocationId) {
      const a = await allocationModel.findById(locked.usage.allocationId, conn);
      if (a.releasedAt === null && a.endAt < dueAt) await allocationModel.setWindow(a.id, { startAt: a.startAt, endAt: dueAt }, conn);
    }
    return locked;
  });
  await auditService.record({
    actor, action: 'RESOURCE_USAGE_EXTENDED', target: resourceTarget(resource), related: [{ entity: 'user', id: String(usage.userId) }],
    before: { usageId, dueAt: usage.dueAt }, after: { usageId, dueAt }, reason, ip: ctx.ip,
  });
  return presentById(usageId);
}

// #152 사용 중인 자원을 다른 구성원에게 인계 (반환 + 사용 시작을 한 트랜잭션으로).
// 업무 자원이면 같은 업무의 참여자에게만, 구성원 배정이면 그 자원을 이용할 수 있는 활동중 구성원에게 넘긴다(배정도 넘어간다).
// dueAt으로 반환 예정 시각을 늘리면 늘어난 시간대에 BR-07을 검사한다.
async function handover(actor, usageId, { toUserId, dueAt, note }, ctx) {
  if (toUserId === actor.id) throw badRequest('본인에게는 인계할 수 없습니다.', [{ field: 'body.toUserId', message: '다른 구성원을 지정하세요.' }]);
  const { resource, oldUsage, toUser, newUsageId } = await withTransaction(async (conn) => {
    const target = await requireUser(toUserId, conn, { forUpdate: true });
    const { resource: r, usage } = await lockUsage(conn, usageId);
    if (usage.userId !== actor.id) throw forbidden('본인이 사용 중인 자원만 인계할 수 있습니다.', { usageId });
    assertOpen(usage);
    if (r.status !== 'IN_USE') throw conflict(`${RESOURCE_STATUS_INFO[r.status].label} 상태의 자원은 인계할 수 없습니다. 반환하세요.`, { status: r.status });
    const now = new Date();
    const newDue = dueAt ?? usage.dueAt;
    if (newDue <= now) {
      throw badRequest('반환 예정 시각이 지났습니다. 새 반환 예정 시각(dueAt)을 지정하세요.', [{ field: 'body.dueAt', message: '지금보다 늦은 시각을 지정하세요.' }]);
    }

    const exclude = { excludeUsageId: usageId, excludeTaskResourceId: usage.taskResourceId ?? 0, excludeAllocationId: usage.allocationId ?? 0 };
    let allocationId = null;
    if (usage.taskId) {
      const task = await requireTask(usage.taskId, conn);
      if (!OPEN_TASK_STATUSES.includes(task.status)) throw conflict('끝난 업무의 자원은 인계할 수 없습니다. 반환하세요.', { taskId: task.id });
      if (!(await taskAssigneeModel.findActive(usage.taskId, toUserId, conn))) {
        throw conflict(`업무 자원은 같은 업무의 참여자에게만 인계할 수 있습니다. (${target.name}님은 '${task.title}'의 참여자가 아닙니다)`, { userId: toUserId });
      }
      if (newDue > usage.dueAt) await rules.assertNoConflict(conn, r, { startAt: usage.dueAt, endAt: newDue, ...exclude });
    } else {
      rules.assertMemberCanUse(target, r);
      await rules.assertNoConflict(conn, r, { startAt: now, endAt: newDue, ...exclude });
      const old = await allocationModel.findById(usage.allocationId, conn);
      await allocationModel.release(old.id, { reason: 'HANDED_OVER', releasedBy: actor.id }, conn);
      allocationId = await allocationModel.insert({
        resourceId: r.id, userId: toUserId, startAt: new Date(Math.floor(now.getTime() / 1000) * 1000), endAt: newDue,
        purpose: old.purpose, handedOverFrom: old.id, allocatedBy: actor.id,
      }, conn);
    }
    // 한 자원에 반환되지 않은 사용은 하나뿐이므로 먼저 끝내고 새로 시작한다.
    await resourceUsageModel.markReturned(usageId, { condition: 'GOOD', note: note ?? '인계', returnedBy: actor.id, handedOverTo: toUserId }, conn);
    const id = await resourceUsageModel.insert({
      resourceId: r.id, userId: toUserId, taskId: usage.taskId, taskResourceId: usage.taskResourceId, allocationId, dueAt: newDue, handoverFromId: usageId,
    }, conn);
    return { resource: r, oldUsage: usage, toUser: target, newUsageId: id };
  });
  await auditService.record({
    actor, action: 'RESOURCE_HANDED_OVER', target: resourceTarget(resource), related: [userTarget(actor), userTarget(toUser)],
    before: { usageId, userId: oldUsage.userId, dueAt: oldUsage.dueAt }, after: { usageId: newUsageId, userId: toUserId }, reason: note, ip: ctx.ip,
  });
  return presentById(newUsageId);
}

// #153 사용 중 고장 신고. 점검을 자동으로 열고 자원을 점검중으로 바꾼다 (새 배정 불가, BR-08). 반환은 따로 한다.
async function reportDamage(actor, usageId, { description }, ctx) {
  const { resource, usage, maintenanceId } = await withTransaction(async (conn) => {
    const locked = await lockUsage(conn, usageId);
    if (locked.usage.userId !== actor.id) throw forbidden('본인이 사용 중인 자원만 고장 신고할 수 있습니다.', { usageId });
    assertOpen(locked.usage);
    if (locked.usage.damageReportedAt) throw conflict('이미 고장 신고한 사용 기록입니다.', { usageId });
    await resourceUsageModel.markDamaged(usageId, description, conn);
    const id = await maintenanceService.openMaintenance(conn, {
      resource: locked.resource, source: 'DAMAGE_REPORT', reason: description, usageId, actor,
    });
    return { ...locked, maintenanceId: id };
  });
  await auditService.recordMany([
    { actor, action: 'RESOURCE_DAMAGE_REPORTED', target: resourceTarget(resource), related: [userTarget(actor)], after: { usageId, maintenanceId }, reason: description, ip: ctx.ip },
    ...maintenanceService.openedEntries({ actor, resource, maintenanceId, source: 'DAMAGE_REPORT', reason: description, cause: 'DAMAGE_REPORT', ip: ctx.ip }),
  ]);
  const m = await maintenanceModel.findById(maintenanceId);
  const refs = await loadRefs({ resourceIds: [m.resourceId], userIds: [m.startedBy] });
  return { usage: await presentById(usage.id), maintenance: P.presentMaintenance(m, refs) };
}

// #154 반환 예정 시각이 지난 미반환 목록 (오래 늦은 순)
async function overdue(actor, query) {
  const { rows, total } = await resourceUsageModel.searchOverdue(query);
  return { data: await presentUsages(rows), meta: pageMeta(query, total) };
}

// 내가 지금 사용 중인 자원 (웹 화면용)
async function myOpenUsages(actor) {
  return presentUsages(await resourceUsageModel.listOpenByUser(actor.id));
}

module.exports = {
  presentUsages,
  returnUsage,
  returnEntries,
  checkout,
  returnResource,
  listByResource,
  extend,
  handover,
  reportDamage,
  overdue,
  myOpenUsages,
};
