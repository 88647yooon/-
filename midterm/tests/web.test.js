// 웹 화면(EJS) 검증 (CR-02). 화면에서도 로그인, 권한 검사, 업무 규칙이 API와 똑같이 적용되는지 확인한다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const crewModel = require('../models/sql/crewModel');
const userModel = require('../models/sql/userModel');
const SecurityEvent = require('../models/mongo/SecurityEvent');
const { getPool } = require('../config/database');
const { startServer, makeUser } = require('./helpers');

let t;
const tokens = {};
const seed = {};

before(async () => {
  t = await startServer();
  for (const name of ['admin', 'boss']) tokens[name] = (await t.login(name)).accessToken;
  for (const name of ['Northside', 'Southside']) seed[name] = await crewModel.findByName(name);
  for (const u of await userModel.findByUsernames(['soldier3', 'associate2'])) seed[u.username] = u;
});
after(async () => {
  await t.stop();
});

// 쿠키를 유지하는 간단한 브라우저. 리다이렉트는 따라가지 않고 그대로 돌려준다.
function browser() {
  const jar = new Map();
  async function request(method, path, { form, referer } = {}) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (referer) headers.referer = `${t.base}${referer}`;
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(t.base + path, { method, headers, body, redirect: 'manual' });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(';');
      const [name, value] = pair.split('=');
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim())) || value === '';
      if (expired) jar.delete(name); else jar.set(name, value);
    }
    return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type'), html: await res.text() };
  }
  const get = (path) => request('GET', path);
  const post = (path, form, referer) => request('POST', path, { form, referer });
  const login = async (username, password = config.seedPassword) => {
    const res = await post('/login', { username, password, next: '/' });
    assert.equal(res.status, 302);
    assert.equal(res.location, '/');
    assert.ok(jar.has('family_token'), `${username} 로그인 쿠키 없음`);
  };
  // 폼을 보낸 뒤 돌아간 화면에 표시된 결과 메시지를 읽는다.
  const flashAfter = async (path, form, referer) => {
    const res = await post(path, form, referer);
    assert.equal(res.status, 302, res.html);
    const page = await get(res.location);
    const match = page.html.match(/<div class="flash (\w+)"[^>]*>([\s\S]*?)<\/div>/);
    return match ? { type: match[1], text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } : null;
  };
  return { get, post, login, flashAfter, jar };
}

describe('웹 화면 (CR-02)', () => {
  it('홈 화면에 구현한 단계의 기능 요구사항 확인 목록과 시나리오, 테스트 계정이 보인다', async () => {
    const res = await browser().get('/');
    assert.equal(res.status, 200);
    assert.match(res.type, /^text\/html/);
    for (const text of ['기능 요구사항 확인', 'FR-01', 'FR-06', 'FR-07', 'FR-12', 'FR-13', 'FR-17', 'FR-18', 'FR-20', 'FR-21', 'FR-23', '업무 규칙 확인 시나리오', 'BR-01', 'BR-05', 'BR-03', 'BR-06', 'BR-07', 'BR-08', 'BR-10', '테스트 계정', 'underboss1']) {
      assert.ok(res.html.includes(text), `홈 화면에 '${text}' 없음`);
    }
  });

  it('로그인하지 않으면 로그인 화면으로 보내고, 로그인하면 원래 화면으로 돌아간다', async () => {
    const b = browser();
    const res = await b.get('/users');
    assert.equal(res.status, 302);
    assert.equal(res.location, '/login?next=%2Fusers');
    const login = await b.post('/login', { username: 'boss', password: config.seedPassword, next: '/users' });
    assert.equal(login.location, '/users');
    const users = await b.get('/users');
    assert.equal(users.status, 200);
    assert.ok(users.html.includes('구성원 등록'));
  });

  it('틀린 비밀번호와 정지 계정은 로그인이 거부되고 이유가 보인다', async () => {
    const b = browser();
    const wrong = await b.flashAfter('/login', { username: 'boss', password: 'wrong-password', next: '/' }, '/login');
    assert.equal(wrong.type, 'error');
    assert.match(wrong.text, /아이디 또는 비밀번호/);
    const suspended = await b.flashAfter('/login', { username: 'suspended1', password: config.seedPassword, next: '/' }, '/login');
    assert.match(suspended.text, /정지 상태의 계정/);
    assert.ok(!b.jar.has('family_token'));
  });

  it('내 정보 화면에 역할·상태·현재 소속·사용 가능 기능이 보인다 (FR-02)', async () => {
    const b = browser();
    await b.login('soldier1');
    const res = await b.get('/me');
    assert.equal(res.status, 200);
    for (const text of ['Luca Esposito', 'Soldier', '활동중', 'Northside', 'Lorenzo Bianchi', 'Southside', 'me.update']) {
      assert.ok(res.html.includes(text), `내 정보에 '${text}' 없음`);
    }
  });

  it('BR-01: 화면에서 다른 Crew 정식 소속원을 정식 편성하면 BR-01 메시지가 보인다', async () => {
    const b = browser();
    await b.login('boss');
    const path = `/crews/${seed.Northside.id}`;
    const flash = await b.flashAfter(`${path}/members`, { username: 'soldier3', type: 'REGULAR' }, path);
    assert.equal(flash.type, 'error');
    assert.match(flash.text, /BR-01/);
    assert.match(flash.text, /Southside/);
  });

  it('BR-05: Capo가 화면에서 다른 Crew를 편성하면 BR-05 메시지가 보이고, 자기 Crew는 편성·제외된다', async () => {
    const u = await makeUser(t, tokens, { role: 'ASSOCIATE' });
    const b = browser();
    await b.login('capo1');
    const south = `/crews/${seed.Southside.id}`;
    const denied = await b.flashAfter(`${south}/members`, { username: u.username, type: 'REGULAR' }, south);
    assert.equal(denied.type, 'error');
    assert.match(denied.text, /BR-05/);

    const north = `/crews/${seed.Northside.id}`;
    const added = await b.flashAfter(`${north}/members`, { username: u.username, type: 'REGULAR' }, north);
    assert.equal(added.type, 'success', added.text);
    assert.ok((await b.get(north)).html.includes(`@${u.username}`));
    const removed = await b.flashAfter(`${north}/members/${u.id}/remove`, {}, north);
    assert.equal(removed.type, 'success', removed.text);
  });

  it('BR-04: Underboss가 화면에서 Boss의 역할을 바꾸려 하면 BR-04 메시지가 보인다', async () => {
    const boss = await userModel.findByUsername('boss');
    const b = browser();
    await b.login('underboss1');
    const path = `/users/${boss.id}`;
    const flash = await b.flashAfter(`${path}/role`, { role: 'SOLDIER' }, path);
    assert.equal(flash.type, 'error');
    assert.match(flash.text, /BR-04/);
  });

  it('화면에서 구성원을 등록하고 상태·역할을 바꾸면 상세 화면에 반영된다 (FR-01, FR-03, FR-04)', async () => {
    const b = browser();
    await b.login('boss');
    const username = `web.${Date.now().toString(36)}`;
    const created = await b.post('/users', { username, password: 'Welcome2026', name: 'Web Member' }, '/users');
    assert.equal(created.status, 302);
    assert.match(created.location, /^\/users\/\d+$/);
    const path = created.location;

    const invalid = await b.flashAfter(`${path}/status`, { status: 'SUSPENDED' }, path);
    assert.equal(invalid.type, 'error'); // 대기 → 정지는 허용되지 않는 전이
    assert.equal((await b.flashAfter(`${path}/status`, { status: 'ACTIVE', reason: '활동 시작' }, path)).type, 'success');
    assert.equal((await b.flashAfter(`${path}/role`, { role: 'SOLDIER' }, path)).type, 'success');
    const page = await b.get(path);
    assert.ok(page.html.includes('Soldier') && page.html.includes('활동중'));
  });

  it('BR-09: 권한 없는 화면에 주소로 직접 들어가면 403 화면이 나오고 보안 이벤트가 기록된다', async () => {
    const started = new Date();
    const b = browser();
    await b.login('associate1');
    const res = await b.get('/users');
    assert.equal(res.status, 403);
    assert.ok(res.html.includes('권한 없음'));
    const event = await SecurityEvent.findOne({ 'user.username': 'associate1', path: '/users', createdAt: { $gte: started } }).lean();
    assert.ok(event, '보안 이벤트가 기록되지 않음');
  });

  it('잘못된 입력은 필드별 메시지로 보이고, 없는 화면은 404 화면, /api는 여전히 JSON이다', async () => {
    const b = browser();
    await b.login('boss');
    const flash = await b.flashAfter('/users', { username: 'Bad Name', password: 'short', name: '' }, '/users');
    assert.equal(flash.type, 'error');
    assert.match(flash.text, /username/);
    assert.match(flash.text, /password/);

    const missing = await b.get('/no-such-page');
    assert.equal(missing.status, 404);
    assert.ok(missing.html.includes('찾을 수 없음'));
    const api = await t.api('GET', '/api/no-such-api');
    assert.equal(api.status, 404);
    assert.equal(api.body.error.code, 'NOT_FOUND');
  });

  it('로그아웃하면 로그인 쿠키가 지워지고 그 세션은 API에서도 쓸 수 없다', async () => {
    const b = browser();
    await b.login('soldier2');
    const token = b.jar.get('family_token');
    const res = await b.post('/logout', {});
    assert.equal(res.status, 302);
    assert.ok(!b.jar.has('family_token'));
    assert.equal((await t.api('GET', '/api/me', { token })).status, 401);
  });
});

describe('업무 화면 (단계 3)', () => {
  // 화면의 날짜·시간 입력칸 형식(YYYY-MM-DDTHH:mm, 한국 시간)
  const HOUR = 60 * 60 * 1000;
  const BASE = Math.floor(Date.now() / HOUR) * HOUR + (400 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
  const local = (hours) => new Date(BASE + hours * HOUR + 9 * HOUR).toISOString().slice(0, 16);
  const taskIdByTitle = async (title) => (await getPool().query('SELECT id FROM tasks WHERE title = ? ORDER BY id LIMIT 1', [title]))[0][0].id;

  it('업무 목록·상세·내 업무 화면이 열리고 시드 업무가 보인다', async () => {
    const b = browser();
    await b.login('boss');
    const list = await b.get('/tasks');
    assert.equal(list.status, 200);
    assert.ok(list.html.includes('업무 등록') && list.html.includes('강북 정기 순찰'));
    const detail = await b.get(`/tasks/${await taskIdByTitle('강북 정기 순찰')}`);
    assert.equal(detail.status, 200);
    for (const text of ['참여자', '지시사항', '체크리스트', '상태 변경 이력', '배정 이력']) assert.ok(detail.html.includes(text), text);

    const s = browser();
    await s.login('soldier1');
    const mine = await s.get('/my-tasks');
    assert.equal(mine.status, 200);
    assert.ok(mine.html.includes('강북 정기 순찰'));
    assert.equal((await s.get('/tasks')).status, 403); // Soldier는 업무 탐색 권한이 없다
  });

  it('BR-02·BR-03: 화면에서 정지 구성원이나 시간이 겹치는 구성원을 배정하면 규칙 메시지가 보인다', async () => {
    const busy = await makeUser(t, tokens);
    const b = browser();
    await b.login('boss');
    const first = await b.post('/tasks', { title: '웹 배정 A', startAt: local(0), endAt: local(2) }, '/tasks');
    assert.match(first.location, /^\/tasks\/\d+$/);
    assert.equal((await b.flashAfter(`${first.location}/assignees`, { usernames: busy.username }, first.location)).type, 'success');

    const second = await b.post('/tasks', { title: '웹 배정 B', startAt: local(1), endAt: local(3) }, '/tasks');
    const overlap = await b.flashAfter(`${second.location}/assignees`, { usernames: busy.username }, second.location);
    assert.equal(overlap.type, 'error');
    assert.match(overlap.text, /BR-03/);
    const suspended = await b.flashAfter(`${second.location}/assignees`, { usernames: 'suspended1' }, second.location);
    assert.match(suspended.text, /BR-02/);
  });

  it('BR-06: Capo가 화면에서 완료된 업무의 결과를 정정하면 BR-06 메시지가 보인다', async () => {
    const path = `/tasks/${await taskIdByTitle('강남 정보 수집')}`;
    const b = browser();
    await b.login('capo2');
    const page = await b.get(path);
    assert.ok(page.html.includes('완료와 결과') && page.html.includes('동향 보고서'));
    const flash = await b.flashAfter(`${path}/result`, { summary: '조작된 결과', reason: '시도' }, path);
    assert.equal(flash.type, 'error');
    assert.match(flash.text, /BR-06/);
  });
});

describe('자원 화면 (단계 4)', () => {
  const HOUR = 60 * 60 * 1000;
  const BASE = Math.floor(Date.now() / HOUR) * HOUR + (400 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
  // 화면의 날짜·시간 입력칸 형식(YYYY-MM-DDTHH:mm, 한국 시간)
  const toLocal = (ms) => new Date(ms + 9 * HOUR).toISOString().slice(0, 16);
  const local = (hours) => toLocal(BASE + hours * HOUR);
  const categoryId = async () => (await getPool().query("SELECT id FROM resource_categories WHERE name = '차량'"))[0][0].id;
  const code = () => `W-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function newResource(b) {
    const res = await b.post('/resources', { code: code(), name: '웹 테스트 자원', categoryId: String(await categoryId()) }, '/resources');
    assert.match(res.location, /^\/resources\/\d+$/);
    const page = await b.get(res.location);
    return { path: res.location, code: page.html.match(/<span class="mono small">([^<]+)<\/span>/)[1] };
  }

  it('자원 목록·상세·내 자원 화면이 역할에 맞게 열린다', async () => {
    const b = browser();
    await b.login('boss');
    const list = await b.get('/resources?q=VH-001');
    assert.equal(list.status, 200);
    for (const text of ['이용 가능한 자원', '전체 자원 (관리용)', '진행 중인 점검', '미반환 자원', '자원 분류', '자원 등록', 'VH-001']) assert.ok(list.html.includes(text), text);
    const id = (await getPool().query("SELECT id FROM resources WHERE code = 'VH-001'"))[0][0].id;
    const detail = await b.get(`/resources/${id}`);
    for (const text of ['현재 상태', '시간대 가용 여부', '예약 일정', '사용·반환 이력', '상태 변경 이력', '자원 관리']) assert.ok(detail.html.includes(text), text);

    const s = browser();
    await s.login('soldier1');
    const soldierList = await s.get('/resources');
    assert.ok(soldierList.html.includes('이용 가능한 자원'));
    assert.ok(!soldierList.html.includes('전체 자원 (관리용)'));
    assert.equal((await s.get('/my-resources')).status, 200);

    const a = browser();
    await a.login('associate1');
    assert.equal((await a.get('/resources')).status, 403);
  });

  it('BR-07·BR-08: 화면에서 겹치는 시간대나 사용불가 자원을 배정하면 규칙 메시지가 보인다', async () => {
    const b = browser();
    await b.login('boss');
    const resource = await newResource(b);
    const first = await b.post('/tasks', { title: '웹 자원 A', startAt: local(0), endAt: local(2) }, '/tasks');
    assert.equal((await b.flashAfter(`${first.location}/resources`, { code: resource.code }, first.location)).type, 'success');
    const second = await b.post('/tasks', { title: '웹 자원 B', startAt: local(1), endAt: local(3) }, '/tasks');
    const overlap = await b.flashAfter(`${second.location}/resources`, { code: resource.code }, second.location);
    assert.equal(overlap.type, 'error');
    assert.match(overlap.text, /BR-07/);
    const member = await b.flashAfter(`${resource.path}/allocations`, { username: 'soldier1', startAt: local(1.5), endAt: local(2.5) }, resource.path);
    assert.match(member.text, /BR-07/);

    assert.equal((await b.flashAfter(`${resource.path}/status`, { status: 'UNAVAILABLE', reason: '웹 테스트' }, resource.path)).type, 'success');
    const third = await b.post('/tasks', { title: '웹 자원 C', startAt: local(5), endAt: local(6) }, '/tasks');
    const broken = await b.flashAfter(`${third.location}/resources`, { code: resource.code }, third.location);
    assert.match(broken.text, /BR-08/);
  });

  it('FR-15: 화면에서 배정받은 자원을 사용·반환하면 자원 화면의 사용 이력에 남는다', async () => {
    const user = await makeUser(t, tokens);
    const b = browser();
    await b.login('boss');
    const resource = await newResource(b);
    const now = Date.now();
    const allocated = await b.flashAfter(`${resource.path}/allocations`, { username: user.username, startAt: toLocal(now - 60 * 1000), endAt: toLocal(now + 2 * HOUR) }, resource.path);
    assert.equal(allocated.type, 'success', allocated.text);

    const u = browser();
    await u.login(user.username, user.password);
    assert.ok((await u.get('/my-resources')).html.includes(resource.code));
    const resourceId = resource.path.split('/').pop();
    assert.equal((await u.flashAfter(`/resources/${resourceId}/checkout`, {}, '/my-resources')).type, 'success');
    assert.ok((await u.get('/my-resources')).html.includes('지금 사용 중인 자원'));
    const returned = await u.flashAfter(`/resources/${resourceId}/return`, { condition: 'GOOD', note: '웹 반환' }, '/my-resources');
    assert.match(returned.text, /사용가능/);

    const history = await b.get(resource.path);
    assert.ok(history.html.includes(user.username) && history.html.includes('웹 반환'));
  });
});

describe('평가·기록 화면 (단계 5)', () => {
  const HOUR = 60 * 60 * 1000;
  const BASE = Math.floor(Date.now() / HOUR) * HOUR + (400 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
  let slot = 0;
  const ok = (res, status = 200) => {
    assert.equal(res.status, status, res.text);
    return res.body.data;
  };
  // API로 업무를 만들어 참여자를 배정·시작·완료한다 (Boss의 조직 업무).
  async function completedTask(user) {
    slot += 3;
    const body = { title: `웹 평가 ${Date.now()}`, startAt: new Date(BASE + slot * HOUR).toISOString(), endAt: new Date(BASE + (slot + 1) * HOUR).toISOString() };
    const task = ok(await t.api('POST', '/api/tasks', { token: tokens.boss, body }), 201);
    ok(await t.api('POST', `/api/tasks/${task.id}/assignees`, { token: tokens.boss, body: { assignees: [{ userId: user.id }] } }), 201);
    ok(await t.api('PATCH', `/api/tasks/${task.id}/status`, { token: tokens.boss, body: { status: 'IN_PROGRESS' } }));
    ok(await t.api('POST', `/api/tasks/${task.id}/complete`, { token: tokens.boss, body: { outcome: 'SUCCESS', summary: '완료', participations: [{ userId: user.id, participated: true }] } }));
    return task;
  }
  const scoreForm = async () => Object.fromEntries(ok(await t.api('GET', '/api/evaluation-criteria', { token: tokens.boss })).map((c) => [`score_${c.key}`, '4']));

  it('구성원 화면에 평판·받은 평가·변경 이력·활동이 보이고, 권한 밖이면 그 영역만 막힌다', async () => {
    const s = browser();
    await s.login('soldier1');
    const own = await s.get(`/users/${(await userModel.findByUsername('soldier1')).id}`);
    assert.equal(own.status, 200);
    for (const text of ['평판', '받은 평가', '강남 정보 수집', '변경 이력 (시간순)', '계정 등록', '활동']) assert.ok(own.html.includes(text), text);
    const other = await s.get(`/users/${seed.soldier3.id}`);
    assert.equal(other.status, 200);
    assert.ok(other.html.includes('class="denied"'));
    assert.ok(!other.html.includes('계정 등록'));
  });

  it('화면에서 완료된 업무의 참여자를 평가하고, 완료되지 않은 업무는 오류 메시지가 보인다', async () => {
    const member = await makeUser(t, tokens);
    const task = await completedTask(member);
    const b = browser();
    await b.login('boss');
    const page = await b.get(`/tasks/${task.id}`);
    assert.ok(page.html.includes('참여자 평가'));
    const created = await b.flashAfter(`/tasks/${task.id}/evaluations`, { evaluateeId: String(member.id), comment: '웹 평가', ...(await scoreForm()) }, `/tasks/${task.id}`);
    assert.equal(created.type, 'success', created.text);
    assert.match(created.text, /4점/);

    slot += 3;
    const open = ok(await t.api('POST', '/api/tasks', { token: tokens.boss, body: { title: '웹 미완료', startAt: new Date(BASE + slot * HOUR).toISOString(), endAt: new Date(BASE + (slot + 1) * HOUR).toISOString() } }), 201);
    const refused = await b.flashAfter(`/tasks/${open.id}/evaluations`, { evaluateeId: String(member.id), ...(await scoreForm()) }, `/tasks/${open.id}`);
    assert.equal(refused.type, 'error');
    assert.match(refused.text, /완료된 업무만/);
  });

  it('화면에서 이의를 제기하고 Underboss·Boss가 정정하면 평가 상세에 정정 이력이 보인다', async () => {
    const member = await makeUser(t, tokens);
    const task = await completedTask(member);
    const scores = Object.fromEntries(ok(await t.api('GET', '/api/evaluation-criteria', { token: tokens.boss })).map((c) => [c.key, 2]));
    const e = ok(await t.api('POST', `/api/tasks/${task.id}/evaluations`, { token: tokens.boss, body: { evaluateeId: member.id, scores } }), 201);

    const m = browser();
    await m.login(member.username, member.password);
    assert.equal((await m.flashAfter(`/evaluations/${e.id}/appeals`, { reason: '웹 이의' }, `/evaluations/${e.id}`)).type, 'success');
    const u = browser();
    await u.login('underboss1');
    const list = await u.get('/evaluations');
    assert.ok(list.html.includes('처리할 이의 제기') && list.html.includes('웹 이의'));
    const appealId = list.html.match(new RegExp(`/evaluation-appeals/([a-f0-9]{24})/resolve`))[1];
    const resolved = await u.flashAfter(`/evaluation-appeals/${appealId}/resolve`, { decision: 'CORRECT', note: '웹 정정', ...(await scoreForm()) }, '/evaluations');
    assert.equal(resolved.type, 'success', resolved.text);
    const detail = await m.get(`/evaluations/${e.id}`);
    assert.ok(detail.html.includes('이의 제기 정정') && detail.html.includes('웹 정정'));
  });

  it('감사 기록은 Boss·Administrator만 보고, Administrator는 CSV로 내려받는다', async () => {
    const b = browser();
    await b.login('boss');
    const page = await b.get('/audit-logs?action=USER_ROLE_CHANGED');
    assert.equal(page.status, 200);
    assert.ok(page.html.includes('역할 변경'));
    const logId = page.html.match(/\/audit-logs\/([a-f0-9]{24})/)[1];
    const detail = await b.get(`/audit-logs/${logId}`);
    assert.ok(detail.html.includes('변경 전') && detail.html.includes('&#34;role&#34;')); // EJS가 JSON의 따옴표를 이스케이프한다
    assert.equal((await b.get('/audit-logs/export')).status, 403);

    const a = browser();
    await a.login('admin');
    const csv = await a.get('/audit-logs/export?action=USER_CREATED');
    assert.equal(csv.status, 200);
    assert.match(csv.type, /text\/csv/);
    assert.ok(csv.html.includes('USER_CREATED'));
    assert.ok((await a.get('/audit-logs')).html.includes('권한 거부 기록'));

    const s = browser();
    await s.login('associate1');
    assert.equal((await s.get('/audit-logs')).status, 403);
  });
});

describe('운영 현황·검색·관리자 화면 (단계 6)', () => {
  it('운영 현황 대시보드는 Underboss·Boss가 보고, 차트마다 표 보기가 있다', async () => {
    const b = browser();
    await b.login('boss');
    const page = await b.get('/dashboard?days=7&interval=day');
    assert.equal(page.status, 200);
    for (const text of ['업무 상태 추이', '자원 상태와 가동률', 'Crew 비교', '구성원 분포', '운영 경고', '관리 활동', '표로 보기', 'Northside']) assert.ok(page.html.includes(text), text);
    const s = browser();
    await s.login('soldier1');
    assert.equal((await s.get('/dashboard')).status, 403);
    assert.ok(!(await s.get('/me')).html.includes('href="/dashboard"'));
  });

  it('검색 화면은 권한 범위를 보여 주고, 검색 조건을 저장해 다시 실행한다', async () => {
    const a = browser();
    await a.login('associate1');
    const restricted = await a.get('/search?q=%EA%B0%95%EB%B6%81');
    assert.equal(restricted.status, 200);
    assert.ok(restricted.html.includes('구성원 목록을 볼 권한이 없습니다'));

    const user = await makeUser(t, tokens);
    const u = browser();
    await u.login(user.username, user.password);
    const saved = await u.flashAfter('/saved-searches', { name: '웹 저장 검색', q: '강북', types: 'crews' }, '/search?q=%EA%B0%95%EB%B6%81');
    assert.equal(saved.type, 'success', saved.text);
    const list = await u.get('/search');
    const id = list.html.match(/\/saved-searches\/([a-f0-9]{24})"/)[1];
    const run = await u.get(`/saved-searches/${id}`);
    assert.ok(run.html.includes("저장 검색 '웹 저장 검색' 실행 결과") && run.html.includes('Northside'));
  });

  it('관리자 화면은 Administrator만 열고, 계정 잠금·해제가 화면에서 된다 (BR-09)', async () => {
    const b = browser();
    await b.login('boss');
    assert.equal((await b.get('/admin')).status, 403);
    const denied = await SecurityEvent.findOne({ path: '/admin', 'user.username': 'boss' }).sort({ createdAt: -1 }).lean();
    assert.ok(denied);

    const target = await makeUser(t, tokens);
    const a = browser();
    await a.login('admin');
    const page = await a.get(`/admin?q=${target.username}`);
    assert.equal(page.status, 200);
    for (const text of ['DB 연결 상태', '데이터 무결성 점검', '계정 보안 현황', '역할별 권한', '운영 설정', target.username]) assert.ok(page.html.includes(text), text);
    assert.equal((await a.flashAfter(`/admin/accounts/${target.id}/lock`, { reason: '웹 잠금' }, '/admin')).type, 'success');
    const tryLogin = await browser().flashAfter('/login', { username: target.username, password: target.password, next: '/' }, '/login');
    assert.match(tryLogin.text, /잠긴 계정/);
    assert.equal((await a.flashAfter(`/admin/accounts/${target.id}/unlock`, {}, '/admin')).type, 'success');
    await browser().login(target.username, target.password);
    const reset = await a.flashAfter(`/admin/accounts/${target.id}/password-reset`, {}, '/admin');
    assert.match(reset.text, /임시 비밀번호: [A-Za-z0-9]{12}/);
  });

  it('내 정보에 내 요약이, Crew 화면에 소속원별 업무량이 보인다', async () => {
    const s = browser();
    await s.login('soldier1');
    const me = await s.get('/me');
    assert.ok(me.html.includes('내 요약') && me.html.includes('평판 점수'));
    const c = browser();
    await c.login('capo1');
    const crew = await c.get(`/crews/${seed.Northside.id}`);
    assert.ok(crew.html.includes('소속원별 업무량'));
    assert.ok(!crew.html.includes('그 Crew의 책임자와 Underboss·Boss만 볼 수 있습니다.'));
  });
});
