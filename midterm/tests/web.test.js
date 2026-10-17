// 웹 화면(EJS) 검증 (CR-02). 화면에서도 로그인, 권한 검사, 업무 규칙이 API와 똑같이 적용되는지 확인한다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const crewModel = require('../models/sql/crewModel');
const userModel = require('../models/sql/userModel');
const SecurityEvent = require('../models/mongo/SecurityEvent');
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
  it('홈 화면에 단계 1·2 기능 요구사항 확인 목록과 시나리오, 테스트 계정이 보인다', async () => {
    const res = await browser().get('/');
    assert.equal(res.status, 200);
    assert.match(res.type, /^text\/html/);
    for (const text of ['기능 요구사항 확인', 'FR-01', 'FR-06', '업무 규칙 확인 시나리오', 'BR-01', 'BR-05', '테스트 계정', 'underboss1']) {
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
