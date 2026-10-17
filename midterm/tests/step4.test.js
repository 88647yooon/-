// 단계 4 공용 자원 검증 (작업지시서 5장 단계 4 완료 기준 + API 목록표 #110~#154, 단계 3 업무 API의 자원 부분)
// 시드 자원은 건드리지 않고, 매번 새로 만든 분류·자원·구성원·업무를 쓴다. 예약은 먼 미래 시간대에,
// 사용 시작이 필요한 경우만 지금 시각 주변에 잡는다 (새로 만든 자원이라 다른 실행과 겹치지 않는다).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ActivityLog = require('../models/mongo/ActivityLog');
const { getPool } = require('../config/database');
const { startServer, makeUser, makeCrew, unique } = require('./helpers');

let t;
const tokens = {};
let category;
const HOUR = 60 * 60 * 1000;
const BASE = Math.floor(Date.now() / HOUR) * HOUR + (200 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
const at = (hours) => new Date(BASE + hours * HOUR).toISOString();
// 지금 기준 시각 (사용 시작은 배정 시간대 안에서만 할 수 있다)
const fromNow = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

before(async () => {
  t = await startServer();
  for (const name of ['admin', 'boss', 'underboss1', 'capo1', 'capo2', 'soldier1', 'associate1']) tokens[name] = (await t.login(name)).accessToken;
  category = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
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

async function makeResource(body = {}, token = tokens.boss) {
  return ok(await api('POST', '/api/resources', { token, body: { code: unique('T-'), name: unique('자원-'), categoryId: category.id, ...body } }), 201);
}
async function makeTask(body = {}, token = tokens.boss) {
  return ok(await api('POST', '/api/tasks', { token, body: { title: unique('업무-'), startAt: at(0), endAt: at(2), ...body } }), 201);
}
const allocateToTask = (taskId, resourceId, extra = {}, token = tokens.boss) =>
  api('POST', `/api/tasks/${taskId}/resources`, { token, body: { resourceId, ...extra } });
const allocateToUser = (resourceId, userId, startAt, endAt, token = tokens.boss) =>
  api('POST', `/api/resources/${resourceId}/allocations`, { token, body: { userId, startAt, endAt } });
const setResourceStatus = (resourceId, status, token = tokens.boss) =>
  api('PATCH', `/api/resources/${resourceId}/status`, { token, body: { status, reason: '테스트' } });
const getResource = async (resourceId) => ok(await api('GET', `/api/resources/${resourceId}`, { token: tokens.boss }));

// 책임자가 있는 테스트용 Crew와 그 소속원
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
// 지금 사용할 수 있게 배정받은 구성원 (배정: 1분 전부터 durationMin분 뒤까지)
async function userHolding(resource, { durationMin = 120, role = 'SOLDIER' } = {}) {
  const user = await makeUser(t, tokens, { role });
  const allocation = ok(await allocateToUser(resource.id, user.id, fromNow(-1), fromNow(durationMin)), 201);
  return { user, token: await login(user), allocation };
}
const checkout = (resourceId, token, body = {}) => api('POST', `/api/resources/${resourceId}/checkout`, { token, body });

// ---------------------------------------------------------------------------
describe('단계 4 완료 기준', () => {
  it('같은 자원을 겹치는 시간대에 다시 배정하면 409 BR-07 (맞닿은 시간은 허용)', async () => {
    const resource = await makeResource();
    const first = await makeTask({ startAt: at(0), endAt: at(2) });
    const second = await makeTask({ startAt: at(1), endAt: at(3) });
    ok(await allocateToTask(first.id, resource.id), 201);

    const res = await allocateToTask(second.id, resource.id);
    expectRule(res, 409, 'BR-07');
    assert.equal(res.body.error.details.conflicts[0].kind, 'TASK');
    assert.equal(res.body.error.details.conflicts[0].task.id, first.id);

    const soldier = await makeUser(t, tokens);
    expectRule(await allocateToUser(resource.id, soldier.id, at(1.5), at(4)), 409, 'BR-07');
    ok(await allocateToUser(resource.id, soldier.id, at(2), at(4)), 201);
  });

  it('사용불가·점검중 자원을 업무·구성원에게 배정하거나 신청하면 409 BR-08', async () => {
    const broken = await makeResource();
    ok(await setResourceStatus(broken.id, 'UNAVAILABLE'));
    const task = await makeTask();
    const soldier = await makeUser(t, tokens);
    expectRule(await allocateToTask(task.id, broken.id), 409, 'BR-08');
    expectRule(await allocateToUser(broken.id, soldier.id, at(0), at(1)), 409, 'BR-08');
    expectRule(await api('POST', '/api/resource-requests', { token: await login(soldier), body: { resourceId: broken.id, startAt: at(0), endAt: at(1), reason: '테스트' } }), 409, 'BR-08');

    const inspected = await makeResource();
    ok(await api('POST', `/api/resources/${inspected.id}/maintenances`, { token: tokens.capo1, body: { reason: '정기 점검' } }), 201);
    expectRule(await allocateToTask(task.id, inspected.id), 409, 'BR-08');
  });

  it('반환하면 자원이 사용가능으로 돌아오고 사용 이력과 상태 이력에서 그 기록을 확인할 수 있다', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource);
    const usage = ok(await checkout(resource.id, holder.token), 201);
    assert.equal(usage.open, true);
    assert.equal((await getResource(resource.id)).status, 'IN_USE');
    assert.equal((await getResource(resource.id)).currentUsage.user.id, holder.user.id);

    const returned = ok(await api('POST', `/api/resources/${resource.id}/return`, { token: holder.token, body: { condition: 'GOOD', note: '이상 없음' } }));
    assert.equal(returned.resourceStatus, 'AVAILABLE');

    const history = ok(await api('GET', `/api/resources/${resource.id}/usages`, { token: tokens.capo1 }));
    assert.equal(history.length, 1);
    assert.equal(history[0].id, usage.id);
    assert.equal(history[0].user.id, holder.user.id);
    assert.equal(history[0].returnCondition, 'GOOD');
    assert.ok(history[0].returnedAt);

    const statusHistory = ok(await api('GET', `/api/resources/${resource.id}/status-history`, { token: tokens.capo1 }));
    assert.deepEqual(statusHistory.map((h) => h.cause), ['CREATED', 'CHECKOUT', 'RETURN']);
    assert.deepEqual(statusHistory.map((h) => h.to), ['AVAILABLE', 'IN_USE', 'AVAILABLE']);

    // 구성원 배정으로 쓴 경우 반환하면 배정도 끝나 남은 시간대가 비워진다.
    const allocations = ok(await api('GET', `/api/users/${holder.user.id}/allocations?includeReleased=true`, { token: holder.token }));
    assert.equal(allocations[0].releaseReason, 'RETURNED');
  });

  it('같은 자원을 겹치는 시간대에 동시에 배정해도 한 건만 성공한다 (자원 행 잠금)', async () => {
    const resource = await makeResource();
    const [a, b] = await Promise.all([makeTask({ startAt: at(10), endAt: at(12) }), makeTask({ startAt: at(11), endAt: at(13) })]);
    const results = await Promise.all([allocateToTask(a.id, resource.id), allocateToTask(b.id, resource.id)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    expectRule(results.find((r) => r.status === 409), 409, 'BR-07');
  });
});

// ---------------------------------------------------------------------------
describe('자원 분류·자원 (#110~#124)', () => {
  it('분류를 등록·수정하고, 이름이 겹치면 409 DUPLICATE, 자원이 있는 분류는 삭제할 수 없다', async () => {
    const c = ok(await api('POST', '/api/resource-categories', { token: tokens.underboss1, body: { name: unique('분류-'), description: '설명' } }), 201);
    expectError(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: c.name } }), 409, 'DUPLICATE');
    expectError(await api('POST', '/api/resource-categories', { token: tokens.capo1, body: { name: unique('분류-') } }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('PATCH', `/api/resource-categories/${c.id}`, { token: tokens.boss, body: { description: '바꾼 설명' } })).description, '바꾼 설명');

    await makeResource({ categoryId: c.id });
    const listed = ok(await api('GET', '/api/resource-categories', { token: tokens.associate1 })).find((x) => x.id === c.id);
    assert.equal(listed.resourceCount, 1);
    assert.equal(listed.availableCount, 1);
    expectError(await api('DELETE', `/api/resource-categories/${c.id}`, { token: tokens.boss }), 409, 'CONFLICT');

    const empty = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    ok(await api('DELETE', `/api/resource-categories/${empty.id}`, { token: tokens.boss }));
  });

  it('관리 번호가 겹치면 409 DUPLICATE, 일괄 등록은 한 행이라도 안 되면 아무것도 등록하지 않는다', async () => {
    const r = await makeResource();
    expectError(await api('POST', '/api/resources', { token: tokens.boss, body: { code: r.code, name: 'x', categoryId: category.id } }), 409, 'DUPLICATE');
    expectError(await api('POST', '/api/resources', { token: tokens.capo1, body: { code: unique('T-'), name: 'x', categoryId: category.id } }), 403, 'FORBIDDEN');

    const fresh = unique('T-');
    const rejected = await api('POST', '/api/resources/bulk', {
      token: tokens.boss,
      body: { resources: [{ code: fresh, name: '하나', categoryId: category.id }, { code: r.code, name: '둘', categoryId: category.id }, { code: unique('T-'), name: '셋', categoryId: 999999 }] },
    });
    expectError(rejected, 409, 'BULK_REJECTED');
    assert.deepEqual(rejected.body.error.details.map((d) => [d.index, d.code]), [[1, 'DUPLICATE'], [2, 'NOT_FOUND']]);
    const search = ok(await api('GET', `/api/resources?q=${fresh}`, { token: tokens.boss }));
    assert.equal(search.length, 0);

    const created = ok(await api('POST', '/api/resources/bulk', {
      token: tokens.boss,
      body: { resources: [{ code: unique('T-'), name: '하나', categoryId: category.id }, { code: unique('T-'), name: '둘', categoryId: category.id, minRole: 'CAPO' }] },
    }), 201);
    assert.deepEqual(created.map((x) => x.minRole), ['SOLDIER', 'CAPO']);
  });

  it('관리용 목록은 Capo 이상만 보고, 상태·정상 여부로 거를 수 있다', async () => {
    const broken = await makeResource({ location: unique('창고-') });
    ok(await setResourceStatus(broken.id, 'UNAVAILABLE'));
    const byStatus = ok(await api('GET', `/api/resources?status=UNAVAILABLE&location=${encodeURIComponent(broken.location)}`, { token: tokens.capo1 }));
    assert.deepEqual(byStatus.map((x) => x.id), [broken.id]);
    const abnormal = ok(await api('GET', `/api/resources?assignable=false&size=100&categoryId=${category.id}`, { token: tokens.capo1 }));
    assert.ok(abnormal.every((x) => x.assignable === false));
    assert.ok(abnormal.some((x) => x.id === broken.id));
    expectError(await api('GET', '/api/resources', { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('이용 가능한 자원은 내 역할·자원 상태·시간대 기준으로만 보인다 (FR-14)', async () => {
    const location = unique('위치-');
    const open = await makeResource({ location });
    const capoOnly = await makeResource({ location, minRole: 'CAPO' });
    const inspected = await makeResource({ location });
    ok(await setResourceStatus(inspected.id, 'MAINTENANCE'));
    const booked = await makeResource({ location });
    const task = await makeTask({ startAt: at(20), endAt: at(22) });
    ok(await allocateToTask(task.id, booked.id), 201);

    const query = `/api/resources/available?location=${encodeURIComponent(location)}&from=${encodeURIComponent(at(21))}&to=${encodeURIComponent(at(23))}`;
    const forSoldier = ok(await api('GET', query, { token: tokens.soldier1 }));
    assert.deepEqual(forSoldier.map((x) => x.id), [open.id]);
    const forCapo = ok(await api('GET', query, { token: tokens.capo1 }));
    assert.deepEqual(forCapo.map((x) => x.id).sort((a, b) => a - b), [open.id, capoOnly.id].sort((a, b) => a - b));
    expectError(await api('GET', '/api/resources/available', { token: tokens.associate1 }), 403, 'FORBIDDEN');

    // 이용 최소 역할보다 낮으면 상세도 볼 수 없다.
    expectError(await api('GET', `/api/resources/${capoOnly.id}`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    ok(await api('GET', `/api/resources/${open.id}`, { token: tokens.soldier1 }));
  });

  it('상태 변경: 같은 상태·허용되지 않는 값은 거부하고, 배정 불가가 되면 잡혀 있는 예약을 알려 준다', async () => {
    const resource = await makeResource();
    expectError(await setResourceStatus(resource.id, 'AVAILABLE'), 409, 'CONFLICT');
    expectError(await setResourceStatus(resource.id, 'IN_USE'), 400, 'VALIDATION_ERROR');
    const task = await makeTask({ startAt: at(30), endAt: at(31) });
    ok(await allocateToTask(task.id, resource.id), 201);

    const changed = ok(await setResourceStatus(resource.id, 'UNAVAILABLE', tokens.capo2));
    assert.equal(changed.assignable, false);
    assert.equal(changed.affectedReservations[0].task.id, task.id);
    expectError(await setResourceStatus(resource.id, 'AVAILABLE', tokens.soldier1), 403, 'FORBIDDEN');
    ok(await setResourceStatus(resource.id, 'AVAILABLE'));

    const statuses = ok(await api('GET', '/api/resource-statuses', { token: tokens.associate1 }));
    assert.deepEqual(statuses.filter((s) => !s.assignable).map((s) => s.status), ['MAINTENANCE', 'UNAVAILABLE']);
  });

  it('이용 최소 역할을 바꾸면 이용 가능 목록에 바로 반영되고, 이력이 있는 자원은 삭제할 수 없다', async () => {
    const location = unique('위치-');
    const resource = await makeResource({ location });
    const query = `/api/resources/available?location=${encodeURIComponent(location)}`;
    assert.equal(ok(await api('GET', query, { token: tokens.soldier1 })).length, 1);
    ok(await api('PATCH', `/api/resources/${resource.id}/access-level`, { token: tokens.boss, body: { minRole: 'UNDERBOSS', reason: '고가 장비' } }));
    assert.equal(ok(await api('GET', query, { token: tokens.soldier1 })).length, 0);
    expectError(await api('PATCH', `/api/resources/${resource.id}/access-level`, { token: tokens.boss, body: { minRole: 'UNDERBOSS' } }), 409, 'CONFLICT');

    const renamed = ok(await api('PATCH', `/api/resources/${resource.id}`, { token: tokens.boss, body: { name: '바뀐 이름', location: null } }));
    assert.equal(renamed.name, '바뀐 이름');
    assert.equal(renamed.location, null);

    const task = await makeTask();
    ok(await allocateToTask(task.id, resource.id), 201);
    expectError(await api('DELETE', `/api/resources/${resource.id}`, { token: tokens.boss }), 409, 'CONFLICT');
    const unused = await makeResource();
    ok(await api('DELETE', `/api/resources/${unused.id}`, { token: tokens.boss }));
    expectError(await api('GET', `/api/resources/${unused.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
describe('자원 점검 (#125~#129)', () => {
  it('점검을 등록하면 점검중이 되고, 완료 결과에 따라 사용가능 또는 사용불가로 바뀐다', async () => {
    const resource = await makeResource();
    const m = ok(await api('POST', `/api/resources/${resource.id}/maintenances`, { token: tokens.capo1, body: { reason: '정기 점검', expectedEndAt: fromNow(60 * 24) } }), 201);
    assert.equal(m.open, true);
    assert.equal(m.source, 'MANUAL');
    assert.equal((await getResource(resource.id)).status, 'MAINTENANCE');
    assert.equal((await getResource(resource.id)).openMaintenance.id, m.id);
    expectError(await api('POST', `/api/resources/${resource.id}/maintenances`, { token: tokens.capo1, body: { reason: '또' } }), 409, 'CONFLICT');
    expectError(await setResourceStatus(resource.id, 'AVAILABLE'), 409, 'CONFLICT');
    expectError(await api('POST', `/api/resources/${resource.id}/maintenances`, { token: tokens.capo1, body: { reason: 'x', expectedEndAt: fromNow(-10) } }), 400, 'VALIDATION_ERROR');

    const updated = ok(await api('PATCH', `/api/resources/${resource.id}/maintenances/${m.id}`, { token: tokens.capo1, body: { reason: '부품 교체', expectedEndAt: fromNow(60) } }));
    assert.equal(updated.reason, '부품 교체');
    const open = ok(await api('GET', `/api/maintenances?q=${resource.code}`, { token: tokens.capo2 }));
    assert.deepEqual(open.map((x) => x.id), [m.id]);

    const done = ok(await api('POST', `/api/resources/${resource.id}/maintenances/${m.id}/complete`, { token: tokens.capo1, body: { result: 'RESTORED', note: '교체 완료' } }));
    assert.equal(done.resourceStatus, 'AVAILABLE');
    assert.equal(done.open, false);
    expectError(await api('POST', `/api/resources/${resource.id}/maintenances/${m.id}/complete`, { token: tokens.capo1, body: { result: 'RESTORED' } }), 409, 'CONFLICT');
    expectError(await api('PATCH', `/api/resources/${resource.id}/maintenances/${m.id}`, { token: tokens.capo1, body: { reason: 'x' } }), 409, 'CONFLICT');

    const m2 = ok(await api('POST', `/api/resources/${resource.id}/maintenances`, { token: tokens.capo1, body: { reason: '다시 고장' } }), 201);
    const scrapped = ok(await api('POST', `/api/resources/${resource.id}/maintenances/${m2.id}/complete`, { token: tokens.boss, body: { result: 'UNREPAIRABLE' } }));
    assert.equal(scrapped.resourceStatus, 'UNAVAILABLE');

    const records = ok(await api('GET', `/api/resources/${resource.id}/maintenances`, { token: tokens.capo1 }));
    assert.deepEqual(records.map((x) => x.result), ['UNREPAIRABLE', 'RESTORED']);
    const causes = ok(await api('GET', `/api/resources/${resource.id}/status-history`, { token: tokens.capo1 })).map((h) => h.cause);
    assert.deepEqual(causes, ['CREATED', 'MAINTENANCE_START', 'MAINTENANCE_COMPLETE', 'MAINTENANCE_START', 'MAINTENANCE_COMPLETE']);
    expectError(await api('GET', '/api/maintenances', { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
describe('업무 자원 할당 (#130~#136)과 업무 API의 자원 부분 (#64, #65, #69, #70, #92, #93)', () => {
  it('기본 시간대는 업무 일정이고, 업무 일정 밖이면 400, 같은 자원을 두 번 할당하면 409', async () => {
    const resource = await makeResource();
    const task = await makeTask({ startAt: at(40), endAt: at(43) });
    const a = ok(await allocateToTask(task.id, resource.id), 201);
    assert.equal(a.startAt, at(40));
    assert.equal(a.endAt, at(43));
    expectError(await allocateToTask(task.id, resource.id), 409, 'CONFLICT');
    const other = await makeResource();
    expectError(await allocateToTask(task.id, other.id, { startAt: at(39), endAt: at(41) }), 400, 'VALIDATION_ERROR');
    ok(await allocateToTask(task.id, other.id, { startAt: at(41), endAt: at(42) }), 201);

    const listed = ok(await api('GET', `/api/tasks/${task.id}/resources`, { token: tokens.boss }));
    assert.deepEqual(listed.map((x) => x.resource.id), [resource.id, other.id]);
    expectError(await api('GET', `/api/tasks/${task.id}/resources`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('Capo는 자기 Crew의 업무에만 자원을 할당한다 (403 BR-05)', async () => {
    const { crew, token } = await crewWithCapo();
    const other = await crewWithCapo();
    const resource = await makeResource();
    const task = await makeTask({ crewId: crew.id }, token);
    ok(await allocateToTask(task.id, resource.id, {}, token), 201);
    const foreign = await makeTask({ crewId: crew.id }, token);
    expectRule(await allocateToTask(foreign.id, (await makeResource()).id, {}, other.token), 403, 'BR-05');
  });

  it('할당 시간대를 조정하면 BR-07을 다시 검사하고, 해제하면 그 시간대가 비워진다', async () => {
    const resource = await makeResource();
    const a = await makeTask({ startAt: at(50), endAt: at(54) });
    const b = await makeTask({ startAt: at(52), endAt: at(54) });
    ok(await allocateToTask(a.id, resource.id, { startAt: at(50), endAt: at(52) }), 201);
    ok(await allocateToTask(b.id, resource.id), 201);
    expectRule(await api('PATCH', `/api/tasks/${a.id}/resources/${resource.id}`, { token: tokens.boss, body: { endAt: at(53) } }), 409, 'BR-07');
    const adjusted = ok(await api('PATCH', `/api/tasks/${a.id}/resources/${resource.id}`, { token: tokens.boss, body: { startAt: at(51) } }));
    assert.equal(adjusted.startAt, at(51));

    const remaining = ok(await api('DELETE', `/api/tasks/${b.id}/resources/${resource.id}`, { token: tokens.boss }));
    assert.equal(remaining.length, 0);
    ok(await api('PATCH', `/api/tasks/${a.id}/resources/${resource.id}`, { token: tokens.boss, body: { endAt: at(54) } }));
    expectError(await api('DELETE', `/api/tasks/${b.id}/resources/${resource.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
  });

  it('업무 일정을 바꾸면 할당 시간대가 따라가고, 옮긴 시간대가 겹치면 409 BR-07로 아무것도 바뀌지 않는다', async () => {
    const resource = await makeResource();
    const task = await makeTask({ startAt: at(60), endAt: at(62) });
    ok(await allocateToTask(task.id, resource.id), 201);
    const blocker = await makeTask({ startAt: at(70), endAt: at(71) });
    ok(await allocateToTask(blocker.id, resource.id), 201);

    ok(await api('PATCH', `/api/tasks/${task.id}/schedule`, { token: tokens.boss, body: { startAt: at(64), endAt: at(67) } }));
    const moved = ok(await api('GET', `/api/tasks/${task.id}/resources`, { token: tokens.boss }))[0];
    assert.deepEqual([moved.startAt, moved.endAt], [at(64), at(67)]);

    const res = await api('PATCH', `/api/tasks/${task.id}/schedule`, { token: tokens.boss, body: { startAt: at(69), endAt: at(72) } });
    expectRule(res, 409, 'BR-07');
    assert.equal(res.body.error.details.conflicts[0].resourceId, resource.id);
    const unchanged = ok(await api('GET', `/api/tasks/${task.id}`, { token: tokens.boss }));
    assert.equal(unchanged.startAt, at(64));
  });

  it('필요 자원 분류를 설정하면 시작 준비 상태가 부족한 자원을 알려 주고, 후보는 그 분류로 좁혀진다', async () => {
    const other = ok(await api('POST', '/api/resource-categories', { token: tokens.boss, body: { name: unique('분류-') } }), 201);
    const task = await makeTask({ startAt: at(80), endAt: at(81) });
    const body = { requiredHeadcount: 1, resources: [{ categoryId: other.id, quantity: 1 }] };
    const set = ok(await api('PUT', `/api/tasks/${task.id}/requirements`, { token: tokens.boss, body }));
    assert.deepEqual(set.resources.map((r) => [r.category.id, r.quantity, r.allocatedCount, r.satisfied]), [[other.id, 1, 0, false]]);
    expectError(await api('PUT', `/api/tasks/${task.id}/requirements`, { token: tokens.boss, body: { requiredHeadcount: 1, resources: [{ categoryId: 999999, quantity: 1 }] } }), 404, 'NOT_FOUND');

    const notReady = ok(await api('GET', `/api/tasks/${task.id}/readiness`, { token: tokens.boss }));
    assert.equal(notReady.resources.requirements[0].satisfied, false);
    assert.ok(notReady.issues.some((m) => m.includes(other.name)));

    const match = await makeResource({ categoryId: other.id });
    const candidates = ok(await api('GET', `/api/tasks/${task.id}/resource-candidates?size=100`, { token: tokens.boss }));
    assert.ok(candidates.every((r) => r.category.id === other.id));
    assert.ok(candidates.some((r) => r.id === match.id));
    const all = ok(await api('GET', `/api/tasks/${task.id}/resource-candidates?matchRequirements=false&q=${match.code}`, { token: tokens.boss }));
    assert.deepEqual(all.map((r) => r.id), [match.id]);

    ok(await allocateToTask(task.id, match.id), 201);
    const after = ok(await api('GET', `/api/tasks/${task.id}/readiness`, { token: tokens.boss }));
    assert.equal(after.resources.requirements[0].satisfied, true);
    assert.equal(after.resources.allocatedCount, 1);
    const again = ok(await api('GET', `/api/tasks/${task.id}/resource-candidates?q=${match.code}`, { token: tokens.boss }));
    assert.equal(again.length, 0);

    ok(await setResourceStatus(match.id, 'UNAVAILABLE'));
    const broken = ok(await api('GET', `/api/tasks/${task.id}/readiness`, { token: tokens.boss }));
    assert.deepEqual(broken.resources.unusable.map((r) => r.id), [match.id]);
    assert.equal(broken.ready, false);
  });

  it('업무를 취소하면 할당 자원이 해제되어 그 시간대를 다른 업무가 쓸 수 있다', async () => {
    const resource = await makeResource();
    const task = await makeTask({ startAt: at(90), endAt: at(92) });
    ok(await allocateToTask(task.id, resource.id), 201);
    const other = await makeTask({ startAt: at(90), endAt: at(92) });
    expectRule(await allocateToTask(other.id, resource.id), 409, 'BR-07');
    ok(await api('POST', `/api/tasks/${task.id}/cancel`, { token: tokens.boss, body: { reason: '테스트 취소' } }));
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}/resources`, { token: tokens.boss })).length, 0);
    ok(await allocateToTask(other.id, resource.id), 201);
    const log = await ActivityLog.findOne({ action: 'TASK_CANCELLED', 'target.id': String(task.id) }).lean();
    assert.equal(log.after.releasedResources, 1);
  });

  it('자원의 시간대 가용 여부와 예약 일정에 업무 할당·구성원 배정이 보인다 (#135, #136)', async () => {
    const resource = await makeResource();
    const task = await makeTask({ startAt: at(100), endAt: at(102) });
    ok(await allocateToTask(task.id, resource.id), 201);
    const soldier = await makeUser(t, tokens);
    ok(await allocateToUser(resource.id, soldier.id, at(103), at(104)), 201);

    const busy = ok(await api('GET', `/api/resources/${resource.id}/availability?from=${encodeURIComponent(at(101))}&to=${encodeURIComponent(at(103.5))}`, { token: tokens.soldier1 }));
    assert.equal(busy.available, false);
    assert.deepEqual(busy.conflicts.map((c) => c.kind), ['TASK', 'MEMBER']);
    const free = ok(await api('GET', `/api/resources/${resource.id}/availability?from=${encodeURIComponent(at(102))}&to=${encodeURIComponent(at(103))}`, { token: tokens.soldier1 }));
    assert.equal(free.available, true);
    assert.equal(free.usableByMe, true);
    expectError(await api('GET', `/api/resources/${resource.id}/availability`, { token: tokens.soldier1 }), 400, 'VALIDATION_ERROR');

    const schedule = ok(await api('GET', `/api/resources/${resource.id}/schedule?from=${encodeURIComponent(at(99))}&to=${encodeURIComponent(at(105))}`, { token: tokens.soldier1 }));
    assert.deepEqual(schedule.items.map((i) => [i.kind, i.task?.id ?? i.user?.id]), [['TASK', task.id], ['MEMBER', soldier.id]]);
  });

  it('참여자는 업무 자원을 할당 시간대에 사용하고, 담당자가 일괄 반환한다. 사용 기록이 있는 업무는 삭제할 수 없다', async () => {
    const resource = await makeResource();
    const worker = await makeUser(t, tokens);
    const outsider = await makeUser(t, tokens);
    const task = await makeTask({ startAt: fromNow(-1), endAt: fromNow(120) });
    ok(await api('POST', `/api/tasks/${task.id}/assignees`, { token: tokens.boss, body: { assignees: [{ userId: worker.id }] } }), 201);
    ok(await allocateToTask(task.id, resource.id), 201);

    expectError(await checkout(resource.id, await login(outsider), { taskId: task.id }), 403, 'FORBIDDEN');
    const workerToken = await login(worker);
    const usage = ok(await checkout(resource.id, workerToken), 201);
    assert.equal(usage.basis, 'TASK');
    assert.equal(usage.task.id, task.id);
    const mine = ok(await api('GET', `/api/me/tasks/${task.id}`, { token: workerToken }));
    assert.equal(mine.resources[0].inUse, true);
    assert.equal(mine.resources[0].usedBy.id, worker.id);
    expectError(await api('DELETE', `/api/tasks/${task.id}/resources/${resource.id}`, { token: tokens.boss }), 409, 'CONFLICT');
    expectError(await api('DELETE', `/api/tasks/${task.id}`, { token: tokens.boss }), 409, 'CONFLICT');

    const returned = ok(await api('POST', `/api/tasks/${task.id}/resources/return`, { token: tokens.boss, body: { note: '업무 종료' } }));
    assert.equal(returned.returnedCount, 1);
    assert.equal((await getResource(resource.id)).status, 'AVAILABLE');
    expectError(await api('POST', `/api/tasks/${task.id}/resources/return`, { token: tokens.boss, body: {} }), 409, 'CONFLICT');
  });
});

// ---------------------------------------------------------------------------
describe('구성원 자원 배정 (#137~#140)', () => {
  it('Capo는 자기 Crew 소속원에게만 배정하고, 받는 사람은 활동중이며 이용 최소 역할 이상이어야 한다', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const outsider = await makeUser(t, tokens);
    const resource = await makeResource();
    ok(await allocateToUser(resource.id, member.id, at(110), at(111), token), 201);
    expectRule(await allocateToUser(resource.id, outsider.id, at(112), at(113), token), 403, 'BR-05');

    const associate = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    expectError(await allocateToUser(resource.id, associate.id, at(114), at(115)), 409, 'CONFLICT');
    const suspended = await makeUser(t, tokens, { status: 'SUSPENDED' });
    expectError(await allocateToUser(resource.id, suspended.id, at(114), at(115)), 409, 'CONFLICT');
    expectError(await allocateToUser(resource.id, member.id, at(115), at(114)), 400, 'VALIDATION_ERROR');
    expectError(await allocateToUser(resource.id, member.id, fromNow(-120), fromNow(-60)), 400, 'VALIDATION_ERROR');
    expectError(await allocateToUser(resource.id, member.id, at(116), at(117), tokens.admin), 403, 'FORBIDDEN');
  });

  it('배정 목록은 본인·담당 Capo·Underboss 이상만 보고, 기간 변경은 BR-07을 다시 검사하며, 취소하면 비활성이 된다', async () => {
    const resource = await makeResource();
    const holder = await makeUser(t, tokens);
    const other = await makeUser(t, tokens);
    const a = ok(await allocateToUser(resource.id, holder.id, at(120), at(121)), 201);
    ok(await allocateToUser(resource.id, other.id, at(122), at(123)), 201);

    const holderToken = await login(holder);
    assert.deepEqual(ok(await api('GET', `/api/users/${holder.id}/allocations`, { token: holderToken })).map((x) => x.id), [a.id]);
    expectError(await api('GET', `/api/users/${holder.id}/allocations`, { token: await login(other) }), 403, 'FORBIDDEN');

    expectRule(await api('PATCH', `/api/resource-allocations/${a.id}`, { token: tokens.boss, body: { endAt: at(122.5) } }), 409, 'BR-07');
    const moved = ok(await api('PATCH', `/api/resource-allocations/${a.id}`, { token: tokens.boss, body: { endAt: at(122) } }));
    assert.equal(moved.endAt, at(122));

    const cancelled = ok(await api('DELETE', `/api/resource-allocations/${a.id}`, { token: tokens.boss }));
    assert.equal(cancelled.active, false);
    assert.equal(cancelled.releaseReason, 'CANCELLED');
    expectError(await api('DELETE', `/api/resource-allocations/${a.id}`, { token: tokens.boss }), 409, 'CONFLICT');
    assert.equal(ok(await api('GET', `/api/users/${holder.id}/allocations`, { token: holderToken })).length, 0);
    assert.equal(ok(await api('GET', `/api/users/${holder.id}/allocations?includeReleased=true`, { token: holderToken })).length, 1);
  });

  it('탈퇴하면 끝나지 않은 자원 배정이 끝나고 대기 중인 사용 신청이 취소된다', async () => {
    const resource = await makeResource();
    const other = await makeResource();
    const user = await makeUser(t, tokens);
    const a = ok(await allocateToUser(resource.id, user.id, at(130), at(131)), 201);
    const q = ok(await api('POST', '/api/resource-requests', { token: await login(user), body: { resourceId: other.id, startAt: at(130), endAt: at(131), reason: '테스트' } }), 201);
    ok(await api('PATCH', `/api/users/${user.id}/status`, { token: tokens.boss, body: { status: 'WITHDRAWN', reason: '테스트 탈퇴' } }));
    const allocations = ok(await api('GET', `/api/users/${user.id}/allocations?includeReleased=true`, { token: tokens.boss }));
    assert.deepEqual(allocations.map((x) => [x.id, x.releaseReason]), [[a.id, 'WITHDRAWN']]);
    assert.equal(ok(await api('GET', `/api/resource-requests/${q.id}`, { token: tokens.boss })).status, 'CANCELLED');
  });
});

// ---------------------------------------------------------------------------
describe('자원 사용 신청 (#141~#146)', () => {
  it('신청하면 담당 Capo가 처리 목록에서 보고, 승인하면 구성원 자원 배정이 만들어진다', async () => {
    const { crew, token: capoToken } = await crewWithCapo();
    const member = await memberOf(crew);
    const memberToken = await login(member);
    const otherCapo = await crewWithCapo();
    const resource = await makeResource();
    const body = { resourceId: resource.id, startAt: at(140), endAt: at(142), reason: '거래처 방문' };

    const q = ok(await api('POST', '/api/resource-requests', { token: memberToken, body }), 201);
    assert.equal(q.status, 'PENDING');
    expectError(await api('POST', '/api/resource-requests', { token: memberToken, body }), 409, 'DUPLICATE');
    assert.deepEqual(ok(await api('GET', '/api/resource-requests?box=mine', { token: memberToken })).map((x) => x.id), [q.id]);
    assert.ok(ok(await api('GET', '/api/resource-requests?box=review&status=PENDING', { token: capoToken })).some((x) => x.id === q.id));
    assert.ok(!ok(await api('GET', '/api/resource-requests?box=review', { token: otherCapo.token })).some((x) => x.id === q.id));
    expectError(await api('GET', `/api/resource-requests/${q.id}`, { token: otherCapo.token }), 403, 'FORBIDDEN');

    expectRule(await api('POST', `/api/resource-requests/${q.id}/approve`, { token: otherCapo.token, body: {} }), 403, 'BR-05');
    const approved = ok(await api('POST', `/api/resource-requests/${q.id}/approve`, { token: capoToken, body: { note: '승인' } }));
    assert.equal(approved.status, 'APPROVED');
    assert.ok(approved.allocationId);
    const allocations = ok(await api('GET', `/api/users/${member.id}/allocations`, { token: memberToken }));
    assert.deepEqual(allocations.map((a) => [a.id, a.requestId]), [[approved.allocationId, q.id]]);
    expectError(await api('POST', `/api/resource-requests/${q.id}/approve`, { token: capoToken, body: {} }), 409, 'CONFLICT');
  });

  it('승인할 때 BR-07을 다시 검사하고, 이용 최소 역할보다 낮으면 신청할 수 없다', async () => {
    const resource = await makeResource();
    const [a, b] = [await makeUser(t, tokens), await makeUser(t, tokens)];
    const body = { resourceId: resource.id, startAt: at(150), endAt: at(152), reason: '같은 시간' };
    const qa = ok(await api('POST', '/api/resource-requests', { token: await login(a), body }), 201);
    const qb = ok(await api('POST', '/api/resource-requests', { token: await login(b), body }), 201);
    ok(await api('POST', `/api/resource-requests/${qa.id}/approve`, { token: tokens.underboss1, body: {} }));
    expectRule(await api('POST', `/api/resource-requests/${qb.id}/approve`, { token: tokens.underboss1, body: {} }), 409, 'BR-07');
    expectRule(await api('POST', '/api/resource-requests', { token: await login(b), body: { ...body, reason: '다시' } }), 409, 'BR-07');

    const capoOnly = await makeResource({ minRole: 'CAPO' });
    expectError(await api('POST', '/api/resource-requests', { token: tokens.soldier1, body: { ...body, resourceId: capoOnly.id } }), 403, 'FORBIDDEN');
  });

  it('거절은 사유가 필요하고, 취소는 신청자 본인만 대기 중인 신청에 할 수 있다. 본인 신청은 처리할 수 없다', async () => {
    const resource = await makeResource();
    const soldier = await makeUser(t, tokens);
    const soldierToken = await login(soldier);
    const q1 = ok(await api('POST', '/api/resource-requests', { token: soldierToken, body: { resourceId: resource.id, startAt: at(160), endAt: at(161), reason: '하나' } }), 201);
    expectError(await api('POST', `/api/resource-requests/${q1.id}/reject`, { token: tokens.boss, body: {} }), 400, 'VALIDATION_ERROR');
    const rejected = ok(await api('POST', `/api/resource-requests/${q1.id}/reject`, { token: tokens.boss, body: { reason: '차량 부족' } }));
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.decisionReason, '차량 부족');

    const q2 = ok(await api('POST', '/api/resource-requests', { token: soldierToken, body: { resourceId: resource.id, startAt: at(162), endAt: at(163), reason: '둘' } }), 201);
    expectError(await api('DELETE', `/api/resource-requests/${q2.id}`, { token: tokens.boss }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('DELETE', `/api/resource-requests/${q2.id}`, { token: soldierToken })).status, 'CANCELLED');
    expectError(await api('DELETE', `/api/resource-requests/${q2.id}`, { token: soldierToken }), 409, 'CONFLICT');

    const own = ok(await api('POST', '/api/resource-requests', { token: tokens.underboss1, body: { resourceId: resource.id, startAt: at(164), endAt: at(165), reason: '셋' } }), 201);
    expectError(await api('POST', `/api/resource-requests/${own.id}/approve`, { token: tokens.underboss1, body: {} }), 403, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
describe('자원 사용·반환 (#147~#154)', () => {
  it('지금 쓸 수 있는 배정이 없거나 이미 사용 중이면 사용을 시작할 수 없다', async () => {
    const resource = await makeResource();
    const stranger = await makeUser(t, tokens);
    expectError(await checkout(resource.id, await login(stranger)), 409, 'CONFLICT');
    const later = await makeUser(t, tokens);
    ok(await allocateToUser(resource.id, later.id, at(170), at(171)), 201);
    expectError(await checkout(resource.id, await login(later)), 409, 'CONFLICT');

    const holder = await userHolding(resource);
    ok(await checkout(resource.id, holder.token), 201);
    expectError(await checkout(resource.id, holder.token), 409, 'CONFLICT');
  });

  it('손상 반환은 점검중(점검 자동 등록), 분실 반환은 사용불가가 된다', async () => {
    const damaged = await makeResource();
    const h1 = await userHolding(damaged);
    ok(await checkout(damaged.id, h1.token), 201);
    const r1 = ok(await api('POST', `/api/resources/${damaged.id}/return`, { token: h1.token, body: { condition: 'DAMAGED', note: '범퍼 파손' } }));
    assert.equal(r1.resourceStatus, 'MAINTENANCE');
    const m = ok(await api('GET', `/api/resources/${damaged.id}/maintenances`, { token: tokens.capo1 }))[0];
    assert.deepEqual([m.source, m.reason, m.usageId], ['RETURN_DAMAGE', '범퍼 파손', r1.id]);

    const lost = await makeResource();
    const h2 = await userHolding(lost);
    ok(await checkout(lost.id, h2.token), 201);
    expectError(await api('POST', `/api/resources/${lost.id}/return`, { token: tokens.soldier1, body: {} }), 403, 'FORBIDDEN');
    const r2 = ok(await api('POST', `/api/resources/${lost.id}/return`, { token: tokens.underboss1, body: { condition: 'LOST' } }));
    assert.equal(r2.resourceStatus, 'UNAVAILABLE');
    assert.equal(r2.returnedBy.username, 'underboss1');
    expectError(await api('POST', `/api/resources/${lost.id}/return`, { token: tokens.underboss1, body: {} }), 409, 'CONFLICT');
  });

  it('사용 중 고장 신고는 점검을 열고 점검중으로 바꾸며, 반환해도 점검이 끝날 때까지 점검중이다', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource);
    const usage = ok(await checkout(resource.id, holder.token), 201);
    expectError(await api('POST', `/api/resource-usages/${usage.id}/damage-reports`, { token: tokens.boss, body: { description: 'x' } }), 403, 'FORBIDDEN');
    const report = ok(await api('POST', `/api/resource-usages/${usage.id}/damage-reports`, { token: holder.token, body: { description: '경고등 점등' } }), 201);
    assert.equal(report.maintenance.source, 'DAMAGE_REPORT');
    assert.ok(report.usage.damageReportedAt);
    assert.equal((await getResource(resource.id)).status, 'MAINTENANCE');
    expectError(await api('POST', `/api/resource-usages/${usage.id}/damage-reports`, { token: holder.token, body: { description: '또' } }), 409, 'CONFLICT');

    const returned = ok(await api('POST', `/api/resources/${resource.id}/return`, { token: holder.token, body: {} }));
    assert.equal(returned.resourceStatus, 'MAINTENANCE');
    const done = ok(await api('POST', `/api/resources/${resource.id}/maintenances/${report.maintenance.id}/complete`, { token: tokens.capo1, body: { result: 'RESTORED' } }));
    assert.equal(done.resourceStatus, 'AVAILABLE');
  });

  it('반환 예정 시각을 늘리면 늘어난 시간대에 BR-07을 검사하고, 구성원 배정 종료 시각도 함께 늘어난다', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource, { durationMin: 60 });
    const usage = ok(await checkout(resource.id, holder.token), 201);
    const next = await makeUser(t, tokens);
    ok(await allocateToUser(resource.id, next.id, holder.allocation.endAt, fromNow(180)), 201);

    expectRule(await api('PATCH', `/api/resource-usages/${usage.id}`, { token: tokens.boss, body: { dueAt: fromNow(120), reason: '연장' } }), 409, 'BR-07');
    expectError(await api('PATCH', `/api/resource-usages/${usage.id}`, { token: tokens.boss, body: { dueAt: fromNow(30) } }), 400, 'VALIDATION_ERROR');
    expectError(await api('PATCH', `/api/resource-usages/${usage.id}`, { token: holder.token, body: { dueAt: fromNow(300) } }), 403, 'FORBIDDEN');

    const free = await makeResource();
    const h2 = await userHolding(free, { durationMin: 60 });
    const u2 = ok(await checkout(free.id, h2.token), 201);
    const dueAt = new Date(Math.floor((Date.now() + 3 * HOUR) / 1000) * 1000).toISOString();
    assert.equal(ok(await api('PATCH', `/api/resource-usages/${u2.id}`, { token: tokens.boss, body: { dueAt } })).dueAt, dueAt);
    const allocation = ok(await api('GET', `/api/users/${h2.user.id}/allocations`, { token: tokens.boss }))[0];
    assert.equal(allocation.endAt, dueAt);
  });

  it('인계하면 내 사용이 끝나고 받는 사람의 사용·배정이 시작된다. 이용 최소 역할보다 낮은 사람에게는 넘길 수 없다', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource);
    const usage = ok(await checkout(resource.id, holder.token), 201);
    const associate = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    expectError(await api('POST', `/api/resource-usages/${usage.id}/handover`, { token: holder.token, body: { toUserId: associate.id } }), 409, 'CONFLICT');
    const receiver = await makeUser(t, tokens);
    expectError(await api('POST', `/api/resource-usages/${usage.id}/handover`, { token: tokens.boss, body: { toUserId: receiver.id } }), 403, 'FORBIDDEN');

    const handed = ok(await api('POST', `/api/resource-usages/${usage.id}/handover`, { token: holder.token, body: { toUserId: receiver.id, note: '교대' } }), 201);
    assert.equal(handed.user.id, receiver.id);
    assert.equal(handed.handoverFromId, usage.id);
    assert.equal((await getResource(resource.id)).currentUsage.user.id, receiver.id);

    const history = ok(await api('GET', `/api/resources/${resource.id}/usages?sort=startedAt`, { token: tokens.capo1 }));
    assert.deepEqual(history.map((u) => [u.user.id, u.open, u.handedOverTo?.id ?? null]), [[holder.user.id, false, receiver.id], [receiver.id, true, null]]);
    const allocations = ok(await api('GET', `/api/users/${holder.user.id}/allocations?includeReleased=true`, { token: tokens.boss }));
    assert.equal(allocations[0].releaseReason, 'HANDED_OVER');
    assert.equal(ok(await api('GET', `/api/users/${receiver.id}/allocations`, { token: tokens.boss }))[0].handedOverFrom, holder.allocation.id);
  });

  it('반환 예정 시각이 지난 미반환 자원은 미반환 목록에 오르고, 반환될 때까지 뒤 시간대에도 배정할 수 없다 (BR-07)', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource);
    const usage = ok(await checkout(resource.id, holder.token), 201);
    // 반환 예정 시각이 지난 상황을 만든다 (API로는 지난 시각을 지정할 수 없다).
    await getPool().query('UPDATE resource_usages SET due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [usage.id]);

    const overdue = ok(await api('GET', '/api/resource-usages/overdue?size=100', { token: tokens.capo1 }));
    assert.ok(overdue.every((u) => u.open && u.overdue));
    assert.ok(overdue.some((u) => u.id === usage.id));
    expectError(await api('GET', '/api/resource-usages/overdue', { token: tokens.soldier1 }), 403, 'FORBIDDEN');

    const task = await makeTask({ startAt: at(180), endAt: at(181) });
    const blocked = await allocateToTask(task.id, resource.id);
    expectRule(blocked, 409, 'BR-07');
    assert.deepEqual(blocked.body.error.details.conflicts.map((c) => [c.kind, c.overdue]), [['USAGE', true]]);
    ok(await api('POST', `/api/resources/${resource.id}/return`, { token: holder.token, body: {} }));
    ok(await allocateToTask(task.id, resource.id), 201);
  });

  it('내 일정에 나에게 배정된 자원이 보인다 (#96)', async () => {
    const resource = await makeResource();
    const holder = await userHolding(resource);
    const schedule = ok(await api('GET', '/api/me/schedule', { token: holder.token }));
    const item = schedule.items.find((i) => i.kind === 'RESOURCE');
    assert.equal(item.resource.id, resource.id);
    assert.equal(item.inUse, false);
  });
});
