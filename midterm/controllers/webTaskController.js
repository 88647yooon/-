// 업무 웹 화면 (CR-02): 업무 관리, 업무 상세, 내 업무 (FR-07~FR-12, 업무 자원 할당 FR-17).
// REST API와 같은 서비스 계층을 호출하므로 배정 규칙(BR-02·BR-03), 완료 업무 잠금(BR-06), 자원 규칙(BR-07·BR-08)이 API와 똑같이 적용된다.
// 자원 할당 폼의 처리는 webResourceController가 맡는다.
const taskService = require('../services/taskService');
const taskTypeService = require('../services/taskTypeService');
const taskContentService = require('../services/taskContentService');
const taskResultService = require('../services/taskResultService');
const assignmentService = require('../services/assignmentService');
const swapService = require('../services/swapService');
const taskResourceService = require('../services/taskResourceService');
const resourceCategoryService = require('../services/resourceCategoryService');
const webRecord = require('./webRecordController');
const crewService = require('../services/crewService');
const access = require('../services/accessService');
const { userIdOf, action, nothingChanged } = require('./webHelpers');
const { contextOf } = require('../utils/context');
const { badRequest } = require('../utils/errors');

const id = (req) => req.valid.params.taskId;

// ---------------------------------------------------------------------------
// 화면

async function tasksPage(req, res) {
  const query = req.valid.query;
  const [result, types, crews] = await Promise.all([
    taskService.list(req.user, query),
    taskTypeService.list(),
    crewService.list(req.user, { status: 'ACTIVE', page: 1, size: 100, sort: 'name' }),
  ]);
  res.render('tasks', { title: '업무 관리', tasks: result.data, meta: result.meta, query, types, crews: crews.data });
}

async function taskPage(req, res) {
  const taskId = id(req);
  const task = await taskService.get(req.user, taskId);
  const manager = task.viewerRelation === 'manager';
  const open = !['COMPLETED', 'CANCELLED'].includes(task.status);
  const [assignees, notes, checklist, dependencies, progress, history, assignmentHistory, readiness, result, participations, swaps, types,
    resources, requirements, candidates, categories, evaluations] =
    await Promise.all([
      assignmentService.listAssignees(req.user, taskId),
      taskContentService.listNotes(req.user, taskId),
      taskContentService.listItems(req.user, taskId),
      taskContentService.listDependencies(req.user, taskId),
      taskResultService.listProgress(req.user, taskId, { page: 1, size: 10 }),
      taskService.statusHistory(req.user, taskId, { page: 1, size: 50 }),
      manager ? assignmentService.history(req.user, taskId, { page: 1, size: 30 }) : null,
      manager && open ? taskService.readiness(req.user, taskId) : null,
      task.status === 'COMPLETED' ? taskResultService.getResult(req.user, taskId) : null,
      taskResultService.listParticipations(req.user, taskId),
      swapService.list(req.user, { page: 1, size: 50 }),
      taskTypeService.list(),
      taskResourceService.list(req.user, taskId),
      taskService.getRequirements(req.user, taskId),
      manager && open ? taskResourceService.candidates(req.user, taskId, { page: 1, size: 10, sort: 'code' }) : null,
      manager && open ? resourceCategoryService.list() : [],
      manager ? webRecord.taskEvaluations(req.user, task) : null,
    ]);
  res.render('task', {
    title: task.title,
    task,
    manager,
    isOrgManager: access.isOrgManager(req.user),
    mine: assignees.find((a) => a.user.id === req.user.id) ?? null,
    assignees,
    notes,
    checklist,
    dependencies,
    progress: progress.data,
    history: history.data,
    assignmentHistory: assignmentHistory?.data ?? [],
    readiness,
    result,
    participations,
    swaps: swaps.data.filter((s) => s.task.id === taskId),
    types,
    resources,
    requirements,
    candidates: candidates?.data ?? [],
    categories,
    evaluations,
  });
}

async function myTasksPage(req, res) {
  const [tasks, schedule, swaps] = await Promise.all([
    assignmentService.myTasks(req.user, { page: 1, size: 50, sort: 'startAt' }),
    assignmentService.mySchedule(req.user, {}),
    swapService.list(req.user, { page: 1, size: 30 }),
  ]);
  res.render('my-tasks', { title: '내 업무', tasks: tasks.data, schedule, swaps: swaps.data });
}

// ---------------------------------------------------------------------------
// 업무 관리

const createTask = action(async (req) => {
  const task = await taskService.create(req.user, req.valid.body, contextOf(req));
  return { message: `'${task.title}' 업무를 등록했습니다. 구성원을 배정한 뒤 시작하세요.`, redirect: `/tasks/${task.id}` };
});

const updateTask = action(async (req) => {
  if (Object.keys(req.valid.body).length === 0) return nothingChanged;
  await taskService.update(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '업무 정보를 수정했습니다.' };
});

const changeSchedule = action(async (req) => {
  await taskService.changeSchedule(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '일정을 바꿨습니다. 모든 참여자의 시간 겹침을 다시 확인했습니다.' };
});

const changeStatus = action(async (req) => {
  const task = await taskService.changeStatus(req.user, id(req), req.valid.body, contextOf(req));
  return { message: `업무를 ${task.statusLabel} 상태로 바꿨습니다.` };
});

// 필요 자원 분류별 수량은 qty_<분류 ID> 칸으로 온다. 비우거나 0이면 그 분류는 필요 없다.
function resourceRequirementsOf(form) {
  const items = [];
  for (const [key, value] of Object.entries(form)) {
    const match = /^qty_(\d+)$/.exec(key);
    if (!match || value === '' || value === '0') continue;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw badRequest('필요 자원 수량은 1~20 사이의 정수여야 합니다.', [{ field: `form.${key}`, message: '1~20 사이의 정수를 입력하세요.' }]);
    }
    items.push({ categoryId: Number(match[1]), quantity });
  }
  return items;
}

const setRequirements = action(async (req) => {
  const resources = resourceRequirementsOf(req.body);
  await taskService.setRequirements(req.user, id(req), { ...req.valid.body, resources }, contextOf(req));
  return { message: resources.length ? `필요 인원과 필요 자원 ${resources.length}종을 설정했습니다.` : '필요 인원을 설정했습니다. (필요 자원 없음)' };
});

const duplicateTask = action(async (req) => {
  const task = await taskService.duplicate(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '업무를 복제했습니다. 새 업무에 구성원을 배정하세요.', redirect: `/tasks/${task.id}` };
});

const cancelTask = action(async (req) => {
  await taskService.cancel(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '업무를 취소했습니다. 배정된 구성원과 할당 자원은 모두 해제되었습니다.' };
});

const deleteTask = action(async (req) => {
  await taskService.remove(req.user, id(req), contextOf(req));
  return { message: '업무를 삭제했습니다.', redirect: '/tasks' };
});

// ---------------------------------------------------------------------------
// 배정

// 아이디를 쉼표로 여러 개 넣으면 한 번에 배정한다 (한 명이라도 안 되면 아무도 배정하지 않는다).
const assign = action(async (req) => {
  const usernames = req.valid.body.usernames.split(',').map((s) => s.trim()).filter(Boolean);
  if (usernames.length === 0) throw badRequest('배정할 구성원의 아이디를 입력하세요.', [{ field: 'form.usernames', message: '필수 항목입니다.' }]);
  const userIds = [];
  for (const username of usernames) userIds.push(await userIdOf(username));
  const role = req.valid.body.role;
  const assignees = userIds.map((userId, i) => ({ userId, role: role === 'LEADER' && i === 0 ? 'LEADER' : 'MEMBER' }));
  await assignmentService.assign(req.user, id(req), { assignees }, contextOf(req));
  return { message: `${usernames.join(', ')}님을 배정했습니다. 배정된 구성원이 수락하거나 거절할 수 있습니다.` };
});

const changeAssigneeRole = action(async (req) => {
  await assignmentService.changeRole(req.user, id(req), req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: '업무 내 역할을 바꿨습니다.' };
});

const unassign = action(async (req) => {
  await assignmentService.unassign(req.user, id(req), req.valid.params.userId, contextOf(req));
  return { message: '배정을 해제했습니다. 기록은 배정 이력에 남습니다.' };
});

const replaceAssignee = action(async (req) => {
  const newUserId = await userIdOf(req.valid.body.username);
  await assignmentService.replace(req.user, id(req), req.valid.params.userId, { newUserId, reason: req.valid.body.reason }, contextOf(req));
  return { message: `${req.valid.body.username}님으로 교체했습니다.` };
});

const respond = action(async (req) => {
  const result = await assignmentService.respond(req.user, id(req), req.user.id, req.valid.body, contextOf(req));
  return { message: result.response === 'ACCEPTED' ? '배정을 수락했습니다.' : '배정을 거절했습니다. 배정이 해제되었습니다.' };
});

// ---------------------------------------------------------------------------
// 지시사항·체크리스트·선행 업무

const createNote = action(async (req) => {
  const { content, target } = req.valid.body;
  const targetUserId = target ? await userIdOf(target) : undefined;
  await taskContentService.createNote(req.user, id(req), { content, targetUserId }, contextOf(req));
  return { message: target ? `${target}님에게 지시사항을 남겼습니다.` : '참여자 전체에게 지시사항을 남겼습니다.' };
});

const deleteNote = action(async (req) => {
  await taskContentService.deleteNote(req.user, id(req), req.valid.params.noteId);
  return { message: '지시사항을 삭제했습니다.' };
});

const addItem = action(async (req) => {
  await taskContentService.addItem(req.user, id(req), req.valid.body);
  return { message: '체크리스트 항목을 추가했습니다.' };
});

const checkItem = action(async (req) => {
  const item = await taskContentService.checkItem(req.user, id(req), req.valid.params.itemId, req.valid.body);
  return { message: item.done ? `'${item.content}' 항목을 완료로 표시했습니다.` : `'${item.content}' 항목의 완료 표시를 지웠습니다.` };
});

const removeItem = action(async (req) => {
  await taskContentService.removeItem(req.user, id(req), req.valid.params.itemId);
  return { message: '체크리스트 항목을 삭제했습니다.' };
});

const addDependency = action(async (req) => {
  await taskContentService.addDependency(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '선행 업무를 지정했습니다. 선행 업무가 끝나야 이 업무를 시작할 수 있습니다.' };
});

const removeDependency = action(async (req) => {
  await taskContentService.removeDependency(req.user, id(req), req.valid.params.dependsOnId, contextOf(req));
  return { message: '선행 관계를 삭제했습니다.' };
});

// ---------------------------------------------------------------------------
// 진행·완료·결과

const reportProgress = action(async (req) => {
  const report = await taskResultService.reportProgress(req.user, id(req), req.valid.body);
  return { message: `진행률 ${report.percent}%를 보고했습니다.` };
});

const complete = action(async (req) => {
  await taskResultService.complete(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '업무를 완료 처리했습니다. 결과와 참여 기록이 잠겼습니다.' };
});

const correctResult = action(async (req) => {
  await taskResultService.correctResult(req.user, id(req), req.valid.body, contextOf(req));
  return { message: '완료 결과를 정정했습니다. 정정 이력에 사유가 남았습니다.' };
});

const recordParticipation = action(async (req) => {
  await taskResultService.recordParticipation(req.user, id(req), req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: '참여 기록을 남겼습니다.' };
});

// ---------------------------------------------------------------------------
// 교대 요청

const requestSwap = action(async (req) => {
  const toUserId = await userIdOf(req.valid.body.username);
  await swapService.create(req.user, id(req), { toUserId, reason: req.valid.body.reason }, contextOf(req));
  return { message: `${req.valid.body.username}님에게 교대를 요청했습니다. 담당 Crew 책임자나 Underboss·Boss가 승인하면 바뀝니다.` };
});

const approveSwap = action(async (req) => {
  const s = await swapService.approve(req.user, req.valid.params.requestId, contextOf(req));
  return { message: `교대를 승인했습니다. ${s.from.name}님 대신 ${s.to.name}님이 배정되었습니다.` };
});

const rejectSwap = action(async (req) => {
  await swapService.reject(req.user, req.valid.params.requestId, req.valid.body, contextOf(req));
  return { message: '교대 요청을 거절했습니다.' };
});

const cancelSwap = action(async (req) => {
  await swapService.cancel(req.user, req.valid.params.requestId, contextOf(req));
  return { message: '교대 요청을 취소했습니다.' };
});

module.exports = {
  tasksPage, taskPage, myTasksPage,
  createTask, updateTask, changeSchedule, changeStatus, setRequirements, duplicateTask, cancelTask, deleteTask,
  assign, changeAssigneeRole, unassign, replaceAssignee, respond,
  createNote, deleteNote, addItem, checkItem, removeItem, addDependency, removeDependency,
  reportProgress, complete, correctResult, recordParticipation,
  requestSwap, approveSwap, rejectSwap, cancelSwap,
};
