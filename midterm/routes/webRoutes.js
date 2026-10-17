// 웹 화면 라우터 (CR-02). REST API가 아니므로 API 목록표의 개수에 포함하지 않는다.
// 각 경로에는 같은 기능의 API와 똑같은 권한 키를 건다. 화면에서 버튼을 숨기는 것과 별개로 서버가 다시 검사한다 (NFR-03).
const express = require('express');
const web = require('../controllers/webController');
const { webContext, requireLogin, webNotFound, webErrorHandler } = require('../middlewares/web');
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

router.use(webNotFound);
router.use(webErrorHandler);

module.exports = router;
