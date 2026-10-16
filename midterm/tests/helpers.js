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

module.exports = { startServer, catalogRows, toOpenApiPath };
