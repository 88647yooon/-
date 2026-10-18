// 내 요약 (FR-02, #198): 진행할 업무, 사용 중·예정 자원, 최근 받은 평가와 평판, 내가 처리할 일.
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const taskModel = require('../models/sql/taskModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const allocationModel = require('../models/sql/resourceAllocationModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const requestModel = require('../models/sql/resourceRequestModel');
const Evaluation = require('../models/mongo/Evaluation');
const EvaluationAppeal = require('../models/mongo/EvaluationAppeal');
const permissionService = require('./permissionService');
const taskService = require('./taskService');
const usageService = require('./resourceUsageService');
const allocationService = require('./resourceAllocationService');
const evaluationService = require('./evaluationService');
const reputationService = require('./reputationService');
const P = require('./presenters');
const { OPEN_TASK_STATUSES } = require('../config/constants');

const DAY = 24 * 60 * 60 * 1000;

async function me(actor) {
  const now = new Date();
  const can = (key) => permissionService.has(actor.role, key);
  const [assignments, upcomingRows, openUsages, allocations, evaluations, swapsToMe, myRequests] = await Promise.all([
    taskAssigneeModel.searchByUser(actor.id, { page: 1, size: 100, sort: 'startAt' }),
    taskAssigneeModel.listByUserInWindow(actor.id, { from: now, to: new Date(now.getTime() + 14 * DAY) }),
    usageService.myOpenUsages(actor),
    allocationModel.listByUserInWindow(actor.id, { from: now, to: new Date(now.getTime() + 14 * DAY) }),
    Evaluation.find({ 'evaluatee.userId': actor.id, status: 'ACTIVE' }).sort({ createdAt: -1 }).limit(3).lean(),
    swapRequestModel.search({ userId: actor.id, box: 'received', status: 'PENDING', page: 1, size: 1 }),
    requestModel.search({ userId: actor.id, box: 'mine', status: 'PENDING', page: 1, size: 1 }),
  ]);
  const tasks = await taskModel.findByIds(assignments.rows.map((a) => a.taskId));
  const statusOf = new Map(tasks.map((t) => [t.id, t.status]));
  const open = assignments.rows.filter((a) => OPEN_TASK_STATUSES.includes(statusOf.get(a.taskId)));
  // 앞으로 14일 안의 끝나지 않은 내 업무 (가까운 순 5건)
  const upcomingTasks = (await taskService.presentTasks(await taskModel.findByIds(upcomingRows.map((a) => a.taskId))))
    .filter((t) => OPEN_TASK_STATUSES.includes(t.status)).sort((a, b) => a.startAt - b.startAt).slice(0, 5);

  const todo = {
    awaitingMyResponse: open.filter((a) => a.response === 'PENDING').length,
    swapRequestsToMe: swapsToMe.total,
    myPendingResourceRequests: myRequests.total,
  };
  if (await can('evaluation.write')) todo.evaluationsToWrite = (await evaluationService.pending(actor)).length;
  if (await can('evaluation.appeal.resolve')) todo.appealsToResolve = await EvaluationAppeal.countDocuments({ status: 'PENDING', 'appellant.userId': { $ne: actor.id } });

  return {
    user: P.userBrief(actor),
    tasks: {
      openCount: open.length,
      inProgressCount: open.filter((a) => statusOf.get(a.taskId) === 'IN_PROGRESS').length,
      upcoming: upcomingTasks,
    },
    resources: {
      inUse: openUsages,
      upcomingAllocations: (await allocationService.presentAllocations(allocations.filter((a) => a.endAt > now))).slice(0, 5),
    },
    evaluations: {
      recent: evaluations.map((e) => P.presentEvaluation(e, { viewer: actor })),
      reputationScore: actor.role === 'ADMIN' ? null : (await reputationService.summary(actor, actor.id)).reputationScore,
    },
    todo,
  };
}

module.exports = { me };
