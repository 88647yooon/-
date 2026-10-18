// 운영 현황 대시보드·통합 검색·관리자 웹 화면 (CR-02). 단계 6의 기능 요구사항(FR-21~FR-23, NFR-04)을 브라우저에서 확인할 수 있게 한다.
// REST API와 같은 서비스 계층과 같은 권한 키를 쓴다. 관리자 화면에 권한 없이 들어오면 403 화면이 나오고 권한 거부 기록이 남는다 (BR-09).
const statsService = require('../services/statsService');
const searchService = require('../services/searchService');
const dashboardService = require('../services/dashboardService');
const adminService = require('../services/adminService');
const { ROLE_INFO, TASK_STATUS_INFO } = require('../config/constants');
const { setFlash } = require('../middlewares/web');
const { optional, action } = require('./webHelpers');
const { contextOf } = require('../utils/context');

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 운영 현황 대시보드 (FR-22)

// 기간 필터 하나가 아래 모든 통계를 정한다: 지난 N일 (업무 추이는 예정된 업무도 보이도록 앞으로 N일까지)
async function dashboardPage(req, res) {
  const days = req.valid.query.days;
  const interval = req.valid.query.interval ?? (days > 31 ? 'week' : 'day');
  const now = new Date();
  const past = { from: new Date(now.getTime() - days * DAY), to: now };
  const around = { from: past.from, to: new Date(now.getTime() + days * DAY) };
  const can = res.locals.can;
  const [overview, members, crews, regions, trend, leadTimes, resources, ranking, evaluations, changes, alerts, adminActivity] = await Promise.all([
    statsService.overview(),
    statsService.members({}),
    statsService.crews({ ...around, status: 'ACTIVE' }),
    statsService.regions(),
    statsService.taskTrend({ ...around, interval }),
    statsService.leadTimes(past),
    statsService.resources(past),
    statsService.usageRanking({ ...past, page: 1, size: 8 }),
    statsService.evaluations({ ...past, interval: days > 31 ? 'month' : 'week' }),
    statsService.membershipChanges({ ...past, interval }),
    statsService.alerts(),
    can('stats.adminActivity') ? statsService.adminActivity({ ...past, interval }) : null,
  ]);
  res.render('dashboard', {
    title: '운영 현황',
    days, interval, now,
    overview, members, crews, regions, trend, leadTimes, resources, ranking: ranking.data, evaluations, changes, alerts, adminActivity,
    taskStatuses: Object.entries(TASK_STATUS_INFO).map(([status, info], i) => ({ status, label: info.label, color: `var(--series-${i + 1})` })),
  });
}

// ---------------------------------------------------------------------------
// 통합 검색 (FR-21)

async function searchPage(req, res) {
  const { q, types, page, size } = req.valid.query;
  const [result, saved] = await Promise.all([
    q ? searchService.search(req.user, { q, types, page, size }) : null,
    searchService.list(req.user),
  ]);
  res.render('search', { title: '통합 검색', query: req.valid.query, result, saved, savedRun: null });
}

// 저장 검색 실행은 같은 검색 화면에 결과를 보여 준다.
async function runSavedSearch(req, res) {
  const run = await searchService.run(req.user, req.valid.params.searchId, { page: 1, size: 10 });
  const saved = await searchService.list(req.user);
  res.render('search', { title: '통합 검색', query: { q: run.q, types: run.types, page: 1, size: 10 }, result: run, saved, savedRun: run.savedSearch });
}

const saveSearch = action(async (req) => {
  const s = await searchService.save(req.user, req.valid.body);
  return { message: `'${s.name}' 검색 조건을 저장했습니다.` };
});

const removeSavedSearch = action(async (req) => {
  await searchService.remove(req.user, req.valid.params.searchId);
  return { message: '저장 검색을 지웠습니다.' };
});

// ---------------------------------------------------------------------------
// 내 요약 (내 정보 화면에 붙는다)

const myDashboard = (viewer) => optional(() => dashboardService.me(viewer));

// Crew 화면에 붙는 업무량 (그 Crew의 책임자, Underboss·Boss)
const crewWorkload = (viewer, crewId) => optional(() => statsService.crewWorkload(viewer, crewId, {}));

// ---------------------------------------------------------------------------
// 관리자 (FR-23)

async function adminPage(req, res) {
  const query = req.valid.query;
  const [accounts, history, permissions, settings, integrity, health] = await Promise.all([
    adminService.accounts(req.user, { q: query.q, locked: query.locked, sort: query.sort, page: query.page, size: query.size }),
    adminService.loginHistory(req.user, { success: query.loginFailed ? false : undefined, page: 1, size: 15 }),
    adminService.permissions(),
    adminService.getSettings(),
    adminService.integrityCheck(),
    adminService.health(),
  ]);
  res.render('admin', {
    title: '관리자', query, accounts: accounts.data, meta: accounts.meta, history: history.data, permissions, settings, integrity, health,
    editRole: query.role ?? 'SOLDIER', roleInfo: ROLE_INFO,
  });
}

const lock = action(async (req) => {
  const a = await adminService.lock(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: `${a.username} 계정을 잠갔습니다. 세션 ${a.revokedSessionCount}개를 끊었습니다.` };
});

const unlock = action(async (req) => {
  const a = await adminService.unlock(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: `${a.username} 계정의 잠금을 풀었습니다.` };
});

// 임시 비밀번호는 다음 화면에 한 번만 보여 준다.
async function resetPassword(req, res) {
  const r = await adminService.resetPassword(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  setFlash(res, 'success', `${r.user.username}의 임시 비밀번호: ${r.temporaryPassword} (지금만 보입니다. 세션 ${r.revokedSessionCount}개를 끊었습니다.)`);
  res.redirect('/admin');
}

const forceLogout = action(async (req) => {
  const r = await adminService.forceLogout(req.user, req.valid.params.userId, req.valid.body, contextOf(req));
  return { message: `${r.user.username}의 세션 ${r.revokedSessionCount}개를 끊었습니다.` };
});

// 권한 체크박스는 perm_<키> 칸으로 온다 (점은 그대로 둔다).
const setRolePermissions = action(async (req) => {
  const keys = Object.keys(req.body).filter((k) => k.startsWith('perm_')).map((k) => k.slice(5));
  const r = await adminService.setRolePermissions(req.user, req.valid.params.role, { keys, reason: req.valid.body.reason }, contextOf(req));
  const diff = [r.added.length && `추가 ${r.added.join(', ')}`, r.removed.length && `제외 ${r.removed.join(', ')}`].filter(Boolean).join(' · ');
  return { message: `${r.roleLabel} 권한을 저장했습니다. ${diff || '바뀐 권한 없음'}`, redirect: `/admin?role=${r.role}#permissions` };
});

// 설정 입력칸은 set_<키> 칸으로 온다. 비운 칸은 보내지 않은 것으로 본다.
const updateSettings = action(async (req) => {
  const settings = Object.fromEntries(Object.entries(req.body).filter(([k, v]) => k.startsWith('set_') && v !== '').map(([k, v]) => [k.slice(4), Number(v)]));
  await adminService.updateSettings(req.user, { settings, reason: req.valid.body.reason }, contextOf(req));
  return { message: '운영 설정을 바꿨습니다. 바로 적용됩니다.', redirect: '/admin#settings' };
});

module.exports = {
  dashboardPage, searchPage, runSavedSearch, saveSearch, removeSavedSearch, myDashboard, crewWorkload,
  adminPage, lock, unlock, resetPassword, forceLogout, setRolePermissions, updateSettings,
};
