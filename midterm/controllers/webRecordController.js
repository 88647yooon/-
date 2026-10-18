// 평가·평판·이력·감사 기록 웹 화면 (CR-02, FR-18~FR-20, BR-10).
// REST API와 같은 서비스 계층을 호출하므로 평가 규칙과 조회 범위가 API와 똑같이 적용된다.
const evaluationService = require('../services/evaluationService');
const reputationService = require('../services/reputationService');
const historyService = require('../services/historyService');
const auditLogService = require('../services/auditLogService');
const { ACTION_LABELS } = require('../config/actions');
const { optional, localDate, action } = require('./webHelpers');
const { contextOf } = require('../utils/context');
const { badRequest } = require('../utils/errors');

const body = (req) => req.valid.body;
const eid = (req) => req.valid.params.evaluationId;

// 점수 입력칸은 score_<항목 키>로 온다. 비운 칸은 보내지 않은 것으로 본다.
function scoresOf(form) {
  const scores = {};
  for (const [key, value] of Object.entries(form)) {
    const match = /^score_([a-z][a-z0-9_]*)$/.exec(key);
    if (match && value !== '') scores[match[1]] = Number(value);
  }
  return Object.keys(scores).length ? scores : undefined;
}

// 평가 항목 설정 폼: 줄마다 key_<n>, label_<n>, weight_<n>, description_<n>. 키를 비운 줄은 뺀다.
function criteriaOf(form) {
  const rows = [];
  for (let i = 0; i < 10; i += 1) {
    const key = (form[`key_${i}`] ?? '').trim();
    if (!key) continue;
    const weight = Number(form[`weight_${i}`]);
    const label = (form[`label_${i}`] ?? '').trim();
    const description = (form[`description_${i}`] ?? '').trim();
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(key) || !label || label.length > 30 || !Number.isInteger(weight) || weight < 1 || weight > 10) {
      throw badRequest(`${i + 1}번째 항목이 올바르지 않습니다.`, [{ field: `form.key_${i}`, message: '키는 영문 소문자로 시작하는 2~30자, 이름은 30자 이하, 가중치는 1~10 정수여야 합니다.' }]);
    }
    rows.push({ key, label, weight, ...(description && { description: description.slice(0, 200) }) });
  }
  if (rows.length === 0) throw badRequest('평가 항목을 하나 이상 입력하세요.', [{ field: 'form.key_0', message: '필수 항목입니다.' }]);
  return rows;
}

// 화면의 기간 조건 (datetime-local, 한국 시간)
const periodOf = (query) => ({ from: localDate(query.from), to: localDate(query.to) });

// ---------------------------------------------------------------------------
// 화면

async function evaluationsPage(req, res) {
  const { can } = res.locals;
  const query = req.valid.query;
  const searchQuery = {
    ...periodOf(query), evaluateeId: query.evaluateeId, evaluatorId: query.evaluatorId, crewId: query.crewId, status: query.status,
    sort: query.sort, page: query.page, size: query.size,
  };
  const [criteria, pending, myAppeals, openAppeals, search, rankings] = await Promise.all([
    evaluationService.listCriteria(),
    can('evaluation.write') ? evaluationService.pending(req.user) : null,
    evaluationService.listAppeals(req.user, { appellantId: req.user.id, page: 1, size: 20 }),
    can('evaluation.appeal.resolve') ? evaluationService.listAppeals(req.user, { status: 'PENDING', page: 1, size: 30 }) : null,
    can('evaluation.search') ? evaluationService.search(req.user, searchQuery) : null,
    can('reputation.ranking') ? reputationService.rankings(req.user, { page: 1, size: 10 }) : null,
  ]);
  res.render('evaluations', {
    title: '평가',
    query,
    criteria,
    pending,
    myAppeals: myAppeals.data.filter((a) => a.appellant.id === req.user.id),
    openAppeals: openAppeals?.data ?? [],
    evaluations: search?.data ?? null,
    meta: search?.meta ?? null,
    rankings: rankings?.data ?? [],
  });
}

async function evaluationPage(req, res) {
  const evaluation = await evaluationService.get(req.user, eid(req));
  res.render('evaluation', { title: `${evaluation.evaluatee.name} 평가`, evaluation });
}

async function auditLogsPage(req, res) {
  const { can } = res.locals;
  const query = req.valid.query;
  const filter = { ...periodOf(query), action: query.action, targetEntity: query.targetEntity, targetId: query.targetId, q: query.q };
  const [logs, security] = await Promise.all([
    auditLogService.search(req.user, { ...filter, sort: query.sort, page: query.page, size: query.size }),
    can('security.read') ? auditLogService.securityEvents(req.user, { page: 1, size: 20 }) : null,
  ]);
  const exportQuery = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => v && !['page', 'size'].includes(k))).toString();
  res.render('audit-logs', {
    title: '감사 기록', query, logs: logs.data, meta: logs.meta, security: security?.data ?? null, actions: ACTION_LABELS, exportQuery,
  });
}

async function auditLogPage(req, res) {
  const log = await auditLogService.get(req.user, req.valid.params.logId);
  res.render('audit-log', { title: '감사 기록 상세', log });
}

async function exportAuditLogs(req, res) {
  const query = req.valid.query;
  const { filename, count, csv } = await auditLogService.exportCsv(req.user, {
    ...periodOf(query), action: query.action, targetEntity: query.targetEntity, targetId: query.targetId, q: query.q, sort: query.sort,
  });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'X-Total-Count': String(count) });
  res.send(csv);
}

// 구성원 상세 화면에 붙는 평가·평판·이력 영역 (권한이 없으면 그 자리에 이유를 보여 준다)
async function userRecords(viewer, userId) {
  const [reputation, evaluations, events, changes, activity] = await Promise.all([
    optional(() => reputationService.summary(viewer, userId)),
    optional(() => evaluationService.listForUser(viewer, userId, { includeWithdrawn: true, page: 1, size: 20, sort: '-createdAt' })),
    optional(() => reputationService.listEvents(viewer, userId, { includeCancelled: true, page: 1, size: 20 })),
    optional(() => historyService.changeHistory(viewer, userId, { page: 1, size: 100, sort: 'at' })),
    optional(() => historyService.userActivity(viewer, userId, { page: 1, size: 30 })),
  ]);
  return { reputation, evaluations, events, changes, activity };
}

// 업무 화면에 붙는 평가 영역 (완료된 업무를 관리하는 사람에게만)
async function taskEvaluations(viewer, task) {
  if (task.status !== 'COMPLETED') return null;
  return optional(async () => ({
    list: await evaluationService.listByTask(viewer, task.id, { includeWithdrawn: true }),
    criteria: await evaluationService.listCriteria(),
  }));
}

// Crew 화면에 붙는 활동 타임라인
const crewActivity = (viewer, crewId) => optional(() => historyService.crewActivity(viewer, crewId, { page: 1, size: 30 }));

// ---------------------------------------------------------------------------
// 폼 처리

const createEvaluation = action(async (req) => {
  const { evaluateeId, comment } = body(req);
  const e = await evaluationService.create(req.user, req.valid.params.taskId, { evaluateeId, comment, scores: scoresOf(req.body) ?? {} }, contextOf(req));
  return { message: `${e.evaluatee.name}님을 평가했습니다 (${e.totalScore}점). 작성 후 7일 안에 고칠 수 있습니다.` };
});

const updateEvaluation = action(async (req) => {
  const { comment, reason } = body(req);
  const e = await evaluationService.update(req.user, eid(req), { scores: scoresOf(req.body), comment, reason }, contextOf(req));
  return { message: `평가를 고쳤습니다 (${e.totalScore}점). 수정 이력에 변경 전후가 남았습니다.` };
});

const withdrawEvaluation = action(async (req) => {
  await evaluationService.withdraw(req.user, eid(req), body(req), contextOf(req));
  return { message: '평가를 철회했습니다. 기록은 남고 평판 집계에서 빠집니다.' };
});

const appeal = action(async (req) => {
  await evaluationService.appeal(req.user, eid(req), body(req), contextOf(req));
  return { message: '이의를 제기했습니다. Underboss·Boss가 처리합니다.' };
});

const resolveAppeal = action(async (req) => {
  const { decision, note, comment } = body(req);
  const a = await evaluationService.resolveAppeal(req.user, req.valid.params.appealId, { decision, note, comment, scores: scoresOf(req.body) }, contextOf(req));
  return { message: a.status === 'CORRECTED' ? `평가를 정정했습니다 (${a.evaluation.totalScore}점). 정정 이력이 남았습니다.` : '이의 제기를 기각했습니다.' };
});

const replaceCriteria = action(async (req) => {
  const criteria = await evaluationService.replaceCriteria(req.user, { criteria: criteriaOf(req.body) }, contextOf(req));
  return { message: `평가 항목 ${criteria.length}개를 설정했습니다. 새로 작성하는 평가부터 적용됩니다.` };
});

const recordReputationEvent = action(async (req) => {
  const e = await reputationService.recordEvent(req.user, req.valid.params.userId, body(req), contextOf(req));
  return { message: `${e.kindLabel} ${e.points > 0 ? '+' : ''}${e.points}점을 기록했습니다.` };
});

const cancelReputationEvent = action(async (req) => {
  await reputationService.cancelEvent(req.user, req.valid.params.eventId, body(req), contextOf(req));
  return { message: '공로·징계 기록을 취소했습니다. 평판 점수에서 빠집니다.' };
});

module.exports = {
  evaluationsPage, evaluationPage, auditLogsPage, auditLogPage, exportAuditLogs,
  userRecords, taskEvaluations, crewActivity,
  createEvaluation, updateEvaluation, withdrawEvaluation, appeal, resolveAppeal, replaceCriteria,
  recordReputationEvent, cancelReputationEvent,
};
