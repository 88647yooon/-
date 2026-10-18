// 검색·통계·관리자 API 컨트롤러 (단계 6)
const searchService = require('../services/searchService');
const statsService = require('../services/statsService');
const dashboardService = require('../services/dashboardService');
const adminService = require('../services/adminService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const p = (req) => req.valid.params;
const b = (req) => req.valid.body;
const q = (req) => req.valid.query;

module.exports = {
  // 검색 (#180~#184)
  search: async (req, res) => ok(res, await searchService.search(req.user, q(req))),
  saveSearch: async (req, res) => created(res, await searchService.save(req.user, b(req))),
  listSavedSearches: async (req, res) => ok(res, await searchService.list(req.user)),
  runSavedSearch: async (req, res) => ok(res, await searchService.run(req.user, p(req).searchId, q(req))),
  removeSavedSearch: async (req, res) => ok(res, await searchService.remove(req.user, p(req).searchId)),

  // 운영 현황 통계 (#185~#198)
  overview: async (req, res) => ok(res, await statsService.overview()),
  members: async (req, res) => ok(res, await statsService.members(q(req))),
  crews: async (req, res) => ok(res, await statsService.crews(q(req))),
  regions: async (req, res) => ok(res, await statsService.regions()),
  taskTrend: async (req, res) => ok(res, await statsService.taskTrend(q(req))),
  leadTimes: async (req, res) => ok(res, await statsService.leadTimes(q(req))),
  resources: async (req, res) => ok(res, await statsService.resources(q(req))),
  usageRanking: async (req, res) => okPage(res, await statsService.usageRanking(q(req))),
  evaluations: async (req, res) => ok(res, await statsService.evaluations(q(req))),
  membershipChanges: async (req, res) => ok(res, await statsService.membershipChanges(q(req))),
  adminActivity: async (req, res) => ok(res, await statsService.adminActivity(q(req))),
  alerts: async (req, res) => ok(res, await statsService.alerts()),
  crewWorkload: async (req, res) => ok(res, await statsService.crewWorkload(req.user, p(req).crewId, q(req))),
  myDashboard: async (req, res) => ok(res, await dashboardService.me(req.user)),

  // 관리자 (#199~#210)
  accounts: async (req, res) => okPage(res, await adminService.accounts(req.user, q(req))),
  lock: async (req, res) => ok(res, await adminService.lock(req.user, p(req).userId, b(req), contextOf(req))),
  unlock: async (req, res) => ok(res, await adminService.unlock(req.user, p(req).userId, b(req), contextOf(req))),
  resetPassword: async (req, res) => ok(res, await adminService.resetPassword(req.user, p(req).userId, b(req), contextOf(req))),
  forceLogout: async (req, res) => ok(res, await adminService.forceLogout(req.user, p(req).userId, b(req), contextOf(req))),
  loginHistory: async (req, res) => okPage(res, await adminService.loginHistory(req.user, q(req))),
  permissions: async (req, res) => ok(res, await adminService.permissions()),
  setRolePermissions: async (req, res) => ok(res, await adminService.setRolePermissions(req.user, p(req).role, b(req), contextOf(req))),
  settings: async (req, res) => ok(res, await adminService.getSettings()),
  updateSettings: async (req, res) => ok(res, await adminService.updateSettings(req.user, b(req), contextOf(req))),
  integrityCheck: async (req, res) => ok(res, await adminService.integrityCheck()),
  health: async (req, res) => ok(res, await adminService.health()),
};
