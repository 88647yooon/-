// 단계 5 평가·기록 검증 (작업지시서 5장 단계 5 완료 기준 + API 목록표 #155~#179)
// 시드 평가는 건드리지 않고, 매번 새로 만든 구성원·Crew·업무를 먼 미래 일정으로 만들어 완료한 뒤 평가한다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Evaluation = require('../models/mongo/Evaluation');
const { startServer, makeUser, makeCrew, unique } = require('./helpers');

let t;
const tokens = {};
let criteria;
const HOUR = 60 * 60 * 1000;
const BASE = Math.floor(Date.now() / HOUR) * HOUR + (200 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
const at = (hours) => new Date(BASE + hours * HOUR).toISOString();
let slot = 0;

before(async () => {
  t = await startServer();
  for (const name of ['admin', 'boss', 'underboss1', 'underboss2', 'capo1', 'capo2', 'soldier1']) tokens[name] = (await t.login(name)).accessToken;
  criteria = ok(await api('GET', '/api/evaluation-criteria', { token: tokens.soldier1 }));
});
after(async () => {
  await t.stop();
});

const api = (...args) => t.api(...args);
const login = async (user) => (await t.login(user.username, user.password)).accessToken;
const ok = (res, status = 200) => {
  assert.equal(res.status, status, res.text);
  return res.body.data;
};
const expectError = (res, status, code) => {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.error.code, code, res.text);
};
const expectRule = (res, status, rule) => {
  assert.equal(res.status, status, res.text);
  assert.equal(status === 409 ? res.body.error.code : res.body.error.details?.rule, rule, res.text);
};
// 모든 평가 항목에 같은 점수 (또는 키별로 지정)
const scoresOf = (value = 4, overrides = {}) => ({ ...Object.fromEntries(criteria.map((c) => [c.key, value])), ...overrides });
const weighted = (scores) => {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  return Math.round((criteria.reduce((sum, c) => sum + scores[c.key] * c.weight, 0) / total) * 100) / 100;
};

// 업무를 만들고 참여자를 배정해 시작한 뒤, 참여 기록과 함께 완료한다 (기본: Boss가 만드는 조직 업무).
async function completedTask(participants, { token = tokens.boss, absent = [], body = {} } = {}) {
  slot += 3;
  const task = ok(await api('POST', '/api/tasks', { token, body: { title: unique('평가 업무-'), startAt: at(slot), endAt: at(slot + 2), ...body } }), 201);
  ok(await api('POST', `/api/tasks/${task.id}/assignees`, { token, body: { assignees: [...participants, ...absent].map((u) => ({ userId: u.id })) } }), 201);
  ok(await api('PATCH', `/api/tasks/${task.id}/status`, { token, body: { status: 'IN_PROGRESS' } }));
  const participations = [...participants.map((u) => ({ userId: u.id, participated: true })), ...absent.map((u) => ({ userId: u.id, participated: false }))];
  ok(await api('POST', `/api/tasks/${task.id}/complete`, { token, body: { outcome: 'SUCCESS', summary: '완료', participations } }));
  return task;
}
const evaluate = (taskId, evaluateeId, scores = scoresOf(), token = tokens.boss, comment = '테스트 평가') =>
  api('POST', `/api/tasks/${taskId}/evaluations`, { token, body: { evaluateeId, scores, comment } });

async function crewWithCapo() {
  const crew = await makeCrew(t, tokens);
  const capo = await makeUser(t, tokens, { role: 'CAPO' });
  ok(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } }));
  return { crew, capo, token: await login(capo) };
}
async function memberOf(crew, role = 'SOLDIER') {
  const u = await makeUser(t, tokens, { role });
  ok(await api('POST', `/api/crews/${crew.id}/members`, { token: tokens.boss, body: { userId: u.id } }), 201);
  return u;
}

// ---------------------------------------------------------------------------
describe('단계 5 완료 기준', () => {
  it('완료되지 않은 업무를 평가하면 409', async () => {
    const member = await makeUser(t, tokens);
    slot += 3;
    const task = ok(await api('POST', '/api/tasks', { token: tokens.boss, body: { title: unique('미완료-'), startAt: at(slot), endAt: at(slot + 1) } }), 201);
    ok(await api('POST', `/api/tasks/${task.id}/assignees`, { token: tokens.boss, body: { assignees: [{ userId: member.id }] } }), 201);
    expectError(await evaluate(task.id, member.id), 409, 'CONFLICT');
    ok(await api('PATCH', `/api/tasks/${task.id}/status`, { token: tokens.boss, body: { status: 'IN_PROGRESS' } }));
    const res = await evaluate(task.id, member.id);
    expectError(res, 409, 'CONFLICT');
    assert.match(res.body.error.message, /완료된 업무만/);
  });

  it('구성원의 역할·소속·상태·평가 변경 이력이 시간순으로 조회된다', async () => {
    const { crew } = await crewWithCapo();
    const member = await makeUser(t, tokens, { role: 'ASSOCIATE' }); // 등록(대기) → 활동중
    ok(await api('POST', `/api/crews/${crew.id}/members`, { token: tokens.boss, body: { userId: member.id } }), 201);
    ok(await api('PATCH', `/api/users/${member.id}/role`, { token: tokens.boss, body: { role: 'SOLDIER', reason: '승진' } }));
    const task = await completedTask([member]);
    const evaluation = ok(await evaluate(task.id, member.id, scoresOf(3)), 201);
    ok(await api('PATCH', `/api/evaluations/${evaluation.id}`, { token: tokens.boss, body: { scores: scoresOf(5), reason: '다시 보니 우수' } }));
    ok(await api('PATCH', `/api/users/${member.id}/status`, { token: tokens.boss, body: { status: 'SUSPENDED', reason: '조사' } }));

    const history = ok(await api('GET', `/api/users/${member.id}/change-history`, { token: tokens.boss }));
    assert.deepEqual(history.map((h) => h.action), [
      'USER_CREATED', 'USER_STATUS_CHANGED', 'MEMBERSHIP_ADDED', 'USER_ROLE_CHANGED', 'EVALUATION_CREATED', 'EVALUATION_UPDATED', 'USER_STATUS_CHANGED',
    ]);
    assert.deepEqual(history.map((h) => h.type), ['ACCOUNT', 'STATUS', 'MEMBERSHIP', 'ROLE', 'EVALUATION', 'EVALUATION', 'STATUS']);
    for (let i = 1; i < history.length; i += 1) assert.ok(new Date(history[i - 1].at) <= new Date(history[i].at));
    assert.equal(history[3].summary, 'Associate → Soldier');
    assert.equal(history[3].reason, '승진');
    assert.equal(history[2].summary, `${crew.name} 정식 소속 시작`);
    assert.match(history[5].summary, new RegExp(`${weighted(scoresOf(3))}점 → 5점`));

    const roles = ok(await api('GET', `/api/users/${member.id}/change-history?type=ROLE`, { token: tokens.boss }));
    assert.deepEqual(roles.map((h) => h.action), ['USER_ROLE_CHANGED']);
    const latestFirst = ok(await api('GET', `/api/users/${member.id}/change-history?sort=-at&size=1`, { token: tokens.boss }));
    assert.equal(latestFirst[0].action, 'USER_STATUS_CHANGED');
    assert.equal(latestFirst[0].after.status, 'SUSPENDED');
  });
});

// ---------------------------------------------------------------------------
describe('평가 작성·수정·철회 (#158~#165)', () => {
  it('참여한 구성원만, 관리 범위 안에서, 평가자당 한 번 평가하고 점수는 가중 평균이다', async () => {
    const { crew, capo, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const absent = await memberOf(crew);
    const task = await completedTask([member, capo], { token, absent: [absent], body: { crewId: crew.id } });

    const scores = scoresOf(4, { [criteria[0].key]: 5, [criteria[1].key]: 2 });
    const created = ok(await evaluate(task.id, member.id, scores, token), 201);
    assert.equal(created.totalScore, weighted(scores));
    assert.equal(created.evaluator.id, capo.id);
    assert.equal(created.editable, true);
    expectError(await evaluate(task.id, member.id, scores, token), 409, 'DUPLICATE');
    expectError(await evaluate(task.id, absent.id, scores, token), 409, 'CONFLICT');
    expectError(await evaluate(task.id, capo.id, scores, token), 403, 'FORBIDDEN');
    expectRule(await evaluate(task.id, member.id, scores, tokens.capo1), 403, 'BR-05');
    expectError(await evaluate(task.id, member.id, scores, tokens.soldier1), 403, 'FORBIDDEN');

    const missing = await evaluate(task.id, capo.id, { [criteria[0].key]: 3 }, tokens.boss);
    expectError(missing, 400, 'VALIDATION_ERROR');
    expectError(await evaluate(task.id, capo.id, scoresOf(6), tokens.boss), 400, 'VALIDATION_ERROR');
    expectError(await evaluate(task.id, capo.id, scoresOf(3, { nope: 3 }), tokens.boss), 400, 'VALIDATION_ERROR');
    ok(await evaluate(task.id, member.id, scoresOf(3), tokens.boss), 201); // 다른 평가자는 따로 평가할 수 있다

    const listed = ok(await api('GET', `/api/tasks/${task.id}/evaluations`, { token }));
    assert.deepEqual(listed.map((e) => e.evaluator.id), [capo.id, (await t.login('boss')).user.id]);
  });

  it('작성할 평가 목록에서 평가한 참여자는 빠진다 (#161)', async () => {
    const { crew, token } = await crewWithCapo();
    const [a, b] = [await memberOf(crew), await memberOf(crew)];
    const task = await completedTask([a, b], { token, body: { crewId: crew.id } });
    const pendingFor = async () => ok(await api('GET', '/api/evaluations/pending', { token })).filter((p) => p.task.id === task.id).map((p) => p.evaluatee.id).sort();
    assert.deepEqual(await pendingFor(), [a.id, b.id].sort());
    ok(await evaluate(task.id, a.id, scoresOf(), token), 201);
    assert.deepEqual(await pendingFor(), [b.id]);
    expectError(await api('GET', '/api/evaluations/pending', { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('평가자는 수정 기한 안에서만 고치고, 고칠 때마다 변경 전후가 수정 이력에 남는다', async () => {
    const member = await makeUser(t, tokens);
    const task = await completedTask([member]);
    const e = ok(await evaluate(task.id, member.id, scoresOf(3)), 201);
    expectError(await api('PATCH', `/api/evaluations/${e.id}`, { token: tokens.underboss1, body: { comment: 'x' } }), 403, 'FORBIDDEN');
    expectError(await api('PATCH', `/api/evaluations/${e.id}`, { token: tokens.boss, body: { scores: scoresOf(3), comment: '테스트 평가' } }), 409, 'CONFLICT');
    expectError(await api('PATCH', `/api/evaluations/${e.id}`, { token: tokens.boss, body: { scores: { [criteria[0].key]: 4 } } }), 400, 'VALIDATION_ERROR');

    const updated = ok(await api('PATCH', `/api/evaluations/${e.id}`, { token: tokens.boss, body: { scores: scoresOf(4), comment: '보완', reason: '추가 보고 반영' } }));
    assert.equal(updated.totalScore, 4);
    assert.equal(updated.revisions.length, 1);
    assert.deepEqual([updated.revisions[0].kind, updated.revisions[0].before.totalScore, updated.revisions[0].after.totalScore, updated.revisions[0].reason],
      ['UPDATE', 3, 4, '추가 보고 반영']);

    await Evaluation.updateOne({ _id: e.id }, { $set: { editableUntil: new Date(Date.now() - 1000) } });
    expectError(await api('PATCH', `/api/evaluations/${e.id}`, { token: tokens.boss, body: { comment: '늦은 수정' } }), 409, 'CONFLICT');
  });

  it('Underboss·Boss가 사유를 남기고 철회하면 기록은 남고 받은 평가 목록과 평판에서 빠진다', async () => {
    const member = await makeUser(t, tokens);
    const memberToken = await login(member);
    const task = await completedTask([member]);
    const e = ok(await evaluate(task.id, member.id, scoresOf(2)), 201);
    assert.equal(ok(await api('GET', `/api/users/${member.id}/reputation`, { token: memberToken })).evaluations.count, 1);

    expectError(await api('DELETE', `/api/evaluations/${e.id}`, { token: tokens.underboss1, body: {} }), 400, 'VALIDATION_ERROR');
    expectError(await api('DELETE', `/api/evaluations/${e.id}`, { token: tokens.capo1, body: { reason: 'x' } }), 403, 'FORBIDDEN');
    const withdrawn = ok(await api('DELETE', `/api/evaluations/${e.id}`, { token: tokens.underboss1, body: { reason: '대상자 착오' } }));
    assert.deepEqual([withdrawn.status, withdrawn.withdrawReason, withdrawn.withdrawnBy.username], ['WITHDRAWN', '대상자 착오', 'underboss1']);
    expectError(await api('DELETE', `/api/evaluations/${e.id}`, { token: tokens.underboss1, body: { reason: '다시' } }), 409, 'CONFLICT');

    assert.equal(ok(await api('GET', `/api/users/${member.id}/evaluations`, { token: memberToken })).length, 0);
    assert.equal(ok(await api('GET', `/api/users/${member.id}/evaluations?includeWithdrawn=true`, { token: memberToken })).length, 1);
    const rep = ok(await api('GET', `/api/users/${member.id}/reputation`, { token: memberToken }));
    assert.equal(rep.evaluations.count, 0);
    assert.equal(rep.reputationScore, 50);
    // 철회해도 같은 평가자가 다시 평가할 수 있다.
    ok(await evaluate(task.id, member.id, scoresOf(4)), 201);
  });

  it('평가 상세는 대상자·평가자·Underboss 이상만, 받은 평가는 본인·담당 Capo·Underboss 이상만, 검색은 Underboss 이상만 본다', async () => {
    const { crew, token: capoToken } = await crewWithCapo();
    const member = await memberOf(crew);
    const task = await completedTask([member]);
    const e = ok(await evaluate(task.id, member.id), 201);
    const memberToken = await login(member);

    ok(await api('GET', `/api/evaluations/${e.id}`, { token: memberToken }));
    ok(await api('GET', `/api/evaluations/${e.id}`, { token: tokens.underboss2 }));
    expectError(await api('GET', `/api/evaluations/${e.id}`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', `/api/evaluations/${'0'.repeat(24)}`, { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('GET', '/api/evaluations/not-an-id', { token: tokens.boss }), 400, 'VALIDATION_ERROR');

    assert.equal(ok(await api('GET', `/api/users/${member.id}/evaluations`, { token: capoToken })).length, 1);
    expectError(await api('GET', `/api/users/${member.id}/evaluations`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', `/api/users/${member.id}/evaluations`, { token: tokens.capo1 }), 403, 'FORBIDDEN');

    const found = ok(await api('GET', `/api/evaluations?evaluateeId=${member.id}&minScore=4`, { token: tokens.underboss1 }));
    assert.deepEqual(found.map((x) => x.id), [e.id]);
    assert.equal(ok(await api('GET', `/api/evaluations?evaluateeId=${member.id}&minScore=4.5`, { token: tokens.underboss1 })).length, 0);
    expectError(await api('GET', '/api/evaluations', { token: tokens.capo1 }), 403, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
describe('이의 제기 (#168~#170)', () => {
  it('대상자가 이의를 내면 Underboss·Boss가 평가를 정정하고 정정 이력과 변경 이력에 남는다', async () => {
    const member = await makeUser(t, tokens);
    const memberToken = await login(member);
    const task = await completedTask([member]);
    const e = ok(await evaluate(task.id, member.id, scoresOf(2), tokens.underboss2), 201);

    expectError(await api('POST', `/api/evaluations/${e.id}/appeals`, { token: tokens.soldier1, body: { reason: 'x' } }), 403, 'FORBIDDEN');
    const appeal = ok(await api('POST', `/api/evaluations/${e.id}/appeals`, { token: memberToken, body: { reason: '참여 기록을 다시 봐 주세요.' } }), 201);
    assert.equal(appeal.status, 'PENDING');
    expectError(await api('POST', `/api/evaluations/${e.id}/appeals`, { token: memberToken, body: { reason: '또' } }), 409, 'DUPLICATE');

    assert.deepEqual(ok(await api('GET', '/api/evaluation-appeals', { token: memberToken })).map((a) => a.id), [appeal.id]);
    assert.ok(ok(await api('GET', '/api/evaluation-appeals?status=PENDING&size=100', { token: tokens.boss })).some((a) => a.id === appeal.id));
    assert.ok(!ok(await api('GET', '/api/evaluation-appeals', { token: tokens.soldier1 })).some((a) => a.id === appeal.id));

    expectError(await api('POST', `/api/evaluation-appeals/${appeal.id}/resolve`, { token: tokens.underboss2, body: { decision: 'DISMISS', note: 'x' } }), 403, 'FORBIDDEN');
    expectError(await api('POST', `/api/evaluation-appeals/${appeal.id}/resolve`, { token: tokens.boss, body: { decision: 'CORRECT', note: '정정' } }), 400, 'VALIDATION_ERROR');
    const resolved = ok(await api('POST', `/api/evaluation-appeals/${appeal.id}/resolve`, {
      token: tokens.boss, body: { decision: 'CORRECT', note: '참여 기록 확인 후 정정', scores: scoresOf(4) },
    }));
    assert.equal(resolved.status, 'CORRECTED');
    assert.equal(resolved.evaluation.totalScore, 4);
    const revision = resolved.evaluation.revisions.at(-1);
    assert.deepEqual([revision.kind, revision.by.username, revision.reason, revision.appealId], ['CORRECTION', 'boss', '참여 기록 확인 후 정정', appeal.id]);
    expectError(await api('POST', `/api/evaluation-appeals/${appeal.id}/resolve`, { token: tokens.boss, body: { decision: 'DISMISS', note: 'x' } }), 409, 'CONFLICT');

    const detail = ok(await api('GET', `/api/evaluations/${e.id}`, { token: memberToken }));
    assert.equal(detail.appeals[0].status, 'CORRECTED');
    const evals = ok(await api('GET', `/api/users/${member.id}/change-history?type=EVALUATION`, { token: memberToken }));
    assert.deepEqual(evals.map((h) => h.action), ['EVALUATION_CREATED', 'EVALUATION_CORRECTED']);
  });

  it('이의를 기각하면 평가는 그대로이고, 다시 이의를 낼 수 있다', async () => {
    const member = await makeUser(t, tokens);
    const memberToken = await login(member);
    const task = await completedTask([member]);
    const e = ok(await evaluate(task.id, member.id, scoresOf(3)), 201);
    const appeal = ok(await api('POST', `/api/evaluations/${e.id}/appeals`, { token: memberToken, body: { reason: '낮아요' } }), 201);
    const dismissed = ok(await api('POST', `/api/evaluation-appeals/${appeal.id}/resolve`, { token: tokens.underboss1, body: { decision: 'DISMISS', note: '평가 근거가 충분합니다.' } }));
    assert.deepEqual([dismissed.status, dismissed.evaluation.totalScore, dismissed.resolutionNote], ['DISMISSED', 3, '평가 근거가 충분합니다.']);
    ok(await api('POST', `/api/evaluations/${e.id}/appeals`, { token: memberToken, body: { reason: '다시 요청합니다.' } }), 201);
  });
});

// ---------------------------------------------------------------------------
describe('평가 항목 (#166~#167)', () => {
  it('Boss·Administrator가 항목을 바꾸면 새 평가에 적용되고, 이미 작성된 평가는 작성 당시 항목을 유지한다', async () => {
    const member = await makeUser(t, tokens);
    const task = await completedTask([member]);
    const old = ok(await evaluate(task.id, member.id, scoresOf(4)), 201);
    const original = criteria.map(({ key, label, description, weight }) => ({ key, label, weight, ...(description ? { description } : {}) }));
    try {
      expectError(await api('PUT', '/api/evaluation-criteria', { token: tokens.underboss1, body: { criteria: original } }), 403, 'FORBIDDEN');
      expectError(await api('PUT', '/api/evaluation-criteria', { token: tokens.boss, body: { criteria: [original[0], original[0]] } }), 400, 'VALIDATION_ERROR');
      const next = ok(await api('PUT', '/api/evaluation-criteria', {
        token: tokens.admin, body: { criteria: [{ key: 'loyalty', label: '충성도', weight: 3 }, { key: original[0].key, label: original[0].label, weight: 1 }] },
      }));
      assert.deepEqual(next.map((c) => [c.key, c.weight]), [['loyalty', 3], [original[0].key, 1]]);

      const other = await makeUser(t, tokens);
      const task2 = await completedTask([other]);
      expectError(await evaluate(task2.id, other.id, scoresOf(4)), 400, 'VALIDATION_ERROR');
      const e2 = ok(await evaluate(task2.id, other.id, { loyalty: 5, [original[0].key]: 1 }), 201);
      assert.equal(e2.totalScore, 4);
      const kept = ok(await api('GET', `/api/evaluations/${old.id}`, { token: tokens.boss }));
      assert.deepEqual(kept.scores.map((s) => s.key), criteria.map((c) => c.key));
    } finally {
      ok(await api('PUT', '/api/evaluation-criteria', { token: tokens.boss, body: { criteria: original } }));
    }
    assert.deepEqual(ok(await api('GET', '/api/evaluation-criteria', { token: tokens.soldier1 })).map((c) => c.key), criteria.map((c) => c.key));
  });
});

// ---------------------------------------------------------------------------
describe('평판 (#171~#175)', () => {
  it('평판 요약은 평가 평균과 공로·징계를 합쳐 계산하고, 기록·취소는 Underboss 이상이 자신보다 낮은 역할에만 한다', async () => {
    const { crew } = await crewWithCapo();
    const member = await memberOf(crew);
    const memberToken = await login(member);
    const task = await completedTask([member]);
    ok(await evaluate(task.id, member.id, scoresOf(4)), 201);
    ok(await evaluate(task.id, member.id, scoresOf(5), tokens.underboss1), 201);

    const merit = ok(await api('POST', `/api/users/${member.id}/reputation-events`, { token: tokens.underboss1, body: { kind: 'MERIT', points: 5, title: '긴급 대응' } }), 201);
    const discipline = ok(await api('POST', `/api/users/${member.id}/reputation-events`, { token: tokens.boss, body: { kind: 'DISCIPLINE', points: 3, title: '보고 누락' } }), 201);
    assert.deepEqual([merit.points, discipline.points], [5, -3]);
    expectRule(await api('POST', `/api/users/${(await t.login('underboss2')).user.id}/reputation-events`, { token: tokens.underboss1, body: { kind: 'MERIT', points: 1, title: 'x' } }), 403, 'BR-04');
    expectError(await api('POST', `/api/users/${member.id}/reputation-events`, { token: tokens.capo1, body: { kind: 'MERIT', points: 1, title: 'x' } }), 403, 'FORBIDDEN');
    expectError(await api('POST', `/api/users/${member.id}/reputation-events`, { token: tokens.boss, body: { kind: 'MERIT', points: 11, title: 'x' } }), 400, 'VALIDATION_ERROR');

    const summary = ok(await api('GET', `/api/users/${member.id}/reputation`, { token: memberToken }));
    assert.deepEqual([summary.evaluations.count, summary.evaluations.averageScore], [2, 4.5]);
    assert.equal(summary.events.points, 2);
    assert.equal(summary.reputationScore, 92); // 4.5 × 20 + 2
    assert.equal(summary.criteria.length, criteria.length);
    assert.equal(summary.trend.at(-1).count, 2);
    expectError(await api('GET', `/api/users/${member.id}/reputation`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');

    const cancelled = ok(await api('DELETE', `/api/reputation-events/${discipline.id}`, { token: tokens.underboss1, body: { reason: '착오' } }));
    assert.equal(cancelled.active, false);
    expectError(await api('DELETE', `/api/reputation-events/${discipline.id}`, { token: tokens.underboss1, body: { reason: '또' } }), 409, 'CONFLICT');
    assert.equal(ok(await api('GET', `/api/users/${member.id}/reputation`, { token: memberToken })).reputationScore, 95);
    assert.equal(ok(await api('GET', `/api/users/${member.id}/reputation-events`, { token: memberToken })).length, 1);
    assert.equal(ok(await api('GET', `/api/users/${member.id}/reputation-events?includeCancelled=true`, { token: memberToken })).length, 2);

    const ranking = ok(await api('GET', `/api/reputation/rankings?crewId=${crew.id}`, { token: tokens.underboss1 }));
    assert.equal(ranking[0].user.id, member.id);
    assert.equal(ranking[0].rank, 1);
    assert.ok(ranking.every((r, i) => i === 0 || ranking[i - 1].reputationScore >= r.reputationScore));
    expectError(await api('GET', '/api/reputation/rankings', { token: tokens.capo1 }), 403, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
describe('활동 타임라인 (#156, #157)', () => {
  it('구성원 활동에 업무 배정·참여, 자원 사용·반환, 받은 평가, 공로·징계가 최근 순으로 모인다', async () => {
    const member = await makeUser(t, tokens);
    const memberToken = await login(member);
    const task = await completedTask([member]);
    ok(await evaluate(task.id, member.id), 201);
    const category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    const resource = ok(await api('POST', '/api/resources', { token: tokens.boss, body: { code: unique('T-'), name: '활동 테스트 자원', categoryId: category.id } }), 201);
    const now = Date.now();
    ok(await api('POST', `/api/resources/${resource.id}/allocations`, {
      token: tokens.boss, body: { userId: member.id, startAt: new Date(now - 60000).toISOString(), endAt: new Date(now + HOUR).toISOString() },
    }), 201);
    ok(await api('POST', `/api/resources/${resource.id}/checkout`, { token: memberToken, body: {} }), 201);
    ok(await api('POST', `/api/resources/${resource.id}/return`, { token: memberToken, body: {} }));
    ok(await api('POST', `/api/users/${member.id}/reputation-events`, { token: tokens.boss, body: { kind: 'MERIT', points: 1, title: '도움' } }), 201);

    const items = ok(await api('GET', `/api/users/${member.id}/activity?size=50`, { token: memberToken }));
    const types = new Set(items.map((i) => i.type));
    for (const type of ['TASK_ASSIGNED', 'TASK_PARTICIPATION', 'RESOURCE_CHECKED_OUT', 'RESOURCE_RETURNED', 'EVALUATION_RECEIVED', 'REPUTATION_EVENT']) assert.ok(types.has(type), type);
    for (let i = 1; i < items.length; i += 1) assert.ok(new Date(items[i - 1].at) >= new Date(items[i].at));
    const onlyResources = ok(await api('GET', `/api/users/${member.id}/activity?kind=RESOURCE`, { token: memberToken }));
    assert.deepEqual(onlyResources.map((i) => i.type).sort(), ['RESOURCE_CHECKED_OUT', 'RESOURCE_RETURNED']);
    const paged = await api('GET', `/api/users/${member.id}/activity?size=2&page=2`, { token: memberToken });
    assert.equal(paged.body.data.length, 2);
    assert.equal(paged.body.meta.total, items.length);
    expectError(await api('GET', `/api/users/${member.id}/activity`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('Crew 활동에는 소속 변경과 그 Crew 업무의 활동·평가가 보이고, 다른 Crew의 Capo는 볼 수 없다 (BR-05)', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const task = await completedTask([member], { token, body: { crewId: crew.id } });
    ok(await evaluate(task.id, member.id, scoresOf(), token), 201);
    const items = ok(await api('GET', `/api/crews/${crew.id}/activity?size=100`, { token }));
    const actions = new Set(items.map((i) => i.action));
    for (const action of ['MEMBERSHIP_ADDED', 'CREW_CAPO_ASSIGNED', 'TASK_CREATED', 'TASK_COMPLETED', 'EVALUATION_CREATED']) assert.ok(actions.has(action), action);
    assert.equal(ok(await api('GET', `/api/crews/${crew.id}/activity?action=TASK_COMPLETED`, { token })).length, 1);
    expectRule(await api('GET', `/api/crews/${crew.id}/activity`, { token: tokens.capo1 }), 403, 'BR-05');
  });
});

// ---------------------------------------------------------------------------
describe('감사 기록 (#176~#179)', () => {
  it('Boss·Administrator는 감사 기록을 검색하고 상세에서 변경 전후를 본다', async () => {
    const member = await makeUser(t, tokens);
    ok(await api('PATCH', `/api/users/${member.id}/role`, { token: tokens.boss, body: { role: 'CAPO', reason: '감사 테스트' } }));
    const logs = ok(await api('GET', `/api/audit-logs?targetEntity=user&targetId=${member.id}&action=USER_ROLE_CHANGED`, { token: tokens.admin }));
    assert.equal(logs.length, 2); // makeUser의 역할 변경 + 위 변경
    assert.equal(logs[0].reason, '감사 테스트');
    assert.equal(logs[0].before, undefined);
    const detail = ok(await api('GET', `/api/audit-logs/${logs[0].id}`, { token: tokens.boss }));
    assert.deepEqual([detail.before.role, detail.after.role, detail.actor.username, detail.actionLabel], ['SOLDIER', 'CAPO', 'boss', '역할 변경']);
    const byText = ok(await api('GET', `/api/audit-logs?q=${member.username}&size=100`, { token: tokens.boss }));
    assert.equal(byText.filter((l) => l.target.label === member.username).length, 4);
    expectError(await api('GET', '/api/audit-logs', { token: tokens.underboss1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', `/api/audit-logs/${'f'.repeat(24)}`, { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('GET', '/api/audit-logs?action=NOT_AN_ACTION', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
  });

  it('Administrator는 검색 결과를 CSV로 내려받고, Boss는 내보낼 수 없다', async () => {
    const member = await makeUser(t, tokens);
    const res = await api('GET', `/api/audit-logs/export?targetEntity=user&targetId=${member.id}`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.match(res.text.slice(0, 40), /시각\(KST\),행위 코드,행위/);
    const lines = res.text.trim().split('\r\n');
    assert.equal(lines.length, 1 + 3); // 헤더 + makeUser의 등록·활동중 전환·역할 변경
    assert.ok(lines.some((l) => l.includes('USER_CREATED') && l.includes(member.username)));
    expectError(await api('GET', '/api/audit-logs/export', { token: tokens.boss }), 403, 'FORBIDDEN');
  });

  it('권한 거부 기록에 누가 어디에 접근하려 했는지 남는다 (BR-09)', async () => {
    const soldier = await makeUser(t, tokens);
    const token = await login(soldier);
    expectError(await api('GET', '/api/audit-logs', { token }), 403, 'FORBIDDEN');
    const events = ok(await api('GET', `/api/security-events?userId=${soldier.id}`, { token: tokens.admin }));
    assert.deepEqual(events.map((e) => [e.method, e.path, e.user.username]), [['GET', '/api/audit-logs', soldier.username]]);
    expectError(await api('GET', '/api/security-events', { token: tokens.boss }), 403, 'FORBIDDEN');
  });
});
