// 단계 6 검색·통계·관리자 검증 (작업지시서 5장 단계 6 완료 기준 + API 목록표 #180~#210)
// 통계는 (1) 전체 값이 DB를 직접 센 값과 같은지, (2) 테스트가 만든 Crew·분류처럼 내용을 아는 데이터에서 정확한지로 확인한다.
// 운영 설정·역할별 권한을 바꾸는 테스트는 끝나면 원래 값으로 되돌린다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { getPool } = require('../config/database');
const userModel = require('../models/sql/userModel');
const Evaluation = require('../models/mongo/Evaluation');
const ActivityLog = require('../models/mongo/ActivityLog');
const SecurityEvent = require('../models/mongo/SecurityEvent');
const DEFAULT_PERMISSIONS = require('../config/permissions');
const { startServer, makeUser, makeCrew, unique } = require('./helpers');

let t;
const tokens = {};
const HOUR = 60 * 60 * 1000;
const BASE = Math.floor(Date.now() / HOUR) * HOUR + (200 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
const at = (hours) => new Date(BASE + hours * HOUR).toISOString();
const iso = (ms) => new Date(ms).toISOString();
const q = (params) => new URLSearchParams(params).toString();

before(async () => {
  t = await startServer();
  for (const name of ['admin', 'boss', 'underboss1', 'capo1', 'capo2', 'soldier1', 'associate1']) tokens[name] = (await t.login(name)).accessToken;
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
const sqlCounts = async (sql) => Object.fromEntries((await getPool().query(sql))[0].map((r) => [r.k, r.cnt]));

async function crewWithCapo() {
  const crew = await makeCrew(t, tokens);
  const capo = await makeUser(t, tokens, { role: 'CAPO' });
  ok(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } }));
  return { crew, capo, token: await login(capo) };
}
async function memberOf(crew, role = 'SOLDIER', type = 'REGULAR') {
  const u = await makeUser(t, tokens, { role });
  ok(await api('POST', `/api/crews/${crew.id}/members`, { token: tokens.boss, body: { userId: u.id, type } }), 201);
  return u;
}
async function task(body, token = tokens.boss) {
  return ok(await api('POST', '/api/tasks', { token, body: { title: unique('통계 업무-'), ...body } }), 201);
}
async function runTask(t0, users, token = tokens.boss) {
  ok(await api('POST', `/api/tasks/${t0.id}/assignees`, { token, body: { assignees: users.map((u, i) => ({ userId: u.id, role: i === 0 ? 'LEADER' : 'MEMBER' })) } }), 201);
  ok(await api('PATCH', `/api/tasks/${t0.id}/status`, { token, body: { status: 'IN_PROGRESS' } }));
}

// ---------------------------------------------------------------------------
describe('단계 6 완료 기준', () => {
  it('권한이 없는 사용자가 관리자 URL에 직접 접근하면 403이고 권한 거부 기록이 남는다 (BR-09)', async () => {
    const victim = (await userModel.findByUsername('soldier1')).id;
    const urls = [
      ['GET', '/api/admin/accounts'], ['PUT', `/api/admin/accounts/${victim}/lock`, { reason: 'x' }], ['DELETE', `/api/admin/accounts/${victim}/lock`, {}],
      ['POST', `/api/admin/accounts/${victim}/password-reset`, {}], ['DELETE', `/api/admin/accounts/${victim}/sessions`, {}], ['GET', '/api/admin/login-history'],
      ['GET', '/api/admin/permissions'], ['PUT', '/api/admin/permissions/SOLDIER', { keys: [] }], ['GET', '/api/admin/settings'],
      ['PUT', '/api/admin/settings', { settings: { evaluationEditDays: 9 } }], ['GET', '/api/admin/integrity-check'], ['GET', '/api/admin/health'],
    ];
    const started = new Date();
    for (const name of ['boss', 'capo1', 'soldier1', 'associate1']) {
      for (const [method, url, body] of urls) expectError(await api(method, url, { token: tokens[name], body }), 403, 'FORBIDDEN');
    }
    expectError(await api('GET', '/api/admin/accounts'), 401, 'UNAUTHENTICATED');
    const events = await SecurityEvent.countDocuments({ createdAt: { $gte: started }, path: { $regex: '^/api/admin/' } });
    assert.equal(events, urls.length * 4);
    // 계정이 아직 잠기지 않았고 설정·권한도 바뀌지 않았다.
    assert.equal((await userModel.findById(victim)).lockedAt, null);
  });

  it('조직 요약·분포 통계가 DB를 직접 센 값과 같다', async () => {
    const overview = ok(await api('GET', '/api/stats/overview', { token: tokens.boss }));
    const members = await sqlCounts("SELECT status AS k, COUNT(*) AS cnt FROM users WHERE role <> 'ADMIN' GROUP BY status");
    for (const [status, n] of Object.entries(overview.members.byStatus)) assert.equal(n, members[status] ?? 0, status);
    const tasks = await sqlCounts('SELECT status AS k, COUNT(*) AS cnt FROM tasks GROUP BY status');
    for (const [status, n] of Object.entries(overview.tasks.byStatus)) assert.equal(n, tasks[status] ?? 0, status);
    assert.equal(overview.tasks.open, (tasks.PLANNED ?? 0) + (tasks.IN_PROGRESS ?? 0) + (tasks.ON_HOLD ?? 0));
    const resources = await sqlCounts('SELECT status AS k, COUNT(*) AS cnt FROM resources GROUP BY status');
    for (const [status, n] of Object.entries(overview.resources.byStatus)) assert.equal(n, resources[status] ?? 0, status);
    const total = Object.values(resources).reduce((a, b) => a + b, 0);
    assert.equal(overview.resources.availabilityRate, Math.round(((resources.AVAILABLE ?? 0) / total) * 1000) / 10);
    assert.equal(overview.evaluations.count, await Evaluation.countDocuments({ status: 'ACTIVE' }));
    const crews = await sqlCounts('SELECT status AS k, COUNT(*) AS cnt FROM crews GROUP BY status');
    assert.deepEqual([overview.crews.active, overview.crews.disbanded], [crews.ACTIVE ?? 0, crews.DISBANDED ?? 0]);

    const matrix = ok(await api('GET', '/api/stats/members', { token: tokens.underboss1 }));
    const all = await sqlCounts("SELECT CONCAT(role, ':', status) AS k, COUNT(*) AS cnt FROM users GROUP BY role, status");
    for (const r of matrix.byRole) for (const [status, n] of Object.entries(r.byStatus)) assert.equal(n, all[`${r.role}:${status}`] ?? 0, `${r.role}:${status}`);

    const regions = ok(await api('GET', '/api/stats/regions', { token: tokens.boss }));
    const crewRegions = await sqlCounts('SELECT region AS k, COUNT(*) AS cnt FROM crews GROUP BY region');
    assert.deepEqual(Object.fromEntries(regions.map((r) => [r.region, r.crews])), crewRegions);
    expectError(await api('GET', '/api/stats/overview', { token: tokens.capo1 }), 403, 'FORBIDDEN');
  });

  it('Crew별 통계가 그 Crew의 소속원·업무·평가·소속 변화와 정확히 같다', async () => {
    const { crew, capo, token } = await crewWithCapo();
    const [a, b] = [await memberOf(crew), await memberOf(crew)];
    const temp = await memberOf(crew, 'SOLDIER', 'TEMPORARY');
    ok(await api('DELETE', `/api/crews/${crew.id}/members/${temp.id}`, { token: tokens.boss }));

    const done = await task({ crewId: crew.id, startAt: at(0), endAt: at(2), priority: 'HIGH' }, token);
    await runTask(done, [a, b], token);
    const participations = [{ userId: a.id, participated: true }, { userId: b.id, participated: true }];
    ok(await api('POST', `/api/tasks/${done.id}/complete`, { token, body: { outcome: 'SUCCESS', summary: '완료', participations } }));
    const cancelled = await task({ crewId: crew.id, startAt: at(24), endAt: at(25) }, token);
    ok(await api('POST', `/api/tasks/${cancelled.id}/cancel`, { token, body: { reason: '취소' } }));
    await task({ crewId: crew.id, startAt: at(48), endAt: at(50) }, token);
    const scores = Object.fromEntries(ok(await api('GET', '/api/evaluation-criteria', { token })).map((c) => [c.key, 4]));
    ok(await api('POST', `/api/tasks/${done.id}/evaluations`, { token, body: { evaluateeId: a.id, scores } }), 201);

    const window = { from: at(-1), to: at(72) };
    const row = ok(await api('GET', `/api/stats/crews?${q(window)}`, { token: tokens.boss })).crews.find((c) => c.crew.id === crew.id);
    assert.deepEqual(
      [row.regularCount, row.temporaryCount, row.taskCount, row.completedCount, row.cancelledCount, row.openCount, row.completionRate],
      [3, 0, 3, 1, 1, 1, 50],
    );
    assert.equal(row.capo.id, capo.id);
    const evalWindow = { from: iso(Date.now() - HOUR), to: iso(Date.now() + HOUR) };
    const crewEvals = ok(await api('GET', `/api/stats/crews?${q(evalWindow)}`, { token: tokens.boss })).crews.find((c) => c.crew.id === crew.id);
    assert.deepEqual([crewEvals.evaluationCount, crewEvals.evaluationAverage], [1, 4]);

    const members = ok(await api('GET', `/api/stats/members?crewId=${crew.id}`, { token: tokens.boss }));
    assert.deepEqual([members.total, members.byRole.find((r) => r.role === 'CAPO').total, members.byRole.find((r) => r.role === 'SOLDIER').total], [3, 1, 2]);

    const trend = ok(await api('GET', `/api/stats/tasks?${q({ ...window, interval: 'week', crewId: crew.id })}`, { token: tokens.boss }));
    const sum = (s) => trend.buckets.reduce((n, x) => n + x.byStatus[s], 0);
    assert.deepEqual([sum('COMPLETED'), sum('CANCELLED'), sum('PLANNED'), trend.buckets.reduce((n, x) => n + x.total, 0)], [1, 1, 1, 3]);

    const lead = ok(await api('GET', `/api/stats/tasks/lead-time?${q({ ...evalWindow, crewId: crew.id })}`, { token: tokens.boss }));
    assert.deepEqual(lead.priorities.map((p) => [p.priority, p.completedCount]), [['LOW', 0], ['MEDIUM', 0], ['HIGH', 1], ['CRITICAL', 0]]);
    assert.equal(lead.priorities[2].averagePlannedHours, 2);

    const changes = ok(await api('GET', `/api/stats/membership-changes?${q({ ...evalWindow, interval: 'day', crewId: crew.id })}`, { token: tokens.boss }));
    assert.deepEqual(changes.totals, { joined: 4, transferred: 0, removed: 1, withdrawn: 0 });

    const evals = ok(await api('GET', `/api/stats/evaluations?${q({ ...evalWindow, interval: 'day', crewId: crew.id })}`, { token: tokens.boss }));
    assert.deepEqual([evals.buckets.reduce((n, x) => n + x.count, 0), evals.byCrew[0].averageScore], [1, 4]);
  });
});

// ---------------------------------------------------------------------------
describe('통합 검색과 저장 검색 (#180~#184)', () => {
  it('검색 결과는 종류마다 요청자의 권한 범위로 제한된다', async () => {
    const word = unique('검색');
    const { crew, token: capoToken } = await crewWithCapo();
    const other = await crewWithCapo();
    const member = await memberOf(crew);
    const mine = await task({ crewId: crew.id, title: `${word} 내 업무`, startAt: at(100), endAt: at(101) }, capoToken);
    await task({ crewId: other.crew.id, title: `${word} 남의 업무`, startAt: at(100), endAt: at(101) }, other.token);
    ok(await api('POST', `/api/tasks/${mine.id}/assignees`, { token: capoToken, body: { assignees: [{ userId: member.id }] } }), 201);
    const category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    for (const minRole of ['SOLDIER', 'CAPO']) {
      ok(await api('POST', '/api/resources', { token: tokens.boss, body: { code: unique('T-'), name: `${word} ${minRole}`, categoryId: category.id, minRole } }), 201);
    }
    const run = async (token) => ok(await api('GET', `/api/search?q=${encodeURIComponent(word)}`, { token })).results;

    const boss = await run(tokens.boss);
    assert.deepEqual([boss.tasks.total, boss.resources.total], [2, 2]);
    const capo = await run(capoToken);
    assert.deepEqual(capo.tasks.items.map((x) => x.id), [mine.id]);
    const soldier = await run(await login(member));
    assert.deepEqual([soldier.tasks.scope, soldier.tasks.items.map((x) => x.id)], ['participant', [mine.id]]);
    assert.deepEqual([soldier.resources.scope, soldier.resources.items.map((x) => x.name)], ['usable', [`${word} SOLDIER`]]);
    const associate = await run(tokens.associate1);
    assert.equal(associate.users.restricted, true);
    assert.equal(associate.resources.restricted, true);
    assert.equal(associate.tasks.total, 0);

    const onlyTasks = ok(await api('GET', `/api/search?q=${encodeURIComponent(word)}&types=tasks&size=1`, { token: tokens.boss }));
    assert.deepEqual([onlyTasks.types, onlyTasks.results.tasks.items.length, onlyTasks.results.tasks.total], [['tasks'], 1, 2]);
    expectError(await api('GET', '/api/search', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
    expectError(await api('GET', '/api/search?q=x&types=planets', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
  });

  it('검색 조건을 저장하고 다시 실행하며, 본인 것만 쓰고 지울 수 있다', async () => {
    const user = await makeUser(t, tokens);
    const token = await login(user);
    const s = ok(await api('POST', '/api/saved-searches', { token, body: { name: '강북', q: '강북', types: ['crews'] } }), 201);
    expectError(await api('POST', '/api/saved-searches', { token, body: { name: '강북', q: '다른' } }), 409, 'DUPLICATE');
    assert.deepEqual(ok(await api('GET', '/api/saved-searches', { token })).map((x) => x.id), [s.id]);
    const result = ok(await api('GET', `/api/saved-searches/${s.id}/results`, { token }));
    assert.deepEqual([result.savedSearch.runCount, result.types, result.results.crews.items[0].name], [1, ['crews'], 'Northside']);
    assert.equal(ok(await api('GET', '/api/saved-searches', { token }))[0].runCount, 1);
    expectError(await api('GET', `/api/saved-searches/${s.id}/results`, { token: tokens.boss }), 403, 'FORBIDDEN');
    expectError(await api('DELETE', `/api/saved-searches/${s.id}`, { token: tokens.boss }), 403, 'FORBIDDEN');
    ok(await api('DELETE', `/api/saved-searches/${s.id}`, { token }));
    expectError(await api('GET', `/api/saved-searches/${s.id}/results`, { token }), 404, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
describe('자원·평가·관리 활동 통계와 운영 경고 (#191~#198)', () => {
  it('자원 분류별 상태 분포·가동률과 사용 순위가 실제 사용과 같다', async () => {
    const category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    const make = async () => ok(await api('POST', '/api/resources', { token: tokens.boss, body: { code: unique('T-'), name: '통계 자원', categoryId: category.id } }), 201);
    const [used, broken] = [await make(), await make()];
    ok(await api('PATCH', `/api/resources/${broken.id}/status`, { token: tokens.boss, body: { status: 'UNAVAILABLE', reason: '통계' } }));
    const user = await makeUser(t, tokens);
    const now = Date.now();
    ok(await api('POST', `/api/resources/${used.id}/allocations`, { token: tokens.boss, body: { userId: user.id, startAt: iso(now - 60000), endAt: iso(now + HOUR) } }), 201);
    const userToken = await login(user);
    ok(await api('POST', `/api/resources/${used.id}/checkout`, { token: userToken, body: {} }), 201);
    ok(await api('POST', `/api/resources/${used.id}/return`, { token: userToken, body: {} }));

    const stats = ok(await api('GET', '/api/stats/resources', { token: tokens.boss }));
    const c = stats.categories.find((x) => x.category.id === category.id);
    assert.deepEqual([c.total, c.byStatus.AVAILABLE, c.byStatus.UNAVAILABLE], [2, 1, 1]);
    const ranking = ok(await api('GET', `/api/stats/resources/usage-ranking?${q({ categoryId: category.id, from: iso(now - HOUR), to: iso(now + HOUR) })}`, { token: tokens.boss }));
    assert.deepEqual(ranking.map((r) => [r.resource.id, r.usageCount, r.rank]), [[used.id, 1, 1]]);
  });

  it('관리 활동 통계는 Boss·Administrator만 보고, 건수가 활동 기록과 같다', async () => {
    const window = { from: iso(Date.now() - 2 * 24 * HOUR), to: iso(Date.now() + HOUR) };
    const stats = ok(await api('GET', `/api/stats/admin-activity?${q({ ...window, interval: 'day' })}`, { token: tokens.admin }));
    const count = await ActivityLog.countDocuments({ createdAt: { $gte: new Date(window.from), $lt: new Date(window.to) } });
    assert.equal(stats.total, count);
    assert.equal(stats.areas.reduce((n, a) => n + a.count, 0), stats.total);
    assert.equal(stats.buckets.reduce((n, b) => n + b.total, 0), stats.total);
    ok(await api('GET', '/api/stats/admin-activity', { token: tokens.boss }));
    expectError(await api('GET', '/api/stats/admin-activity', { token: tokens.underboss1 }), 403, 'FORBIDDEN');
  });

  it('운영 경고에 일정이 지난 미완료 업무, 반환 연체 자원, 장기 점검이 오른다', async () => {
    const late = await task({ startAt: iso(Date.now() - 3 * HOUR), endAt: iso(Date.now() - 2 * HOUR) });
    const category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    const resource = ok(await api('POST', '/api/resources', { token: tokens.boss, body: { code: unique('T-'), name: '경고 자원', categoryId: category.id } }), 201);
    const m = ok(await api('POST', `/api/resources/${resource.id}/maintenances`, { token: tokens.boss, body: { reason: '오래 걸리는 점검' } }), 201);
    await getPool().query('UPDATE resource_maintenances SET started_at = NOW() - INTERVAL 10 DAY WHERE id = ?', [m.id]);

    const alerts = ok(await api('GET', '/api/stats/alerts', { token: tokens.boss }));
    assert.ok(alerts.overdueTasks.some((x) => x.id === late.id));
    assert.ok(alerts.longMaintenances.some((x) => x.id === m.id && x.daysOpen >= 10));
    assert.ok(alerts.counts.overdueTasks >= alerts.overdueTasks.length && alerts.counts.longMaintenances >= 1);
    assert.ok(alerts.overdueUsages.every((u) => u.open && u.hoursLate >= 0));
    // 다음 실행의 경고 목록에 남지 않게 정리한다.
    ok(await api('POST', `/api/tasks/${late.id}/cancel`, { token: tokens.boss, body: { reason: '정리' } }));
    ok(await api('POST', `/api/resources/${resource.id}/maintenances/${m.id}/complete`, { token: tokens.boss, body: { result: 'RESTORED' } }));
  });

  it('Crew 업무량은 그 Crew의 책임자와 Underboss 이상만 보고, 소속원별 업무 수·시간이 맞다 (#197)', async () => {
    const { crew, token } = await crewWithCapo();
    const [a, b] = [await memberOf(crew), await memberOf(crew)];
    const t1 = await task({ crewId: crew.id, startAt: at(200), endAt: at(203) }, token);
    ok(await api('POST', `/api/tasks/${t1.id}/assignees`, { token, body: { assignees: [{ userId: a.id, role: 'LEADER' }, { userId: b.id }] } }), 201);
    const t2 = await task({ crewId: crew.id, startAt: at(204), endAt: at(205) }, token);
    ok(await api('POST', `/api/tasks/${t2.id}/assignees`, { token, body: { assignees: [{ userId: a.id }] } }), 201);
    const w = ok(await api('GET', `/api/crews/${crew.id}/workload?${q({ from: at(199), to: at(210) })}`, { token }));
    const byId = new Map(w.members.map((m) => [m.user.id, m]));
    assert.deepEqual([byId.get(a.id).taskCount, byId.get(a.id).hours, byId.get(a.id).leaderCount], [2, 4, 1]);
    assert.deepEqual([byId.get(b.id).taskCount, byId.get(b.id).hours], [1, 3]);
    assert.equal(w.members[0].user.id, a.id);
    const res = await api('GET', `/api/crews/${crew.id}/workload`, { token: tokens.capo1 });
    expectError(res, 403, 'FORBIDDEN');
    assert.equal(res.body.error.details.rule, 'BR-05');
  });

  it('내 요약에 진행할 업무, 응답 대기, 사용 중 자원, 최근 평가가 모인다 (#198)', async () => {
    const user = await makeUser(t, tokens);
    const token = await login(user);
    const soon = await task({ startAt: iso(Date.now() + 24 * HOUR), endAt: iso(Date.now() + 26 * HOUR) });
    ok(await api('POST', `/api/tasks/${soon.id}/assignees`, { token: tokens.boss, body: { assignees: [{ userId: user.id }] } }), 201);
    const d = ok(await api('GET', '/api/me/dashboard', { token }));
    assert.deepEqual([d.tasks.openCount, d.todo.awaitingMyResponse, d.tasks.upcoming[0].id], [1, 1, soon.id]);
    assert.equal(d.evaluations.reputationScore, 50);
    assert.equal(d.todo.evaluationsToWrite, undefined);
    const bossView = ok(await api('GET', '/api/me/dashboard', { token: tokens.boss }));
    assert.equal(typeof bossView.todo.evaluationsToWrite, 'number');
    assert.equal(typeof bossView.todo.appealsToResolve, 'number');
  });
});

// ---------------------------------------------------------------------------
describe('관리자: 계정 (#199~#204)', () => {
  it('잠그면 로그인과 기존 토큰이 바로 막히고, 풀면 다시 로그인된다', async () => {
    const user = await makeUser(t, tokens);
    const token = await login(user);
    const locked = ok(await api('PUT', `/api/admin/accounts/${user.id}/lock`, { token: tokens.admin, body: { reason: '조사' } }));
    assert.deepEqual([locked.locked, locked.lockedReason, locked.revokedSessionCount, locked.activeSessionCount], [true, '조사', 1, 0]);
    expectError(await api('GET', '/api/me', { token }), 401, 'UNAUTHENTICATED');
    const blocked = await api('POST', '/api/auth/login', { body: { username: user.username, password: user.password } });
    expectError(blocked, 403, 'FORBIDDEN');
    assert.equal(blocked.body.error.details.reason, 'ACCOUNT_LOCKED');
    expectError(await api('PUT', `/api/admin/accounts/${user.id}/lock`, { token: tokens.admin, body: { reason: '또' } }), 409, 'CONFLICT');
    assert.ok(ok(await api('GET', `/api/admin/accounts?locked=true&q=${user.username}`, { token: tokens.admin })).some((a) => a.id === user.id));

    ok(await api('DELETE', `/api/admin/accounts/${user.id}/lock`, { token: tokens.admin, body: { reason: '확인 끝' } }));
    await login(user);
    expectError(await api('DELETE', `/api/admin/accounts/${user.id}/lock`, { token: tokens.admin, body: {} }), 409, 'CONFLICT');
    const adminId = (await userModel.findByUsername('admin')).id;
    expectError(await api('PUT', `/api/admin/accounts/${adminId}/lock`, { token: tokens.admin, body: { reason: '본인' } }), 403, 'FORBIDDEN');
  });

  it('로그인 실패가 운영 설정의 잠금 기준에 이르면 자동으로 잠기고 로그인 이력에 남는다', async () => {
    const before = ok(await api('GET', '/api/admin/settings', { token: tokens.admin })).find((s) => s.key === 'loginLockThreshold').value;
    const user = await makeUser(t, tokens);
    try {
      ok(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { loginLockThreshold: 2 }, reason: '테스트' } }));
      for (let i = 0; i < 2; i += 1) expectError(await api('POST', '/api/auth/login', { body: { username: user.username, password: 'Wrong1234' } }), 401, 'UNAUTHENTICATED');
      const account = ok(await api('GET', `/api/admin/accounts?q=${user.username}`, { token: tokens.admin }))[0];
      assert.deepEqual([account.locked, account.failedLoginCount], [true, 2]);
      expectError(await api('POST', '/api/auth/login', { body: { username: user.username, password: user.password } }), 403, 'FORBIDDEN');
      const history = ok(await api('GET', `/api/admin/login-history?userId=${user.id}&success=false`, { token: tokens.admin }));
      assert.deepEqual(history.map((h) => h.reason), ['ACCOUNT_LOCKED', 'WRONG_PASSWORD', 'WRONG_PASSWORD']);
      const log = await ActivityLog.findOne({ action: 'ACCOUNT_LOCKED', 'target.id': String(user.id) }).lean();
      assert.match(log.reason, /2회 연속 실패/);
    } finally {
      ok(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { loginLockThreshold: before } } }));
    }
  });

  it('임시 비밀번호를 발급하면 이전 비밀번호와 세션이 끊기고, 강제 로그아웃은 세션만 끊는다', async () => {
    const user = await makeUser(t, tokens);
    const token = await login(user);
    const reset = ok(await api('POST', `/api/admin/accounts/${user.id}/password-reset`, { token: tokens.admin, body: { reason: '분실' } }));
    assert.match(reset.temporaryPassword, /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{12}$/);
    assert.equal(reset.revokedSessionCount, 1);
    expectError(await api('GET', '/api/me', { token }), 401, 'UNAUTHENTICATED');
    expectError(await api('POST', '/api/auth/login', { body: { username: user.username, password: user.password } }), 401, 'UNAUTHENTICATED');
    const fresh = (await t.login(user.username, reset.temporaryPassword)).accessToken;

    const out = ok(await api('DELETE', `/api/admin/accounts/${user.id}/sessions`, { token: tokens.admin, body: { reason: '보안 점검' } }));
    assert.equal(out.revokedSessionCount, 1);
    expectError(await api('GET', '/api/me', { token: fresh }), 401, 'UNAUTHENTICATED');
    await t.login(user.username, reset.temporaryPassword);
    const logs = await ActivityLog.find({ 'target.id': String(user.id), action: { $in: ['PASSWORD_RESET', 'SESSIONS_FORCE_REVOKED'] } }).lean();
    assert.deepEqual(logs.map((l) => l.action).sort(), ['PASSWORD_RESET', 'SESSIONS_FORCE_REVOKED']);
  });
});

// ---------------------------------------------------------------------------
describe('관리자: 권한·설정·점검 (#205~#210)', () => {
  it('역할별 권한을 바꾸면 RBAC에 바로 반영되고, 기본값으로 되돌릴 수 있다', async () => {
    const soldierDefaults = Object.entries(DEFAULT_PERMISSIONS).filter(([, p]) => p.roles.includes('SOLDIER')).map(([k]) => k);
    try {
      ok(await api('GET', '/api/resources/available', { token: tokens.soldier1 }));
      const changed = ok(await api('PUT', '/api/admin/permissions/SOLDIER', {
        token: tokens.admin, body: { keys: [...soldierDefaults.filter((k) => k !== 'resource.read'), 'stats.read'], reason: '테스트' },
      }));
      assert.deepEqual([changed.removed, changed.added], [['resource.read'], ['stats.read']]);
      expectError(await api('GET', '/api/resources/available', { token: tokens.soldier1 }), 403, 'FORBIDDEN');
      ok(await api('GET', '/api/stats/overview', { token: tokens.soldier1 }));
      const matrix = ok(await api('GET', '/api/admin/permissions', { token: tokens.admin }));
      const row = matrix.permissions.find((p) => p.key === 'resource.read');
      assert.deepEqual(row.roles.SOLDIER, { allowed: false, default: true, overridden: true });
      assert.ok((await getPool().query("SELECT COUNT(*) AS n FROM role_permission_overrides WHERE role = 'SOLDIER'"))[0][0].n === 2);
    } finally {
      const restored = ok(await api('PUT', '/api/admin/permissions/SOLDIER', { token: tokens.admin, body: { keys: soldierDefaults } }));
      assert.deepEqual(restored.overrides, []);
    }
    ok(await api('GET', '/api/resources/available', { token: tokens.soldier1 }));
    expectError(await api('GET', '/api/stats/overview', { token: tokens.soldier1 }), 403, 'FORBIDDEN');

    expectError(await api('PUT', '/api/admin/permissions/SOLDIER', { token: tokens.admin, body: { keys: ['no.such.key'] } }), 400, 'VALIDATION_ERROR');
    const adminKeys = Object.entries(DEFAULT_PERMISSIONS).filter(([, p]) => p.roles.includes('ADMIN')).map(([k]) => k);
    expectError(await api('PUT', '/api/admin/permissions/ADMIN', { token: tokens.admin, body: { keys: adminKeys.filter((k) => k !== 'admin.permissions') } }), 409, 'CONFLICT');
    expectError(await api('PUT', '/api/admin/permissions/PIRATE', { token: tokens.admin, body: { keys: [] } }), 400, 'VALIDATION_ERROR');
  });

  it('운영 설정을 바꾸면 평가 수정 기한 같은 규칙에 바로 반영된다', async () => {
    const current = ok(await api('GET', '/api/admin/settings', { token: tokens.admin }));
    const before = current.find((s) => s.key === 'evaluationEditDays').value;
    try {
      expectError(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { evaluationEditDays: 99 } } }), 400, 'VALIDATION_ERROR');
      expectError(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { nope: 1 } } }), 400, 'VALIDATION_ERROR');
      expectError(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { evaluationEditDays: before } } }), 409, 'CONFLICT');
      const next = before === 10 ? 11 : 10;
      const updated = ok(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { evaluationEditDays: next }, reason: '테스트' } }));
      assert.equal(updated.find((s) => s.key === 'evaluationEditDays').value, next);

      const member = await makeUser(t, tokens);
      const done = await task({ startAt: at(300), endAt: at(301) });
      await runTask(done, [member]);
      ok(await api('POST', `/api/tasks/${done.id}/complete`, { token: tokens.boss, body: { outcome: 'SUCCESS', summary: '완료', participations: [{ userId: member.id, participated: true }] } }));
      const scores = Object.fromEntries(ok(await api('GET', '/api/evaluation-criteria', { token: tokens.boss })).map((c) => [c.key, 3]));
      const e = ok(await api('POST', `/api/tasks/${done.id}/evaluations`, { token: tokens.boss, body: { evaluateeId: member.id, scores } }), 201);
      const days = (new Date(e.editableUntil) - Date.now()) / (24 * HOUR);
      assert.ok(Math.abs(days - next) < 0.01, String(days));
    } finally {
      ok(await api('PUT', '/api/admin/settings', { token: tokens.admin, body: { settings: { evaluationEditDays: before } } }));
    }
  });

  it('무결성 점검은 깨진 데이터를 규칙별로 찾아내고, DB 상태는 두 DB 모두 연결됨이다', async () => {
    const category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    const resource = ok(await api('POST', '/api/resources', { token: tokens.boss, body: { code: unique('T-'), name: '무결성 자원', categoryId: category.id } }), 201);
    const find = (report) => report.checks.find((c) => c.key === 'resourceStatusMismatch').items.some((i) => i.resourceId === resource.id);
    assert.equal(find(ok(await api('GET', '/api/admin/integrity-check', { token: tokens.admin }))), false);
    await getPool().query("UPDATE resources SET status = 'IN_USE' WHERE id = ?", [resource.id]); // 사용 기록 없이 사용중
    try {
      const report = ok(await api('GET', '/api/admin/integrity-check', { token: tokens.admin }));
      assert.equal(report.ok, false);
      assert.equal(find(report), true);
      assert.deepEqual(report.checks.map((c) => c.rule), ['BR-01', 'DR-01', 'BR-03', 'BR-07', 'DR-03']);
    } finally {
      await getPool().query("UPDATE resources SET status = 'AVAILABLE' WHERE id = ?", [resource.id]);
    }
    const health = ok(await api('GET', '/api/admin/health', { token: tokens.admin }));
    assert.deepEqual([health.status, health.mysql.ok, health.mongodb.ok, health.mysql.database], ['ok', true, true, config.mysql.database]);
  });
});
