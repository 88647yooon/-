// 내 정보 조회·수정, 비밀번호 변경, 사용 가능 기능 조회 (FR-01, FR-02).
const bcrypt = require('bcryptjs');
const config = require('../config');
const { withTransaction } = require('../config/database');
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const sessionModel = require('../models/sql/sessionModel');
const auditService = require('./auditService');
const permissionService = require('./permissionService');
const { loadRefs } = require('./refs');
const { presentUser, userBrief, crewBrief } = require('./presenters');
const { ROLE_INFO } = require('../config/constants');
const { badRequest } = require('../utils/errors');

// 내 계정 정보와 현재 소속(정식 Crew와 그 책임자, 임시 소속), 내가 맡은 Crew
async function getMe(user) {
  const [me, memberships, capoOf, underbossOf] = await Promise.all([
    userModel.findById(user.id),
    membershipModel.listActiveByUser(user.id),
    crewModel.findByCapo(user.id),
    crewModel.listByUnderboss(user.id),
  ]);
  const refs = await loadRefs({ crewIds: memberships.map((m) => m.crewId) });
  const regular = memberships.find((m) => m.type === 'REGULAR');
  const regularCrew = regular ? refs.crews.get(regular.crewId) : null;
  const capo = regularCrew?.capoId ? await userModel.findById(regularCrew.capoId) : null;

  return {
    ...presentUser(me),
    crew: regular ? { ...crewBrief(regularCrew), membershipId: regular.id, joinedAt: regular.joinedAt, capo: userBrief(capo) } : null,
    temporaryCrews: memberships
      .filter((m) => m.type === 'TEMPORARY')
      .map((m) => ({ ...crewBrief(refs.crews.get(m.crewId)), membershipId: m.id, joinedAt: m.joinedAt })),
    leadership: { capoOf: crewBrief(capoOf), underbossOf: underbossOf.map(crewBrief) },
  };
}

async function updateMe(user, changes, ctx) {
  const current = await userModel.findById(user.id);
  const before = {};
  const after = {};
  for (const [key, value] of Object.entries(changes)) {
    if (current[key] !== value) {
      before[key] = current[key];
      after[key] = value;
    }
  }

  if (Object.keys(after).length > 0) {
    await userModel.updateProfile(user.id, after);
    await auditService.record({
      actor: user, action: 'USER_PROFILE_UPDATED', target: auditService.userTarget(current), before, after, ip: ctx.ip,
    });
  }
  return getMe(user);
}

// 비밀번호를 바꾸면 지금 쓰는 세션만 남기고 다른 기기의 세션은 모두 종료한다.
async function changePassword(user, sessionId, { currentPassword, newPassword }, ctx) {
  const current = await userModel.findById(user.id);
  if (!(await bcrypt.compare(currentPassword, current.passwordHash))) {
    const message = '현재 비밀번호가 일치하지 않습니다.';
    throw badRequest(message, [{ field: 'body.currentPassword', message }]);
  }
  if (currentPassword === newPassword) {
    const message = '새 비밀번호는 현재 비밀번호와 달라야 합니다.';
    throw badRequest(message, [{ field: 'body.newPassword', message }]);
  }

  const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);
  const revokedSessionCount = await withTransaction(async (conn) => {
    await userModel.updatePassword(user.id, passwordHash, conn);
    return sessionModel.revokeAllForUser(user.id, 'PASSWORD_CHANGED', { exceptId: sessionId }, conn);
  });

  await auditService.record({
    actor: user,
    action: 'USER_PASSWORD_CHANGED',
    target: auditService.userTarget(current),
    after: { revokedSessionCount },
    ip: ctx.ip,
  });

  const updated = await userModel.findById(user.id);
  return { passwordChangedAt: updated.passwordChangedAt, revokedSessionCount };
}

async function getPermissions(user) {
  const info = ROLE_INFO[user.role];
  return {
    role: user.role,
    roleLabel: info.label,
    rank: info.rank,
    roleDescription: info.description,
    permissions: await permissionService.listFor(user.role),
  };
}

module.exports = { getMe, updateMe, changePassword, getPermissions };
