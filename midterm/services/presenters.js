// DB 객체를 API 응답 형태로 바꾼다. 비밀번호 해시 같은 내부 값은 여기서 걸러진다.
const { ROLE_INFO, MEMBER_STATUS_INFO } = require('../config/constants');

function presentUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    nickname: user.nickname,
    phone: user.phone,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    rank: ROLE_INFO[user.role].rank,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function presentSession(session, currentSessionId) {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
  };
}

module.exports = { presentUser, presentSession };
