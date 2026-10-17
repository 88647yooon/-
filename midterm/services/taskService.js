// 업무 (FR-07, FR-10, FR-12, BR-03, BR-06, BR-07). 업무 등록·조회·수정, 일정·상태 변경, 복제, 필요 인원·자원, 취소, 시작 준비 상태, 상태 이력.
// 할당 자원과 관련된 부분(필요 자원 분류, 일정 변경 시 자원 시간 충돌, 취소 시 할당 해제)은 taskResourceService가 맡는다.
const { withTransaction } = require('../config/database');
const taskModel = require('../models/sql/taskModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const taskContentModel = require('../models/sql/taskContentModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const userModel = require('../models/sql/userModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const taskResourceService = require('./taskResourceService');
const { requireTask, requireCrew, requireTaskType } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { TASK_STATUS_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict, ruleViolation } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { changedFields } = require('../utils/diff');

const { taskTarget, crewTarget } = auditService;
const snapshot = (t) => ({ title: t.title, crewId: t.crewId, status: t.status, startAt: t.startAt, endAt: t.endAt, priority: t.priority });

function assertPeriod(startAt, endAt) {
  if (endAt <= startAt) {
    throw badRequest('종료 시각은 시작 시각보다 늦어야 합니다.', [{ field: 'body.endAt', message: '시작 시각보다 늦어야 합니다.' }]);
  }
}

// 여러 업무를 응답 형태로 바꾼다 (유형·Crew·작성자·배정 인원을 한 번에 불러온다).
async function presentTasks(tasks, db) {
  const [refs, counts] = await Promise.all([
    loadRefs({
      userIds: tasks.flatMap((t) => [t.createdBy, t.resultRecordedBy]),
      crewIds: tasks.map((t) => t.crewId),
      typeIds: tasks.map((t) => t.typeId),
    }, db),
    taskAssigneeModel.countsByTasks(tasks.map((t) => t.id), db),
  ]);
  return tasks.map((t) => P.presentTask(t, refs, counts.get(t.id)));
}

const presentById = async (taskId) => (await presentTasks([await taskModel.findById(taskId)]))[0];

// ---------------------------------------------------------------------------
// 등록·조회·수정·삭제

// #60 업무 등록. Capo는 자신이 책임자인 Crew의 업무만 만들 수 있고, crewId를 생략하면 그 Crew로 정한다.
async function create(actor, input, ctx) {
  assertPeriod(input.startAt, input.endAt);
  let crewId = input.crewId ?? null;
  if (actor.role === 'CAPO') {
    const own = await taskAccess.capoCrewId(actor);
    if (!own) throw forbidden('책임자로 지정된 Crew가 없어 업무를 만들 수 없습니다.', { rule: 'BR-05' });
    if (crewId === null) crewId = own;
    if (crewId !== own) throw forbidden('Capo는 자신이 책임자인 Crew의 업무만 만들 수 있습니다.', { rule: 'BR-05', crewId });
  }
  let crew = null;
  if (crewId !== null) {
    crew = await requireCrew(crewId);
    if (crew.status !== 'ACTIVE') throw conflict(`해산된 Crew('${crew.name}')에는 업무를 만들 수 없습니다.`, { crewId });
  }
  if (input.typeId) await requireTaskType(input.typeId);

  const id = await taskModel.insert({ ...input, crewId, createdBy: actor.id });
  const task = await taskModel.findById(id);
  await auditService.record({
    actor, action: 'TASK_CREATED', target: taskTarget(task), related: crew ? [crewTarget(crew)] : undefined,
    after: snapshot(task), ip: ctx.ip,
  });
  return presentById(id);
}

// #61 업무 목록 (FR-12). Capo는 자신이 책임자인 Crew의 업무만 본다.
async function list(actor, query) {
  const scope = {};
  if (!access.isOrgManager(actor)) {
    const own = await taskAccess.capoCrewId(actor);
    if (query.crewId && query.crewId !== own) {
      throw forbidden('Capo는 자신이 책임자인 Crew의 업무만 조회할 수 있습니다.', { rule: 'BR-05', crewId: query.crewId });
    }
    scope.scopeCrewId = own ?? 0;
  }
  const { rows, total } = await taskModel.search({ ...query, ...scope });
  return { data: await presentTasks(rows), meta: pageMeta(query, total) };
}

// #62 업무 상세 (참여자, 담당 Crew 책임자, Underboss·Boss)
async function get(actor, taskId) {
  const task = await requireTask(taskId);
  const relation = await taskAccess.assertCanViewTask(actor, task);
  return { ...(await presentById(taskId)), viewerRelation: relation };
}

// #63 기본 정보 수정. 완료된 업무는 409 BR-06.
async function update(actor, taskId, changes, ctx) {
  const task = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    if (changes.typeId) await requireTaskType(changes.typeId, conn);
    const { before, after, changed } = changedFields(current, changes);
    if (changed) await taskModel.update(taskId, after, conn);
    return { current, before, after, changed };
  });
  if (task.changed) {
    await auditService.record({ actor, action: 'TASK_UPDATED', target: taskTarget(task.current), before: task.before, after: task.after, ip: ctx.ip });
  }
  return presentById(taskId);
}

// #64 계획 상태 업무 삭제. 배정·교대 요청·지시사항·체크리스트·선행 관계·참여 기록·자원 할당도 함께 지운다.
// 자원 사용 기록이 있으면 이력을 지킬 수 있도록 삭제하지 않는다 (취소 안내).
async function remove(actor, taskId, ctx) {
  const task = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    if (current.status !== 'PLANNED') {
      throw conflict(`계획 상태의 업무만 삭제할 수 있습니다. (현재 상태: ${TASK_STATUS_INFO[current.status].label}) 시작된 업무는 취소하세요.`,
        { status: current.status });
    }
    await taskResourceService.removeForTask(conn, taskId);
    await conn.query('DELETE FROM task_swap_requests WHERE task_id = ?', [taskId]);
    await conn.query('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
    await taskModel.remove(taskId, conn);
    return current;
  });
  await auditService.record({ actor, action: 'TASK_DELETED', target: taskTarget(task), before: snapshot(task), ip: ctx.ip });
  return { id: taskId, deleted: true };
}

// ---------------------------------------------------------------------------
// 일정·상태

// #65 일정 변경. 배정된 모든 구성원에 대해 새 시간대의 중복 배정(BR-03)을 다시 검사하고,
// 할당 자원의 시간대를 새 일정에 맞춰 옮긴 뒤 다른 예약과 겹치는지(BR-07) 검사한다.
async function changeSchedule(actor, taskId, { startAt, endAt, reason }, ctx) {
  assertPeriod(startAt, endAt);
  const outcome = await withTransaction(async (conn) => {
    const task = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, task, conn);
    taskAccess.assertTaskOpen(task);

    const assignees = await taskAssigneeModel.listActiveByTask(taskId, conn);
    const conflicts = [];
    for (const userId of assignees.map((a) => a.userId).sort((a, b) => a - b)) {
      const user = await userModel.findById(userId, conn, { forUpdate: true });
      const overlaps = await taskAssigneeModel.findOverlaps(userId, { startAt, endAt, excludeTaskId: taskId }, conn);
      if (overlaps.length > 0) conflicts.push({ userId, username: user.username, name: user.name, tasks: overlaps });
    }
    if (conflicts.length > 0) {
      throw ruleViolation('BR-03',
        `새 일정에 다른 업무와 시간이 겹치는 참여자가 ${conflicts.length}명 있습니다. (${conflicts.map((c) => c.name).join(', ')})`,
        { conflicts });
    }
    const moved = await taskResourceService.rescheduleForTask(conn, task, { startAt, endAt });
    await taskModel.setSchedule(taskId, { startAt, endAt }, conn);
    return { task, moved };
  });
  await auditService.record({
    actor, action: 'TASK_SCHEDULE_CHANGED', target: taskTarget(outcome.task),
    before: { startAt: outcome.task.startAt, endAt: outcome.task.endAt }, after: { startAt, endAt, movedResources: outcome.moved.length }, reason, ip: ctx.ip,
  });
  return presentById(taskId);
}

// #66 진행 상태 변경 (계획 → 진행, 진행 ↔ 보류). 완료·취소는 전용 API로 한다.
// 시작하려면 배정된 구성원이 한 명 이상 있어야 하고(FR-08), 선행 업무가 모두 끝나 있어야 한다.
async function changeStatus(actor, taskId, { status, reason }, ctx) {
  const task = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const from = TASK_STATUS_INFO[current.status];
    if (current.status === status) throw conflict(`이미 ${from.label} 상태입니다.`);
    if (!from.next.includes(status)) {
      throw conflict(`${from.label} 상태에서 ${TASK_STATUS_INFO[status].label} 상태로 바꿀 수 없습니다.`,
        { from: current.status, to: status, allowed: from.next });
    }
    if (status === 'IN_PROGRESS') {
      const assignees = await taskAssigneeModel.listActiveByTask(taskId, conn);
      if (assignees.length === 0) throw conflict('배정된 구성원이 없어 업무를 시작할 수 없습니다. 먼저 구성원을 배정하세요.');
      const waiting = await taskContentModel.unfinishedPredecessors(taskId, conn);
      if (waiting.length > 0) {
        throw conflict(`끝나지 않은 선행 업무가 ${waiting.length}건 있어 시작할 수 없습니다. ('${waiting[0].title}')`, { predecessors: waiting });
      }
    }
    await taskModel.setStatus(taskId, status, conn);
    return current;
  });
  await auditService.record({
    actor, action: 'TASK_STATUS_CHANGED', target: taskTarget(task), before: { status: task.status }, after: { status }, reason, ip: ctx.ip,
  });
  return presentById(taskId);
}

// #67 업무 복제. 새 일정으로 계획 상태의 업무를 만들고 필요 인원과 체크리스트를 복사한다 (배정은 복사하지 않는다).
async function duplicate(actor, taskId, { startAt, endAt, title }, ctx) {
  assertPeriod(startAt, endAt);
  const source = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, source);
  if (source.crewId) {
    const crew = await requireCrew(source.crewId);
    if (crew.status !== 'ACTIVE') throw conflict(`해산된 Crew('${crew.name}')의 업무는 복제할 수 없습니다.`);
  }
  const id = await withTransaction(async (conn) => {
    const newId = await taskModel.insert({
      ...source, title: title ?? source.title, startAt, endAt, duplicatedFrom: source.id, createdBy: actor.id,
    }, conn);
    await taskContentModel.copyItems(source.id, newId, actor.id, conn);
    return newId;
  });
  const task = await taskModel.findById(id);
  await auditService.record({
    actor, action: 'TASK_CREATED', target: taskTarget(task), after: { ...snapshot(task), duplicatedFrom: source.id }, reason: '업무 복제', ip: ctx.ip,
  });
  return presentById(id);
}

// #68 업무 상태 목록과 허용 전이
function statuses() {
  const how = { IN_PROGRESS: '상태 변경 API', ON_HOLD: '상태 변경 API', COMPLETED: '완료 처리 API', CANCELLED: '취소 API' };
  return Object.entries(TASK_STATUS_INFO).map(([status, info]) => ({
    status,
    label: info.label,
    terminal: info.next.length === 0,
    next: info.next.map((s) => ({ status: s, label: TASK_STATUS_INFO[s].label, via: how[s] })),
  }));
}

// ---------------------------------------------------------------------------
// 필요 인원·자원

// #70 필요 조건 조회 (필요 인원, 리더 필요 여부, 필요 자원 분류별 수량과 할당된 수)
async function getRequirements(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  return {
    taskId,
    requiredHeadcount: task.requiredHeadcount,
    leaderRequired: task.leaderRequired,
    resources: await taskResourceService.requirementStatus(taskId),
  };
}

// #69 필요 조건 설정 (전체 교체). resources를 생략하면 필요 자원 분류가 없는 것으로 바꾼다.
async function setRequirements(actor, taskId, { requiredHeadcount, leaderRequired, resources = [] }, ctx) {
  const { task, before } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const previous = await taskResourceService.requirementStatus(taskId, conn);
    await taskResourceService.replaceRequirements(conn, taskId, resources);
    await taskModel.setRequirements(taskId, { requiredHeadcount, leaderRequired }, conn);
    return { task: current, before: previous };
  });
  await auditService.record({
    actor, action: 'TASK_REQUIREMENTS_UPDATED', target: taskTarget(task),
    before: {
      requiredHeadcount: task.requiredHeadcount, leaderRequired: task.leaderRequired,
      resources: before.map((r) => ({ categoryId: r.category.id, quantity: r.quantity })),
    },
    after: { requiredHeadcount, leaderRequired, resources }, ip: ctx.ip,
  });
  return getRequirements(actor, taskId);
}

// ---------------------------------------------------------------------------
// 취소·준비 상태·상태 이력

// #93 업무 취소. 한 트랜잭션으로 배정된 구성원과 할당 자원을 모두 해제하고 대기 중인 교대 요청을 취소한다.
// 이미 사용 중인 자원은 반환할 때까지 사용 기록이 남는다 (일괄 반환 API로 돌려받는다).
async function cancel(actor, taskId, { reason }, ctx) {
  const { task, released, releasedResources } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const assignees = await taskAssigneeModel.listActiveByTask(taskId, conn, { forUpdate: true });
    await taskAssigneeModel.releaseAllByTask(taskId, { reason: 'TASK_CANCELLED', releasedBy: actor.id }, conn);
    await swapRequestModel.cancelPending({ taskId }, { reason: '업무 취소', decidedBy: actor.id }, conn);
    const resources = await taskResourceService.releaseAllForTask(conn, taskId, { reason: 'TASK_CANCELLED', releasedBy: actor.id });
    await taskModel.cancel(taskId, reason, conn);
    return { task: current, released: assignees, releasedResources: resources };
  });
  await auditService.record({
    actor, action: 'TASK_CANCELLED', target: taskTarget(task),
    related: [
      ...released.map((a) => ({ entity: 'user', id: String(a.userId) })),
      ...releasedResources.map((a) => ({ entity: 'resource', id: String(a.resourceId) })),
    ],
    before: { status: task.status },
    after: { status: 'CANCELLED', releasedAssignees: released.length, releasedResources: releasedResources.length }, reason, ip: ctx.ip,
  });
  return presentById(taskId);
}

// #92 시작 준비 상태: 필요 인원 충족, 응답 대기, 리더 지정, 선행 업무 완료, 필요 자원 충족, 할당 자원 상태
async function readiness(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  const [assignees, waiting, resources] = await Promise.all([
    taskAssigneeModel.listActiveByTask(taskId),
    taskContentModel.unfinishedPredecessors(taskId),
    taskResourceService.readiness(taskId),
  ]);
  const required = task.requiredHeadcount ?? 1;
  const accepted = assignees.filter((a) => a.response === 'ACCEPTED').length;
  const pending = assignees.filter((a) => a.response === 'PENDING').length;
  const hasLeader = assignees.some((a) => a.role === 'LEADER');

  const issues = [];
  if (!['PLANNED', 'ON_HOLD'].includes(task.status)) issues.push(`${TASK_STATUS_INFO[task.status].label} 상태라 시작할 수 없습니다.`);
  if (assignees.length < required) issues.push(`필요 인원 ${required}명 중 ${assignees.length}명만 배정되어 있습니다.`);
  if (pending > 0) issues.push(`${pending}명이 아직 배정에 응답하지 않았습니다.`);
  if (task.leaderRequired && !hasLeader) issues.push('리더가 지정되지 않았습니다.');
  if (waiting.length > 0) issues.push(`끝나지 않은 선행 업무가 ${waiting.length}건 있습니다.`);
  issues.push(...resources.issues);

  return {
    taskId,
    status: task.status,
    statusLabel: TASK_STATUS_INFO[task.status].label,
    ready: issues.length === 0,
    personnel: {
      requiredHeadcount: required, assignedCount: assignees.length, acceptedCount: accepted, pendingCount: pending,
      leaderRequired: task.leaderRequired, hasLeader,
    },
    unfinishedPredecessors: waiting,
    resources: { requirements: resources.requirements, allocatedCount: resources.allocatedCount, unusable: resources.unusable },
    issues,
  };
}

const STATUS_ACTIONS = {
  TASK_CREATED: '등록', TASK_STATUS_CHANGED: '상태 변경', TASK_COMPLETED: '완료', TASK_CANCELLED: '취소',
};

// #109 업무 상태 변경 이력 (MongoDB 활동 기록, 시간순)
async function statusHistory(actor, taskId, query) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  const filter = { 'target.entity': 'task', 'target.id': String(taskId), action: { $in: Object.keys(STATUS_ACTIONS) } };
  const [docs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: 1, _id: 1 }).skip((query.page - 1) * query.size).limit(query.size).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  const label = (s) => (s ? TASK_STATUS_INFO[s].label : null);
  return {
    data: docs.map((d) => {
      const to = d.action === 'TASK_CREATED' ? 'PLANNED' : d.after?.status;
      return {
        at: d.createdAt,
        action: d.action,
        actionLabel: STATUS_ACTIONS[d.action],
        from: d.before?.status ?? null,
        fromLabel: label(d.before?.status),
        to,
        toLabel: label(to),
        actor: d.actor ?? null,
        reason: d.reason ?? null,
      };
    }),
    meta: pageMeta(query, total),
  };
}

module.exports = {
  assertPeriod,
  presentTasks,
  presentById,
  create,
  list,
  get,
  update,
  remove,
  changeSchedule,
  changeStatus,
  duplicate,
  statuses,
  getRequirements,
  setRequirements,
  cancel,
  readiness,
  statusHistory,
};
