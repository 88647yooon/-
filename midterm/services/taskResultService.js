// 업무 완료·결과·참여 기록·진행 보고 (FR-10, FR-11, BR-06)
// 완료하면 결과(성과·요약)와 참여 기록이 핵심 결과로 잠긴다. 일반 구성원(Associate·Soldier·Capo)이 바꾸려 하면 409 BR-06이고,
// 정정은 Underboss·Boss만 사유를 남기고 할 수 있다. 정정 내용은 활동 기록에 변경 전후로 남는다.
const { withTransaction } = require('../config/database');
const taskModel = require('../models/sql/taskModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const taskResultModel = require('../models/sql/taskResultModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const TaskProgress = require('../models/mongo/TaskProgress');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const { requireTask } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { TASK_STATUS_INFO, TASK_OUTCOME_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict, ruleViolation } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { changedFields } = require('../utils/diff');

const { taskTarget } = auditService;

function brSixViolation() {
  return ruleViolation('BR-06', '완료된 업무의 핵심 결과는 일반 구성원이 바꿀 수 없습니다. 정정은 Underboss·Boss만 사유를 남기고 할 수 있습니다.');
}

async function presentParticipations(rows) {
  const refs = await loadRefs({ userIds: rows.flatMap((p) => [p.userId, p.recordedBy]) });
  return rows.map((p) => P.presentParticipation(p, refs));
}

// #102 완료 처리. 결과와 참여 기록을 한 트랜잭션으로 남기고 업무를 완료 상태로 잠근다.
// participations에 없는 현재 참여자는 배정을 수락했으면 참여, 아니면 불참으로 기록한다.
async function complete(actor, taskId, { outcome, summary, participations = [] }, ctx) {
  const ids = participations.map((p) => p.userId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('같은 구성원의 참여 기록이 여러 번 들어 있습니다.', [{ field: 'body.participations', message: '구성원마다 한 번씩만 보내세요.' }]);
  }
  const task = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, current, conn);
    if (current.status === 'COMPLETED') throw ruleViolation('BR-06', '이미 완료된 업무입니다. 결과 정정은 Underboss·Boss만 할 수 있습니다.');
    if (current.status !== 'IN_PROGRESS') {
      throw conflict(`진행 중인 업무만 완료할 수 있습니다. (현재 상태: ${TASK_STATUS_INFO[current.status].label})`, { status: current.status });
    }
    for (const p of participations) {
      if (!(await taskAssigneeModel.wasAssigned(taskId, p.userId, conn))) {
        throw conflict(`이 업무에 배정된 적 없는 구성원(ID ${p.userId})의 참여 기록은 남길 수 없습니다.`, { userId: p.userId });
      }
    }
    await taskModel.complete(taskId, { outcome, summary, recordedBy: actor.id }, conn);
    for (const p of participations) {
      await taskResultModel.upsertParticipation({ taskId, ...p, recordedBy: actor.id }, conn);
    }
    for (const a of await taskAssigneeModel.listActiveByTask(taskId, conn)) {
      if (!ids.includes(a.userId)) {
        await taskResultModel.upsertParticipation({ taskId, userId: a.userId, participated: a.response === 'ACCEPTED', recordedBy: actor.id }, conn);
      }
    }
    await swapRequestModel.cancelPending({ taskId }, { reason: '업무 완료', decidedBy: actor.id }, conn);
    return current;
  });
  await auditService.record({
    actor, action: 'TASK_COMPLETED', target: taskTarget(task), before: { status: task.status }, after: { status: 'COMPLETED', outcome, summary }, ip: ctx.ip,
  });
  return getResult(actor, taskId);
}

// #103 완료 결과 조회: 성과·요약, 참여 기록, 정정 이력
async function getResult(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  if (task.status !== 'COMPLETED') {
    throw conflict(`아직 완료되지 않은 업무입니다. (현재 상태: ${TASK_STATUS_INFO[task.status].label})`, { status: task.status });
  }
  const [participations, corrections, refs] = await Promise.all([
    taskResultModel.listParticipations(taskId).then(presentParticipations),
    ActivityLog.find({ 'target.entity': 'task', 'target.id': String(taskId), action: { $in: ['TASK_RESULT_CORRECTED', 'PARTICIPATION_CORRECTED'] } })
      .sort({ createdAt: 1, _id: 1 }).lean(),
    loadRefs({ userIds: [task.resultRecordedBy] }),
  ]);
  return {
    taskId,
    outcome: task.resultOutcome,
    outcomeLabel: TASK_OUTCOME_INFO[task.resultOutcome].label,
    summary: task.resultSummary,
    completedAt: task.completedAt,
    recordedBy: P.userBrief(refs.users.get(task.resultRecordedBy)),
    participations,
    corrections: corrections.map((c) => ({
      at: c.createdAt, action: c.action, actor: c.actor ?? null, before: c.before ?? null, after: c.after ?? null, reason: c.reason ?? null,
    })),
  };
}

// #104 결과 정정. Underboss·Boss만 할 수 있고 사유가 필요하다. 그 밖의 구성원은 409 BR-06.
async function correctResult(actor, taskId, { outcome, summary, reason }, ctx) {
  const changes = Object.fromEntries(Object.entries({ outcome, summary }).filter(([, v]) => v !== undefined));
  if (Object.keys(changes).length === 0) {
    throw badRequest('정정할 항목(outcome 또는 summary)을 보내야 합니다.', [{ field: 'body', message: 'outcome 또는 summary가 필요합니다.' }]);
  }
  const { task, before, after, changed } = await withTransaction(async (conn) => {
    const current = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanViewTask(actor, current, conn);
    if (current.status !== 'COMPLETED') throw conflict('완료된 업무만 결과를 정정할 수 있습니다.', { status: current.status });
    if (!access.isOrgManager(actor)) throw brSixViolation();
    const diff = changedFields({ outcome: current.resultOutcome, summary: current.resultSummary }, changes);
    if (diff.changed) await taskModel.updateResult(taskId, diff.after, conn);
    return { task: current, ...diff };
  });
  if (changed) {
    await auditService.record({ actor, action: 'TASK_RESULT_CORRECTED', target: taskTarget(task), before, after, reason, ip: ctx.ip });
  }
  return getResult(actor, taskId);
}

// #105 참여자별 참여 기록. 진행·보류 중에는 담당 Crew 책임자와 Underboss·Boss가 남기고,
// 완료된 뒤에는 Underboss·Boss만 사유를 남기고 정정할 수 있다 (그 밖에는 409 BR-06).
async function recordParticipation(actor, taskId, userId, { participated, contribution, reason }, ctx) {
  const outcome = await withTransaction(async (conn) => {
    const task = await requireTask(taskId, conn, { forUpdate: true });
    await taskAccess.assertCanManageTask(actor, task, conn);
    if (task.status === 'CANCELLED') throw conflict('취소된 업무에는 참여 기록을 남길 수 없습니다.');
    if (task.status === 'PLANNED') throw conflict('아직 시작하지 않은 업무에는 참여 기록을 남길 수 없습니다.');
    const correcting = task.status === 'COMPLETED';
    if (correcting && !access.isOrgManager(actor)) throw brSixViolation();
    if (correcting && !reason) {
      throw badRequest('완료된 업무의 참여 기록을 정정하려면 사유가 필요합니다.', [{ field: 'body.reason', message: '정정 사유를 입력하세요.' }]);
    }
    if (!(await taskAssigneeModel.wasAssigned(taskId, userId, conn))) {
      throw conflict(`이 업무에 배정된 적 없는 구성원(ID ${userId})의 참여 기록은 남길 수 없습니다.`, { userId });
    }
    const before = await taskResultModel.findParticipation(taskId, userId, conn);
    await taskResultModel.upsertParticipation({ taskId, userId, participated, contribution, recordedBy: actor.id }, conn);
    return { task, before, correcting };
  });
  await auditService.record({
    actor,
    action: outcome.correcting ? 'PARTICIPATION_CORRECTED' : 'PARTICIPATION_RECORDED',
    target: taskTarget(outcome.task),
    related: [{ entity: 'user', id: String(userId) }],
    before: outcome.before ? { userId, participated: outcome.before.participated, contribution: outcome.before.contribution } : null,
    after: { userId, participated, contribution: contribution ?? null },
    reason,
    ip: ctx.ip,
  });
  return (await presentParticipations([await taskResultModel.findParticipation(taskId, userId)]))[0];
}

// #106 참여 기록 목록
async function listParticipations(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  return presentParticipations(await taskResultModel.listParticipations(taskId));
}

// #107 진행 보고 (참여자). 진행 중인 업무에만 남길 수 있다.
async function reportProgress(actor, taskId, { percent, note }) {
  const task = await requireTask(taskId);
  if (!(await taskAssigneeModel.findActive(taskId, actor.id))) throw forbidden('이 업무에 배정된 참여자만 진행 상황을 보고할 수 있습니다.');
  if (task.status === 'COMPLETED') throw brSixViolation();
  if (task.status !== 'IN_PROGRESS') {
    throw conflict(`진행 중인 업무에만 진행 상황을 보고할 수 있습니다. (현재 상태: ${TASK_STATUS_INFO[task.status].label})`, { status: task.status });
  }
  const doc = await TaskProgress.create({
    taskId, reporter: { userId: actor.id, username: actor.username, name: actor.name }, percent, note,
  });
  return P.presentProgress(doc.toObject());
}

// #108 진행 보고 목록 (최근 순)
async function listProgress(actor, taskId, query) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  const [docs, total] = await Promise.all([
    TaskProgress.find({ taskId }).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * query.size).limit(query.size).lean(),
    TaskProgress.countDocuments({ taskId }),
  ]);
  return { data: docs.map(P.presentProgress), meta: pageMeta(query, total) };
}

module.exports = { complete, getResult, correctResult, recordParticipation, listParticipations, reportProgress, listProgress };
