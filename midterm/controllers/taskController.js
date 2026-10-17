// 업무 유형·업무·세부 정보·배정·교대·결과 API 컨트롤러 (단계 3)
const taskTypeService = require('../services/taskTypeService');
const taskService = require('../services/taskService');
const taskContentService = require('../services/taskContentService');
const taskResultService = require('../services/taskResultService');
const assignmentService = require('../services/assignmentService');
const swapService = require('../services/swapService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const p = (req) => req.valid.params;
const b = (req) => req.valid.body;
const q = (req) => req.valid.query;

module.exports = {
  // 업무 유형 (#56~#59)
  createType: async (req, res) => created(res, await taskTypeService.create(req.user, b(req), contextOf(req))),
  listTypes: async (req, res) => ok(res, await taskTypeService.list()),
  updateType: async (req, res) => ok(res, await taskTypeService.update(req.user, p(req).typeId, b(req), contextOf(req))),
  removeType: async (req, res) => ok(res, await taskTypeService.remove(req.user, p(req).typeId, contextOf(req))),

  // 업무 (#60~#68)
  create: async (req, res) => created(res, await taskService.create(req.user, b(req), contextOf(req))),
  list: async (req, res) => okPage(res, await taskService.list(req.user, q(req))),
  get: async (req, res) => ok(res, await taskService.get(req.user, p(req).taskId)),
  update: async (req, res) => ok(res, await taskService.update(req.user, p(req).taskId, b(req), contextOf(req))),
  remove: async (req, res) => ok(res, await taskService.remove(req.user, p(req).taskId, contextOf(req))),
  changeSchedule: async (req, res) => ok(res, await taskService.changeSchedule(req.user, p(req).taskId, b(req), contextOf(req))),
  changeStatus: async (req, res) => ok(res, await taskService.changeStatus(req.user, p(req).taskId, b(req), contextOf(req))),
  duplicate: async (req, res) => created(res, await taskService.duplicate(req.user, p(req).taskId, b(req), contextOf(req))),
  statuses: async (req, res) => ok(res, taskService.statuses()),

  // 필요 인원 (#69, #70)
  setRequirements: async (req, res) => ok(res, await taskService.setRequirements(req.user, p(req).taskId, b(req), contextOf(req))),
  getRequirements: async (req, res) => ok(res, await taskService.getRequirements(req.user, p(req).taskId)),

  // 지시사항 (#71~#74)
  createNote: async (req, res) => created(res, await taskContentService.createNote(req.user, p(req).taskId, b(req), contextOf(req))),
  listNotes: async (req, res) => ok(res, await taskContentService.listNotes(req.user, p(req).taskId)),
  updateNote: async (req, res) => ok(res, await taskContentService.updateNote(req.user, p(req).taskId, p(req).noteId, b(req))),
  deleteNote: async (req, res) => ok(res, await taskContentService.deleteNote(req.user, p(req).taskId, p(req).noteId)),

  // 체크리스트 (#75~#79)
  addItem: async (req, res) => created(res, await taskContentService.addItem(req.user, p(req).taskId, b(req))),
  listItems: async (req, res) => ok(res, await taskContentService.listItems(req.user, p(req).taskId)),
  updateItem: async (req, res) => ok(res, await taskContentService.updateItem(req.user, p(req).taskId, p(req).itemId, b(req))),
  checkItem: async (req, res) => ok(res, await taskContentService.checkItem(req.user, p(req).taskId, p(req).itemId, b(req))),
  removeItem: async (req, res) => ok(res, await taskContentService.removeItem(req.user, p(req).taskId, p(req).itemId)),

  // 선행 업무 (#80~#82)
  addDependency: async (req, res) => created(res, await taskContentService.addDependency(req.user, p(req).taskId, b(req), contextOf(req))),
  listDependencies: async (req, res) => ok(res, await taskContentService.listDependencies(req.user, p(req).taskId)),
  removeDependency: async (req, res) => ok(res, await taskContentService.removeDependency(req.user, p(req).taskId, p(req).dependsOnId, contextOf(req))),

  // 배정 (#83~#93)
  assign: async (req, res) => created(res, await assignmentService.assign(req.user, p(req).taskId, b(req), contextOf(req))),
  listAssignees: async (req, res) => ok(res, await assignmentService.listAssignees(req.user, p(req).taskId)),
  changeAssigneeRole: async (req, res) => ok(res, await assignmentService.changeRole(req.user, p(req).taskId, p(req).userId, b(req), contextOf(req))),
  unassign: async (req, res) => ok(res, await assignmentService.unassign(req.user, p(req).taskId, p(req).userId, contextOf(req))),
  replace: async (req, res) => ok(res, await assignmentService.replace(req.user, p(req).taskId, p(req).userId, b(req), contextOf(req))),
  respond: async (req, res) => ok(res, await assignmentService.respond(req.user, p(req).taskId, p(req).userId, b(req), contextOf(req))),
  candidates: async (req, res) => okPage(res, await assignmentService.candidates(req.user, p(req).taskId, q(req))),
  history: async (req, res) => okPage(res, await assignmentService.history(req.user, p(req).taskId, q(req))),
  availability: async (req, res) => ok(res, await assignmentService.availability(req.user, p(req).userId, q(req))),
  readiness: async (req, res) => ok(res, await taskService.readiness(req.user, p(req).taskId)),
  cancel: async (req, res) => ok(res, await taskService.cancel(req.user, p(req).taskId, b(req), contextOf(req))),

  // 내 업무 (#94~#96)
  myTasks: async (req, res) => okPage(res, await assignmentService.myTasks(req.user, q(req))),
  myTask: async (req, res) => ok(res, await assignmentService.myTask(req.user, p(req).taskId)),
  mySchedule: async (req, res) => ok(res, await assignmentService.mySchedule(req.user, q(req))),

  // 교대 요청 (#97~#101)
  createSwap: async (req, res) => created(res, await swapService.create(req.user, p(req).taskId, b(req), contextOf(req))),
  listSwaps: async (req, res) => okPage(res, await swapService.list(req.user, q(req))),
  approveSwap: async (req, res) => ok(res, await swapService.approve(req.user, p(req).requestId, contextOf(req))),
  rejectSwap: async (req, res) => ok(res, await swapService.reject(req.user, p(req).requestId, b(req), contextOf(req))),
  cancelSwap: async (req, res) => ok(res, await swapService.cancel(req.user, p(req).requestId, contextOf(req))),

  // 진행·완료·결과 (#102~#109)
  complete: async (req, res) => ok(res, await taskResultService.complete(req.user, p(req).taskId, b(req), contextOf(req))),
  getResult: async (req, res) => ok(res, await taskResultService.getResult(req.user, p(req).taskId)),
  correctResult: async (req, res) => ok(res, await taskResultService.correctResult(req.user, p(req).taskId, b(req), contextOf(req))),
  recordParticipation: async (req, res) => ok(res, await taskResultService.recordParticipation(req.user, p(req).taskId, p(req).userId, b(req), contextOf(req))),
  listParticipations: async (req, res) => ok(res, await taskResultService.listParticipations(req.user, p(req).taskId)),
  reportProgress: async (req, res) => created(res, await taskResultService.reportProgress(req.user, p(req).taskId, b(req))),
  listProgress: async (req, res) => okPage(res, await taskResultService.listProgress(req.user, p(req).taskId, q(req))),
  statusHistory: async (req, res) => okPage(res, await taskService.statusHistory(req.user, p(req).taskId, q(req))),
};
