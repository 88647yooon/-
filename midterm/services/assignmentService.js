// 업무 배정 (FR-08, FR-09, BR-02, BR-03, BR-05) — 배정·해제·교체·응답, 후보, 배정 이력, 구성원 가용 여부, 내 업무·일정
const { withTransaction } = require('../config/database');
const userModel = require('../models/sql/userModel');
const taskModel = require('../models/sql/taskModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const taskContentModel = require('../models/sql/taskContentModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const rules = require('./assignmentRules');
const taskService = require('./taskService');
const taskResourceService = require('./taskResourceService');
const taskResourceModel = require('../models/sql/taskResourceModel');
const allocationModel = require('../models/sql/resourceAllocationModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const { requireTask, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { ASSIGNABLE_ROLES, ASSIGNEE_ROLE_INFO, ASSIGNMENT_RESPONSE_INFO, MEMBER_STATUS_INFO } = require('../config/constants');
const { AppError, badRequest, forbidden, conflict, notFound, bulkRejected } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { taskTarget, userTarget } = auditService;

async function presentAssignees(rows) {
  const refs = await loadRefs({ userIds: P.assigneeRefIds(rows) });
  return rows.map((a) => P.presentAssignee(a, refs));
}

const presentActive = async (taskId) => presentAssignees(await taskAssigneeModel.listActiveByTask(taskId));

async function requireActiveAssignment(task, userId, conn, options) {
  const assignment = await taskAssigneeModel.findActive(task.id, userId, conn, options);
  if (!assignment) throw notFound(`구성원(ID ${userId})은 이 업무에 배정되어 있지 않습니다.`);
  return assignment;
}

// 구성원 행을 ID 순서로 잠근다 (교착 상태 방지). 없는 ID는 null로 둔다.
async function lockUsers(conn, ids) {
  const users = new Map();
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) users.set(id, await userModel.findById(id, conn, { forUpdate: true }));
  return users;
}

const assignLog = (actor, action, task, user, extra, ctx) => ({
  actor, action, target: taskTarget(task), related: [userTarget(user)], ...extra, ip: ctx.ip,
});

// ---------------------------------------------------------------------------
// 배정 관리

// #83 구성원 배정 (여러 명 동시). 모든 사람을 먼저 검사하고, 한 명이라도 안 되면 아무도 배정하지 않는다.
// 한 명만 보낸 경우 그 오류(BR-02·BR-03 등)를 그대로 돌려주고, 여러 명이면 409 BULK_REJECTED와 행별 오류를 돌려준다.
async function assign(actor, taskId, { assignees }, ctx) {
  const ids = assignees.map((a) => a.userId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('같은 구성원이 여러 번 들어 있습니다.', [{ field: 'body.assignees', message: '구성원마다 한 번씩만 보내세요.' }]);
  }
  if (assignees.filter((a) => a.role === 'LEADER').length > 1) {
    throw badRequest('리더는 한 명만 지정할 수 있습니다.', [{ field: 'body.assignees', message: 'LEADER는 한 명만 보내세요.' }]);
  }

  const { task, added } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const users = await lockUsers(conn, ids);

    const failures = [];
    for (const [index, a] of assignees.entries()) {
      const user = users.get(a.userId);
      try {
        if (!user) throw notFound(`구성원(ID ${a.userId})을 찾을 수 없습니다.`);
        await rules.checkAssignable(conn, { task: current, user, actor });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        failures.push({ err, row: { index, userId: a.userId, code: err.code, rule: err.details?.rule ?? null, message: err.message } });
      }
    }
    if (failures.length > 0) {
      if (assignees.length === 1) throw failures[0].err;
      throw bulkRejected(assignees.length, failures.map((f) => f.row));
    }

    if (assignees.some((a) => a.role === 'LEADER')) await taskAssigneeModel.demoteLeaders(taskId, conn);
    for (const a of assignees) {
      await rules.insertAssignment(conn, { task: current, user: users.get(a.userId), role: a.role, actor });
    }
    return { task: current, added: assignees.map((a) => ({ user: users.get(a.userId), role: a.role })) };
  });

  await auditService.recordMany(added.map(({ user, role }) => assignLog(actor, 'ASSIGNEE_ADDED', task, user, { after: { userId: user.id, role } }, ctx)));
  return presentActive(taskId);
}

// #84 현재 참여자 목록 (업무 내 역할, 수락 여부)
async function listAssignees(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  return presentActive(taskId);
}

// #85 업무 내 역할 변경. 리더는 한 명이라 새 리더를 정하면 기존 리더는 일반 참여자가 된다.
async function changeRole(actor, taskId, userId, { role }, ctx) {
  const { task, user, assignment } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const a = await requireActiveAssignment(current, userId, conn, { forUpdate: true });
    if (a.role === role) throw conflict(`이미 ${ASSIGNEE_ROLE_INFO[role].label}입니다.`);
    if (role === 'LEADER') await taskAssigneeModel.demoteLeaders(taskId, conn);
    await taskAssigneeModel.setRole(a.id, role, conn);
    return { task: current, user: await userModel.findById(userId, conn), assignment: a };
  });
  await auditService.record(assignLog(actor, 'ASSIGNEE_ROLE_CHANGED', task, user, { before: { role: assignment.role }, after: { role } }, ctx));
  return presentActive(taskId);
}

// #86 배정 해제. 배정 기록은 지우지 않고 해제 시각과 이유를 남긴다.
async function unassign(actor, taskId, userId, ctx) {
  const { task, user, assignment } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const a = await requireActiveAssignment(current, userId, conn, { forUpdate: true });
    await taskAssigneeModel.release(a.id, { reason: 'REMOVED', releasedBy: actor.id }, conn);
    await swapRequestModel.cancelPending({ taskId, userId }, { reason: '배정 해제', decidedBy: actor.id }, conn);
    return { task: current, user: await userModel.findById(userId, conn), assignment: a };
  });
  await auditService.record(assignLog(actor, 'ASSIGNEE_REMOVED', task, user,
    { before: { userId, role: assignment.role }, after: { releaseReason: 'REMOVED' } }, ctx));
  return presentActive(taskId);
}

// #87 참여자 교체. 기존 배정 해제와 새 배정을 한 트랜잭션으로 처리하고, 새 구성원에게 배정 규칙(BR-02·BR-03)을 적용한다.
async function replace(actor, taskId, userId, { newUserId, reason }, ctx) {
  if (newUserId === userId) {
    throw badRequest('같은 구성원으로는 교체할 수 없습니다.', [{ field: 'body.newUserId', message: '다른 구성원을 지정하세요.' }]);
  }
  const { task, oldUser, newUser, assignment } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    const users = await lockUsers(conn, [userId, newUserId]);
    const a = await requireActiveAssignment(current, userId, conn, { forUpdate: true });
    const next = users.get(newUserId);
    if (!next) throw notFound(`구성원(ID ${newUserId})을 찾을 수 없습니다.`);
    await rules.checkAssignable(conn, { task: current, user: next, actor });
    await taskAssigneeModel.release(a.id, { reason: 'REPLACED', releasedBy: actor.id, replacedBy: newUserId }, conn);
    await swapRequestModel.cancelPending({ taskId, userId }, { reason: '참여자 교체', decidedBy: actor.id }, conn);
    await rules.insertAssignment(conn, { task: current, user: next, role: a.role, actor });
    return { task: current, oldUser: users.get(userId), newUser: next, assignment: a };
  });
  await auditService.record({
    actor, action: 'ASSIGNEE_REPLACED', target: taskTarget(task), related: [userTarget(oldUser), userTarget(newUser)],
    before: { userId: oldUser.id, role: assignment.role }, after: { userId: newUser.id, role: assignment.role }, reason, ip: ctx.ip,
  });
  return presentActive(taskId);
}

// #88 배정 수락·거절 (본인만). 거절하면 배정이 해제되어 그 시간대가 비워진다. 응답이 반영된 배정을 돌려준다.
async function respond(actor, taskId, userId, { response, note }, ctx) {
  if (userId !== actor.id) throw forbidden('본인의 배정에만 응답할 수 있습니다.');
  const { task, before } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    taskAccess.assertTaskOpen(current);
    const a = await requireActiveAssignment(current, userId, conn, { forUpdate: true });
    if (a.response === response) throw conflict(`이미 ${ASSIGNMENT_RESPONSE_INFO[response].label}한 배정입니다.`);
    await taskAssigneeModel.respond(a.id, { response, note }, conn);
    if (response === 'DECLINED') {
      await taskAssigneeModel.release(a.id, { reason: 'DECLINED', releasedBy: actor.id }, conn);
      await swapRequestModel.cancelPending({ taskId, userId }, { reason: '배정 거절', decidedBy: actor.id }, conn);
    }
    return { task: current, before: a };
  });
  await auditService.record(assignLog(actor, 'ASSIGNMENT_RESPONDED', task, actor,
    { before: { response: before.response }, after: { response }, reason: note }, ctx));
  return (await presentAssignees([await taskAssigneeModel.findById(before.id)]))[0];
}

// ---------------------------------------------------------------------------
// 후보·이력·가용 여부

// #89 배정 후보: 활동중, 업무를 맡을 수 있는 역할, 아직 배정되지 않았고 업무 시간대가 비어 있는 구성원.
// Crew 업무는 기본으로 그 Crew 소속원만 보여 주고, Underboss·Boss는 scope=all로 전체를 볼 수 있다. Capo는 항상 자기 Crew만.
async function candidates(actor, taskId, { scope, ...query }) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  const crewId = actor.role === 'CAPO' || scope !== 'all' ? task.crewId : null;
  const { rows, total } = await userModel.searchAssignable({ ...query, taskId, startAt: task.startAt, endAt: task.endAt, crewId });
  const refs = await loadRefs({ crewIds: rows.map((u) => u.regularCrewId) });
  const contactIds = await access.contactIdsFor(actor);
  return {
    data: rows.map((u) => P.presentUserFor(u, access.visibilityOf(actor, u, contactIds), { crew: P.crewBrief(refs.crews.get(u.regularCrewId)) })),
    meta: pageMeta(query, total),
  };
}

// #90 배정 이력 (배정·해제·교체·교대·거절, 최근 순)
async function history(actor, taskId, query) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  const { rows, total } = await taskAssigneeModel.searchByTask(taskId, query);
  return { data: await presentAssignees(rows), meta: pageMeta(query, total) };
}

// #91 구성원의 지정 시간대 가용 여부와 겹치는 업무 (본인, 소속 Crew의 책임자, Underboss·Boss)
async function availability(actor, userId, { from, to }) {
  if (to <= from) throw badRequest('to는 from보다 늦어야 합니다.', [{ field: 'query.to', message: 'from보다 늦은 시각을 지정하세요.' }]);
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const overlaps = await taskAssigneeModel.findOverlaps(userId, { startAt: from, endAt: to });
  const refs = await loadRefs({ crewIds: overlaps.map((o) => o.crewId) });

  let unassignableReason = null;
  if (!ASSIGNABLE_ROLES.includes(user.role)) unassignableReason = 'Administrator는 업무에 배정할 수 없습니다.';
  else if (user.status !== 'ACTIVE') unassignableReason = `${MEMBER_STATUS_INFO[user.status].label} 상태라 새 업무에 배정할 수 없습니다.`;

  return {
    user: P.userBrief(user),
    from,
    to,
    available: overlaps.length === 0 && unassignableReason === null,
    unassignableReason,
    conflicts: overlaps.map((o) => ({
      taskId: o.taskId, title: o.title, status: o.status, startAt: o.startAt, endAt: o.endAt, crew: P.crewBrief(refs.crews.get(o.crewId)),
    })),
  };
}

// ---------------------------------------------------------------------------
// 내 업무 (FR-09)

const myAssignment = (a) => ({
  role: a.role, roleLabel: ASSIGNEE_ROLE_INFO[a.role].label,
  response: a.response, responseLabel: ASSIGNMENT_RESPONSE_INFO[a.response].label, assignedAt: a.assignedAt,
});

// #94 내게 배정된 업무 목록
async function myTasks(actor, query) {
  const { rows, total } = await taskAssigneeModel.searchByUser(actor.id, query);
  const tasks = await taskService.presentTasks(await taskModel.findByIds(rows.map((a) => a.taskId)));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return { data: rows.map((a) => ({ assignment: myAssignment(a), task: byId.get(a.taskId) })), meta: pageMeta(query, total) };
}

// #95 참여자 관점의 업무 상세: 내 역할, 나에게 온 지시사항, 함께하는 참여자, 체크리스트, 할당 자원(지금 사용 중인 사람 포함)
async function myTask(actor, taskId) {
  const task = await requireTask(taskId);
  const mine = await taskAssigneeModel.findActive(taskId, actor.id);
  if (!mine) throw notFound('내게 배정된 업무가 아닙니다.');
  const [presented, notes, others, items, resources] = await Promise.all([
    taskService.presentById(taskId),
    taskContentModel.listNotes(taskId, { forUserId: actor.id }),
    taskAssigneeModel.listActiveByTask(taskId),
    taskContentModel.listItems(taskId),
    taskResourceService.listActive(taskId),
  ]);
  const refs = await loadRefs({ userIds: [...notes.flatMap((n) => [n.authorId, n.targetUserId]), ...others.map((a) => a.userId), ...items.map((i) => i.doneBy)] });
  return {
    task: presented,
    myAssignment: myAssignment(mine),
    notes: notes.map((n) => P.presentNote(n, refs)),
    teammates: others.filter((a) => a.userId !== actor.id).map((a) => ({
      user: P.userBrief(refs.users.get(a.userId)), role: a.role, roleLabel: ASSIGNEE_ROLE_INFO[a.role].label,
      response: a.response, responseLabel: ASSIGNMENT_RESPONSE_INFO[a.response].label,
    })),
    checklist: items.map((i) => P.presentChecklistItem(i, refs)),
    resources,
  };
}

// #96 내 일정: 기간과 겹치는 내 업무(취소된 업무 제외, 업무에 할당된 자원 포함)와 나에게 배정된 자원을 시간순으로
async function mySchedule(actor, { from, to }) {
  const start = from ?? new Date();
  const end = to ?? new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (end <= start) throw badRequest('to는 from보다 늦어야 합니다.', [{ field: 'query.to', message: 'from보다 늦은 시각을 지정하세요.' }]);
  const [rows, allocations, openUsages] = await Promise.all([
    taskAssigneeModel.listByUserInWindow(actor.id, { from: start, to: end }),
    allocationModel.listByUserInWindow(actor.id, { from: start, to: end }),
    resourceUsageModel.listOpenByUser(actor.id),
  ]);
  const tasks = await taskModel.findByIds(rows.map((a) => a.taskId));
  const taskResources = await taskResourceService.presentTaskResources(await taskResourceModel.listActiveByTasks(tasks.map((t) => t.id)));
  const refs = await loadRefs({ crewIds: tasks.map((t) => t.crewId), resourceIds: allocations.map((a) => a.resourceId) });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const usingAllocation = new Set(openUsages.map((u) => u.allocationId));
  const taskItems = rows.map((a) => {
    const t = byId.get(a.taskId);
    return {
      kind: 'TASK', ...P.taskBrief(t, refs), taskId: t.id, location: t.location, myRole: a.role, myRoleLabel: ASSIGNEE_ROLE_INFO[a.role].label,
      resources: taskResources.filter((r) => r.task.id === t.id).map((r) => ({ ...r.resource, startAt: r.startAt, endAt: r.endAt, inUse: r.inUse })),
    };
  });
  const resourceItems = allocations.map((a) => ({
    kind: 'RESOURCE', allocationId: a.id, resource: P.resourceBrief(refs.resources.get(a.resourceId), refs),
    startAt: a.startAt, endAt: a.endAt, purpose: a.purpose, inUse: usingAllocation.has(a.id),
  }));
  return {
    from: start,
    to: end,
    items: [...taskItems, ...resourceItems].sort((x, y) => x.startAt - y.startAt),
  };
}

module.exports = {
  assign, listAssignees, changeRole, unassign, replace, respond,
  candidates, history, availability,
  myTasks, myTask, mySchedule,
};
