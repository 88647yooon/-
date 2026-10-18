// 평판 (FR-18, FR-19, FR-22, BR-10) — 평판 요약, 업무 밖 공로·징계 기록, 평판 순위.
// 평판 점수 = 평균 평가 점수 × 20 + 공로·징계 점수 합계 (0~100). 평가가 없으면 평가 부분을 50으로 본다.
// 집계는 MongoDB aggregate로 한다 (DR-05).
const Evaluation = require('../models/mongo/Evaluation');
const ReputationEvent = require('../models/mongo/ReputationEvent');
const userModel = require('../models/sql/userModel');
const auditService = require('./auditService');
const access = require('./accessService');
const { personOf } = require('./evaluationService');
const { requireUser, requireCrew } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { REPUTATION_EVENT_KIND_INFO, REPUTATION_BASE_WITHOUT_EVALUATION } = require('../config/constants');
const { conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { isObjectId, periodFilter, findPage } = require('../utils/mongo');

const { userTarget } = auditService;
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const eventTarget = (e) => ({ entity: 'reputationEvent', id: String(e._id), label: `${e.user.username} ${e.title}` });

function reputationScore(averageScore, eventPoints) {
  const base = averageScore === null ? REPUTATION_BASE_WITHOUT_EVALUATION : averageScore * 20;
  return round1(Math.min(100, Math.max(0, base + eventPoints)));
}

// 구성원별 평가 평균·건수 (기간: 평가 작성 시각)
async function evaluationStats(userIds, { from, to } = {}) {
  const rows = await Evaluation.aggregate([
    { $match: { status: 'ACTIVE', 'evaluatee.userId': { $in: userIds }, ...periodFilter('createdAt', from, to) } },
    { $group: { _id: '$evaluatee.userId', average: { $avg: '$totalScore' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, { average: round2(r.average), count: r.count }]));
}

// 구성원별 공로·징계 점수 합계와 건수
async function eventStats(userIds, { from, to } = {}) {
  const rows = await ReputationEvent.aggregate([
    { $match: { status: 'ACTIVE', 'user.userId': { $in: userIds }, ...periodFilter('createdAt', from, to) } },
    {
      $group: {
        _id: '$user.userId',
        points: { $sum: '$points' },
        merits: { $sum: { $cond: [{ $eq: ['$kind', 'MERIT'] }, 1, 0] } },
        disciplines: { $sum: { $cond: [{ $eq: ['$kind', 'DISCIPLINE'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, { points: r.points, merits: r.merits, disciplines: r.disciplines }]));
}

// #171 평판 요약 (본인, 소속 Crew의 책임자, Underboss·Boss): 평균 점수, 항목별 평균, 최근 6개월 추세, 공로·징계
async function summary(actor, userId) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const match = { status: 'ACTIVE', 'evaluatee.userId': userId };
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);
  const [evals, events, byCriterion, trend, recent] = await Promise.all([
    evaluationStats([userId]),
    eventStats([userId]),
    Evaluation.aggregate([
      { $match: match },
      { $unwind: '$scores' },
      { $group: { _id: '$scores.key', label: { $last: '$scores.label' }, average: { $avg: '$scores.score' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Evaluation.aggregate([
      { $match: { ...match, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Seoul' } }, average: { $avg: '$totalScore' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ReputationEvent.find({ 'user.userId': userId, status: 'ACTIVE' }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const e = evals.get(userId) ?? { average: null, count: 0 };
  const ev = events.get(userId) ?? { points: 0, merits: 0, disciplines: 0 };
  return {
    user: P.userBrief(user),
    reputationScore: reputationScore(e.average, ev.points),
    evaluations: { count: e.count, averageScore: e.average },
    criteria: byCriterion.map((c) => ({ key: c._id, label: c.label, averageScore: round2(c.average), count: c.count })),
    trend: trend.map((m) => ({ month: m._id, averageScore: round2(m.average), count: m.count })),
    events: { points: ev.points, meritCount: ev.merits, disciplineCount: ev.disciplines, recent: recent.map(P.presentReputationEvent) },
    formula: `평균 평가 점수 × 20 + 공로·징계 점수 합계 (0~100, 평가가 없으면 평가 부분 ${REPUTATION_BASE_WITHOUT_EVALUATION})`,
  };
}

// #172 업무 밖 공로·징계 기록 (Underboss·Boss). 자신과 같거나 높은 역할의 구성원에게는 기록할 수 없다 (BR-04).
async function recordEvent(actor, userId, { kind, points, title, description }, ctx) {
  const user = await requireUser(userId);
  await access.assertCanManageUser(actor, user);
  if (user.status === 'WITHDRAWN') throw conflict('탈퇴한 구성원에게는 기록할 수 없습니다.', { userId });
  const doc = await ReputationEvent.create({
    user: personOf(user), kind, points: REPUTATION_EVENT_KIND_INFO[kind].sign * points, title, description: description ?? null, recordedBy: personOf(actor),
  });
  await auditService.record({
    actor, action: 'REPUTATION_EVENT_RECORDED', target: eventTarget(doc), related: [userTarget(user)],
    after: { kind, points: doc.points, title }, reason: description, ip: ctx.ip,
  });
  return P.presentReputationEvent(doc.toObject());
}

// #173 공로·징계 기록 목록 (본인, 소속 Crew의 책임자, Underboss·Boss). 취소된 기록은 includeCancelled=true일 때만.
async function listEvents(actor, userId, { includeCancelled = false, ...query }) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const filter = { 'user.userId': userId, ...(includeCancelled ? {} : { status: 'ACTIVE' }) };
  const { docs, total } = await findPage(ReputationEvent, filter, { ...query, sort: { createdAt: -1, _id: -1 } });
  return { data: docs.map(P.presentReputationEvent), meta: pageMeta(query, total) };
}

// #174 잘못된 공로·징계 기록 취소 (Underboss·Boss, 사유 필수). 기록은 지우지 않는다.
async function cancelEvent(actor, eventId, { reason }, ctx) {
  const e = isObjectId(eventId) ? await ReputationEvent.findById(eventId).lean() : null;
  if (!e) throw notFound(`공로·징계 기록(ID ${eventId})을 찾을 수 없습니다.`);
  await access.assertCanManageUser(actor, await requireUser(e.user.userId));
  const updated = await ReputationEvent.findOneAndUpdate(
    { _id: e._id, status: 'ACTIVE' },
    { $set: { status: 'CANCELLED', cancelledBy: personOf(actor), cancelledAt: new Date(), cancelReason: reason } },
    { returnDocument: 'after', lean: true },
  );
  if (!updated) throw conflict('이미 취소된 기록입니다.');
  await auditService.record({
    actor, action: 'REPUTATION_EVENT_CANCELLED', target: eventTarget(e), related: [{ entity: 'user', id: String(e.user.userId), label: e.user.username }],
    before: { kind: e.kind, points: e.points, status: 'ACTIVE' }, after: { status: 'CANCELLED' }, reason, ip: ctx.ip,
  });
  return P.presentReputationEvent(updated);
}

// #175 평판 순위 (Underboss·Boss): 활동중인 운영 계층 구성원을 평판 점수 순으로. Crew(현재 소속원)·역할·기간(평가·기록 시각)으로 거른다.
async function rankings(actor, { crewId, role, from, to, ...query }) {
  if (crewId) await requireCrew(crewId);
  const { rows: users } = await userModel.search({
    status: 'ACTIVE', crewId, role, excludeRoles: ['ADMIN'], sort: 'name', page: 1, size: 10000,
  });
  const ids = users.map((u) => u.id);
  const [evals, events] = await Promise.all([evaluationStats(ids, { from, to }), eventStats(ids, { from, to })]);
  const scored = users.map((u) => {
    const e = evals.get(u.id) ?? { average: null, count: 0 };
    const ev = events.get(u.id) ?? { points: 0 };
    return { u, averageScore: e.average, evaluationCount: e.count, eventPoints: ev.points, reputationScore: reputationScore(e.average, ev.points) };
  }).sort((a, b) => b.reputationScore - a.reputationScore || b.evaluationCount - a.evaluationCount || a.u.name.localeCompare(b.u.name));
  const slice = scored.slice((query.page - 1) * query.size, query.page * query.size);
  const refs = await loadRefs({ crewIds: slice.map((r) => r.u.regularCrewId) });
  return {
    data: slice.map((r, i) => ({
      rank: (query.page - 1) * query.size + i + 1,
      user: P.userBrief(r.u),
      crew: P.crewBrief(refs.crews.get(r.u.regularCrewId)),
      reputationScore: r.reputationScore,
      averageScore: r.averageScore,
      evaluationCount: r.evaluationCount,
      eventPoints: r.eventPoints,
    })),
    meta: { ...pageMeta(query, scored.length), from: from ?? null, to: to ?? null },
  };
}

module.exports = { reputationScore, summary, recordEvent, listEvents, cancelEvent, rankings };
