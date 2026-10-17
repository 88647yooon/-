// 단계 1 공통 기반 검증 (작업지시서 5장 단계 1 완료 기준 + API 목록표 #1~#9)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const config = require('../config');
const userModel = require('../models/sql/userModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const LoginHistory = require('../models/mongo/LoginHistory');
const SecurityEvent = require('../models/mongo/SecurityEvent');
const { requirePermission } = require('../middlewares/authorize');
const { errorHandler } = require('../middlewares/errorHandler');
const { startServer } = require('./helpers');

let t;
before(async () => {
  t = await startServer();
});
after(async () => {
  await t.stop();
});

const expectError = (res, status, code) => {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
  assert.ok('details' in res.body.error);
};

describe('공통 오류 형식과 서버 안정성 (AR-04, AR-05, NFR-02)', () => {
  it('잘못된 JSON은 400이고, 서버는 계속 요청을 처리한다', async () => {
    expectError(await t.api('POST', '/api/auth/login', { raw: '{"username": ' }), 400, 'VALIDATION_ERROR');
    expectError(await t.api('POST', '/api/auth/login', { raw: '"just a string"' }), 400, 'VALIDATION_ERROR');
    const res = await t.api('POST', '/api/auth/login', { body: { username: 'boss', password: config.seedPassword } });
    assert.equal(res.status, 200);
  });

  it('없는 경로는 404 NOT_FOUND', async () => {
    expectError(await t.api('GET', '/api/no-such-api'), 404, 'NOT_FOUND');
  });

  it('필수 항목이 없거나 정의되지 않은 항목이 오면 필드별 오류를 돌려준다', async () => {
    const res = await t.api('POST', '/api/auth/login', { body: { username: 'boss', extra: 1 } });
    expectError(res, 400, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['body.extra', 'body.password']);
  });
});

describe('인증 API (#1~#5)', () => {
  it('토큰이 없거나 잘못되면 401', async () => {
    expectError(await t.api('GET', '/api/me'), 401, 'UNAUTHENTICATED');
    expectError(await t.api('GET', '/api/me', { token: 'not-a-jwt' }), 401, 'UNAUTHENTICATED');
  });

  it('틀린 비밀번호는 401이고 로그인 실패가 이력과 실패 횟수에 남는다', async () => {
    const before = await userModel.findByUsername('soldier3');
    const started = new Date();
    expectError(await t.api('POST', '/api/auth/login', { body: { username: 'soldier3', password: 'wrong-pass' } }), 401, 'UNAUTHENTICATED');

    const after = await userModel.findByUsername('soldier3');
    assert.equal(after.failedLoginCount, before.failedLoginCount + 1);
    const history = await LoginHistory.findOne({ username: 'soldier3', createdAt: { $gte: started } }).lean();
    assert.equal(history.success, false);
    assert.equal(history.reason, 'WRONG_PASSWORD');
  });

  it('없는 아이디도 같은 401 메시지를 돌려준다 (아이디 존재 여부 비노출)', async () => {
    const a = await t.api('POST', '/api/auth/login', { body: { username: 'no-such-user', password: 'x' } });
    const b = await t.api('POST', '/api/auth/login', { body: { username: 'soldier3', password: 'x' } });
    expectError(a, 401, 'UNAUTHENTICATED');
    assert.equal(a.body.error.message, b.body.error.message);
  });

  it('정지·탈퇴 계정은 로그인할 수 없다 (403), 대기 계정은 로그인할 수 있다', async () => {
    const suspended = await t.api('POST', '/api/auth/login', { body: { username: 'suspended1', password: config.seedPassword } });
    expectError(suspended, 403, 'FORBIDDEN');
    assert.equal(suspended.body.error.details.reason, 'ACCOUNT_SUSPENDED');

    const withdrawn = await t.api('POST', '/api/auth/login', { body: { username: 'withdrawn1', password: config.seedPassword } });
    expectError(withdrawn, 403, 'FORBIDDEN');
    assert.equal(withdrawn.body.error.details.reason, 'ACCOUNT_WITHDRAWN');

    const pending = await t.login('pending1');
    assert.equal(pending.user.status, 'PENDING');
  });

  it('로그인하면 토큰과 내 정보를 돌려주고, 마지막 로그인 시각이 실제 현재 시각(UTC)으로 저장된다', async () => {
    const data = await t.login('capo1');
    assert.equal(data.tokenType, 'Bearer');
    assert.ok(data.accessToken && data.refreshToken && data.sessionId);
    assert.equal(data.user.username, 'capo1');
    assert.equal(data.user.role, 'CAPO');
    assert.ok(!('passwordHash' in data.user));
    const drift = Math.abs(new Date(data.user.lastLoginAt).getTime() - Date.now());
    assert.ok(drift < 60 * 1000, `시각 차이 ${drift}ms`);
  });

  it('리프레시 토큰으로 재발급하면 새 토큰이 동작하고 이전 리프레시 토큰은 쓸 수 없다', async () => {
    const first = await t.login('soldier1');
    const res = await t.api('POST', '/api/auth/refresh', { body: { refreshToken: first.refreshToken } });
    assert.equal(res.status, 200, res.text);
    assert.notEqual(res.body.data.refreshToken, first.refreshToken);
    assert.equal(res.body.data.sessionId, first.sessionId);
    assert.equal((await t.api('GET', '/api/me', { token: res.body.data.accessToken })).status, 200);

    expectError(await t.api('POST', '/api/auth/refresh', { body: { refreshToken: first.refreshToken } }), 401, 'UNAUTHENTICATED');
  });

  it('세션 목록은 유효한 세션만 보여 주고 현재 세션을 표시한다', async () => {
    const a = await t.login('soldier4');
    const b = await t.login('soldier4');
    const res = await t.api('GET', '/api/auth/sessions', { token: b.accessToken });
    assert.equal(res.status, 200, res.text);
    const ids = res.body.data.map((s) => s.id);
    assert.ok(ids.includes(a.sessionId) && ids.includes(b.sessionId));
    assert.deepEqual(res.body.data.filter((s) => s.current).map((s) => s.id), [b.sessionId]);
  });

  it('로그아웃하면 그 세션의 토큰만 즉시 401이 되고 다른 세션은 유지된다', async () => {
    const a = await t.login('soldier4');
    const b = await t.login('soldier4');
    const res = await t.api('POST', '/api/auth/logout', { token: a.accessToken });
    assert.equal(res.status, 200, res.text);
    expectError(await t.api('GET', '/api/me', { token: a.accessToken }), 401, 'UNAUTHENTICATED');
    expectError(await t.api('POST', '/api/auth/refresh', { body: { refreshToken: a.refreshToken } }), 401, 'UNAUTHENTICATED');
    assert.equal((await t.api('GET', '/api/me', { token: b.accessToken })).status, 200);
  });

  it('모든 세션을 종료하면 모든 토큰이 401이 되고 활동 기록이 남는다', async () => {
    const started = new Date();
    const a = await t.login('soldier4');
    const b = await t.login('soldier4');
    const res = await t.api('DELETE', '/api/auth/sessions', { token: a.accessToken });
    assert.equal(res.status, 200, res.text);
    assert.ok(res.body.data.revokedCount >= 2);
    expectError(await t.api('GET', '/api/me', { token: a.accessToken }), 401, 'UNAUTHENTICATED');
    expectError(await t.api('GET', '/api/me', { token: b.accessToken }), 401, 'UNAUTHENTICATED');

    const log = await ActivityLog.findOne({ action: 'USER_SESSIONS_REVOKED', 'actor.username': 'soldier4', createdAt: { $gte: started } }).lean();
    assert.ok(log, '활동 기록이 없음');
  });
});

describe('내 정보 API (#6~#9)', () => {
  it('GET /api/me는 계정·역할·상태를 돌려주고 비밀번호 해시는 노출하지 않는다', async () => {
    const { accessToken } = await t.login('underboss1');
    const res = await t.api('GET', '/api/me', { token: accessToken });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.role, 'UNDERBOSS');
    assert.equal(res.body.data.rank, 4);
    assert.equal(res.body.data.statusLabel, '활동중');
    assert.ok(!res.text.includes('passwordHash') && !res.text.includes('$2'));
  });

  it('PATCH /api/me는 보낸 항목만 바꾸고 변경 전후를 활동 기록에 남긴다', async () => {
    const { accessToken, user } = await t.login('soldier2');
    const nickname = `nick-${Date.now()}`;
    const res = await t.api('PATCH', '/api/me', { token: accessToken, body: { nickname } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.nickname, nickname);
    assert.equal(res.body.data.phone, user.phone);

    const log = await ActivityLog.findOne({ action: 'USER_PROFILE_UPDATED', 'target.id': String(user.id) }).sort({ createdAt: -1 }).lean();
    assert.equal(log.after.nickname, nickname);
    assert.equal(log.before.nickname, user.nickname);
  });

  it('PATCH /api/me는 빈 본문, 역할 같은 허용되지 않은 항목, 형식 오류를 400으로 거부한다', async () => {
    const { accessToken } = await t.login('associate1');
    expectError(await t.api('PATCH', '/api/me', { token: accessToken, body: {} }), 400, 'VALIDATION_ERROR');
    expectError(await t.api('PATCH', '/api/me', { token: accessToken, body: { role: 'BOSS' } }), 400, 'VALIDATION_ERROR');
    expectError(await t.api('PATCH', '/api/me', { token: accessToken, body: { email: 'not-an-email' } }), 400, 'VALIDATION_ERROR');
    const me = await t.api('GET', '/api/me', { token: accessToken });
    assert.equal(me.body.data.role, 'ASSOCIATE');
  });

  it('PUT /api/me/password: 규칙 위반·틀린 현재 비밀번호는 400, 성공하면 다른 세션이 종료된다', async () => {
    const a = await t.login('associate2');
    const b = await t.login('associate2');
    const newPassword = 'ChangedPass99';

    expectError(await t.api('PUT', '/api/me/password', { token: a.accessToken, body: { currentPassword: config.seedPassword, newPassword: 'short1' } }), 400, 'VALIDATION_ERROR');
    expectError(await t.api('PUT', '/api/me/password', { token: a.accessToken, body: { currentPassword: config.seedPassword, newPassword: 'onlyletters' } }), 400, 'VALIDATION_ERROR');
    expectError(await t.api('PUT', '/api/me/password', { token: a.accessToken, body: { currentPassword: 'wrong', newPassword } }), 400, 'VALIDATION_ERROR');

    const res = await t.api('PUT', '/api/me/password', { token: a.accessToken, body: { currentPassword: config.seedPassword, newPassword } });
    assert.equal(res.status, 200, res.text);
    assert.ok(res.body.data.revokedSessionCount >= 1);
    expectError(await t.api('GET', '/api/me', { token: b.accessToken }), 401, 'UNAUTHENTICATED');
    assert.equal((await t.api('GET', '/api/me', { token: a.accessToken })).status, 200);
    await t.login('associate2', newPassword);

    // 시드 비밀번호로 되돌린다.
    const restore = await t.api('PUT', '/api/me/password', { token: a.accessToken, body: { currentPassword: newPassword, newPassword: config.seedPassword } });
    assert.equal(restore.status, 200, restore.text);
  });

  it('GET /api/me/permissions는 역할 정보와 허용된 권한 목록을 돌려준다', async () => {
    const { accessToken } = await t.login('admin');
    const res = await t.api('GET', '/api/me/permissions', { token: accessToken });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.roleLabel, 'Administrator');
    assert.equal(res.body.data.rank, null);
    assert.ok(res.body.data.permissions.some((p) => p.key === 'me.update'));
  });
});

describe('권한 검사 미들웨어 (NFR-03, BR-09)', () => {
  it('권한이 없는 역할은 403 FORBIDDEN이고 보안 이벤트가 기록된다', async () => {
    const app = express();
    app.get('/rbac-check', (req, res, next) => {
      req.user = { id: 990001, username: 'rbac-test', role: 'NO_SUCH_ROLE' };
      next();
    }, requirePermission('me.read'), (req, res) => res.json({ reached: true }));
    app.use(errorHandler);

    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/rbac-check`);
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.error.code, 'FORBIDDEN');
      assert.equal(body.error.details.permission, 'me.read');
    } finally {
      server.closeAllConnections();
      server.close();
    }

    const event = await SecurityEvent.findOne({ 'user.userId': 990001 }).sort({ createdAt: -1 }).lean();
    assert.equal(event.event, 'ACCESS_DENIED');
    assert.equal(event.path, '/rbac-check');
  });

  it('정의되지 않은 권한 키는 라우터를 만들 때 바로 오류가 난다', () => {
    assert.throws(() => requirePermission('no.such.permission'), /정의되지 않은 권한 키/);
  });
});

