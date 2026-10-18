// 단계 2 구성원·Crew 검증 (작업지시서 5장 단계 2 완료 기준 + API 목록표 #10~#55)
// 시드 데이터는 읽기만 하고, 바꾸는 작업은 매번 새로 만든 테스트용 구성원·Crew로 한다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const { startServer, makeUser, makeCrew, unique } = require('./helpers');

let t;
const tokens = {};
const seed = {};

before(async () => {
  t = await startServer();
  const names = ['admin', 'boss', 'underboss1', 'underboss2', 'capo1', 'capo2', 'capo3', 'soldier1', 'soldier2', 'soldier3', 'associate1'];
  for (const name of names) tokens[name] = (await t.login(name)).accessToken;
  for (const u of await userModel.findByUsernames(names)) seed[u.username] = u;
  for (const name of ['Northside', 'Southside', 'Harbor']) seed[name] = await crewModel.findByName(name);
});
after(async () => {
  await t.stop();
});

const api = (...args) => t.api(...args);
const login = async (user) => (await t.login(user.username, user.password)).accessToken;

const expectError = (res, status, code) => {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, code, res.text);
};
// 403은 details.rule, 409는 error.code에 규칙 ID가 들어간다.
const expectRule = (res, status, rule) => {
  assert.equal(res.status, status, res.text);
  assert.equal(status === 409 ? res.body.error.code : res.body.error.details?.rule, rule, res.text);
};

const add = (crewId, userId, type = 'REGULAR', token = tokens.boss) =>
  api('POST', `/api/crews/${crewId}/members`, { token, body: { userId, type } });
const removeFrom = async (crewId, userId) => {
  const res = await api('DELETE', `/api/crews/${crewId}/members/${userId}`, { token: tokens.boss });
  assert.equal(res.status, 200, res.text);
};
const latestLog = (action, targetId) =>
  ActivityLog.findOne({ action, 'target.id': String(targetId) }).sort({ createdAt: -1, _id: -1 }).lean();

// ---------------------------------------------------------------------------
describe('단계 2 완료 기준', () => {
  it('다른 Crew에 정식 소속된 구성원을 편성하면 409 BR-01', async () => {
    const res = await add(seed.Northside.id, seed.soldier3.id);
    expectRule(res, 409, 'BR-01');
    assert.equal(res.body.error.details.currentCrewName, 'Southside');
  });

  it('Capo가 다른 Crew를 편성하려 하면 403 (BR-05)', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    expectRule(await add(seed.Southside.id, u.id, 'REGULAR', tokens.capo1), 403, 'BR-05');
  });

  it('상위 역할자의 역할을 바꾸려 하면 403 (BR-04)', async () => {
    expectError(await api('PATCH', `/api/users/${seed.boss.id}/role`, { token: tokens.capo1, body: { role: 'SOLDIER' } }), 403, 'FORBIDDEN');
    expectRule(await api('PATCH', `/api/users/${seed.boss.id}/role`, { token: tokens.underboss1, body: { role: 'SOLDIER' } }), 403, 'BR-04');
    expectRule(await api('PATCH', `/api/users/${seed.underboss2.id}/role`, { token: tokens.underboss1, body: { role: 'CAPO' } }), 403, 'BR-04');
  });
});

// ---------------------------------------------------------------------------
describe('구성원 등록·조회 (#10~#14)', () => {
  it('등록: 새 구성원은 Associate·대기 상태이고, 아이디 중복은 409 DUPLICATE, 등록이 기록된다', async () => {
    const username = unique('reg.');
    const res = await api('POST', '/api/users', { token: tokens.underboss1, body: { username, password: 'Welcome2026', name: 'Reg Test', phone: '010-1111-2222' } });
    assert.equal(res.status, 201, res.text);
    assert.deepEqual([res.body.data.role, res.body.data.status, res.body.data.phone], ['ASSOCIATE', 'PENDING', '010-1111-2222']);
    assert.ok(!res.text.includes('passwordHash') && !res.text.includes('$2'));
    assert.equal((await latestLog('USER_CREATED', res.body.data.id)).actor.username, 'underboss1');

    expectError(await api('POST', '/api/users', { token: tokens.underboss1, body: { username, password: 'Welcome2026', name: 'Dup' } }), 409, 'DUPLICATE');
    expectError(await api('POST', '/api/users', { token: tokens.underboss1, body: { username: 'Bad Name!', password: 'short', name: 'x' } }), 400, 'VALIDATION_ERROR');
    expectError(await api('POST', '/api/users', { token: tokens.soldier1, body: { username: unique('x.'), password: 'Welcome2026', name: 'x' } }), 403, 'FORBIDDEN');
  });

  it('아이디 확인: 사용 중이면 available=false, 형식이 틀리면 400', async () => {
    assert.equal((await api('GET', '/api/users/check-username?username=boss', { token: tokens.admin })).body.data.available, false);
    assert.equal((await api('GET', `/api/users/check-username?username=${unique('free.')}`, { token: tokens.admin })).body.data.available, true);
    expectError(await api('GET', '/api/users/check-username?username=AB', { token: tokens.admin }), 400, 'VALIDATION_ERROR');
  });

  it('일괄 등록: 한 건이라도 중복이면 아무도 등록하지 않고(409 BULK_REJECTED), 문제가 없으면 모두 등록한다', async () => {
    const a = unique('bulk.');
    const b = unique('bulk.');
    const row = (username, name) => ({ username, password: 'Welcome2026', name });
    const rejected = await api('POST', '/api/users/bulk', { token: tokens.admin, body: { users: [row(a, 'A'), row('boss', 'Dup'), row(a, 'A again')] } });
    expectError(rejected, 409, 'BULK_REJECTED');
    assert.deepEqual(rejected.body.error.details.map((d) => [d.index, d.code]), [[1, 'DUPLICATE'], [2, 'DUPLICATE']]);
    assert.equal((await api('GET', `/api/users/check-username?username=${a}`, { token: tokens.admin })).body.data.available, true);

    const created = await api('POST', '/api/users/bulk', { token: tokens.admin, body: { users: [row(a, 'A'), row(b, 'B')] } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.data.createdCount, 2);
    expectError(await api('POST', '/api/users/bulk', { token: tokens.underboss1, body: { users: [row(unique('x.'), 'x')] } }), 403, 'FORBIDDEN');
    expectError(await api('POST', '/api/users/bulk', { token: tokens.admin, body: { users: [{ username: unique('x.'), name: 'no password' }] } }), 400, 'VALIDATION_ERROR');
  });

  it('목록: 필터·검색·정렬·페이지를 지원한다', async () => {
    const capos = await api('GET', '/api/users?role=CAPO&size=2&sort=username', { token: tokens.boss });
    assert.equal(capos.status, 200, capos.text);
    assert.equal(capos.body.data.length, 2);
    assert.ok(capos.body.data.every((u) => u.role === 'CAPO'));
    assert.ok(capos.body.data[0].username < capos.body.data[1].username);
    assert.ok(capos.body.meta.total >= 3 && capos.body.meta.size === 2 && capos.body.meta.page === 1);

    assert.ok((await api('GET', '/api/users?q=Esposito', { token: tokens.boss })).body.data.some((u) => u.username === 'soldier1'));
    const northside = await api('GET', `/api/users?crewId=${seed.Northside.id}&size=100`, { token: tokens.boss });
    assert.ok(northside.body.data.some((u) => u.username === 'soldier2') && !northside.body.data.some((u) => u.username === 'soldier3'));

    expectError(await api('GET', '/api/users', { token: tokens.associate1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', '/api/users?sort=password', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
    expectError(await api('GET', '/api/users?size=1000', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
  });

  it('목록: 보는 사람에 따라 공개 범위가 다르다 (Soldier 기본, Capo는 자기 Crew 연락처, Boss 전체)', async () => {
    const asSoldier = await api('GET', '/api/users?q=capo', { token: tokens.soldier1 });
    assert.ok(asSoldier.body.data.every((u) => u.visibility === 'basic' && !('phone' in u)));

    const asCapo = await api('GET', '/api/users?q=soldier&size=100', { token: tokens.capo1 });
    const visibility = Object.fromEntries(asCapo.body.data.map((u) => [u.username, u.visibility]));
    assert.equal(visibility.soldier2, 'contact'); // Northside 소속
    assert.equal(visibility.soldier3, 'basic'); // Southside 소속
    assert.equal((await api('GET', '/api/users?q=capo1', { token: tokens.capo1 })).body.data[0].visibility, 'full');

    const asBoss = await api('GET', '/api/users?size=5', { token: tokens.boss });
    assert.ok(asBoss.body.data.every((u) => u.visibility === 'full' && 'lastLoginAt' in u));
  });

  it('상세: 현재 소속과 맡은 Crew를 보여 주고, Associate는 본인만 볼 수 있다', async () => {
    const res = await api('GET', `/api/users/${seed.soldier1.id}`, { token: tokens.boss });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.crew.name, 'Northside');
    assert.deepEqual(res.body.data.currentMemberships.map((m) => [m.crew.name, m.type]).sort(), [['Northside', 'REGULAR'], ['Southside', 'TEMPORARY']]);
    assert.equal((await api('GET', `/api/users/${seed.capo1.id}`, { token: tokens.boss })).body.data.leadership.capoOf.name, 'Northside');
    const underbossOf = (await api('GET', `/api/users/${seed.underboss1.id}`, { token: tokens.boss })).body.data.leadership.underbossOf.map((c) => c.name);
    assert.ok(underbossOf.includes('Northside') && underbossOf.includes('Southside'));

    expectError(await api('GET', `/api/users/${seed.soldier1.id}`, { token: tokens.associate1 }), 403, 'FORBIDDEN');
    assert.equal((await api('GET', `/api/users/${seed.associate1.id}`, { token: tokens.associate1 })).status, 200);
    expectError(await api('GET', '/api/users/99999999', { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('GET', '/api/users/abc', { token: tokens.boss }), 400, 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
describe('구성원 수정·삭제 (#15, #16)', () => {
  it('수정: 하위 역할 구성원을 수정하면 변경 전후가 기록되고, 같거나 높은 역할은 403 (BR-04)', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    const res = await api('PATCH', `/api/users/${u.id}`, { token: tokens.underboss1, body: { name: 'Renamed Soldier', phone: '010-3333-4444' } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.name, 'Renamed Soldier');
    const log = await latestLog('USER_UPDATED', u.id);
    assert.deepEqual([log.before.name, log.after.name], [u.username, 'Renamed Soldier']);

    expectRule(await api('PATCH', `/api/users/${seed.underboss2.id}`, { token: tokens.underboss1, body: { nickname: 'x' } }), 403, 'BR-04');
    expectRule(await api('PATCH', `/api/users/${seed.boss.id}`, { token: tokens.underboss1, body: { nickname: 'x' } }), 403, 'BR-04');
    expectError(await api('PATCH', `/api/users/${seed.underboss1.id}`, { token: tokens.underboss1, body: { nickname: 'x' } }), 403, 'FORBIDDEN');
    expectError(await api('PATCH', `/api/users/${u.id}`, { token: tokens.underboss1, body: {} }), 400, 'VALIDATION_ERROR');
    expectError(await api('PATCH', `/api/users/${u.id}`, { token: tokens.underboss1, body: { role: 'BOSS' } }), 400, 'VALIDATION_ERROR');
  });

  it('수정: Capo는 자기 Crew 소속원만 수정할 수 있다 (BR-05)', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    assert.equal((await add(seed.Northside.id, u.id)).status, 201);
    assert.equal((await api('PATCH', `/api/users/${u.id}`, { token: tokens.capo1, body: { nickname: 'north' } })).status, 200);
    expectRule(await api('PATCH', `/api/users/${seed.soldier3.id}`, { token: tokens.capo1, body: { nickname: 'south' } }), 403, 'BR-05');
    await removeFrom(seed.Northside.id, u.id);
  });

  it('삭제: 활동 기록이 없는 구성원만 지울 수 있고, 그 밖에는 409로 탈퇴 처리를 안내한다', async () => {
    const created = await api('POST', '/api/users', { token: tokens.admin, body: { username: unique('del.'), password: 'Welcome2026', name: 'To Delete' } });
    const { id } = created.body.data;
    expectError(await api('DELETE', `/api/users/${id}`, { token: tokens.underboss1 }), 403, 'FORBIDDEN');
    assert.equal((await api('DELETE', `/api/users/${id}`, { token: tokens.admin })).status, 200);
    expectError(await api('GET', `/api/users/${id}`, { token: tokens.admin }), 404, 'NOT_FOUND');

    const used = await api('DELETE', `/api/users/${seed.soldier2.id}`, { token: tokens.admin });
    expectError(used, 409, 'CONFLICT');
    assert.ok(used.body.error.details.memberships > 0);
  });
});

// ---------------------------------------------------------------------------
describe('역할 변경 (#17, FR-03, BR-04)', () => {
  it('Underboss는 하위 구성원의 역할을 자신 이하로 바꾸고, 이력이 남는다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    const res = await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.underboss1, body: { role: 'CAPO', reason: '승진' } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.role, 'CAPO');
    const log = await latestLog('USER_ROLE_CHANGED', u.id);
    assert.deepEqual([log.before.role, log.after.role, log.reason], ['ASSOCIATE', 'CAPO', '승진']);
    expectError(await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.underboss1, body: { role: 'CAPO' } }), 409, 'CONFLICT');
  });

  it('Boss 역할 지정, 본인 역할 변경, Capo의 직접 변경은 403', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    expectRule(await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.underboss1, body: { role: 'BOSS' } }), 403, 'BR-04');
    expectError(await api('PATCH', `/api/users/${seed.underboss1.id}/role`, { token: tokens.underboss1, body: { role: 'CAPO' } }), 403, 'FORBIDDEN');
    expectError(await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.capo1, body: { role: 'ASSOCIATE' } }), 403, 'FORBIDDEN');
    assert.equal((await api('GET', `/api/users/${seed.boss.id}`, { token: tokens.boss })).body.data.role, 'BOSS');
  });

  it('Crew 구조와 맞지 않는 역할 변경은 409 (책임자는 Capo, Crew 소속원은 Underboss 이상 불가)', async () => {
    expectError(await api('PATCH', `/api/users/${seed.capo1.id}/role`, { token: tokens.boss, body: { role: 'SOLDIER' } }), 409, 'CONFLICT');
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Harbor.id, u.id);
    expectError(await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.boss, body: { role: 'UNDERBOSS' } }), 409, 'CONFLICT');
    await removeFrom(seed.Harbor.id, u.id);
    assert.equal((await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.boss, body: { role: 'UNDERBOSS' } })).status, 200);
  });
});

// ---------------------------------------------------------------------------
describe('상태 변경 (#18, FR-04)', () => {
  it('허용된 전이만 가능하고, 정지하면 그 구성원의 세션이 바로 끊긴다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    const token = await login(u);
    const res = await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.underboss1, body: { status: 'SUSPENDED', reason: '규정 위반' } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.status, 'SUSPENDED');
    expectError(await api('GET', '/api/me', { token }), 401, 'UNAUTHENTICATED');
    const log = await latestLog('USER_STATUS_CHANGED', u.id);
    assert.deepEqual([log.before.status, log.after.status, log.reason], ['ACTIVE', 'SUSPENDED', '규정 위반']);

    const bad = await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.underboss1, body: { status: 'PENDING' } });
    expectError(bad, 409, 'CONFLICT');
    assert.deepEqual(bad.body.error.details.allowed, ['ACTIVE', 'WITHDRAWN']);
    assert.equal((await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.underboss1, body: { status: 'ACTIVE' } })).status, 200);
    expectError(await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.underboss1, body: { status: 'ACTIVE' } }), 409, 'CONFLICT');
  });

  it('탈퇴하면 모든 Crew 소속이 끝나고 대기 중인 소속 신청이 취소된다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Harbor.id, u.id);
    const crew = await makeCrew(t, tokens);
    const applied = await api('POST', `/api/crews/${crew.id}/join-requests`, { token: await login(u), body: { type: 'TEMPORARY' } });
    assert.equal(applied.status, 201, applied.text);

    const res = await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.boss, body: { status: 'WITHDRAWN' } });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.data.currentMemberships, []);
    assert.equal((await api('GET', `/api/users/${u.id}/memberships`, { token: tokens.boss })).body.data[0].endReason, 'WITHDRAWN');
    const requests = await api('GET', `/api/crews/${crew.id}/join-requests`, { token: tokens.boss });
    assert.equal(requests.body.data.find((r) => r.id === applied.body.data.id).status, 'CANCELLED');
    expectError(await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.boss, body: { status: 'ACTIVE' } }), 409, 'CONFLICT');
  });

  it('Capo는 자기 Crew 소속원의 상태만 바꿀 수 있고(BR-05), 책임자는 탈퇴 처리할 수 없다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    await add(seed.Northside.id, u.id);
    assert.equal((await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.capo1, body: { status: 'SUSPENDED' } })).status, 200);
    expectRule(await api('PATCH', `/api/users/${seed.soldier3.id}/status`, { token: tokens.capo1, body: { status: 'SUSPENDED' } }), 403, 'BR-05');
    expectError(await api('PATCH', `/api/users/${seed.capo1.id}/status`, { token: tokens.boss, body: { status: 'WITHDRAWN' } }), 409, 'CONFLICT');
    expectError(await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.admin, body: { status: 'ACTIVE' } }), 403, 'FORBIDDEN');
    await removeFrom(seed.Northside.id, u.id);
  });
});

// ---------------------------------------------------------------------------
describe('소속 이력·지휘 계통·기준 정보 (#19~#23)', () => {
  it('소속 이력: 종료된 소속도 종료 이유와 함께 남고, 본인·소속 Crew 책임자·Underboss 이상만 볼 수 있다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Northside.id, u.id);
    await removeFrom(seed.Northside.id, u.id);
    await add(seed.Harbor.id, u.id, 'TEMPORARY');

    const res = await api('GET', `/api/users/${u.id}/memberships`, { token: tokens.underboss1 });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.data.map((m) => [m.crew.name, m.active, m.endReason]), [['Harbor', true, null], ['Northside', false, 'REMOVED']]);
    assert.equal((await api('GET', `/api/users/${u.id}/memberships?active=false`, { token: tokens.underboss1 })).body.meta.total, 1);
    assert.equal((await api('GET', `/api/users/${u.id}/memberships`, { token: await login(u) })).status, 200);
    expectError(await api('GET', `/api/users/${u.id}/memberships`, { token: tokens.capo1 }), 403, 'FORBIDDEN');
    assert.equal((await api('GET', `/api/users/${seed.soldier2.id}/memberships`, { token: tokens.capo1 })).status, 200);
    expectError(await api('GET', `/api/users/${seed.soldier2.id}/memberships`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    await removeFrom(seed.Harbor.id, u.id);
  });

  it('하위 구성원: Capo는 자기 Crew, Underboss는 담당 Crew들, Boss는 조직 전체', async () => {
    const capo = await api('GET', `/api/users/${seed.capo1.id}/subordinates?size=100`, { token: tokens.capo1 });
    assert.equal(capo.status, 200, capo.text);
    const northside = (await api('GET', `/api/crews/${seed.Northside.id}`, { token: tokens.boss })).body.data;
    assert.equal(capo.body.meta.total, northside.memberCount - 1);
    assert.ok(capo.body.data.every((s) => s.relation === 'CREW_MEMBER' && s.user.crew.name === 'Northside'));

    const underboss = await api('GET', `/api/users/${seed.underboss1.id}/subordinates?size=100`, { token: tokens.underboss1 });
    const names = new Set(underboss.body.data.map((s) => s.user.username));
    for (const name of ['capo1', 'capo2', 'soldier2', 'soldier3']) assert.ok(names.has(name), name);
    assert.ok(!names.has('capo3'), 'Harbor는 underboss2 담당');
    assert.equal(underboss.body.data.find((s) => s.user.username === 'capo2').relation, 'CREW_CAPO');

    assert.ok((await api('GET', `/api/users/${seed.boss.id}/subordinates?size=1`, { token: tokens.boss })).body.meta.total >= 14);
    expectError(await api('GET', `/api/users/${seed.capo1.id}/subordinates`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    assert.deepEqual((await api('GET', `/api/users/${seed.soldier1.id}/subordinates`, { token: tokens.soldier1 })).body.data, []);
  });

  it('지휘 계통: 정식 소속 Crew의 Capo → 담당 Underboss → Boss 순서', async () => {
    const res = await api('GET', `/api/users/${seed.soldier1.id}/chain-of-command`, { token: tokens.soldier1 });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.crew.name, 'Northside');
    assert.deepEqual(res.body.data.chain.map((c) => [c.level, c.user.username]), [['CAPO', 'capo1'], ['UNDERBOSS', 'underboss1'], ['BOSS', 'boss']]);
    assert.deepEqual((await api('GET', `/api/users/${seed.capo1.id}/chain-of-command`, { token: tokens.capo1 })).body.data.chain.map((c) => c.level), ['UNDERBOSS', 'BOSS']);
    assert.equal((await api('GET', `/api/users/${seed.soldier1.id}/chain-of-command`, { token: tokens.capo2 })).status, 200);
    expectError(await api('GET', `/api/users/${seed.soldier2.id}/chain-of-command`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('기준 정보: 역할은 순위 순이고, 상태는 허용 전이와 로그인 가능 여부를 보여 준다', async () => {
    const roles = (await api('GET', '/api/roles', { token: tokens.associate1 })).body.data;
    assert.deepEqual(roles.map((r) => r.role), ['ASSOCIATE', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS', 'ADMIN']);
    assert.deepEqual(roles.filter((r) => r.canJoinCrew).map((r) => r.role), ['ASSOCIATE', 'SOLDIER', 'CAPO']);
    const statuses = (await api('GET', '/api/member-statuses', { token: tokens.associate1 })).body.data;
    assert.deepEqual(statuses.find((s) => s.status === 'ACTIVE').next.map((n) => n.status), ['SUSPENDED', 'WITHDRAWN']);
    assert.equal(statuses.find((s) => s.status === 'SUSPENDED').canSignIn, false);
  });
});

// ---------------------------------------------------------------------------
describe('Crew (#24~#34)', () => {
  it('생성: Underboss가 만들면 자신이 담당 Underboss이고, 다른 Underboss 지정·이름 중복·Capo의 생성은 거부된다', async () => {
    const name = unique('U-');
    const res = await api('POST', '/api/crews', { token: tokens.underboss2, body: { name, region: '대구' } });
    assert.equal(res.status, 201, res.text);
    assert.deepEqual([res.body.data.underboss.username, res.body.data.capo, res.body.data.memberCount], ['underboss2', null, 0]);
    expectError(await api('POST', '/api/crews', { token: tokens.underboss2, body: { name: unique('U-'), region: '대구', underbossId: seed.underboss1.id } }), 403, 'FORBIDDEN');
    expectError(await api('POST', '/api/crews', { token: tokens.boss, body: { name, region: '대구' } }), 409, 'DUPLICATE');
    expectError(await api('POST', '/api/crews', { token: tokens.capo1, body: { name: unique('U-'), region: '대구' } }), 403, 'FORBIDDEN');
    const assigned = await api('POST', '/api/crews', { token: tokens.boss, body: { name: unique('U-'), region: '대구', underbossId: seed.underboss2.id } });
    assert.equal(assigned.body.data.underboss.username, 'underboss2');
    expectError(await api('POST', '/api/crews', { token: tokens.boss, body: { name: unique('U-'), region: '대구', underbossId: seed.soldier1.id } }), 409, 'CONFLICT');
  });

  it('목록·상세: 지역으로 거르고 인원 수로 정렬하며, 책임자·담당 Underboss·인원을 보여 준다', async () => {
    const list = await api('GET', `/api/crews?region=${encodeURIComponent('서울 강북')}`, { token: tokens.associate1 });
    assert.equal(list.status, 200, list.text);
    assert.ok(list.body.data.every((c) => c.region === '서울 강북') && list.body.data.some((c) => c.name === 'Northside'));
    const counts = (await api('GET', '/api/crews?sort=-memberCount&size=5', { token: tokens.associate1 })).body.data.map((c) => c.memberCount);
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a));

    const detail = (await api('GET', `/api/crews/${seed.Southside.id}`, { token: tokens.associate1 })).body.data;
    assert.deepEqual([detail.capo.username, detail.underboss.username], ['capo2', 'underboss1']);
    assert.ok(detail.temporaryCount >= 1);
    expectError(await api('GET', '/api/crews/99999999', { token: tokens.associate1 }), 404, 'NOT_FOUND');
  });

  it('수정: Capo는 자기 Crew만 수정할 수 있고(BR-05), 변경 전후가 기록된다', async () => {
    const crew = await makeCrew(t, tokens);
    const capo = await makeUser(t, tokens, { role: 'CAPO' });
    assert.equal((await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } })).status, 200);
    const capoToken = await login(capo);
    const res = await api('PATCH', `/api/crews/${crew.id}`, { token: capoToken, body: { description: '새 설명' } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.description, '새 설명');
    assert.equal((await latestLog('CREW_UPDATED', crew.id)).after.description, '새 설명');
    expectRule(await api('PATCH', `/api/crews/${seed.Northside.id}`, { token: capoToken, body: { description: 'x' } }), 403, 'BR-05');
    expectError(await api('PATCH', `/api/crews/${crew.id}`, { token: tokens.boss, body: { name: 'Northside' } }), 409, 'DUPLICATE');
  });

  it('책임자 지정: Capo 역할만 가능하고, 소속이 없으면 정식으로 함께 편성되며, 다른 Crew 정식 소속이면 BR-01', async () => {
    const crew = await makeCrew(t, tokens);
    const first = await makeUser(t, tokens, { role: 'CAPO' });
    const res = await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.underboss1, body: { userId: first.id, reason: '신규 Crew' } });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.body.data.capo.id, res.body.data.regularCount], [first.id, 1]);
    const member = (await api('GET', `/api/crews/${crew.id}/members/${first.id}`, { token: tokens.boss })).body.data;
    assert.deepEqual([member.joinMethod, member.isCapo], ['CAPO_ASSIGNMENT', true]);

    const soldier = await makeUser(t, tokens, { role: 'SOLDIER' });
    expectError(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: soldier.id } }), 409, 'CONFLICT');
    expectRule(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: seed.capo2.id } }), 409, 'BR-01');
    expectError(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.capo1, body: { userId: first.id } }), 403, 'FORBIDDEN');

    const second = await makeUser(t, tokens, { role: 'CAPO' });
    assert.equal((await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: second.id } })).status, 200);
    const history = await api('GET', `/api/crews/${crew.id}/capo-history`, { token: tokens.capo1 });
    assert.deepEqual(history.body.data.map((h) => [h.capo.id, h.active, h.endReason]), [[second.id, true, null], [first.id, false, 'REPLACED']]);
    assert.equal((await api('GET', `/api/crews/${crew.id}/members/${first.id}`, { token: tokens.boss })).body.data.isCapo, false);
    assert.equal((await latestLog('CREW_CAPO_ASSIGNED', crew.id)).after.capoId, second.id);

    assert.equal((await api('DELETE', `/api/crews/${crew.id}/capo`, { token: tokens.boss })).body.data.capo, null);
    expectError(await api('DELETE', `/api/crews/${crew.id}/capo`, { token: tokens.boss }), 409, 'CONFLICT');
  });

  it('담당 Underboss 지정: Boss만 할 수 있고, Underboss 역할만 지정할 수 있다', async () => {
    const crew = await makeCrew(t, tokens);
    expectError(await api('PUT', `/api/crews/${crew.id}/underboss`, { token: tokens.underboss1, body: { userId: seed.underboss1.id } }), 403, 'FORBIDDEN');
    expectError(await api('PUT', `/api/crews/${crew.id}/underboss`, { token: tokens.boss, body: { userId: seed.capo1.id } }), 409, 'CONFLICT');
    assert.equal((await api('PUT', `/api/crews/${crew.id}/underboss`, { token: tokens.boss, body: { userId: seed.underboss2.id } })).body.data.underboss.username, 'underboss2');
  });

  it('해산: 소속이 모두 끝나고 대기 신청이 취소되며 편성할 수 없게 되고, 다시 활성화할 수 있다', async () => {
    const crew = await makeCrew(t, tokens);
    const capo = await makeUser(t, tokens, { role: 'CAPO' });
    const member = await makeUser(t, tokens, { role: 'SOLDIER' });
    const applicant = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } });
    await add(crew.id, member.id);
    assert.equal((await api('POST', `/api/crews/${crew.id}/join-requests`, { token: await login(applicant) })).status, 201);

    expectError(await api('PATCH', `/api/crews/${crew.id}/status`, { token: tokens.capo1, body: { status: 'DISBANDED' } }), 403, 'FORBIDDEN');
    const res = await api('PATCH', `/api/crews/${crew.id}/status`, { token: tokens.underboss1, body: { status: 'DISBANDED', reason: '재편' } });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.body.data.status, res.body.data.memberCount, res.body.data.capo], ['DISBANDED', 0, null]);
    const history = (await api('GET', `/api/crews/${crew.id}/membership-history`, { token: tokens.boss })).body.data;
    assert.ok(history.length === 2 && history.every((m) => !m.active && m.endReason === 'DISBANDED'));
    assert.equal((await api('GET', `/api/crews/${crew.id}/join-requests`, { token: tokens.boss })).body.data[0].status, 'CANCELLED');
    assert.equal((await api('GET', `/api/crews/${crew.id}/capo-history`, { token: tokens.boss })).body.data[0].endReason, 'DISBANDED');

    expectError(await add(crew.id, member.id), 409, 'CONFLICT');
    expectError(await api('PATCH', `/api/crews/${crew.id}`, { token: tokens.boss, body: { description: 'x' } }), 409, 'CONFLICT');
    expectError(await api('PATCH', `/api/crews/${crew.id}/status`, { token: tokens.boss, body: { status: 'DISBANDED' } }), 409, 'CONFLICT');
    assert.equal((await api('PATCH', `/api/crews/${crew.id}/status`, { token: tokens.boss, body: { status: 'ACTIVE' } })).body.data.status, 'ACTIVE');
    assert.equal((await add(crew.id, member.id)).status, 201);
  });

  it('삭제: 사용 기록이 없는 Crew만 지울 수 있다', async () => {
    const empty = await makeCrew(t, tokens);
    assert.equal((await api('DELETE', `/api/crews/${empty.id}`, { token: tokens.underboss1 })).status, 200);
    expectError(await api('GET', `/api/crews/${empty.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('DELETE', `/api/crews/${seed.Harbor.id}`, { token: tokens.boss }), 409, 'CONFLICT');
  });

  it('조직도: Underboss → Capo → 소속원(순위 높은 순) 트리이고, 소속원과 Underboss 이상만 볼 수 있다', async () => {
    const res = await api('GET', `/api/crews/${seed.Northside.id}/hierarchy`, { token: tokens.soldier2 });
    assert.equal(res.status, 200, res.text);
    const { tree } = res.body.data;
    assert.deepEqual([tree.user.username, tree.children[0].user.username], ['underboss1', 'capo1']);
    const members = tree.children[0].children;
    const usernames = members.map((c) => c.user.username);
    assert.ok(usernames.includes('soldier1') && usernames.includes('associate1') && !usernames.includes('capo1'));
    const ranks = members.map((c) => ({ ASSOCIATE: 1, SOLDIER: 2, CAPO: 3 })[c.user.role]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
    expectError(await api('GET', `/api/crews/${seed.Northside.id}/hierarchy`, { token: tokens.soldier3 }), 403, 'FORBIDDEN');
    assert.equal((await api('GET', `/api/crews/${seed.Northside.id}/hierarchy`, { token: tokens.underboss2 })).status, 200);
  });
});

// ---------------------------------------------------------------------------
describe('Crew 편성 (#35~#44, BR-01, BR-05)', () => {
  it('BR-01: 정식 편성은 거부되고 임시 편성은 가능하며, 임시 → 정식 변경도 BR-01을 검사한다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    assert.equal((await add(seed.Northside.id, u.id)).status, 201);
    expectRule(await add(seed.Harbor.id, u.id, 'REGULAR'), 409, 'BR-01');
    assert.equal((await add(seed.Harbor.id, u.id, 'TEMPORARY')).status, 201);
    expectRule(await api('PATCH', `/api/crews/${seed.Harbor.id}/members/${u.id}`, { token: tokens.boss, body: { type: 'REGULAR' } }), 409, 'BR-01');
    expectError(await add(seed.Harbor.id, u.id, 'TEMPORARY'), 409, 'CONFLICT');

    await removeFrom(seed.Northside.id, u.id);
    const changed = await api('PATCH', `/api/crews/${seed.Harbor.id}/members/${u.id}`, { token: tokens.boss, body: { type: 'REGULAR' } });
    assert.equal(changed.status, 200, changed.text);
    assert.deepEqual([changed.body.data.type, changed.body.data.joinMethod], ['REGULAR', 'TYPE_CHANGE']);
    await removeFrom(seed.Harbor.id, u.id);
  });

  it('BR-01은 DB의 UNIQUE 인덱스로도 막혀서, 동시에 두 Crew에 정식 편성해도 한 건만 성공한다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    const [a, b] = await Promise.all([add(seed.Northside.id, u.id), add(seed.Harbor.id, u.id)]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal([a, b].find((r) => r.status === 409).body.error.code, 'BR-01');
    await assert.rejects(
      membershipModel.insert({ crewId: seed.Southside.id, userId: u.id, type: 'REGULAR' }),
      (err) => err.code === 'ER_DUP_ENTRY' && /uq_membership_active_regular/.test(err.sqlMessage),
    );
    await removeFrom(a.status === 201 ? seed.Northside.id : seed.Harbor.id, u.id);
  });

  it('BR-05: Capo는 자신이 책임자인 Crew에서만 편성·제외할 수 있다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    expectRule(await add(seed.Southside.id, u.id, 'REGULAR', tokens.capo1), 403, 'BR-05');
    assert.equal((await add(seed.Northside.id, u.id, 'REGULAR', tokens.capo1)).status, 201);
    expectRule(await api('DELETE', `/api/crews/${seed.Southside.id}/members/${seed.soldier3.id}`, { token: tokens.capo1 }), 403, 'BR-05');
    assert.equal((await api('DELETE', `/api/crews/${seed.Northside.id}/members/${u.id}`, { token: tokens.capo1 })).status, 200);
    expectError(await add(seed.Northside.id, u.id, 'REGULAR', tokens.soldier1), 403, 'FORBIDDEN');
  });

  it('소속원 목록·상세: 소속원과 Underboss 이상만 보고, 연락처는 책임자에게만 보인다', async () => {
    const asMember = await api('GET', `/api/crews/${seed.Northside.id}/members?size=100`, { token: tokens.soldier2 });
    assert.equal(asMember.status, 200, asMember.text);
    assert.equal(asMember.body.data.find((m) => m.user.username === 'capo1').isCapo, true);
    assert.ok(asMember.body.data.filter((m) => m.user.username !== 'soldier2').every((m) => m.user.visibility === 'basic'));
    const asCapo = await api('GET', `/api/crews/${seed.Northside.id}/members?size=100`, { token: tokens.capo1 });
    assert.ok(asCapo.body.data.filter((m) => m.user.username !== 'capo1').every((m) => m.user.visibility === 'contact'));

    const temporary = await api('GET', `/api/crews/${seed.Southside.id}/members?type=TEMPORARY`, { token: tokens.boss });
    assert.ok(temporary.body.data.every((m) => m.type === 'TEMPORARY') && temporary.body.data.some((m) => m.user.username === 'soldier1'));
    expectError(await api('GET', `/api/crews/${seed.Northside.id}/members`, { token: tokens.soldier3 }), 403, 'FORBIDDEN');
    assert.equal((await api('GET', `/api/crews/${seed.Southside.id}/members/${seed.soldier1.id}`, { token: tokens.capo2 })).body.data.type, 'TEMPORARY');
    expectError(await api('GET', `/api/crews/${seed.Harbor.id}/members/${seed.soldier1.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
  });

  it('일괄 편성: 한 명이라도 편성할 수 없으면 아무도 편성하지 않는다', async () => {
    const crew = await makeCrew(t, tokens);
    const a = await makeUser(t, tokens, { role: 'SOLDIER' });
    const b = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    const pending = await makeUser(t, tokens, { role: 'ASSOCIATE', status: 'PENDING' });
    const rejected = await api('POST', `/api/crews/${crew.id}/members/bulk`, {
      token: tokens.boss, body: { members: [{ userId: a.id }, { userId: seed.soldier3.id }, { userId: pending.id }, { userId: 99999999 }] },
    });
    expectError(rejected, 409, 'BULK_REJECTED');
    assert.deepEqual(rejected.body.error.details.map((d) => [d.index, d.code]), [[1, 'BR-01'], [2, 'CONFLICT'], [3, 'NOT_FOUND']]);
    assert.equal((await api('GET', `/api/crews/${crew.id}`, { token: tokens.boss })).body.data.memberCount, 0);

    expectError(await api('POST', `/api/crews/${crew.id}/members/bulk`, { token: tokens.boss, body: { members: [{ userId: a.id }, { userId: a.id }] } }), 400, 'VALIDATION_ERROR');
    const ok = await api('POST', `/api/crews/${crew.id}/members/bulk`, { token: tokens.boss, body: { members: [{ userId: a.id }, { userId: b.id, type: 'TEMPORARY' }] } });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.body.data.addedCount, 2);
    const view = (await api('GET', `/api/crews/${crew.id}`, { token: tokens.boss })).body.data;
    assert.deepEqual([view.regularCount, view.temporaryCount], [1, 1]);
  });

  it('제외: 소속 기록은 종료일·이유·처리자와 함께 남고, 책임자는 먼저 해제해야 제외할 수 있다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Harbor.id, u.id);
    const res = await api('DELETE', `/api/crews/${seed.Harbor.id}/members/${u.id}`, { token: tokens.underboss2 });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.body.data.active, res.body.data.endReason, res.body.data.endedBy.username], [false, 'REMOVED', 'underboss2']);
    expectError(await api('DELETE', `/api/crews/${seed.Harbor.id}/members/${u.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('DELETE', `/api/crews/${seed.Harbor.id}/members/${seed.capo3.id}`, { token: tokens.boss }), 409, 'CONFLICT');
    assert.equal((await latestLog('MEMBERSHIP_ENDED', u.id)).related[0].id, String(seed.Harbor.id));
  });

  it('이동: 기존 소속 종료와 새 소속 생성이 함께 일어나고, Underboss 이상만 할 수 있다', async () => {
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Northside.id, u.id);
    const path = `/api/crews/${seed.Northside.id}/members/${u.id}/transfer`;
    expectError(await api('POST', path, { token: tokens.capo1, body: { targetCrewId: seed.Harbor.id } }), 403, 'FORBIDDEN');
    expectError(await api('POST', path, { token: tokens.boss, body: { targetCrewId: seed.Northside.id } }), 400, 'VALIDATION_ERROR');

    const res = await api('POST', path, { token: tokens.underboss1, body: { targetCrewId: seed.Harbor.id, note: '인력 재배치' } });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.body.data.crew.name, res.body.data.type, res.body.data.joinMethod, res.body.data.fromCrew.name], ['Harbor', 'REGULAR', 'TRANSFER', 'Northside']);
    const old = (await api('GET', `/api/users/${u.id}/memberships`, { token: tokens.boss })).body.data.find((m) => m.crew.name === 'Northside');
    assert.deepEqual([old.active, old.endReason, old.toCrew.name], [false, 'TRANSFERRED', 'Harbor']);
    assert.deepEqual((await latestLog('MEMBERSHIP_TRANSFERRED', u.id)).related.map((r) => r.label), ['Northside', 'Harbor']);
    expectError(await api('POST', `/api/crews/${seed.Southside.id}/members/${seed.capo2.id}/transfer`, { token: tokens.boss, body: { targetCrewId: seed.Harbor.id } }), 409, 'CONFLICT');
    await removeFrom(seed.Harbor.id, u.id);
  });

  it('후보: 정식 후보에는 다른 Crew 정식 소속원이 빠지고 임시 후보에는 포함되며, 정지 구성원은 빠진다', async () => {
    const crew = await makeCrew(t, tokens);
    const free = await makeUser(t, tokens, { role: 'SOLDIER' });
    const suspended = await makeUser(t, tokens, { role: 'SOLDIER', status: 'SUSPENDED' });
    const candidates = async (query) => (await api('GET', `/api/crews/${crew.id}/candidates?size=100&${query}`, { token: tokens.boss })).body.data.map((u) => u.username);

    assert.ok((await candidates(`q=${free.username}`)).includes(free.username));
    assert.deepEqual(await candidates(`q=${suspended.username}`), []);
    assert.ok(!(await candidates('q=soldier1')).includes('soldier1'));
    assert.ok((await candidates('type=TEMPORARY&q=soldier1')).includes('soldier1'));
    assert.deepEqual(await candidates('q=underboss1'), []);
    expectError(await api('GET', `/api/crews/${seed.Northside.id}/candidates`, { token: tokens.capo2 }), 403, 'FORBIDDEN');
  });

  it('편성 이력: 가입·제외·이동이 처리한 사람과 함께 모두 남는다', async () => {
    const crew = await makeCrew(t, tokens);
    const a = await makeUser(t, tokens, { role: 'SOLDIER' });
    const b = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(crew.id, a.id);
    await add(crew.id, b.id);
    await removeFrom(crew.id, a.id);
    assert.equal((await api('POST', `/api/crews/${crew.id}/members/${b.id}/transfer`, { token: tokens.boss, body: { targetCrewId: seed.Harbor.id } })).status, 200);

    const res = await api('GET', `/api/crews/${crew.id}/membership-history`, { token: tokens.boss });
    assert.equal(res.status, 200, res.text);
    const rows = Object.fromEntries(res.body.data.map((m) => [m.user.id, m]));
    assert.deepEqual([rows[a.id].endReason, rows[a.id].addedBy.username, rows[a.id].endedBy.username], ['REMOVED', 'boss', 'boss']);
    assert.deepEqual([rows[b.id].endReason, rows[b.id].toCrew.name], ['TRANSFERRED', 'Harbor']);
    assert.equal((await api('GET', `/api/crews/${crew.id}/membership-history?status=ended`, { token: tokens.boss })).body.meta.total, 2);
    assert.equal((await api('GET', `/api/crews/${crew.id}/membership-history?status=active`, { token: tokens.boss })).body.meta.total, 0);
    await removeFrom(seed.Harbor.id, b.id);
  });

  it('병합: 원 Crew의 소속원이 대상 Crew로 옮겨지고 원 Crew는 해산된다', async () => {
    const source = await makeCrew(t, tokens);
    const target = await makeCrew(t, tokens);
    const capo = await makeUser(t, tokens, { role: 'CAPO' });
    const regular = await makeUser(t, tokens, { role: 'SOLDIER' });
    const both = await makeUser(t, tokens, { role: 'SOLDIER' });
    await api('PUT', `/api/crews/${source.id}/capo`, { token: tokens.boss, body: { userId: capo.id } });
    await add(source.id, regular.id);
    await add(source.id, both.id, 'REGULAR');
    await add(target.id, both.id, 'TEMPORARY');

    const body = { sourceCrewId: source.id, targetCrewId: target.id };
    expectError(await api('POST', '/api/crews/merge', { token: tokens.capo1, body }), 403, 'FORBIDDEN');
    expectError(await api('POST', '/api/crews/merge', { token: tokens.boss, body: { ...body, targetCrewId: source.id } }), 400, 'VALIDATION_ERROR');
    const res = await api('POST', '/api/crews/merge', { token: tokens.underboss1, body: { ...body, reason: '통합' } });
    assert.equal(res.status, 200, res.text);
    const { movedCount, alreadyMemberCount, sourceCrew, targetCrew } = res.body.data;
    assert.deepEqual([movedCount, alreadyMemberCount], [3, 0]);
    assert.deepEqual([sourceCrew.status, sourceCrew.memberCount, sourceCrew.capo], ['DISBANDED', 0, null]);
    assert.deepEqual([targetCrew.regularCount, targetCrew.temporaryCount], [3, 0]);
    const moved = (await api('GET', `/api/crews/${target.id}/members/${both.id}`, { token: tokens.boss })).body.data;
    assert.deepEqual([moved.type, moved.joinMethod, moved.fromCrew.id], ['REGULAR', 'MERGE', source.id]);
    expectError(await api('POST', '/api/crews/merge', { token: tokens.boss, body }), 409, 'CONFLICT');
  });
});

// ---------------------------------------------------------------------------
describe('소속 신청 (#45~#50)', () => {
  it('신청 → 책임자 승인 → 편성되고, 내 신청 현황과 내 정보에 결과가 보인다', async () => {
    const crew = await makeCrew(t, tokens);
    const capo = await makeUser(t, tokens, { role: 'CAPO' });
    await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } });
    const applicant = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    const token = await login(applicant);

    const applied = await api('POST', `/api/crews/${crew.id}/join-requests`, { token, body: { message: '함께하고 싶습니다' } });
    assert.equal(applied.status, 201, applied.text);
    assert.deepEqual([applied.body.data.status, applied.body.data.type], ['PENDING', 'REGULAR']);
    expectError(await api('POST', `/api/crews/${crew.id}/join-requests`, { token }), 409, 'CONFLICT');

    const capoToken = await login(capo);
    const pending = await api('GET', `/api/crews/${crew.id}/join-requests?status=PENDING`, { token: capoToken });
    assert.deepEqual(pending.body.data.map((r) => r.applicant.id), [applicant.id]);
    const approved = await api('POST', `/api/crews/${crew.id}/join-requests/${applied.body.data.id}/approve`, { token: capoToken });
    assert.equal(approved.status, 200, approved.text);
    assert.equal(approved.body.data.status, 'APPROVED');
    assert.ok(approved.body.data.membershipId);
    assert.equal((await api('GET', `/api/crews/${crew.id}/members/${applicant.id}`, { token: capoToken })).body.data.joinMethod, 'JOIN_REQUEST');
    expectError(await api('POST', `/api/crews/${crew.id}/join-requests/${applied.body.data.id}/approve`, { token: capoToken }), 409, 'CONFLICT');

    assert.equal((await api('GET', '/api/me/join-requests', { token })).body.data[0].status, 'APPROVED');
    const me = (await api('GET', '/api/me', { token })).body.data;
    assert.deepEqual([me.crew.id, me.crew.capo.id], [crew.id, capo.id]);
  });

  it('정식 소속이 있으면 정식 신청은 BR-01이고, 승인 시점에도 BR-01을 다시 검사한다', async () => {
    expectRule(await api('POST', `/api/crews/${seed.Harbor.id}/join-requests`, { token: tokens.soldier2, body: { type: 'REGULAR' } }), 409, 'BR-01');
    const crewA = await makeCrew(t, tokens);
    const crewB = await makeCrew(t, tokens);
    const token = await login(await makeUser(t, tokens, { role: 'SOLDIER' }));
    const requestA = (await api('POST', `/api/crews/${crewA.id}/join-requests`, { token })).body.data;
    const requestB = (await api('POST', `/api/crews/${crewB.id}/join-requests`, { token })).body.data;
    assert.equal((await api('POST', `/api/crews/${crewA.id}/join-requests/${requestA.id}/approve`, { token: tokens.boss })).status, 200);
    expectRule(await api('POST', `/api/crews/${crewB.id}/join-requests/${requestB.id}/approve`, { token: tokens.boss }), 409, 'BR-01');
  });

  it('거절은 사유가 필요하고, 취소는 신청자 본인만 하며, Capo는 자기 Crew 신청만 처리한다 (BR-05)', async () => {
    const crew = await makeCrew(t, tokens);
    const token = await login(await makeUser(t, tokens, { role: 'ASSOCIATE' }));
    const first = (await api('POST', `/api/crews/${crew.id}/join-requests`, { token })).body.data;
    const reject = (id, actor, body) => api('POST', `/api/crews/${crew.id}/join-requests/${id}/reject`, { token: actor, body });
    expectError(await reject(first.id, tokens.boss, {}), 400, 'VALIDATION_ERROR');
    expectRule(await reject(first.id, tokens.capo1, { reason: 'x' }), 403, 'BR-05');
    expectError(await api('GET', `/api/crews/${crew.id}/join-requests`, { token: tokens.capo1 }), 403, 'FORBIDDEN');
    const rejected = (await reject(first.id, tokens.boss, { reason: '정원 초과' })).body.data;
    assert.deepEqual([rejected.status, rejected.decisionReason], ['REJECTED', '정원 초과']);

    const second = (await api('POST', `/api/crews/${crew.id}/join-requests`, { token })).body.data;
    expectError(await api('DELETE', `/api/crews/${crew.id}/join-requests/${second.id}`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    assert.equal((await api('DELETE', `/api/crews/${crew.id}/join-requests/${second.id}`, { token })).body.data.status, 'CANCELLED');
    expectError(await api('DELETE', `/api/crews/${crew.id}/join-requests/${second.id}`, { token }), 409, 'CONFLICT');
    expectError(await api('POST', `/api/crews/${seed.Northside.id}/join-requests/${second.id}/approve`, { token: tokens.boss }), 404, 'NOT_FOUND');
    expectError(await api('POST', `/api/crews/${crew.id}/join-requests`, { token: tokens.underboss1 }), 403, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
describe('역할 변경 요청 (#51~#55)', () => {
  it('Capo가 자기 Crew 소속원을 추천하고 Underboss가 승인하면 역할이 바뀌고 이력이 남는다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    await add(seed.Northside.id, u.id);
    const created = await api('POST', '/api/role-change-requests', { token: tokens.capo1, body: { userId: u.id, role: 'SOLDIER', reason: '성실함' } });
    assert.equal(created.status, 201, created.text);
    const request = created.body.data;
    assert.deepEqual([request.fromRole, request.toRole, request.status], ['ASSOCIATE', 'SOLDIER', 'PENDING']);
    expectError(await api('POST', '/api/role-change-requests', { token: tokens.capo1, body: { userId: u.id, role: 'SOLDIER', reason: '중복' } }), 409, 'CONFLICT');
    expectError(await api('POST', `/api/role-change-requests/${request.id}/approve`, { token: tokens.capo1 }), 403, 'FORBIDDEN');

    const pending = await api('GET', `/api/role-change-requests/${request.id}`, { token: tokens.capo1 });
    assert.equal(pending.status, 200, pending.text);
    assert.deepEqual([pending.body.data.user.id, pending.body.data.status, pending.body.data.requestedBy.username, pending.body.data.decidedBy], [u.id, 'PENDING', 'capo1', null]);

    const approved = await api('POST', `/api/role-change-requests/${request.id}/approve`, { token: tokens.underboss1 });
    assert.equal(approved.status, 200, approved.text);
    assert.equal(approved.body.data.status, 'APPROVED');
    const detail = await api('GET', `/api/role-change-requests/${request.id}`, { token: tokens.underboss1 });
    assert.equal(detail.status, 200, detail.text);
    assert.deepEqual([detail.body.data.status, detail.body.data.decidedBy.username], ['APPROVED', 'underboss1']);
    assert.ok(detail.body.data.decidedAt);
    expectError(await api('GET', '/api/role-change-requests/999999999', { token: tokens.boss }), 404, 'NOT_FOUND');
    assert.equal((await api('GET', `/api/users/${u.id}`, { token: tokens.boss })).body.data.role, 'SOLDIER');
    assert.equal((await latestLog('USER_ROLE_CHANGED', u.id)).after.requestId, request.id);
    expectError(await api('POST', `/api/role-change-requests/${request.id}/reject`, { token: tokens.underboss1, body: { reason: 'x' } }), 409, 'CONFLICT');
    await removeFrom(seed.Northside.id, u.id);
  });

  it('Capo는 다른 Crew 소속원(BR-05)이나 Underboss 이상 역할(BR-04)을 추천할 수 없다', async () => {
    const recommend = (token, body) => api('POST', '/api/role-change-requests', { token, body: { reason: '추천', ...body } });
    expectRule(await recommend(tokens.capo1, { userId: seed.soldier3.id, role: 'CAPO' }), 403, 'BR-05');
    const u = await makeUser(t, tokens, { role: 'SOLDIER' });
    await add(seed.Northside.id, u.id);
    expectRule(await recommend(tokens.capo1, { userId: u.id, role: 'UNDERBOSS' }), 403, 'BR-04');
    expectRule(await recommend(tokens.underboss1, { userId: seed.underboss2.id, role: 'CAPO' }), 403, 'BR-04');
    expectError(await recommend(tokens.soldier1, { userId: u.id, role: 'CAPO' }), 403, 'FORBIDDEN');
    expectError(await api('POST', '/api/role-change-requests', { token: tokens.capo1, body: { userId: u.id, role: 'CAPO' } }), 400, 'VALIDATION_ERROR');
    await removeFrom(seed.Northside.id, u.id);
  });

  it('자신이 한 요청은 승인할 수 없고, 요청 후 역할이 바뀌면 승인할 수 없으며, Capo는 자신이 한 요청만 본다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    const own = (await api('POST', '/api/role-change-requests', { token: tokens.underboss1, body: { userId: u.id, role: 'SOLDIER', reason: '추천' } })).body.data;
    expectError(await api('POST', `/api/role-change-requests/${own.id}/approve`, { token: tokens.underboss1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', `/api/role-change-requests/${own.id}`, { token: tokens.capo1 }), 403, 'FORBIDDEN');
    const capoList = await api('GET', '/api/role-change-requests?size=100', { token: tokens.capo1 });
    assert.ok(capoList.body.data.every((r) => r.requestedBy.username === 'capo1'));

    assert.equal((await api('PATCH', `/api/users/${u.id}/role`, { token: tokens.boss, body: { role: 'CAPO' } })).status, 200);
    expectError(await api('POST', `/api/role-change-requests/${own.id}/approve`, { token: tokens.boss }), 409, 'CONFLICT');
    expectError(await api('POST', `/api/role-change-requests/${own.id}/reject`, { token: tokens.boss, body: {} }), 400, 'VALIDATION_ERROR');
    assert.equal((await api('POST', `/api/role-change-requests/${own.id}/reject`, { token: tokens.boss, body: { reason: '이미 역할 변경됨' } })).body.data.status, 'REJECTED');
    assert.deepEqual((await api('GET', `/api/role-change-requests?userId=${u.id}`, { token: tokens.boss })).body.data.map((r) => r.status), ['REJECTED']);
  });
});
