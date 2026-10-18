// 이력·평가·평판·감사 기록 API 컨트롤러 (단계 5)
const historyService = require('../services/historyService');
const evaluationService = require('../services/evaluationService');
const reputationService = require('../services/reputationService');
const auditLogService = require('../services/auditLogService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const p = (req) => req.valid.params;
const b = (req) => req.valid.body;
const q = (req) => req.valid.query;

module.exports = {
  // 이력 조회 (#155~#157)
  changeHistory: async (req, res) => okPage(res, await historyService.changeHistory(req.user, p(req).userId, q(req))),
  userActivity: async (req, res) => okPage(res, await historyService.userActivity(req.user, p(req).userId, q(req))),
  crewActivity: async (req, res) => okPage(res, await historyService.crewActivity(req.user, p(req).crewId, q(req))),

  // 평가 (#158~#170)
  createEvaluation: async (req, res) => created(res, await evaluationService.create(req.user, p(req).taskId, b(req), contextOf(req))),
  taskEvaluations: async (req, res) => ok(res, await evaluationService.listByTask(req.user, p(req).taskId, q(req))),
  searchEvaluations: async (req, res) => okPage(res, await evaluationService.search(req.user, q(req))),
  pendingEvaluations: async (req, res) => ok(res, await evaluationService.pending(req.user)),
  getEvaluation: async (req, res) => ok(res, await evaluationService.get(req.user, p(req).evaluationId)),
  updateEvaluation: async (req, res) => ok(res, await evaluationService.update(req.user, p(req).evaluationId, b(req), contextOf(req))),
  withdrawEvaluation: async (req, res) => ok(res, await evaluationService.withdraw(req.user, p(req).evaluationId, b(req), contextOf(req))),
  userEvaluations: async (req, res) => okPage(res, await evaluationService.listForUser(req.user, p(req).userId, q(req))),
  listCriteria: async (req, res) => ok(res, await evaluationService.listCriteria()),
  replaceCriteria: async (req, res) => ok(res, await evaluationService.replaceCriteria(req.user, b(req), contextOf(req))),
  appeal: async (req, res) => created(res, await evaluationService.appeal(req.user, p(req).evaluationId, b(req), contextOf(req))),
  listAppeals: async (req, res) => okPage(res, await evaluationService.listAppeals(req.user, q(req))),
  resolveAppeal: async (req, res) => ok(res, await evaluationService.resolveAppeal(req.user, p(req).appealId, b(req), contextOf(req))),

  // 평판 (#171~#175)
  reputation: async (req, res) => ok(res, await reputationService.summary(req.user, p(req).userId)),
  recordReputationEvent: async (req, res) => created(res, await reputationService.recordEvent(req.user, p(req).userId, b(req), contextOf(req))),
  reputationEvents: async (req, res) => okPage(res, await reputationService.listEvents(req.user, p(req).userId, q(req))),
  cancelReputationEvent: async (req, res) => ok(res, await reputationService.cancelEvent(req.user, p(req).eventId, b(req), contextOf(req))),
  rankings: async (req, res) => okPage(res, await reputationService.rankings(req.user, q(req))),

  // 감사 기록 (#176~#179)
  auditLogs: async (req, res) => okPage(res, await auditLogService.search(req.user, q(req))),
  auditLog: async (req, res) => ok(res, await auditLogService.get(req.user, p(req).logId)),
  // CSV 파일로 내려 준다 (공통 JSON 응답 형식의 예외)
  exportAuditLogs: async (req, res) => {
    const { filename, count, csv } = await auditLogService.exportCsv(req.user, q(req));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'X-Total-Count': String(count) });
    res.send(csv);
  },
  securityEvents: async (req, res) => okPage(res, await auditLogService.securityEvents(req.user, q(req))),
};
