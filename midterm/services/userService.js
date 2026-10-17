// 구성원 관리 (FR-01~FR-05, BR-04, BR-10)
const bcrypt = require('bcryptjs');
const config = require('../config');
const { withTransaction } = require('../config/database');
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const sessionModel = require('../models/sql/sessionModel');
const joinRequestModel = require('../models/sql/joinRequestModel');
const roleRequestModel = require('../models/sql/roleRequestModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const swapRequestModel = require('../models/sql/swapRequestModel');
const allocationModel = require('../models/sql/resourceAllocationModel');
const resourceRequestModel = require('../models/sql/resourceRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const { requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const {
  ROLE_INFO, MEMBER_STATUS_INFO, MEMBERSHIP_TYPE_INFO, CREW_MEMBER_ROLES, SIGN_IN_BLOCKED_STATUSES,
} = require('../config/constants');
const { forbidden, conflict, bulkRejected } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { changedFields } = require('../utils/diff');

const { userTarget, crewTarget } = auditService;
const snapshot = (u) => ({ username: u.username, name: u.name, role: u.role, status: u.status });

// ---------------------------------------------------------------------------
// 등록·조회

// #10 구성원 등록. 처음에는 Associate·대기 상태로 만든다. 역할·상태는 별도 API로 바꾼다.
async function create(actor, input, ctx) {
  if (await userModel.findByUsername(input.username)) {
    throw conflict('이미 사용 중인 아이디입니다.', { field: 'body.username' }, 'DUPLICATE');
  }
  const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);
  const id = await userModel.insert({ ...input, passwordHash, role: 'ASSOCIATE', status: 'PENDING' });
  const user = await userModel.findById(id);
  await auditService.record({ actor, action: 'USER_CREATED', target: userTarget(user), after: snapshot(user), ip: ctx.ip });
  return detailView(actor, user);
}

// #11 일괄 등록. 아이디 중복이 하나라도 있으면 아무것도 등록하지 않는다.
async function bulkCreate(actor, { users }, ctx) {
  const errors = [];
  const firstIndex = new Map();
  users.forEach((u, index) => {
    if (firstIndex.has(u.username)) {
      errors.push({ index, username: u.username, code: 'DUPLICATE', message: `${firstIndex.get(u.username) + 1}번째 항목과 아이디가 같습니다.` });
    } else {
      firstIndex.set(u.username, index);
    }
  });
  for (const existing of await userModel.findByUsernames([...firstIndex.keys()])) {
    errors.push({ index: firstIndex.get(existing.username), username: existing.username, code: 'DUPLICATE', message: '이미 사용 중인 아이디입니다.' });
  }
  if (errors.length > 0) throw bulkRejected(users.length, errors.sort((a, b) => a.index - b.index));

  const rows = await Promise.all(users.map(async (u) => ({
    ...u, passwordHash: await bcrypt.hash(u.password, config.auth.bcryptRounds), role: 'ASSOCIATE', status: 'PENDING',
  })));
  const created = await withTransaction(async (conn) => {
    await userModel.insertMany(rows, conn);
    return userModel.findByUsernames(users.map((u) => u.username), conn);
  });

  await auditService.recordMany(created.map((u) => ({
    actor, action: 'USER_CREATED', target: userTarget(u), after: snapshot(u), reason: '일괄 등록', ip: ctx.ip,
  })));
  return { createdCount: created.length, users: created.map((u) => P.presentUserFor(u, 'full', { crew: null })) };
}

// #12 구성원 목록
async function list(actor, query) {
  const { rows, total } = await userModel.search(query);
  const contactIds = await access.contactIdsFor(actor);
  const refs = await loadRefs({ crewIds: rows.map((u) => u.regularCrewId) });
  return {
    data: rows.map((u) => P.presentUserFor(u, access.visibilityOf(actor, u, contactIds), {
      crew: P.crewBrief(refs.crews.get(u.regularCrewId)),
    })),
    meta: pageMeta(query, total),
  };
}

// #13 아이디 사용 가능 여부
async function checkUsername({ username }) {
  return { username, available: !(await userModel.findByUsername(username)) };
}

// 구성원 상세: 현재 소속과 맡은 Crew까지 보여 준다.
async function detailView(viewer, user, contactIds) {
  const [memberships, capoOf, underbossOf] = await Promise.all([
    membershipModel.listActiveByUser(user.id),
    crewModel.findByCapo(user.id),
    crewModel.listByUnderboss(user.id),
  ]);
  const refs = await loadRefs({ crewIds: memberships.map((m) => m.crewId) });
  const regular = memberships.find((m) => m.type === 'REGULAR');
  return P.presentUserFor(user, access.visibilityOf(viewer, user, contactIds), {
    crew: regular ? P.crewBrief(refs.crews.get(regular.crewId)) : null,
    currentMemberships: memberships.map((m) => ({
      membershipId: m.id,
      crew: P.crewBrief(refs.crews.get(m.crewId)),
      type: m.type,
      typeLabel: MEMBERSHIP_TYPE_INFO[m.type].label,
      joinedAt: m.joinedAt,
    })),
    leadership: { capoOf: P.crewBrief(capoOf), underbossOf: underbossOf.map(P.crewBrief) },
  });
}

// #14 구성원 상세. Associate는 본인 정보만 볼 수 있다.
async function get(actor, userId) {
  if (actor.role === 'ASSOCIATE' && actor.id !== userId) {
    throw forbidden('Associate는 본인 정보만 조회할 수 있습니다.');
  }
  const user = await requireUser(userId);
  return detailView(actor, user, await access.contactIdsFor(actor));
}

// ---------------------------------------------------------------------------
// 수정·삭제

// #15 기본 정보 수정 (BR-04 순위, BR-05 범위)
async function update(actor, userId, changes, ctx) {
  const target = await requireUser(userId);
  await access.assertCanManageUser(actor, target, { allowAdmin: true });
  if (target.status === 'WITHDRAWN') throw conflict('탈퇴한 구성원의 정보는 바꿀 수 없습니다.');

  const { before, after, changed } = changedFields(target, changes);
  if (changed) {
    await userModel.updateBasic(userId, after);
    await auditService.record({ actor, action: 'USER_UPDATED', target: userTarget(target), before, after, ip: ctx.ip });
  }
  return get(actor, userId);
}

// #16 삭제. 잘못 등록된 계정만 지울 수 있고, 활동 기록이 있으면 탈퇴 처리를 안내한다.
async function remove(actor, userId, ctx) {
  if (actor.id === userId) throw forbidden('본인 계정은 삭제할 수 없습니다.');
  const target = await requireUser(userId);
  const usage = await userModel.activitySummary(userId);
  if (target.lastLoginAt || Object.values(usage).some((n) => n > 0)) {
    throw conflict('활동 기록이 있는 구성원은 삭제할 수 없습니다. 상태를 탈퇴(WITHDRAWN)로 바꿔 주세요.',
      { lastLoginAt: target.lastLoginAt, ...usage });
  }
  await userModel.remove(userId);
  await auditService.record({ actor, action: 'USER_DELETED', target: userTarget(target), before: snapshot(target), ip: ctx.ip });
  return { id: userId, deleted: true };
}

// ---------------------------------------------------------------------------
// 역할·상태 변경

// 역할을 바꿔도 Crew 구조가 어긋나지 않는지 확인한다.
// 책임자(Capo)·담당 Underboss로 지정된 구성원은 먼저 지정을 해제해야 하고,
// Crew에 소속된 구성원은 Crew 소속이 불가능한 역할(Underboss·Boss·Administrator)이 될 수 없다.
async function assertRoleConsistent(conn, target, newRole) {
  const capoOf = await crewModel.findByCapo(target.id, conn);
  if (capoOf && newRole !== 'CAPO') {
    throw conflict(`'${capoOf.name}' Crew의 책임자로 지정되어 있어 역할을 바꿀 수 없습니다. 먼저 책임자를 해제하세요.`,
      { crewId: capoOf.id });
  }
  const underbossOf = await crewModel.listByUnderboss(target.id, conn);
  if (underbossOf.length > 0 && newRole !== 'UNDERBOSS') {
    throw conflict('담당 Underboss로 지정된 Crew가 있어 역할을 바꿀 수 없습니다. 먼저 다른 Underboss를 지정하세요.',
      { crewIds: underbossOf.map((c) => c.id) });
  }
  if (!CREW_MEMBER_ROLES.includes(newRole) && (await membershipModel.listActiveByUser(target.id, conn)).length > 0) {
    throw conflict(`Crew에 소속된 구성원은 ${ROLE_INFO[newRole].label} 역할이 될 수 없습니다. 먼저 Crew 소속을 종료하세요.`);
  }
}

// 역할 변경의 공통 처리. 직접 변경(#17)과 역할 변경 요청 승인(#54)이 함께 쓴다.
async function applyRoleChange(conn, actor, target, newRole) {
  if (target.status === 'WITHDRAWN') throw conflict('탈퇴한 구성원의 역할은 바꿀 수 없습니다.');
  if (target.role === newRole) throw conflict(`이미 ${ROLE_INFO[newRole].label} 역할입니다.`);
  access.assertCanChangeRole(actor, target, newRole);
  await assertRoleConsistent(conn, target, newRole);
  await userModel.updateRole(target.id, newRole, conn);
}

// #17 역할 변경 (FR-03, BR-04)
async function changeRole(actor, userId, { role, reason }, ctx) {
  const target = await withTransaction(async (conn) => {
    const user = await requireUser(userId, conn, { forUpdate: true });
    await applyRoleChange(conn, actor, user, role);
    return user;
  });
  await auditService.record({
    actor, action: 'USER_ROLE_CHANGED', target: userTarget(target),
    before: { role: target.role }, after: { role }, reason, ip: ctx.ip,
  });
  return get(actor, userId);
}

// #18 상태 변경 (FR-03, FR-04). 탈퇴하면 모든 Crew 소속, 끝나지 않은 업무 배정·자원 배정, 대기 중인 신청·요청을 정리한다.
async function changeStatus(actor, userId, { status, reason }, ctx) {
  const { target, ended, releasedTasks, releasedResources } = await withTransaction(async (conn) => {
    const user = await requireUser(userId, conn, { forUpdate: true });
    await access.assertCanManageUser(actor, user, { db: conn });

    const from = MEMBER_STATUS_INFO[user.status];
    if (user.status === status) throw conflict(`이미 ${from.label} 상태입니다.`);
    if (!from.next.includes(status)) {
      throw conflict(`${from.label} 상태에서 ${MEMBER_STATUS_INFO[status].label} 상태로 바꿀 수 없습니다.`,
        { from: user.status, to: status, allowed: from.next });
    }

    let memberships = [];
    let assignments = [];
    let allocations = [];
    if (status === 'WITHDRAWN') {
      const capoOf = await crewModel.findByCapo(userId, conn);
      if (capoOf) throw conflict(`'${capoOf.name}' Crew의 책임자는 탈퇴 처리할 수 없습니다. 먼저 책임자를 해제하세요.`, { crewId: capoOf.id });
      if ((await crewModel.listByUnderboss(userId, conn)).length > 0) {
        throw conflict('담당 Underboss로 지정된 Crew가 있어 탈퇴 처리할 수 없습니다. 먼저 다른 Underboss를 지정하세요.');
      }
      memberships = await membershipModel.listActiveByUser(userId, conn);
      for (const m of memberships) await membershipModel.end(m.id, { reason: 'WITHDRAWN', endedBy: actor.id }, conn);
      await joinRequestModel.cancelPending({ userId }, { reason: '구성원 탈퇴', decidedBy: actor.id }, conn);
      await roleRequestModel.rejectPendingByUser(userId, { reason: '대상 구성원 탈퇴', decidedBy: actor.id }, conn);
      assignments = await taskAssigneeModel.releaseOpenByUser(userId, { reason: 'WITHDRAWN', releasedBy: actor.id }, conn);
      await swapRequestModel.cancelPending({ userId }, { reason: '구성원 탈퇴', decidedBy: actor.id }, conn);
      allocations = await allocationModel.releaseOpenByUser(userId, { reason: 'WITHDRAWN', releasedBy: actor.id }, conn);
      await resourceRequestModel.cancelPendingByUser(userId, { reason: '구성원 탈퇴', decidedBy: actor.id }, conn);
    }

    await userModel.updateStatus(userId, status, conn);
    // 정지·탈퇴된 계정은 로그인 상태도 바로 끊는다.
    if (SIGN_IN_BLOCKED_STATUSES.includes(status)) {
      await sessionModel.revokeAllForUser(userId, `STATUS_${status}`, {}, conn);
    }
    return { target: user, ended: memberships, releasedTasks: assignments, releasedResources: allocations };
  });

  const refs = await loadRefs({
    crewIds: ended.map((m) => m.crewId), taskIds: releasedTasks.map((a) => a.taskId), resourceIds: releasedResources.map((a) => a.resourceId),
  });
  await auditService.recordMany([
    { actor, action: 'USER_STATUS_CHANGED', target: userTarget(target), before: { status: target.status }, after: { status }, reason, ip: ctx.ip },
    ...ended.map((m) => ({
      actor, action: 'MEMBERSHIP_ENDED', target: userTarget(target), related: [crewTarget(refs.crews.get(m.crewId))],
      before: { crewId: m.crewId, type: m.type }, after: { endReason: 'WITHDRAWN' }, ip: ctx.ip,
    })),
    ...releasedTasks.map((a) => ({
      actor, action: 'ASSIGNEE_REMOVED', target: auditService.taskTarget(refs.tasks.get(a.taskId)), related: [userTarget(target)],
      before: { userId: target.id, role: a.role }, after: { releaseReason: 'WITHDRAWN' }, ip: ctx.ip,
    })),
    ...releasedResources.map((a) => ({
      actor, action: 'RESOURCE_ALLOCATION_CANCELLED', target: auditService.resourceTarget(refs.resources.get(a.resourceId)), related: [userTarget(target)],
      before: { allocationId: a.id, startAt: a.startAt, endAt: a.endAt }, after: { releaseReason: 'WITHDRAWN' }, ip: ctx.ip,
    })),
  ]);
  return get(actor, userId);
}

// ---------------------------------------------------------------------------
// 소속·지휘 계통

// #19 소속 이력 (종료된 소속 포함)
async function memberships(actor, userId, query) {
  const target = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, target);
  const { rows, total } = await membershipModel.searchByUser(userId, query);
  const refs = await loadRefs(P.membershipRefIds(rows));
  return { data: rows.map((m) => P.presentMembership(m, refs)), meta: pageMeta(query, total) };
}

// #20 지휘 하위 구성원. Boss는 조직 전체, Underboss는 담당 Crew들, Capo는 자신의 Crew 소속원.
async function subordinates(actor, userId, query) {
  if (actor.id !== userId && !access.isOrgManager(actor)) {
    throw forbidden('본인 또는 Underboss·Boss만 조회할 수 있습니다.');
  }
  const target = await requireUser(userId);
  const contactIds = await access.contactIdsFor(actor);
  const view = (user, extra) => P.presentUserFor(user, access.visibilityOf(actor, user, contactIds), extra);

  if (target.role === 'BOSS') {
    const { rows, total } = await userModel.search({
      ...query, excludeRoles: ['ADMIN'], excludeStatuses: ['WITHDRAWN'], excludeUserId: userId,
    });
    const refs = await loadRefs({ crewIds: rows.map((u) => u.regularCrewId) });
    return {
      data: rows.map((u) => ({ relation: 'ORGANIZATION', user: view(u, { crew: P.crewBrief(refs.crews.get(u.regularCrewId)) }) })),
      meta: pageMeta(query, total),
    };
  }

  let crews = [];
  if (target.role === 'UNDERBOSS') crews = (await crewModel.listByUnderboss(userId)).filter((c) => c.status === 'ACTIVE');
  if (target.role === 'CAPO') crews = [await crewModel.findByCapo(userId)].filter(Boolean);

  const { rows, total } = await membershipModel.searchActiveMembers(crews.map((c) => c.id), { ...query, excludeUserId: userId });
  const crewById = new Map(crews.map((c) => [c.id, c]));
  const refs = await loadRefs({ userIds: rows.map((m) => m.userId) });
  return {
    data: rows.map((m) => {
      const crew = crewById.get(m.crewId);
      return {
        relation: crew.capoId === m.userId ? 'CREW_CAPO' : 'CREW_MEMBER',
        user: view(refs.users.get(m.userId), { crew: P.crewBrief(crew) }),
        membershipType: m.type,
        membershipTypeLabel: MEMBERSHIP_TYPE_INFO[m.type].label,
      };
    }),
    meta: pageMeta(query, total),
  };
}

// #21 상위 지휘 계통: 정식 소속 Crew의 Capo → 그 Crew의 Underboss → Boss
async function chainOfCommand(actor, userId) {
  if (actor.id !== userId && !(access.rankOf(actor.role) >= ROLE_INFO.CAPO.rank)) {
    throw forbidden('본인 또는 Capo 이상만 조회할 수 있습니다.');
  }
  const target = await requireUser(userId);
  const chain = [];
  let crew = null;

  if (target.role !== 'BOSS' && target.role !== 'ADMIN') {
    if (target.role !== 'UNDERBOSS') {
      const regular = await membershipModel.findActiveRegularByUser(userId);
      crew = regular ? await crewModel.findById(regular.crewId) : null;
      if (crew?.capoId && crew.capoId !== userId) chain.push({ level: 'CAPO', userId: crew.capoId });
      if (crew?.underbossId) chain.push({ level: 'UNDERBOSS', userId: crew.underbossId });
    }
    for (const boss of await userModel.listByRole('BOSS', { status: 'ACTIVE' })) chain.push({ level: 'BOSS', userId: boss.id });
  }

  const refs = await loadRefs({ userIds: chain.map((c) => c.userId) });
  return {
    user: P.userBrief(target),
    crew: P.crewBrief(crew),
    chain: chain.map((c) => ({ level: c.level, levelLabel: ROLE_INFO[c.level].label, user: P.userBrief(refs.users.get(c.userId)) })),
  };
}

// ---------------------------------------------------------------------------
// 기준 정보

// #22 역할 목록 (순위 오름차순, Administrator는 마지막)
function roles() {
  return Object.entries(ROLE_INFO)
    .map(([role, info]) => ({
      role, label: info.label, rank: info.rank, description: info.description, canJoinCrew: CREW_MEMBER_ROLES.includes(role),
    }))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
}

// #23 구성원 상태 목록과 허용 전이
function memberStatuses() {
  return Object.entries(MEMBER_STATUS_INFO).map(([status, info]) => ({
    status,
    label: info.label,
    next: info.next.map((s) => ({ status: s, label: MEMBER_STATUS_INFO[s].label })),
    canSignIn: !SIGN_IN_BLOCKED_STATUSES.includes(status),
    canJoinCrew: status === 'ACTIVE',
  }));
}

module.exports = {
  create,
  bulkCreate,
  list,
  checkUsername,
  get,
  update,
  remove,
  applyRoleChange,
  changeRole,
  changeStatus,
  memberships,
  subordinates,
  chainOfCommand,
  roles,
  memberStatuses,
};
