// DB 객체를 API 응답 형태로 바꾼다. 비밀번호 해시 같은 내부 값은 여기서 걸러진다.
// refs: services/refs.js의 loadRefs 결과 ({ users: Map, crews: Map })
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO,
} = require('../config/constants');

const labelOf = (info, key) => (key ? info[key].label : null);

// 본인 정보(로그인 응답, /api/me)의 기본 형태
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

// 다른 구성원 정보. visibility: basic(누구나) < contact(+연락처) < full(+계정 시각 정보)
function presentUserFor(user, visibility, extra = {}) {
  const view = {
    id: user.id,
    username: user.username,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    rank: ROLE_INFO[user.role].rank,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
  };
  if (visibility !== 'basic') Object.assign(view, { phone: user.phone, email: user.email });
  if (visibility === 'full') Object.assign(view, { lastLoginAt: user.lastLoginAt, createdAt: user.createdAt, updatedAt: user.updatedAt });
  return { ...view, ...extra, visibility };
}

// 다른 객체 안에 들어가는 구성원 요약
function userBrief(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
  };
}

function crewBrief(crew) {
  if (!crew) return null;
  return { id: crew.id, name: crew.name, region: crew.region, status: crew.status, statusLabel: CREW_STATUS_INFO[crew.status].label };
}

function presentCrew(crew, refs, counts = { memberCount: 0, regularCount: 0, temporaryCount: 0 }) {
  return {
    id: crew.id,
    name: crew.name,
    region: crew.region,
    description: crew.description,
    status: crew.status,
    statusLabel: CREW_STATUS_INFO[crew.status].label,
    capo: userBrief(refs.users.get(crew.capoId)),
    underboss: userBrief(refs.users.get(crew.underbossId)),
    ...counts,
    createdAt: crew.createdAt,
    updatedAt: crew.updatedAt,
    disbandedAt: crew.disbandedAt,
  };
}

function presentMembership(m, refs, extra = {}) {
  return {
    id: m.id,
    active: m.leftAt === null,
    crew: crewBrief(refs.crews.get(m.crewId)),
    user: userBrief(refs.users.get(m.userId)),
    type: m.type,
    typeLabel: labelOf(MEMBERSHIP_TYPE_INFO, m.type),
    joinMethod: m.joinMethod,
    joinMethodLabel: labelOf(JOIN_METHOD_INFO, m.joinMethod),
    fromCrew: crewBrief(refs.crews.get(m.fromCrewId)),
    joinedAt: m.joinedAt,
    addedBy: userBrief(refs.users.get(m.addedBy)),
    leftAt: m.leftAt,
    endReason: m.endReason,
    endReasonLabel: labelOf(MEMBERSHIP_END_REASON_INFO, m.endReason),
    toCrew: crewBrief(refs.crews.get(m.toCrewId)),
    endedBy: userBrief(refs.users.get(m.endedBy)),
    note: m.note,
    ...extra,
  };
}

const membershipRefIds = (rows) => ({
  userIds: rows.flatMap((m) => [m.userId, m.addedBy, m.endedBy]),
  crewIds: rows.flatMap((m) => [m.crewId, m.fromCrewId, m.toCrewId]),
});

function presentCapoTerm(t, refs) {
  return {
    id: t.id,
    active: t.endedAt === null,
    capo: userBrief(refs.users.get(t.userId)),
    startedAt: t.startedAt,
    assignedBy: userBrief(refs.users.get(t.assignedBy)),
    reason: t.reason,
    endedAt: t.endedAt,
    endReason: t.endReason,
    endReasonLabel: labelOf(CAPO_TERM_END_REASON_INFO, t.endReason),
    endedBy: userBrief(refs.users.get(t.endedBy)),
  };
}

function presentJoinRequest(r, refs) {
  return {
    id: r.id,
    crew: crewBrief(refs.crews.get(r.crewId)),
    applicant: userBrief(refs.users.get(r.userId)),
    type: r.type,
    typeLabel: labelOf(MEMBERSHIP_TYPE_INFO, r.type),
    message: r.message,
    status: r.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, r.status),
    decidedBy: userBrief(refs.users.get(r.decidedBy)),
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    membershipId: r.membershipId,
    createdAt: r.createdAt,
  };
}

function presentRoleRequest(r, refs) {
  return {
    id: r.id,
    user: userBrief(refs.users.get(r.userId)),
    fromRole: r.fromRole,
    fromRoleLabel: labelOf(ROLE_INFO, r.fromRole),
    toRole: r.toRole,
    toRoleLabel: labelOf(ROLE_INFO, r.toRole),
    reason: r.reason,
    status: r.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, r.status),
    requestedBy: userBrief(refs.users.get(r.requestedBy)),
    decidedBy: userBrief(refs.users.get(r.decidedBy)),
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    createdAt: r.createdAt,
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

module.exports = {
  labelOf,
  presentUser,
  presentUserFor,
  userBrief,
  crewBrief,
  presentCrew,
  presentMembership,
  membershipRefIds,
  presentCapoTerm,
  presentJoinRequest,
  presentRoleRequest,
  presentSession,
};
