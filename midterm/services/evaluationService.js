// 평가 (FR-18, FR-19, BR-10) — 평가 항목, 완료 업무 참여자 평가·수정·철회, 평가 조회, 이의 제기와 처리.
// 평가는 MongoDB에 저장한다. 작성 시점의 평가 항목·가중치를 함께 남기고, 수정·정정은 변경 전후를 revisions에 쌓는다.
const Evaluation = require('../models/mongo/Evaluation');
const EvaluationCriterion = require('../models/mongo/EvaluationCriterion');
const EvaluationAppeal = require('../models/mongo/EvaluationAppeal');
const taskResultModel = require('../models/sql/taskResultModel');
const auditService = require('./auditService');
const settings = require('./settingsService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const { requireTask, requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { EVALUATION_SCORE, TASK_STATUS_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { isObjectId, contains, periodFilter, sortOf, findPage } = require('../utils/mongo');

const DAY = 24 * 60 * 60 * 1000;
const { userTarget, taskTarget } = auditService;
const personOf = (u) => ({ userId: u.id, username: u.username, name: u.name, role: u.role });
const evaluationTarget = (e) => ({ entity: 'evaluation', id: String(e._id), label: `${e.taskTitle} · ${e.evaluatee.username}` });
const evaluateeRef = (e) => ({ entity: 'user', id: String(e.evaluatee.userId), label: e.evaluatee.username });
const taskRef = (e) => ({ entity: 'task', id: String(e.taskId), label: e.taskTitle });
const round2 = (n) => Math.round(n * 100) / 100;

async function findEvaluation(id) {
  const e = isObjectId(id) ? await Evaluation.findById(id).lean() : null;
  if (!e) throw notFound(`평가(ID ${id})를 찾을 수 없습니다.`);
  return e;
}

// ---------------------------------------------------------------------------
// 평가 항목

const activeCriteria = () => EvaluationCriterion.find({ active: true }).sort({ position: 1, key: 1 }).lean();

// #166 평가 항목 목록 (가중치와 점수 범위)
async function listCriteria() {
  return (await activeCriteria()).map(P.presentCriterion);
}

// #167 평가 항목·가중치 설정 (전체 교체). 빠진 항목은 쓰지 않음으로 바꾸고, 이미 작성된 평가는 작성 당시 항목을 그대로 가진다.
async function replaceCriteria(actor, { criteria }, ctx) {
  const keys = criteria.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    throw badRequest('같은 항목 키가 여러 번 들어 있습니다.', [{ field: 'body.criteria', message: '항목 키(key)는 겹칠 수 없습니다.' }]);
  }
  const before = await activeCriteria();
  for (const [position, c] of criteria.entries()) {
    await EvaluationCriterion.updateOne({ key: c.key }, { $set: { ...c, description: c.description ?? null, position, active: true } }, { upsert: true });
  }
  await EvaluationCriterion.updateMany({ key: { $nin: keys } }, { $set: { active: false } });
  await auditService.record({
    actor, action: 'EVALUATION_CRITERIA_UPDATED', target: { entity: 'evaluationCriteria', id: 'current', label: '평가 항목' },
    before: { criteria: before.map((c) => ({ key: c.key, weight: c.weight })) }, after: { criteria: criteria.map((c) => ({ key: c.key, weight: c.weight })) },
    ip: ctx.ip,
  });
  return listCriteria();
}

// 항목별 점수를 검사하고 가중 평균을 낸다. criteria: [{ key, label, weight }], scores: { key: 점수 }
function scoreWith(criteria, scores) {
  const errors = [];
  for (const key of Object.keys(scores)) {
    if (!criteria.some((c) => c.key === key)) errors.push({ field: `body.scores.${key}`, message: '평가 항목에 없는 키입니다.' });
  }
  const rows = criteria.map((c) => {
    const score = scores[c.key];
    if (!Number.isInteger(score) || score < EVALUATION_SCORE.min || score > EVALUATION_SCORE.max) {
      errors.push({ field: `body.scores.${c.key}`, message: `${c.label} 점수는 ${EVALUATION_SCORE.min}~${EVALUATION_SCORE.max} 사이의 정수여야 합니다.` });
    }
    return { key: c.key, label: c.label, weight: c.weight, score };
  });
  if (errors.length > 0) throw badRequest('평가 점수가 올바르지 않습니다.', errors);
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  return { scores: rows, totalScore: round2(rows.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight) };
}

const scoreSet = (e) => ({ scores: e.scores, totalScore: e.totalScore, comment: e.comment ?? null });

// ---------------------------------------------------------------------------
// 평가 작성·조회

// #158 완료 업무 참여자 평가. 완료되지 않은 업무는 409, 참여하지 않은 구성원·본인은 평가할 수 없고, 평가자당 대상 1회다.
// 작성 기한(완료 후)과 수정 기한(작성 후)은 운영 설정(evaluationWindowDays, evaluationEditDays)을 따른다.
async function create(actor, taskId, { evaluateeId, scores, comment }, ctx) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  if (task.status !== 'COMPLETED') {
    throw conflict(`완료된 업무만 평가할 수 있습니다. (현재 상태: ${TASK_STATUS_INFO[task.status].label})`, { taskId, status: task.status });
  }
  const [windowDays, editDays] = [await settings.get('evaluationWindowDays'), await settings.get('evaluationEditDays')];
  const deadline = new Date(task.completedAt.getTime() + windowDays * DAY);
  if (deadline < new Date()) throw conflict(`업무 완료 후 ${windowDays}일이 지나 평가할 수 없습니다.`, { taskId, deadline });
  if (evaluateeId === actor.id) throw forbidden('본인은 평가할 수 없습니다.');
  const evaluatee = await requireUser(evaluateeId);
  const participation = await taskResultModel.findParticipation(taskId, evaluateeId);
  if (!participation?.participated) {
    throw conflict(`${evaluatee.name}님은 이 업무에 참여한 기록이 없어 평가할 수 없습니다.`, { taskId, userId: evaluateeId });
  }
  const scored = scoreWith(await activeCriteria(), scores);
  const duplicate = () => conflict(`${evaluatee.name}님에 대한 이 업무의 평가를 이미 작성했습니다. 작성한 평가를 수정하세요.`, { taskId, userId: evaluateeId }, 'DUPLICATE');
  if (await Evaluation.exists({ taskId, 'evaluatee.userId': evaluateeId, 'evaluator.userId': actor.id, status: 'ACTIVE' })) throw duplicate();

  let doc;
  try {
    doc = await Evaluation.create({
      taskId, taskTitle: task.title, crewId: task.crewId, taskCompletedAt: task.completedAt,
      evaluatee: personOf(evaluatee), evaluator: personOf(actor), ...scored, comment: comment ?? null,
      editableUntil: new Date(Date.now() + editDays * DAY),
    });
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
  await auditService.record({
    actor, action: 'EVALUATION_CREATED', target: evaluationTarget(doc), related: [userTarget(evaluatee), taskTarget(task)],
    after: { totalScore: doc.totalScore }, ip: ctx.ip,
  });
  return P.presentEvaluation(doc.toObject(), { viewer: actor });
}

// #159 업무별 평가 목록 (담당 Crew 책임자, Underboss·Boss). 철회된 평가는 includeWithdrawn=true일 때만.
async function listByTask(actor, taskId, { includeWithdrawn = false }) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  const docs = await Evaluation.find({ taskId, ...(includeWithdrawn ? {} : { status: 'ACTIVE' }) }).sort({ createdAt: 1 }).lean();
  return docs.map((e) => P.presentEvaluation(e, { viewer: actor }));
}

const SORT_FIELDS = { createdAt: 'createdAt', totalScore: 'totalScore' };

async function page(filter, query, viewer) {
  const { docs, total } = await findPage(Evaluation, filter, { ...query, sort: sortOf(query.sort ?? '-createdAt', SORT_FIELDS) });
  return { data: docs.map((e) => P.presentEvaluation(e, { viewer })), meta: pageMeta(query, total) };
}

// #160 평가 검색 (Underboss·Boss): 기간·Crew·평가자·대상자·업무·상태·최저 점수
async function search(actor, { from, to, crewId, evaluatorId, evaluateeId, taskId, status, minScore, q, ...query }) {
  const filter = {
    ...periodFilter('createdAt', from, to),
    ...(crewId && { crewId }),
    ...(evaluatorId && { 'evaluator.userId': evaluatorId }),
    ...(evaluateeId && { 'evaluatee.userId': evaluateeId }),
    ...(taskId && { taskId }),
    ...(status && { status }),
    ...(minScore !== undefined && { totalScore: { $gte: minScore } }),
    ...(q && { $or: [{ taskTitle: contains(q) }, { comment: contains(q) }] }),
  };
  return page(filter, query, actor);
}

// #161 내가 작성해야 할 평가: 최근 완료된 내 관리 업무의 참여자 가운데 아직 평가하지 않은 사람 (Capo는 자기 Crew 업무, Underboss·Boss는 전체)
async function pending(actor) {
  const windowDays = await settings.get('evaluationWindowDays');
  const since = new Date(Date.now() - windowDays * DAY);
  let crewId;
  if (!access.isOrgManager(actor)) {
    crewId = await taskAccess.capoCrewId(actor);
    if (!crewId) return [];
  }
  const rows = await taskResultModel.listEvaluable({ since, crewId, excludeUserId: actor.id });
  const done = new Set((await Evaluation.find(
    { 'evaluator.userId': actor.id, status: 'ACTIVE', taskId: { $in: [...new Set(rows.map((r) => r.taskId))] } },
    { taskId: 1, 'evaluatee.userId': 1 },
  ).lean()).map((e) => `${e.taskId}:${e.evaluatee.userId}`));
  const todo = rows.filter((r) => !done.has(`${r.taskId}:${r.userId}`));
  const refs = await loadRefs({ userIds: todo.map((r) => r.userId), taskIds: todo.map((r) => r.taskId) });
  return todo.map((r) => ({
    task: P.taskBrief(refs.tasks.get(r.taskId), refs),
    evaluatee: P.userBrief(refs.users.get(r.userId)),
    completedAt: r.completedAt,
    deadline: new Date(r.completedAt.getTime() + windowDays * DAY),
  }));
}

// #162 평가 상세 (대상자, 평가자, Underboss·Boss). 수정·정정 이력과 이의 제기를 함께 보여 준다.
async function get(actor, evaluationId) {
  const e = await findEvaluation(evaluationId);
  if (e.evaluatee.userId !== actor.id && e.evaluator.userId !== actor.id && !access.isOrgManager(actor)) {
    throw forbidden('평가 대상자, 평가자, Underboss·Boss만 볼 수 있습니다.');
  }
  const appeals = await EvaluationAppeal.find({ evaluationId: e._id }).sort({ createdAt: 1 }).lean();
  return { ...P.presentEvaluation(e, { viewer: actor, detail: true }), appeals: appeals.map(P.presentAppeal) };
}

// #165 구성원이 받은 평가 (본인, 소속 Crew의 책임자, Underboss·Boss)
async function listForUser(actor, userId, { includeWithdrawn = false, ...query }) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  return page({ 'evaluatee.userId': userId, ...(includeWithdrawn ? {} : { status: 'ACTIVE' }) }, query, actor);
}

// ---------------------------------------------------------------------------
// 수정·철회

// 점수·의견을 바꾸고 변경 전후를 revisions에 남긴다. scores를 주면 그 평가를 작성할 때의 항목으로 다시 계산한다.
function revise(e, { scores, comment }) {
  const next = scores ? scoreWith(e.scores, scores) : { scores: e.scores, totalScore: e.totalScore };
  const after = { ...next, comment: comment !== undefined ? comment : (e.comment ?? null) };
  const same = after.totalScore === e.totalScore && after.comment === (e.comment ?? null)
    && after.scores.every((s, i) => s.score === e.scores[i].score);
  return { before: scoreSet(e), after, same };
}

// #163 평가 수정 (평가자 본인, 작성 후 수정 기한 안에서만)
async function update(actor, evaluationId, { scores, comment, reason }, ctx) {
  const e = await findEvaluation(evaluationId);
  if (e.evaluator.userId !== actor.id) throw forbidden('본인이 작성한 평가만 수정할 수 있습니다.');
  if (e.status !== 'ACTIVE') throw conflict('철회된 평가는 수정할 수 없습니다.', { status: e.status });
  if (e.editableUntil < new Date()) {
    throw conflict('수정 기한이 지났습니다. 정정이 필요하면 대상자가 이의를 제기합니다.', { editableUntil: e.editableUntil });
  }
  const { before, after, same } = revise(e, { scores, comment });
  if (same) throw conflict('바뀐 내용이 없습니다.');
  const revision = { kind: 'UPDATE', at: new Date(), by: personOf(actor), before, after, reason: reason ?? null };
  const updated = await Evaluation.findOneAndUpdate(
    { _id: e._id, status: 'ACTIVE' }, { $set: after, $push: { revisions: revision } }, { returnDocument: 'after', lean: true },
  );
  if (!updated) throw conflict('평가가 방금 철회되어 수정할 수 없습니다.');
  await auditService.record({
    actor, action: 'EVALUATION_UPDATED', target: evaluationTarget(e), related: [evaluateeRef(e), taskRef(e)],
    before: { totalScore: before.totalScore }, after: { totalScore: after.totalScore }, reason, ip: ctx.ip,
  });
  return P.presentEvaluation(updated, { viewer: actor, detail: true });
}

// #164 평가 철회 (Underboss·Boss, 사유 필수). 기록은 지우지 않고, 처리 대기 중인 이의 제기는 함께 끝낸다.
async function withdraw(actor, evaluationId, { reason }, ctx) {
  const e = await findEvaluation(evaluationId);
  if (e.evaluatee.userId === actor.id) throw forbidden('본인이 받은 평가는 철회할 수 없습니다.');
  const updated = await Evaluation.findOneAndUpdate(
    { _id: e._id, status: 'ACTIVE' },
    { $set: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawnBy: personOf(actor), withdrawReason: reason } },
    { returnDocument: 'after', lean: true },
  );
  if (!updated) throw conflict('이미 철회된 평가입니다.', { status: e.status });
  await EvaluationAppeal.updateMany(
    { evaluationId: e._id, status: 'PENDING' },
    { $set: { status: 'CORRECTED', resolvedBy: personOf(actor), resolvedAt: new Date(), resolutionNote: `평가 철회: ${reason}` } },
  );
  await auditService.record({
    actor, action: 'EVALUATION_WITHDRAWN', target: evaluationTarget(e), related: [evaluateeRef(e), taskRef(e)],
    before: { status: 'ACTIVE', totalScore: e.totalScore }, after: { status: 'WITHDRAWN' }, reason, ip: ctx.ip,
  });
  return P.presentEvaluation(updated, { viewer: actor, detail: true });
}

// ---------------------------------------------------------------------------
// 이의 제기

// #168 받은 평가에 이의 제기 (대상자 본인). 한 평가에 처리 대기 중인 이의는 하나뿐이다.
async function appeal(actor, evaluationId, { reason }, ctx) {
  const e = await findEvaluation(evaluationId);
  if (e.evaluatee.userId !== actor.id) throw forbidden('본인이 받은 평가에만 이의를 제기할 수 있습니다.');
  if (e.status !== 'ACTIVE') throw conflict('철회된 평가에는 이의를 제기할 수 없습니다.', { status: e.status });
  const duplicate = () => conflict('이 평가에 처리 대기 중인 이의 제기가 이미 있습니다.', { evaluationId }, 'DUPLICATE');
  if (await EvaluationAppeal.exists({ evaluationId: e._id, status: 'PENDING' })) throw duplicate();
  let doc;
  try {
    doc = await EvaluationAppeal.create({ evaluationId: e._id, taskId: e.taskId, taskTitle: e.taskTitle, appellant: personOf(actor), reason });
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
  await auditService.record({
    actor, action: 'EVALUATION_APPEALED', target: evaluationTarget(e), related: [evaluateeRef(e), taskRef(e)],
    after: { appealId: String(doc._id) }, reason, ip: ctx.ip,
  });
  return P.presentAppeal(doc.toObject());
}

// #169 이의 제기 목록: Underboss·Boss는 전체(appellantId로 거를 수 있음), 그 밖에는 본인이 낸 것만
async function listAppeals(actor, { status, appellantId, ...query }) {
  const filter = {
    ...(status && { status }),
    ...(access.isOrgManager(actor) ? (appellantId ? { 'appellant.userId': appellantId } : {}) : { 'appellant.userId': actor.id }),
  };
  const { docs, total } = await findPage(EvaluationAppeal, filter, { ...query, sort: { status: -1, createdAt: -1, _id: -1 } });
  return { data: docs.map(P.presentAppeal), meta: pageMeta(query, total) };
}

// #170 이의 처리 (Underboss·Boss): 기각(DISMISS) 또는 평가 정정(CORRECT, 점수·의견을 고치고 정정 이력을 남긴다).
// 이의를 낸 사람과 그 평가의 평가자는 처리할 수 없다.
async function resolveAppeal(actor, appealId, { decision, note, scores, comment }, ctx) {
  const a = isObjectId(appealId) ? await EvaluationAppeal.findById(appealId).lean() : null;
  if (!a) throw notFound(`이의 제기(ID ${appealId})를 찾을 수 없습니다.`);
  if (a.status !== 'PENDING') throw conflict('이미 처리된 이의 제기입니다.', { status: a.status });
  if (a.appellant.userId === actor.id) throw forbidden('본인이 낸 이의 제기는 처리할 수 없습니다.');
  const e = await findEvaluation(String(a.evaluationId));
  if (e.evaluator.userId === actor.id) throw forbidden('본인이 작성한 평가에 대한 이의는 다른 Underboss·Boss가 처리합니다.');
  if (e.status !== 'ACTIVE') throw conflict('철회된 평가입니다.', { status: e.status });

  let correction = null;
  if (decision === 'CORRECT') {
    if (scores === undefined && comment === undefined) {
      throw badRequest('정정할 점수(scores)나 의견(comment)을 보내세요.', [{ field: 'body.scores', message: '정정할 내용이 필요합니다.' }]);
    }
    const { before, after, same } = revise(e, { scores, comment });
    if (same) throw conflict('정정할 내용이 지금 평가와 같습니다. 바꿀 것이 없으면 기각하세요.');
    correction = { before, after };
    await Evaluation.updateOne({ _id: e._id, status: 'ACTIVE' }, {
      $set: after,
      $push: { revisions: { kind: 'CORRECTION', at: new Date(), by: personOf(actor), before, after, reason: note, appealId: String(a._id) } },
    });
  }
  const status = decision === 'CORRECT' ? 'CORRECTED' : 'DISMISSED';
  const resolved = await EvaluationAppeal.findOneAndUpdate(
    { _id: a._id, status: 'PENDING' },
    { $set: { status, resolvedBy: personOf(actor), resolvedAt: new Date(), resolutionNote: note } },
    { returnDocument: 'after', lean: true },
  );
  const entries = [{
    actor, action: 'EVALUATION_APPEAL_RESOLVED', target: evaluationTarget(e), related: [evaluateeRef(e), taskRef(e)],
    after: { appealId: String(a._id), status }, reason: note, ip: ctx.ip,
  }];
  if (correction) {
    entries.push({
      actor, action: 'EVALUATION_CORRECTED', target: evaluationTarget(e), related: [evaluateeRef(e), taskRef(e)],
      before: { totalScore: correction.before.totalScore }, after: { totalScore: correction.after.totalScore, appealId: String(a._id) }, reason: note, ip: ctx.ip,
    });
  }
  await auditService.recordMany(entries);
  return { ...P.presentAppeal(resolved), evaluation: P.presentEvaluation(await Evaluation.findById(e._id).lean(), { viewer: actor, detail: true }) };
}

module.exports = {
  personOf,
  scoreWith,
  listCriteria,
  replaceCriteria,
  create,
  listByTask,
  search,
  pending,
  get,
  listForUser,
  update,
  withdraw,
  appeal,
  listAppeals,
  resolveAppeal,
};
