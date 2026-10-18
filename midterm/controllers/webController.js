// 웹 화면 (CR-02, EJS 서버 사이드 렌더링): 업무 홈, 로그인, 내 정보, 구성원, Crew, 역할 변경 요청.
// 화면은 REST API와 같은 서비스 계층을 호출하므로, 권한 검사(NFR-03)와 업무 규칙(BR-01·BR-04·BR-05)이 API와 똑같이 적용된다.
const userModel = require('../models/sql/userModel');
const membershipModel = require('../models/sql/membershipModel');
const authService = require('../services/authService');
const meService = require('../services/meService');
const userService = require('../services/userService');
const crewService = require('../services/crewService');
const membershipService = require('../services/membershipService');
const joinRequestService = require('../services/joinRequestService');
const roleRequestService = require('../services/roleRequestService');
const resourceRequestService = require('../services/resourceRequestService');
const statsService = require('../services/statsService');
const adminService = require('../services/adminService');
const { setLoginCookie, clearLoginCookie, setFlash, safeNext } = require('../middlewares/web');
const webRecord = require('./webRecordController');
const webOps = require('./webOpsController');
const { optional, denied, userIdOf, action, nothingChanged } = require('./webHelpers');
const { contextOf } = require('../utils/context');

// ---------------------------------------------------------------------------
// 업무 홈·로그인

// 내가 승인·처리해야 하는 요청 수 (권한이 있는 것만)
async function pendingApprovals(user, can) {
  const [roleRequests, resourceRequests] = await Promise.all([
    can('roleRequest.review') ? roleRequestService.list(user, { status: 'PENDING', page: 1, size: 1 }) : null,
    can('resource.request.review') ? resourceRequestService.list(user, { box: 'review', status: 'PENDING', page: 1, size: 1 }) : null,
  ]);
  return { roleRequests: roleRequests?.meta.total ?? null, resourceRequests: resourceRequests?.meta.total ?? null };
}

// 로그인한 구성원의 첫 화면: 내 업무·일정·자원·처리할 일, 관리자는 시스템 상태, 운영 관리자는 운영 경고
async function home(req, res) {
  if (!req.user) return res.redirect('/login');
  const { can } = res.locals;
  const admin = req.user.role === 'ADMIN';
  const [profile, summary, approvals, alerts, system] = await Promise.all([
    meService.getMe(req.user),
    admin ? null : webOps.myDashboard(req.user),
    pendingApprovals(req.user, can),
    can('stats.read') ? statsService.alerts() : null,
    admin ? Promise.all([
      adminService.health(),
      adminService.integrityCheck(),
      adminService.accounts(req.user, { locked: true, page: 1, size: 1 }),
      adminService.loginHistory(req.user, { success: false, page: 1, size: 6 }),
    ]) : null,
  ]);
  return res.render('home', {
    title: '업무 홈', profile, summary, approvals, alerts, now: new Date(),
    system: system && { health: system[0], integrity: system[1], lockedCount: system[2].meta.total, failedLogins: system[3].data },
  });
}

function loginPage(req, res) {
  const next = safeNext(req.query.next);
  if (req.user) return res.redirect(next);
  return res.render('login', { title: '로그인', next });
}

async function login(req, res) {
  const { username, password, next } = req.valid.body;
  const result = await authService.login({ username, password }, contextOf(req));
  // 다른 계정으로 바꿔 로그인하면 이전 세션은 끝낸다.
  if (req.user) await authService.logout(req.user, req.sessionId);
  setLoginCookie(res, result);
  setFlash(res, 'success', `${result.user.name}(${result.user.roleLabel})님으로 로그인했습니다.`);
  res.redirect(safeNext(next));
}

async function logout(req, res) {
  if (req.user) await authService.logout(req.user, req.sessionId);
  clearLoginCookie(res);
  setFlash(res, 'success', '로그아웃했습니다.');
  res.redirect('/');
}

// ---------------------------------------------------------------------------
// 내 정보

async function mePage(req, res) {
  const [profile, permissions, sessions, joinRequests] = await Promise.all([
    meService.getMe(req.user),
    meService.getPermissions(req.user),
    authService.listSessions(req.user, req.sessionId),
    joinRequestService.listMine(req.user, { page: 1, size: 20 }),
  ]);
  res.render('me', { title: '내 정보', profile, permissions, sessions, joinRequests: joinRequests.data });
}

const updateProfile = action(async (req) => {
  if (Object.keys(req.valid.body).length === 0) return nothingChanged;
  await meService.updateMe(req.user, req.valid.body, contextOf(req));
  return { message: '연락처·별명을 수정했습니다.' };
});

const changePassword = action(async (req) => {
  const result = await meService.changePassword(req.user, req.sessionId, req.valid.body, contextOf(req));
  return { message: `비밀번호를 바꿨습니다. 다른 기기의 로그인 세션 ${result.revokedSessionCount}개를 종료했습니다.` };
});

async function revokeSessions(req, res) {
  const { revokedCount } = await authService.revokeAllSessions(req.user, contextOf(req));
  clearLoginCookie(res);
  setFlash(res, 'success', `로그인 세션 ${revokedCount}개를 모두 종료했습니다. 다시 로그인하세요.`);
  res.redirect('/login');
}

// ---------------------------------------------------------------------------
// 구성원

async function usersPage(req, res) {
  const query = req.valid.query;
  const [result, crews] = await Promise.all([
    userService.list(req.user, query),
    crewService.list(req.user, { page: 1, size: 100, sort: 'name' }),
  ]);
  res.render('users', { title: '구성원', users: result.data, meta: result.meta, query, crews: crews.data });
}

const createUser = action(async (req) => {
  const user = await userService.create(req.user, req.valid.body, contextOf(req));
  return { message: `${user.name}(${user.username})님을 Associate·대기 상태로 등록했습니다.`, redirect: `/users/${user.id}` };
});

async function userPage(req, res) {
  const { userId } = req.valid.params;
  const user = await userService.get(req.user, userId);
  const [chain, memberships, subordinates, records] = await Promise.all([
    optional(() => userService.chainOfCommand(req.user, userId)),
    optional(() => userService.memberships(req.user, userId, { page: 1, size: 50 })),
    optional(() => userService.subordinates(req.user, userId, { page: 1, size: 50, sort: '-rank' })),
    webRecord.userRecords(req.user, userId),
  ]);
  res.render('user', { title: user.name, user, chain, memberships, subordinates, ...records });
}

const updateUser = action(async (req) => {
  if (Object.keys(req.valid.body).length === 0) return nothingChanged;
  await userService.update(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: '기본 정보를 수정했습니다.' };
});

const changeRole = action(async (req) => {
  const user = await userService.changeRole(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: `${user.name}님의 역할을 ${user.roleLabel}(으)로 바꿨습니다.` };
});

const changeStatus = action(async (req) => {
  const user = await userService.changeStatus(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: `${user.name}님의 상태를 ${user.statusLabel}(으)로 바꿨습니다.` };
});

const recommendRole = action(async (req) => {
  const request = await roleRequestService.create(req.user, { userId: req.valid.params.userId, ...req.valid.body }, contextOf(req));
  return { message: `${request.user.name}님의 역할을 ${request.toRoleLabel}(으)로 바꾸도록 요청했습니다. Underboss·Boss가 승인하면 반영됩니다.` };
});

const deleteUser = action(async (req) => {
  await userService.remove(req.user, req.valid.params.userId, contextOf(req));
  return { message: '구성원을 삭제했습니다.', redirect: '/users' };
});

// ---------------------------------------------------------------------------
// Crew

async function crewsPage(req, res) {
  const query = req.valid.query;
  const [result, underbosses] = await Promise.all([
    crewService.list(req.user, query),
    userModel.listByRole('UNDERBOSS', { status: 'ACTIVE' }),
  ]);
  res.render('crews', { title: 'Crew', crews: result.data, meta: result.meta, query, underbosses });
}

const createCrew = action(async (req) => {
  const crew = await crewService.create(req.user, req.valid.body, contextOf(req));
  return { message: `'${crew.name}' Crew를 만들었습니다.`, redirect: `/crews/${crew.id}` };
});

async function crewPage(req, res) {
  const { crewId } = req.valid.params;
  const { can } = res.locals;
  const crew = await crewService.get(req.user, crewId);
  const [hierarchy, members, history, capoHistory, joinRequests, activeCrews, myMembership, activity, workload] = await Promise.all([
    optional(() => crewService.hierarchy(req.user, crewId)),
    optional(() => membershipService.listMembers(req.user, crewId, { page: 1, size: 100, sort: '-rank' })),
    optional(() => membershipService.history(req.user, crewId, { page: 1, size: 30 })),
    can('crew.capoHistory.read')
      ? optional(() => crewService.capoHistory(req.user, crewId, { page: 1, size: 20 }))
      : denied('Capo 이상만 볼 수 있습니다.'),
    can('crew.joinRequest.review')
      ? optional(() => joinRequestService.listForCrew(req.user, crewId, { page: 1, size: 30 }))
      : denied('Crew 책임자와 Underboss·Boss만 볼 수 있습니다.'),
    crewService.list(req.user, { status: 'ACTIVE', page: 1, size: 100, sort: 'name' }),
    membershipModel.findActive(crewId, req.user.id),
    can('crew.activity.read') ? webRecord.crewActivity(req.user, crewId) : denied('그 Crew의 책임자와 Underboss·Boss만 볼 수 있습니다.'),
    can('crew.workload.read') ? webOps.crewWorkload(req.user, crewId) : denied('그 Crew의 책임자와 Underboss·Boss만 볼 수 있습니다.'),
  ]);
  res.render('crew', {
    title: crew.name, crew, hierarchy, members, history, capoHistory, joinRequests, activity, workload,
    isMember: Boolean(myMembership),
    otherCrews: activeCrews.data.filter((c) => c.id !== crew.id),
  });
}

const crewAction = (handle) => action(async (req) => handle(req, req.valid.params.crewId, contextOf(req)));

const updateCrew = crewAction(async (req, crewId, ctx) => {
  if (Object.keys(req.valid.body).length === 0) return nothingChanged;
  await crewService.update(req.user, crewId, req.valid.body, ctx);
  return { message: 'Crew 정보를 수정했습니다.' };
});

const changeCrewStatus = crewAction(async (req, crewId, ctx) => {
  const crew = await crewService.changeStatus(req.user, crewId, req.valid.body, ctx);
  return { message: `'${crew.name}' Crew를 ${crew.statusLabel} 상태로 바꿨습니다.` };
});

const assignCapo = crewAction(async (req, crewId, ctx) => {
  const { username, reason } = req.valid.body;
  const crew = await crewService.assignCapo(req.user, crewId, { userId: await userIdOf(username), reason }, ctx);
  return { message: `${crew.capo.name}님을 책임자로 지정했습니다.` };
});

const removeCapo = crewAction(async (req, crewId, ctx) => {
  await crewService.removeCapo(req.user, crewId, ctx);
  return { message: '책임자 지정을 해제했습니다. 해제된 구성원은 정식 소속원으로 남습니다.' };
});

const assignUnderboss = crewAction(async (req, crewId, ctx) => {
  const crew = await crewService.assignUnderboss(req.user, crewId, { userId: await userIdOf(req.valid.body.username) }, ctx);
  return { message: `${crew.underboss.name}님을 담당 Underboss로 지정했습니다.` };
});

const mergeCrew = crewAction(async (req, crewId, ctx) => {
  const result = await membershipService.merge(req.user, { sourceCrewId: crewId, ...req.valid.body }, ctx);
  return {
    message: `'${result.sourceCrew.name}' Crew를 '${result.targetCrew.name}'에 병합했습니다. ${result.movedCount}명을 옮겼습니다.`,
    redirect: `/crews/${result.targetCrew.id}`,
  };
});

const deleteCrew = crewAction(async (req, crewId, ctx) => {
  await crewService.remove(req.user, crewId, ctx);
  return { message: 'Crew를 삭제했습니다.', redirect: '/crews' };
});

const addMember = crewAction(async (req, crewId, ctx) => {
  const { username, type, note } = req.valid.body;
  const membership = await membershipService.addMember(req.user, crewId, { userId: await userIdOf(username), type, note }, ctx);
  return { message: `${membership.user.name}님을 ${membership.typeLabel} 소속으로 편성했습니다.` };
});

const changeMemberType = crewAction(async (req, crewId, ctx) => {
  const membership = await membershipService.changeType(req.user, crewId, req.valid.params.userId, req.valid.body, ctx);
  return { message: `${membership.user.name}님을 ${membership.typeLabel} 소속으로 바꿨습니다.` };
});

const removeMember = crewAction(async (req, crewId, ctx) => {
  const membership = await membershipService.removeMember(req.user, crewId, req.valid.params.userId, ctx);
  return { message: `${membership.user.name}님을 Crew에서 제외했습니다. 소속 기록은 이력에 남습니다.` };
});

const transferMember = crewAction(async (req, crewId, ctx) => {
  const membership = await membershipService.transfer(req.user, crewId, req.valid.params.userId, req.valid.body, ctx);
  return { message: `${membership.user.name}님을 '${membership.crew.name}' Crew로 이동했습니다.` };
});

const applyJoin = crewAction(async (req, crewId, ctx) => {
  const request = await joinRequestService.apply(req.user, crewId, req.valid.body, ctx);
  return { message: `'${request.crew.name}' Crew에 ${request.typeLabel} 소속을 신청했습니다. 책임자의 승인을 기다립니다.` };
});

const approveJoin = crewAction(async (req, crewId, ctx) => {
  const request = await joinRequestService.approve(req.user, crewId, req.valid.params.requestId, ctx);
  return { message: `${request.applicant.name}님의 소속 신청을 승인하고 ${request.typeLabel} 소속으로 편성했습니다.` };
});

const rejectJoin = crewAction(async (req, crewId, ctx) => {
  const request = await joinRequestService.reject(req.user, crewId, req.valid.params.requestId, req.valid.body, ctx);
  return { message: `${request.applicant.name}님의 소속 신청을 거절했습니다.` };
});

const cancelJoin = crewAction(async (req, crewId, ctx) => {
  await joinRequestService.cancel(req.user, crewId, req.valid.params.requestId, ctx);
  return { message: '소속 신청을 취소했습니다.' };
});

// ---------------------------------------------------------------------------
// 역할 변경 요청

async function roleRequestsPage(req, res) {
  const query = req.valid.query;
  const result = await roleRequestService.list(req.user, query);
  res.render('role-requests', { title: '역할 변경 요청', requests: result.data, meta: result.meta, query });
}

const approveRoleRequest = action(async (req) => {
  const request = await roleRequestService.approve(req.user, req.valid.params.requestId, contextOf(req));
  return { message: `요청을 승인해 ${request.user.name}님의 역할을 ${request.toRoleLabel}(으)로 바꿨습니다.` };
});

const rejectRoleRequest = action(async (req) => {
  const request = await roleRequestService.reject(req.user, req.valid.params.requestId, req.valid.body, contextOf(req));
  return { message: `${request.user.name}님에 대한 역할 변경 요청을 거절했습니다.` };
});

module.exports = {
  home, loginPage, login, logout,
  mePage, updateProfile, changePassword, revokeSessions,
  usersPage, createUser, userPage, updateUser, changeRole, changeStatus, recommendRole, deleteUser,
  crewsPage, createCrew, crewPage, updateCrew, changeCrewStatus, assignCapo, removeCapo, assignUnderboss,
  mergeCrew, deleteCrew, addMember, changeMemberType, removeMember, transferMember,
  applyJoin, approveJoin, rejectJoin, cancelJoin,
  roleRequestsPage, approveRoleRequest, rejectRoleRequest,
};
