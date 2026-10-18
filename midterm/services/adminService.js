// 관리자 기능 (FR-23, NFR-02, NFR-03, DR-01) — 계정 보안 현황·잠금·해제·임시 비밀번호·강제 로그아웃, 로그인 이력,
// 역할별 권한 관리, 운영 설정, 데이터 무결성 점검, DB 연결 상태. 모두 Administrator만 쓴다.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const config = require('../config');
const { getPool } = require('../config/database');
const userModel = require('../models/sql/userModel');
const sessionModel = require('../models/sql/sessionModel');
const integrityModel = require('../models/sql/integrityModel');
const LoginHistory = require('../models/mongo/LoginHistory');
const auditService = require('./auditService');
const permissionService = require('./permissionService');
const settings = require('./settingsService');
const { requireUser } = require('./lookup');
const P = require('./presenters');
const { ALL_ROLES, ROLE_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { contains, periodFilter, findPage } = require('../utils/mongo');

const { userTarget } = auditService;
// Administrator에게서 뺄 수 없는 권한 (빼면 아무도 권한을 되돌릴 수 없다)
const LOCKED_ADMIN_KEYS = ['admin.permissions'];

function assertNotSelf(actor, user, what) {
  if (actor.id === user.id) throw forbidden(`본인 계정은 ${what}할 수 없습니다.`);
}

// ---------------------------------------------------------------------------
// 계정

function presentAccount(u, sessionCount) {
  return {
    ...P.userBrief(u),
    lastLoginAt: u.lastLoginAt,
    failedLoginCount: u.failedLoginCount,
    locked: u.lockedAt !== null,
    lockedAt: u.lockedAt,
    lockedReason: u.lockedReason,
    passwordChangedAt: u.passwordChangedAt,
    activeSessionCount: sessionCount ?? 0,
    createdAt: u.createdAt,
  };
}

async function presentAccountById(userId) {
  const user = await userModel.findById(userId);
  return presentAccount(user, (await sessionModel.countActiveByUsers([userId])).get(userId));
}

// #199 계정 보안 현황 (마지막 로그인, 로그인 실패 횟수, 잠금 여부, 유효한 세션 수)
async function accounts(actor, query) {
  const { rows, total } = await userModel.searchAccounts(query);
  const sessions = await sessionModel.countActiveByUsers(rows.map((u) => u.id));
  return { data: rows.map((u) => presentAccount(u, sessions.get(u.id))), meta: pageMeta(query, total) };
}

// #200 계정 잠금: 로그인을 막고 모든 세션을 끊는다.
async function lock(actor, userId, { reason }, ctx) {
  const user = await requireUser(userId);
  assertNotSelf(actor, user, '잠금');
  if (user.lockedAt) throw conflict('이미 잠긴 계정입니다.', { lockedAt: user.lockedAt, lockedReason: user.lockedReason });
  await userModel.lock(userId, reason);
  const revoked = await sessionModel.revokeAllForUser(userId, 'ACCOUNT_LOCKED');
  await auditService.record({
    actor, action: 'ACCOUNT_LOCKED', target: userTarget(user), before: { locked: false }, after: { locked: true, revokedSessions: revoked }, reason, ip: ctx.ip,
  });
  return { ...(await presentAccountById(userId)), revokedSessionCount: revoked };
}

// #201 계정 잠금 해제 (로그인 실패 횟수도 0으로)
async function unlock(actor, userId, { reason }, ctx) {
  const user = await requireUser(userId);
  if (!user.lockedAt) throw conflict('잠기지 않은 계정입니다.');
  await userModel.unlock(userId);
  await auditService.record({
    actor, action: 'ACCOUNT_UNLOCKED', target: userTarget(user),
    before: { locked: true, lockedReason: user.lockedReason, failedLoginCount: user.failedLoginCount }, after: { locked: false }, reason, ip: ctx.ip,
  });
  return presentAccountById(userId);
}

// 영문 대소문자와 숫자가 섞인 12자 임시 비밀번호 (비밀번호 규칙을 만족한다)
function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 10 }, () => pick(letters + digits))];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// #202 임시 비밀번호 발급: 새 비밀번호를 정해 응답으로 한 번만 보여 주고, 기존 세션을 모두 끊는다.
async function resetPassword(actor, userId, { reason }, ctx) {
  const user = await requireUser(userId);
  assertNotSelf(actor, user, '비밀번호 초기화');
  const password = temporaryPassword();
  await userModel.updatePassword(userId, await bcrypt.hash(password, config.auth.bcryptRounds));
  const revoked = await sessionModel.revokeAllForUser(userId, 'PASSWORD_RESET');
  await auditService.record({ actor, action: 'PASSWORD_RESET', target: userTarget(user), after: { revokedSessions: revoked }, reason, ip: ctx.ip });
  return { user: P.userBrief(user), temporaryPassword: password, revokedSessionCount: revoked };
}

// #203 대상 계정 강제 로그아웃 (모든 세션 종료)
async function forceLogout(actor, userId, { reason }, ctx) {
  const user = await requireUser(userId);
  assertNotSelf(actor, user, '강제 로그아웃');
  const revoked = await sessionModel.revokeAllForUser(userId, 'FORCED_LOGOUT');
  await auditService.record({ actor, action: 'SESSIONS_FORCE_REVOKED', target: userTarget(user), after: { revokedSessions: revoked }, reason, ip: ctx.ip });
  return { user: P.userBrief(user), revokedSessionCount: revoked };
}

// #204 로그인 성공·실패 이력 (사용자, 아이디 검색어, 성공 여부, 실패 이유, 기간)
async function loginHistory(actor, { userId, q, success, reason, from, to, ...query }) {
  const filter = {
    ...(userId && { userId }),
    ...(q && { username: contains(q) }),
    ...(success !== undefined && { success }),
    ...(reason && { reason }),
    ...periodFilter('createdAt', from, to),
  };
  const { docs, total } = await findPage(LoginHistory, filter, { ...query, sort: { createdAt: -1, _id: -1 } });
  return {
    data: docs.map((d) => ({
      id: String(d._id), at: d.createdAt, userId: d.userId, username: d.username, success: d.success, reason: d.reason ?? null, ip: d.ip ?? null, userAgent: d.userAgent ?? null,
    })),
    meta: pageMeta(query, total),
  };
}

// ---------------------------------------------------------------------------
// 역할별 권한

// #205 역할별 권한 매트릭스 (지금 값과 기본값, 기본값과 다르면 overridden)
async function permissions() {
  const rows = await permissionService.matrix(ALL_ROLES);
  return {
    roles: ALL_ROLES.map((role) => ({ role, label: ROLE_INFO[role].label })),
    permissions: rows.map((r) => ({
      ...r,
      roles: Object.fromEntries(Object.entries(r.roles).map(([role, v]) => [role, { ...v, overridden: v.allowed !== v.default }])),
    })),
  };
}

// #206 한 역할의 권한을 통째로 바꾼다 (RBAC 미들웨어에 즉시 반영). 모르는 키는 400, Administrator의 권한 관리 권한은 뺄 수 없다(409).
async function setRolePermissions(actor, role, { keys, reason }, ctx) {
  const unknown = keys.filter((k) => !permissionService.DEFAULT_PERMISSIONS[k]);
  if (unknown.length > 0) {
    throw badRequest(`정의되지 않은 권한 키가 있습니다: ${unknown.join(', ')}`, unknown.map((k) => ({ field: 'body.keys', message: `알 수 없는 키: ${k}` })));
  }
  if (role === 'ADMIN' && LOCKED_ADMIN_KEYS.some((k) => !keys.includes(k))) {
    throw conflict('Administrator에게서 역할별 권한 관리 권한(admin.permissions)은 뺄 수 없습니다.', { keys: LOCKED_ADMIN_KEYS });
  }
  const before = (await permissionService.listFor(role)).map((p) => p.key);
  const overrides = await permissionService.replaceRole(role, [...new Set(keys)], actor.id);
  const after = (await permissionService.listFor(role)).map((p) => p.key);
  await auditService.record({
    actor, action: 'PERMISSIONS_UPDATED', target: { entity: 'role', id: role, label: ROLE_INFO[role].label },
    before: { granted: before.filter((k) => !after.includes(k)) }, after: { granted: after.filter((k) => !before.includes(k)), overrides: overrides.length }, reason, ip: ctx.ip,
  });
  const matrix = await permissions();
  return {
    role,
    roleLabel: ROLE_INFO[role].label,
    allowed: after,
    overrides: overrides.map((o) => ({ key: o.key, allowed: o.allowed })),
    added: after.filter((k) => !before.includes(k)),
    removed: before.filter((k) => !after.includes(k)),
    permissions: matrix.permissions.map((p) => ({ key: p.key, description: p.description, ...p.roles[role] })),
  };
}

// ---------------------------------------------------------------------------
// 운영 설정

// #207 운영 설정 조회 (값, 기본값, 허용 범위, 마지막 변경)
const getSettings = () => settings.describe();

// #208 운영 설정 변경 (보낸 항목만 바꾼다)
async function updateSettings(actor, { settings: changes, reason }, ctx) {
  const defs = settings.SETTINGS;
  const errors = [];
  for (const [key, value] of Object.entries(changes)) {
    const def = defs[key];
    if (!def) errors.push({ field: `body.settings.${key}`, message: '알 수 없는 설정 항목입니다.' });
    else if (!Number.isInteger(value) || value < def.min || value > def.max) {
      errors.push({ field: `body.settings.${key}`, message: `${def.label}은(는) ${def.min}~${def.max} 사이의 정수여야 합니다.` });
    }
  }
  if (errors.length > 0) throw badRequest('운영 설정 값이 올바르지 않습니다.', errors);
  if (Object.keys(changes).length === 0) throw badRequest('바꿀 설정 항목을 보내세요.', [{ field: 'body.settings', message: '1개 이상 필요합니다.' }]);
  const current = await settings.all();
  const changed = Object.fromEntries(Object.entries(changes).filter(([key, value]) => current[key] !== value));
  if (Object.keys(changed).length === 0) throw conflict('바뀐 설정이 없습니다.');
  await settings.save(changed, actor.id);
  await auditService.record({
    actor, action: 'SETTINGS_UPDATED', target: { entity: 'settings', id: 'system', label: '운영 설정' },
    before: Object.fromEntries(Object.keys(changed).map((k) => [k, current[k]])), after: changed, reason, ip: ctx.ip,
  });
  return getSettings();
}

// ---------------------------------------------------------------------------
// 점검·상태

const CHECKS = [
  { key: 'multipleRegularMemberships', label: '둘 이상의 Crew에 정식 소속된 구성원', rule: 'BR-01', run: integrityModel.multipleRegularMemberships },
  { key: 'capoNotRegularMember', label: '자기 Crew의 정식 소속원이 아닌 책임자', rule: 'DR-01', run: integrityModel.capoNotRegularMember },
  { key: 'overlappingAssignments', label: '같은 시간대 끝나지 않은 업무에 중복 배정된 구성원', rule: 'BR-03', run: integrityModel.overlappingAssignments },
  { key: 'overlappingReservations', label: '같은 시간대에 중복 예약된 자원', rule: 'BR-07', run: integrityModel.overlappingReservations },
  { key: 'resourceStatusMismatch', label: '사용 기록과 상태가 맞지 않는 자원', rule: 'DR-03', run: integrityModel.resourceStatusMismatch },
];

// #209 데이터 무결성 점검: 규칙이 깨진 데이터가 있는지 SQL로 찾는다 (정상이면 모든 항목 0건).
async function integrityCheck() {
  const results = [];
  for (const c of CHECKS) {
    const items = await c.run();
    results.push({ key: c.key, label: c.label, rule: c.rule, ok: items.length === 0, count: items.length, items: items.slice(0, 50) });
  }
  return { checkedAt: new Date(), ok: results.every((r) => r.ok), checks: results };
}

async function timed(fn) {
  const started = process.hrtime.bigint();
  try {
    await fn();
    return { ok: true, latencyMs: Number((process.hrtime.bigint() - started) / 1000000n) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// #210 SQL·MongoDB 연결 상태와 응답 시간, 서버 가동 시간
async function health() {
  const [mysql, mongodb] = await Promise.all([
    timed(() => getPool().query('SELECT 1')),
    timed(() => mongoose.connection.db.admin().ping()),
  ]);
  return {
    status: mysql.ok && mongodb.ok ? 'ok' : 'degraded',
    mysql: { ...mysql, database: config.mysql.database },
    mongodb: { ...mongodb, database: mongoose.connection.name, state: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' },
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    checkedAt: new Date(),
  };
}

module.exports = {
  LOCKED_ADMIN_KEYS,
  accounts, lock, unlock, resetPassword, forceLogout, loginHistory,
  permissions, setRolePermissions, getSettings, updateSettings, integrityCheck, health,
};
