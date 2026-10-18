// 테스트 공통 도구: 실제 DB에 연결한 서버를 임의 포트로 띄우고 HTTP로 호출한다.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const config = require('../config');
const database = require('../config/database');
const { seed } = require('../models/seed');
const createApp = require('../createApp');

async function startServer() {
  await database.connect();
  await seed();
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, { token, body, raw } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let payload;
    if (raw !== undefined || body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = raw !== undefined ? raw : JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // JSON이 아닌 응답(HTML 등)은 text로 확인한다.
    }
    return { status: res.status, body: json, text };
  }

  async function login(username, password = config.seedPassword) {
    const res = await api('POST', '/api/auth/login', { body: { username, password } });
    assert.equal(res.status, 200, `${username} 로그인 실패: ${res.text}`);
    return res.body.data;
  }

  async function stop() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }

  return { base, api, login, stop };
}

// 지금까지 구현을 마친 작업지시서 단계. 문서 테스트는 목록표의 이 단계까지와 Swagger를 대조한다.
const IMPLEMENTED_STEP = 6;

// 테스트 실행마다 겹치지 않는 이름 (아이디 규칙: 영문 소문자·숫자·. _ -)
let seq = 0;
const unique = (prefix) => `${prefix}${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// 테스트용 구성원을 API로 만든다. 등록(Associate·대기) → 활동중 → 역할 변경 → 최종 상태 순서로 바꾼다.
async function makeUser(t, tokens, { role = 'SOLDIER', status = 'ACTIVE', name } = {}) {
  const username = unique('t.');
  const password = 'TestPass123';
  const created = await t.api('POST', '/api/users', { token: tokens.admin, body: { username, password, name: name ?? username } });
  assert.equal(created.status, 201, created.text);
  const { id } = created.body.data;
  const patch = async (path, body, token = tokens.boss) => {
    const res = await t.api('PATCH', `/api/users/${id}/${path}`, { token, body });
    assert.equal(res.status, 200, res.text);
  };
  if (status !== 'PENDING') await patch('status', { status: 'ACTIVE' });
  if (role !== 'ASSOCIATE') await patch('role', { role }, role === 'ADMIN' ? tokens.admin : tokens.boss);
  if (status !== 'PENDING' && status !== 'ACTIVE') await patch('status', { status });
  return { id, username, password };
}

async function makeCrew(t, tokens, body = {}) {
  const res = await t.api('POST', '/api/crews', { token: tokens.boss, body: { name: unique('T-'), region: '테스트', ...body } });
  assert.equal(res.status, 201, res.text);
  return res.body.data;
}

// API 목록표에서 maxStep 단계까지의 행을 읽는다.
function catalogRows(maxStep) {
  const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'api_catalog.md'), 'utf8');
  const re = /^\|\s*(\d+)\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*([^|]*?)\s*\|[^|]*\|\s*(\d)\s*\|\s*$/gm;
  return [...text.matchAll(re)]
    .map((m) => ({ no: Number(m[1]), method: m[2], url: m[3], requirements: m[4], step: Number(m[5]) }))
    .filter((row) => row.step <= maxStep);
}

// Express 경로(:id)를 OpenAPI 경로({id})로 바꾼다.
const toOpenApiPath = (url) => url.replace(/:(\w+)/g, '{$1}');

module.exports = { startServer, catalogRows, toOpenApiPath, IMPLEMENTED_STEP, unique, makeUser, makeCrew };
