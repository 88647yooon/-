// 업무 교대 요청 (FR-08, BR-02, BR-03). 참여자가 자기 배정을 다른 구성원에게 넘기도록 요청하고,
// 담당 Crew 책임자나 Underboss·Boss가 승인하면 배정이 바뀐다. 승인할 때 배정 규칙을 다시 검사한다.
const { withTransaction } = require('../config/database');
const userModel = require('../models/sql/userModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const rules = require('./assignmentRules');
const { requireTask, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { REQUEST_STATUS_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { taskTarget, userTarget } = auditService;

async function presentMany(rows) {
  const refs = await loadRefs({ userIds: rows.flatMap((s) => [s.fromUserId, s.toUserId, s.decidedBy]), taskIds: rows.map((s) => s.taskId) });
  const crewRefs = await loadRefs({ crewIds: [...refs.tasks.values()].map((t) => t.crewId) });
  return rows.map((s) => P.presentSwap(s, { ...refs, crews: crewRefs.crews }));
}

const presentOne = async (id) => (await presentMany([await swapRequestModel.findById(id)]))[0];

async function requireRequest(id, conn, { pending = false, forUpdate = false } = {}) {
  const request = await swapRequestModel.findById(id, conn, { forUpdate });
  if (!request) throw notFound(`교대 요청(ID ${id})을 찾을 수 없습니다.`);
  if (pending && request.status !== 'PENDING') {
    throw conflict(`이미 처리된 요청입니다. (현재 상태: ${REQUEST_STATUS_INFO[request.status].label})`, { status: request.status });
  }
  return request;
}

const swapLog = (actor, action, task, users, extra, ctx) => ({
  actor, action, target: taskTarget(task), related: users.filter(Boolean).map(userTarget), ...extra, ip: ctx.ip,
});

// #97 교대 요청. 요청하는 사람은 이 업무의 현재 참여자여야 하고, 받을 사람은 배정 규칙(BR-02·BR-03)을 만족해야 한다.
async function create(actor, taskId, { toUserId, reason }, ctx) {
  if (toUserId === actor.id) {
    throw badRequest('자기 자신에게는 교대를 요청할 수 없습니다.', [{ field: 'body.toUserId', message: '다른 구성원을 지정하세요.' }]);
  }
  const { task, toUser, requestId } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    taskAccess.assertTaskOpen(current);
    if (!(await taskAssigneeModel.findActive(taskId, actor.id, conn))) {
      throw forbidden('이 업무에 배정된 참여자만 교대를 요청할 수 있습니다.');
    }
    const target = await userModel.findById(toUserId, conn, { forUpdate: true });
    if (!target) throw notFound(`구성원(ID ${toUserId})을 찾을 수 없습니다.`);
    // 받을 사람이 지금 배정될 수 있는지 미리 확인한다. 관리 범위(Crew 소속) 검사는 승인하는 사람 기준으로 승인 때 한다.
    await rules.checkAssignable(conn, { task: current, user: target });
    if (await swapRequestModel.findPending(taskId, actor.id, conn)) throw conflict('이 업무에 대해 처리 대기 중인 교대 요청이 이미 있습니다.');
    try {
      return { task: current, toUser: target, requestId: await swapRequestModel.insert({ taskId, fromUserId: actor.id, toUserId, reason }, conn) };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('이 업무에 대해 처리 대기 중인 교대 요청이 이미 있습니다.');
      throw err;
    }
  });
  await auditService.record(swapLog(actor, 'SWAP_REQUESTED', task, [actor, toUser], { after: { requestId, toUserId }, reason }, ctx));
  return presentOne(requestId);
}

// #98 교대 요청 목록. box: sent(보낸 요청), received(받은 요청), review(내가 승인할 수 있는 요청). 없으면 모두.
async function list(actor, { box, status, ...paging }) {
  const reviewAll = access.isOrgManager(actor);
  const reviewCrewId = reviewAll ? null : await taskAccess.capoCrewId(actor);
  const { rows, total } = await swapRequestModel.search({ userId: actor.id, box, reviewAll, reviewCrewId, status, ...paging });
  return { data: await presentMany(rows), meta: pageMeta(paging, total) };
}

// #99 승인 (담당 Crew 책임자, Underboss·Boss). 요청한 사람의 배정을 '교대'로 끝내고 받을 사람을 같은 역할로 배정한다.
async function approve(actor, requestId, ctx) {
  const snapshot = await requireRequest(requestId);
  const outcome = await withTransaction(async (conn) => {
    // 잠금 순서: 업무 → 요청 → 구성원 (다른 업무 트랜잭션과 같은 순서)
    const task = await requireTask(snapshot.taskId, conn, { forUpdate: true });
    const request = await requireRequest(requestId, conn, { pending: true, forUpdate: true });
    await taskAccess.assertCanManageTask(actor, task, conn);
    taskAccess.assertTaskOpen(task);
    const from = await taskAssigneeModel.findActive(task.id, request.fromUserId, conn, { forUpdate: true });
    if (!from) throw conflict('요청한 구성원의 배정이 이미 끝나 교대할 수 없습니다.');
    const users = new Map();
    for (const id of [request.fromUserId, request.toUserId].sort((a, b) => a - b)) users.set(id, await userModel.findById(id, conn, { forUpdate: true }));
    const toUser = users.get(request.toUserId);
    await rules.checkAssignable(conn, { task, user: toUser, actor });
    await taskAssigneeModel.release(from.id, { reason: 'SWAPPED', releasedBy: actor.id, replacedBy: toUser.id }, conn);
    await rules.insertAssignment(conn, { task, user: toUser, role: from.role, actor });
    await swapRequestModel.decide(requestId, { status: 'APPROVED', decidedBy: actor.id }, conn);
    return { task, fromUser: users.get(request.fromUserId), toUser, role: from.role };
  });
  const { task, fromUser, toUser, role } = outcome;
  await auditService.recordMany([
    swapLog(actor, 'SWAP_APPROVED', task, [fromUser, toUser], { after: { requestId } }, ctx),
    swapLog(actor, 'ASSIGNEE_REPLACED', task, [fromUser, toUser], {
      before: { userId: fromUser.id, role }, after: { userId: toUser.id, role, releaseReason: 'SWAPPED' },
    }, ctx),
  ]);
  return presentOne(requestId);
}

// #100 거절 (받을 사람, 담당 Crew 책임자, Underboss·Boss)
async function reject(actor, requestId, { reason }, ctx) {
  const { task, request } = await withTransaction(async (conn) => {
    const r = await requireRequest(requestId, conn, { pending: true, forUpdate: true });
    const t = await requireTask(r.taskId, conn);
    if (r.toUserId !== actor.id && !(await taskAccess.canManageTask(actor, t, conn))) {
      throw forbidden('교대를 요청받은 구성원이나 담당 Crew 책임자, Underboss·Boss만 거절할 수 있습니다.');
    }
    await swapRequestModel.decide(requestId, { status: 'REJECTED', decidedBy: actor.id, reason }, conn);
    return { task: t, request: r };
  });
  await auditService.record(swapLog(actor, 'SWAP_REJECTED', task, [await requireUser(request.fromUserId)], { after: { requestId }, reason }, ctx));
  return presentOne(requestId);
}

// #101 요청 취소 (요청한 사람만)
async function cancel(actor, requestId, ctx) {
  const { task } = await withTransaction(async (conn) => {
    const r = await requireRequest(requestId, conn, { forUpdate: true });
    if (r.fromUserId !== actor.id) throw forbidden('교대를 요청한 본인만 취소할 수 있습니다.');
    if (r.status !== 'PENDING') {
      throw conflict(`이미 처리된 요청입니다. (현재 상태: ${REQUEST_STATUS_INFO[r.status].label})`, { status: r.status });
    }
    await swapRequestModel.decide(requestId, { status: 'CANCELLED', decidedBy: actor.id, reason: '요청자 취소' }, conn);
    return { task: await requireTask(r.taskId, conn) };
  });
  await auditService.record(swapLog(actor, 'SWAP_CANCELLED', task, [actor], { after: { requestId } }, ctx));
  return presentOne(requestId);
}

module.exports = { create, list, approve, reject, cancel };
