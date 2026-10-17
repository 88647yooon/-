// 웹 화면 라우터 (CR-02). REST API가 아니므로 API 목록표의 개수에 포함하지 않는다.
// 각 경로에는 같은 기능의 API와 똑같은 권한 키를 건다. 화면에서 버튼을 숨기는 것과 별개로 서버가 다시 검사한다 (NFR-03).
const express = require('express');
const web = require('../controllers/webController');
const webTask = require('../controllers/webTaskController');
const webResource = require('../controllers/webResourceController');
const { webContext, requireLogin, webNotFound, webErrorHandler, kstDatetimes } = require('../middlewares/web');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const { paging, enums, fields } = require('./rules');

const router = express.Router();

// /api 경로(REST API·Swagger)는 이 라우터를 건너뛴다. API 오류는 JSON으로만 응답한다.
router.use((req, res, next) => (req.path.startsWith('/api') ? next('router') : next()));
router.use(express.urlencoded({ extended: false, limit: '100kb' }));
router.use(webContext);

const allowed = (key) => [requireLogin, requirePermission(key)];
const userParams = { params: { userId: fields.id } };
const crewParams = { params: { crewId: fields.id } };
const memberParams = { params: { crewId: fields.id, userId: fields.id } };
const joinParams = { params: { crewId: fields.id, requestId: fields.id } };
const requestParams = { params: { requestId: fields.id } };
const username = { type: 'string', required: true, max: 50 };
const regularByDefault = { ...enums.membershipType, default: 'REGULAR' };

// 홈·로그인
router.get('/', web.home);
router.get('/login', web.loginPage);
router.post(
  '/login',
  validate({ form: { username, password: { type: 'string', required: true, max: 72, trim: false }, next: { type: 'string', max: 500 } } }),
  web.login,
);
router.post('/logout', web.logout);

// 내 정보 (FR-01, FR-02, NFR-03)
router.get('/me', ...allowed('me.read'), web.mePage);
router.post('/me/profile', ...allowed('me.update'), validate({ form: { nickname: fields.nickname, phone: fields.phone, email: fields.email } }), web.updateProfile);
router.post(
  '/me/password',
  ...allowed('me.password'),
  validate({ form: { currentPassword: { type: 'string', required: true, max: 72, trim: false }, newPassword: fields.password } }),
  web.changePassword,
);
router.post('/me/sessions/revoke', ...allowed('session.manage'), web.revokeSessions);

// 구성원 (FR-01~FR-04)
router.get(
  '/users',
  ...allowed('user.list'),
  validate({ query: { role: enums.role, status: enums.memberStatus, crewId: fields.optionalId, q: fields.q, ...paging('users') } }),
  web.usersPage,
);
router.post(
  '/users',
  ...allowed('user.create'),
  validate({
    form: {
      username: fields.username, password: fields.password, name: fields.name, nickname: fields.nickname, phone: fields.phone, email: fields.email,
    },
  }),
  web.createUser,
);
router.get('/users/:userId', ...allowed('user.read'), validate(userParams), web.userPage);
router.post(
  '/users/:userId/basic',
  ...allowed('user.update'),
  validate({ ...userParams, form: { name: { ...fields.name, required: false }, nickname: fields.nickname, phone: fields.phone, email: fields.email } }),
  web.updateUser,
);
router.post(
  '/users/:userId/role',
  ...allowed('user.role.change'),
  validate({ ...userParams, form: { role: { ...enums.role, required: true }, reason: fields.reason } }),
  web.changeRole,
);
router.post(
  '/users/:userId/status',
  ...allowed('user.status.change'),
  validate({ ...userParams, form: { status: { ...enums.memberStatus, required: true }, reason: fields.reason } }),
  web.changeStatus,
);
router.post(
  '/users/:userId/role-request',
  ...allowed('roleRequest.create'),
  validate({ ...userParams, form: { role: { ...enums.role, required: true }, reason: fields.requiredReason } }),
  web.recommendRole,
);
router.post('/users/:userId/delete', ...allowed('user.delete'), validate(userParams), web.deleteUser);

// Crew (FR-05)
router.get(
  '/crews',
  ...allowed('crew.read'),
  validate({ query: { region: { type: 'string', max: 50 }, status: enums.crewStatus, q: fields.q, ...paging('crews') } }),
  web.crewsPage,
);
router.post(
  '/crews',
  ...allowed('crew.create'),
  validate({
    form: {
      name: fields.name, region: { type: 'string', required: true, max: 50 }, description: { type: 'string', max: 500 }, underbossId: fields.optionalId,
    },
  }),
  web.createCrew,
);
router.get('/crews/:crewId', ...allowed('crew.read'), validate(crewParams), web.crewPage);
router.post(
  '/crews/:crewId/edit',
  ...allowed('crew.update'),
  validate({ ...crewParams, form: { name: { ...fields.name, required: false }, region: { type: 'string', max: 50 }, description: { type: 'string', max: 500 } } }),
  web.updateCrew,
);
router.post(
  '/crews/:crewId/status',
  ...allowed('crew.status.change'),
  validate({ ...crewParams, form: { status: { ...enums.crewStatus, required: true }, reason: fields.reason } }),
  web.changeCrewStatus,
);
router.post('/crews/:crewId/capo', ...allowed('crew.capo.assign'), validate({ ...crewParams, form: { username, reason: fields.reason } }), web.assignCapo);
router.post('/crews/:crewId/capo/remove', ...allowed('crew.capo.assign'), validate(crewParams), web.removeCapo);
router.post('/crews/:crewId/underboss', ...allowed('crew.underboss.assign'), validate({ ...crewParams, form: { username } }), web.assignUnderboss);
router.post('/crews/:crewId/merge', ...allowed('crew.merge'), validate({ ...crewParams, form: { targetCrewId: fields.id, reason: fields.reason } }), web.mergeCrew);
router.post('/crews/:crewId/delete', ...allowed('crew.delete'), validate(crewParams), web.deleteCrew);

// Crew 편성 (FR-06, BR-01, BR-05)
router.post(
  '/crews/:crewId/members',
  ...allowed('crew.members.manage'),
  validate({ ...crewParams, form: { username, type: regularByDefault, note: fields.note } }),
  web.addMember,
);
router.post(
  '/crews/:crewId/members/:userId/type',
  ...allowed('crew.members.manage'),
  validate({ ...memberParams, form: { type: { ...enums.membershipType, required: true } } }),
  web.changeMemberType,
);
router.post('/crews/:crewId/members/:userId/remove', ...allowed('crew.members.manage'), validate(memberParams), web.removeMember);
router.post(
  '/crews/:crewId/members/:userId/transfer',
  ...allowed('crew.members.transfer'),
  validate({ ...memberParams, form: { targetCrewId: fields.id, type: enums.membershipType } }),
  web.transferMember,
);

// 소속 신청 (FR-06)
router.post(
  '/crews/:crewId/join',
  ...allowed('crew.joinRequest.apply'),
  validate({ ...crewParams, form: { type: regularByDefault, message: fields.reason } }),
  web.applyJoin,
);
router.post('/crews/:crewId/join-requests/:requestId/approve', ...allowed('crew.joinRequest.review'), validate(joinParams), web.approveJoin);
router.post(
  '/crews/:crewId/join-requests/:requestId/reject',
  ...allowed('crew.joinRequest.review'),
  validate({ ...joinParams, form: { reason: fields.requiredReason } }),
  web.rejectJoin,
);
router.post('/crews/:crewId/join-requests/:requestId/cancel', ...allowed('crew.joinRequest.apply'), validate(joinParams), web.cancelJoin);

// 역할 변경 요청 (FR-03)
router.get('/role-requests', ...allowed('roleRequest.read'), validate({ query: { status: enums.requestStatus, ...paging() } }), web.roleRequestsPage);
router.post('/role-requests/:requestId/approve', ...allowed('roleRequest.review'), validate(requestParams), web.approveRoleRequest);
router.post(
  '/role-requests/:requestId/reject',
  ...allowed('roleRequest.review'),
  validate({ ...requestParams, form: { reason: fields.requiredReason } }),
  web.rejectRoleRequest,
);

// 업무 (FR-07~FR-12, BR-02, BR-03, BR-06)
const taskParams = { params: { taskId: fields.id } };
const taskUserParams = { params: { taskId: fields.id, userId: fields.id } };
const schedule = kstDatetimes('startAt', 'endAt');
const taskEditable = {
  title: { ...fields.title, required: false }, description: { type: 'string', max: 2000 }, typeId: fields.optionalId,
  priority: enums.taskPriority, location: { type: 'string', max: 100 },
};

router.get(
  '/tasks',
  ...allowed('task.list'),
  validate({ query: { status: enums.taskStatus, crewId: fields.optionalId, priority: enums.taskPriority, q: fields.q, ...paging('tasks') } }),
  webTask.tasksPage,
);
router.post(
  '/tasks',
  ...allowed('task.create'),
  schedule,
  validate({
    form: {
      ...taskEditable, title: fields.title, crewId: fields.optionalId, priority: { ...enums.taskPriority, default: 'MEDIUM' },
      startAt: fields.datetime, endAt: fields.datetime, requiredHeadcount: fields.headcount,
    },
  }),
  webTask.createTask,
);
router.get('/tasks/:taskId', ...allowed('task.read'), validate(taskParams), webTask.taskPage);
router.post('/tasks/:taskId/edit', ...allowed('task.manage'), validate({ ...taskParams, form: taskEditable }), webTask.updateTask);
router.post(
  '/tasks/:taskId/schedule',
  ...allowed('task.manage'),
  schedule,
  validate({ ...taskParams, form: { startAt: fields.datetime, endAt: fields.datetime, reason: fields.reason } }),
  webTask.changeSchedule,
);
router.post(
  '/tasks/:taskId/status',
  ...allowed('task.manage'),
  validate({ ...taskParams, form: { status: { type: 'string', required: true, enum: ['IN_PROGRESS', 'ON_HOLD'] }, reason: fields.reason } }),
  webTask.changeStatus,
);
// 필요 자원 분류별 수량은 qty_<분류 ID> 칸으로 받는다 (컨트롤러에서 읽는다).
router.post(
  '/tasks/:taskId/requirements',
  ...allowed('task.manage'),
  validate({ ...taskParams, form: { requiredHeadcount: { ...fields.headcount, required: true }, leaderRequired: { type: 'boolean', default: false } } }),
  webTask.setRequirements,
);
router.post(
  '/tasks/:taskId/duplicate',
  ...allowed('task.manage'),
  schedule,
  validate({ ...taskParams, form: { startAt: fields.datetime, endAt: fields.datetime, title: { ...fields.title, required: false } } }),
  webTask.duplicateTask,
);
router.post('/tasks/:taskId/cancel', ...allowed('task.manage'), validate({ ...taskParams, form: { reason: fields.requiredReason } }), webTask.cancelTask);
router.post('/tasks/:taskId/delete', ...allowed('task.manage'), validate(taskParams), webTask.deleteTask);

router.post(
  '/tasks/:taskId/assignees',
  ...allowed('task.manage'),
  validate({ ...taskParams, form: { usernames: { type: 'string', required: true, max: 500 }, role: { ...enums.assigneeRole, default: 'MEMBER' } } }),
  webTask.assign,
);
router.post(
  '/tasks/:taskId/assignees/:userId/role',
  ...allowed('task.manage'),
  validate({ ...taskUserParams, form: { role: { ...enums.assigneeRole, required: true } } }),
  webTask.changeAssigneeRole,
);
router.post('/tasks/:taskId/assignees/:userId/remove', ...allowed('task.manage'), validate(taskUserParams), webTask.unassign);
router.post(
  '/tasks/:taskId/assignees/:userId/replace',
  ...allowed('task.manage'),
  validate({ ...taskUserParams, form: { username, reason: fields.reason } }),
  webTask.replaceAssignee,
);
router.post(
  '/tasks/:taskId/respond',
  ...allowed('task.participate'),
  validate({ ...taskParams, form: { response: { type: 'string', required: true, enum: ['ACCEPTED', 'DECLINED'] }, note: fields.reason } }),
  webTask.respond,
);

router.post(
  '/tasks/:taskId/notes',
  ...allowed('task.manage'),
  validate({ ...taskParams, form: { content: { type: 'string', required: true, max: 2000 }, target: { type: 'string', max: 50 } } }),
  webTask.createNote,
);
router.post('/tasks/:taskId/notes/:noteId/delete', ...allowed('task.manage'), validate({ params: { taskId: fields.id, noteId: fields.id } }), webTask.deleteNote);
router.post('/tasks/:taskId/checklist', ...allowed('task.manage'), validate({ ...taskParams, form: { content: { type: 'string', required: true, max: 300 } } }), webTask.addItem);
router.post(
  '/tasks/:taskId/checklist/:itemId/check',
  ...allowed('task.participate'),
  validate({ params: { taskId: fields.id, itemId: fields.id }, form: { done: { type: 'boolean', default: true } } }),
  webTask.checkItem,
);
router.post('/tasks/:taskId/checklist/:itemId/delete', ...allowed('task.manage'), validate({ params: { taskId: fields.id, itemId: fields.id } }), webTask.removeItem);
router.post('/tasks/:taskId/dependencies', ...allowed('task.manage'), validate({ ...taskParams, form: { dependsOnId: fields.id } }), webTask.addDependency);
router.post(
  '/tasks/:taskId/dependencies/:dependsOnId/delete',
  ...allowed('task.manage'),
  validate({ params: { taskId: fields.id, dependsOnId: fields.id } }),
  webTask.removeDependency,
);

router.post(
  '/tasks/:taskId/progress',
  ...allowed('task.participate'),
  validate({ ...taskParams, form: { percent: { type: 'integer', required: true, min: 0, max: 100 }, note: { type: 'string', max: 1000 } } }),
  webTask.reportProgress,
);
router.post(
  '/tasks/:taskId/complete',
  ...allowed('task.manage'),
  validate({ ...taskParams, form: { outcome: { ...enums.taskOutcome, required: true }, summary: { type: 'string', required: true, max: 2000 } } }),
  webTask.complete,
);
router.post(
  '/tasks/:taskId/result',
  ...allowed('task.read'),
  validate({ ...taskParams, form: { outcome: enums.taskOutcome, summary: { type: 'string', max: 2000 }, reason: fields.requiredReason } }),
  webTask.correctResult,
);
router.post(
  '/tasks/:taskId/participations/:userId',
  ...allowed('task.manage'),
  validate({ ...taskUserParams, form: { participated: { type: 'boolean', required: true }, contribution: { type: 'string', max: 1000 }, reason: fields.reason } }),
  webTask.recordParticipation,
);

// 내 업무·교대 요청 (FR-08, FR-09)
router.get('/my-tasks', ...allowed('me.read'), webTask.myTasksPage);
router.post('/tasks/:taskId/swap', ...allowed('task.swap'), validate({ ...taskParams, form: { username, reason: fields.reason } }), webTask.requestSwap);
router.post('/swap-requests/:requestId/approve', ...allowed('task.swap.review'), validate(requestParams), webTask.approveSwap);
router.post('/swap-requests/:requestId/reject', ...allowed('task.swap'), validate({ ...requestParams, form: { reason: fields.reason } }), webTask.rejectSwap);
router.post('/swap-requests/:requestId/cancel', ...allowed('task.swap'), validate(requestParams), webTask.cancelSwap);

// 공용 자원 (FR-13~FR-17, BR-07, BR-08)
const resourceParams = { params: { resourceId: fields.id } };
const taskResourceParams = { params: { taskId: fields.id, resourceId: fields.id } };
const localWindow = { from: { type: 'string', max: 20 }, to: { type: 'string', max: 20 } };
const code = { type: 'string', required: true, max: 30 };
const resourceTimes = kstDatetimes('startAt', 'endAt', 'expectedEndAt', 'dueAt');

router.get(
  '/resources',
  ...allowed('resource.read'),
  validate({
    query: {
      status: enums.resourceStatus, categoryId: fields.optionalId, assignable: { type: 'boolean' }, q: fields.q, ...localWindow, ...paging('resources'),
    },
  }),
  webResource.resourcesPage,
);
router.post(
  '/resources',
  ...allowed('resource.manage'),
  validate({
    form: {
      code: fields.resourceCode, name: fields.resourceName, categoryId: fields.id, location: { type: 'string', max: 100 },
      description: { type: 'string', max: 1000 }, minRole: { ...enums.resourceMinRole, default: 'SOLDIER' },
    },
  }),
  webResource.createResource,
);
router.post(
  '/resource-categories',
  ...allowed('resourceCategory.manage'),
  validate({ form: { name: { type: 'string', required: true, max: 50 }, description: { type: 'string', max: 300 } } }),
  webResource.createCategory,
);
router.post('/resource-categories/:categoryId/delete', ...allowed('resourceCategory.manage'), validate({ params: { categoryId: fields.id } }), webResource.deleteCategory);

router.get('/resources/:resourceId', ...allowed('resource.read'), validate({ ...resourceParams, query: localWindow }), webResource.resourcePage);
router.post(
  '/resources/:resourceId/edit',
  ...allowed('resource.manage'),
  validate({ ...resourceParams, form: { name: { ...fields.resourceName, required: false }, categoryId: fields.optionalId, location: { type: 'string', max: 100 }, description: { type: 'string', max: 1000 } } }),
  webResource.updateResource,
);
router.post(
  '/resources/:resourceId/status',
  ...allowed('resource.operate'),
  validate({ ...resourceParams, form: { status: { ...enums.manualResourceStatus, required: true }, reason: fields.requiredReason } }),
  webResource.changeStatus,
);
router.post(
  '/resources/:resourceId/access-level',
  ...allowed('resource.manage'),
  validate({ ...resourceParams, form: { minRole: { ...enums.resourceMinRole, required: true }, reason: fields.reason } }),
  webResource.changeAccessLevel,
);
router.post('/resources/:resourceId/delete', ...allowed('resource.manage'), validate(resourceParams), webResource.deleteResource);
router.post(
  '/resources/:resourceId/maintenances',
  ...allowed('resource.operate'),
  resourceTimes,
  validate({ ...resourceParams, form: { reason: fields.requiredReason, expectedEndAt: fields.optionalDatetime } }),
  webResource.createMaintenance,
);
router.post(
  '/resources/:resourceId/maintenances/:maintenanceId/complete',
  ...allowed('resource.operate'),
  validate({ params: { resourceId: fields.id, maintenanceId: fields.id }, form: { result: { ...enums.maintenanceResult, required: true }, note: fields.reason } }),
  webResource.completeMaintenance,
);
router.post(
  '/resources/:resourceId/allocations',
  ...allowed('resource.allocate'),
  resourceTimes,
  validate({ ...resourceParams, form: { username, startAt: fields.datetime, endAt: fields.datetime, purpose: fields.reason } }),
  webResource.allocateToMember,
);
router.post('/resource-allocations/:allocationId/cancel', ...allowed('resource.allocate'), validate({ params: { allocationId: fields.id } }), webResource.cancelAllocation);

router.post('/resources/:resourceId/checkout', ...allowed('resource.use'), validate({ ...resourceParams, form: { taskId: fields.optionalId } }), webResource.checkout);
router.post(
  '/resources/:resourceId/return',
  ...allowed('resource.use'),
  validate({ ...resourceParams, form: { condition: { ...enums.returnCondition, default: 'GOOD' }, note: fields.reason } }),
  webResource.returnResource,
);
router.post(
  '/resource-usages/:usageId/extend',
  ...allowed('resource.allocate'),
  resourceTimes,
  validate({ params: { usageId: fields.id }, form: { dueAt: fields.datetime, reason: fields.reason } }),
  webResource.extendUsage,
);
router.post(
  '/resource-usages/:usageId/handover',
  ...allowed('resource.use'),
  resourceTimes,
  validate({ params: { usageId: fields.id }, form: { username, dueAt: fields.optionalDatetime, note: fields.reason } }),
  webResource.handover,
);
router.post(
  '/resource-usages/:usageId/damage',
  ...allowed('resource.use'),
  validate({ params: { usageId: fields.id }, form: { description: fields.requiredReason } }),
  webResource.reportDamage,
);

router.get('/my-resources', ...allowed('resource.use'), webResource.myResourcesPage);
router.post(
  '/resource-requests',
  ...allowed('resource.request'),
  resourceTimes,
  validate({ form: { code, startAt: fields.datetime, endAt: fields.datetime, reason: fields.requiredReason } }),
  webResource.createRequest,
);
router.post('/resource-requests/:requestId/approve', ...allowed('resource.request.review'), validate({ ...requestParams, form: { note: fields.reason } }), webResource.approveRequest);
router.post('/resource-requests/:requestId/reject', ...allowed('resource.request.review'), validate({ ...requestParams, form: { reason: fields.requiredReason } }), webResource.rejectRequest);
router.post('/resource-requests/:requestId/cancel', ...allowed('resource.request'), validate(requestParams), webResource.cancelRequest);

// 업무 자원 할당 (업무 화면)
router.post(
  '/tasks/:taskId/resources',
  ...allowed('task.manage'),
  resourceTimes,
  validate({ ...taskParams, form: { code, startAt: fields.optionalDatetime, endAt: fields.optionalDatetime, note: fields.note } }),
  webResource.allocateToTask,
);
router.post('/tasks/:taskId/resources/return', ...allowed('task.manage'), validate({ ...taskParams, form: { note: fields.reason } }), webResource.returnTaskResources);
router.post(
  '/tasks/:taskId/resources/:resourceId/edit',
  ...allowed('task.manage'),
  resourceTimes,
  validate({ ...taskResourceParams, form: { startAt: fields.optionalDatetime, endAt: fields.optionalDatetime } }),
  webResource.adjustTaskResource,
);
router.post('/tasks/:taskId/resources/:resourceId/remove', ...allowed('task.manage'), validate(taskResourceParams), webResource.releaseTaskResource);

router.use(webNotFound);
router.use(webErrorHandler);

module.exports = router;
