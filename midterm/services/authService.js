// 로그인·토큰·세션 (FR-02, NFR-03).
// 액세스 토큰: JWT(1시간). 리프레시 토큰: 임의 문자열(14일), DB에는 SHA-256 해시만 저장하고 재발급할 때마다 교체한다.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userModel = require('../models/sql/userModel');
const sessionModel = require('../models/sql/sessionModel');
const auditService = require('./auditService');
const settings = require('./settingsService');
const { presentUser, presentSession } = require('./presenters');
const { SIGN_IN_BLOCKED_STATUSES, MEMBER_STATUS_INFO } = require('../config/constants');
const { unauthenticated, forbidden } = require('../utils/errors');

// 없는 아이디로 로그인해도 비밀번호 비교 시간을 똑같이 써서 아이디 존재 여부가 드러나지 않게 한다.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', config.auth.bcryptRounds);
const LOGIN_FAILED = '아이디 또는 비밀번호가 올바르지 않습니다.';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newRefreshToken = () => crypto.randomBytes(32).toString('base64url');
const refreshExpiry = () => new Date(Date.now() + config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

// 로그인할 수 없는 계정이면 이유를 돌려준다.
function signInBlock(user) {
  if (user.lockedAt) return { reason: 'ACCOUNT_LOCKED', message: '잠긴 계정입니다. 관리자에게 문의해 주세요.' };
  if (SIGN_IN_BLOCKED_STATUSES.includes(user.status)) {
    return {
      reason: `ACCOUNT_${user.status}`,
      message: `${MEMBER_STATUS_INFO[user.status].label} 상태의 계정은 사용할 수 없습니다.`,
    };
  }
  return null;
}

function assertCanSignIn(user) {
  if (!user) throw unauthenticated('존재하지 않는 계정입니다. 다시 로그인해 주세요.');
  const block = signInBlock(user);
  if (block) throw forbidden(block.message, { reason: block.reason });
}

// FR-23: 연속 실패가 운영 설정의 잠금 기준(loginLockThreshold, 0이면 끔)에 이르면 계정을 잠그고 세션을 끊는다.
async function lockAfterFailures(user, ctx) {
  const threshold = await settings.get('loginLockThreshold');
  const failures = user.failedLoginCount + 1;
  if (threshold === 0 || user.lockedAt || failures < threshold) return;
  const reason = `로그인 ${failures}회 연속 실패로 자동 잠금`;
  await userModel.lock(user.id, reason);
  await sessionModel.revokeAllForUser(user.id, 'ACCOUNT_LOCKED');
  await auditService.record({
    action: 'ACCOUNT_LOCKED', target: auditService.userTarget(user), after: { lockedReason: reason, failedLoginCount: failures }, reason, ip: ctx.ip,
  });
}

function issueTokens(user, sessionId, refreshToken, refreshTokenExpiresAt) {
  const ttl = config.auth.accessTokenTtlSeconds;
  const accessToken = jwt.sign({ sid: sessionId }, config.auth.jwtSecret, { subject: String(user.id), expiresIn: ttl });
  return { tokenType: 'Bearer', accessToken, expiresIn: ttl, refreshToken, refreshTokenExpiresAt, sessionId };
}

async function login({ username, password }, ctx) {
  const user = await userModel.findByUsername(username);
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) {
    if (user) await userModel.recordLoginFailure(user.id);
    await auditService.recordLogin({
      user, username, success: false, reason: user ? 'WRONG_PASSWORD' : 'UNKNOWN_USERNAME', ...ctx,
    });
    if (user) await lockAfterFailures(user, ctx);
    throw unauthenticated(LOGIN_FAILED);
  }

  const block = signInBlock(user);
  if (block) {
    await auditService.recordLogin({ user, username, success: false, reason: block.reason, ...ctx });
    throw forbidden(block.message, { reason: block.reason });
  }

  const sessionId = crypto.randomUUID();
  const refreshToken = newRefreshToken();
  const expiresAt = refreshExpiry();
  await sessionModel.create({ id: sessionId, userId: user.id, refreshTokenHash: hashToken(refreshToken), expiresAt, ...ctx });
  await userModel.recordLoginSuccess(user.id);
  await auditService.recordLogin({ user, username, success: true, ...ctx });

  return { ...issueTokens(user, sessionId, refreshToken, expiresAt), user: presentUser(await userModel.findById(user.id)) };
}

async function refresh({ refreshToken }, ctx) {
  const session = await sessionModel.findActiveByTokenHash(hashToken(refreshToken));
  if (!session) throw unauthenticated('유효하지 않거나 만료된 리프레시 토큰입니다. 다시 로그인해 주세요.');

  const user = await userModel.findById(session.userId);
  const block = user && signInBlock(user);
  if (!user || block) {
    await sessionModel.revoke(session.id, 'ACCOUNT_BLOCKED');
    assertCanSignIn(user);
  }

  const nextToken = newRefreshToken();
  const expiresAt = refreshExpiry();
  await sessionModel.rotate(session.id, { refreshTokenHash: hashToken(nextToken), expiresAt, ...ctx });
  return issueTokens(user, session.id, nextToken, expiresAt);
}

async function logout(user, sessionId) {
  await sessionModel.revoke(sessionId, 'LOGOUT');
  return { sessionId, revoked: true };
}

async function listSessions(user, currentSessionId) {
  const sessions = await sessionModel.listActiveByUser(user.id);
  return sessions.map((s) => presentSession(s, currentSessionId));
}

async function revokeAllSessions(user, ctx) {
  const revokedCount = await sessionModel.revokeAllForUser(user.id, 'LOGOUT_ALL');
  await auditService.record({
    actor: user,
    action: 'USER_SESSIONS_REVOKED',
    target: auditService.userTarget(user),
    after: { revokedCount },
    reason: '본인 요청으로 모든 세션 종료',
    ip: ctx.ip,
  });
  return { revokedCount };
}

module.exports = { assertCanSignIn, login, refresh, logout, listSessions, revokeAllSessions };
