// Crew 편성 (FR-05, FR-06, BR-01, BR-05, BR-10)
const { withTransaction } = require('../config/database');
const userModel = require('../models/sql/userModel');
const membershipModel = require('../models/sql/membershipModel');
const auditService = require('./auditService');
const access = require('./accessService');
const enrollment = require('./enrollment');
const crewService = require('./crewService');
const { requireUser, requireCrew } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { CREW_MEMBER_ROLES, MEMBERSHIP_TYPE_INFO } = require('../config/constants');
const { AppError, badRequest, conflict, notFound, bulkRejected } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { userTarget, crewTarget } = auditService;

async function requireActiveMembership(crew, userId, conn, options) {
  const membership = await membershipModel.findActive(crew.id, userId, conn, options);
  if (!membership) throw notFound(`'${crew.name}' Crew의 현재 소속원이 아닙니다. (구성원 ID ${userId})`);
  return membership;
}

function assertNotCapo(crew, userId, action) {
  if (crew.capoId === userId) {
    throw conflict(`'${crew.name}' Crew의 책임자는 ${action}할 수 없습니다. 먼저 책임자를 해제하세요.`, { crewId: crew.id, userId });
  }
}

async function presentOne(membershipId, viewer) {
  const m = await membershipModel.findById(membershipId);
  const refs = await loadRefs(P.membershipRefIds([m]));
  const crew = refs.crews.get(m.crewId);
  const contactIds = await access.contactIdsFor(viewer);
  const user = refs.users.get(m.userId);
  return P.presentMembership(m, refs, {
    isCapo: crew.capoId === m.userId,
    user: P.presentUserFor(user, access.visibilityOf(viewer, user, contactIds)),
  });
}

const addedLog = (actor, user, crew, after, ctx) => ({
  actor, action: 'MEMBERSHIP_ADDED', target: userTarget(user), related: [crewTarget(crew)], after: { crewId: crew.id, ...after }, ip: ctx.ip,
});

// ---------------------------------------------------------------------------
// 조회

// #35 현재 소속원 목록
async function listMembers(actor, crewId, query) {
  const crew = await requireCrew(crewId);
  await access.assertCanViewCrewInside(actor, crew);
  const { rows, total } = await membershipModel.searchActiveMembers([crewId], query);
  const refs = await loadRefs(P.membershipRefIds(rows));
  const contactIds = await access.contactIdsFor(actor);
  return {
    data: rows.map((m) => {
      const user = refs.users.get(m.userId);
      return P.presentMembership(m, refs, { isCapo: crew.capoId === m.userId, user: P.presentUserFor(user, access.visibilityOf(actor, user, contactIds)) });
    }),
    meta: pageMeta(query, total),
  };
}

// #36 특정 구성원의 현재 소속 상세
async function getMember(actor, crewId, userId) {
  const crew = await requireCrew(crewId);
  await access.assertCanViewCrewInside(actor, crew);
  const membership = await requireActiveMembership(crew, userId);
  return presentOne(membership.id, actor);
}

// #42 편성 후보. type=REGULAR(기본)이면 다른 Crew에 정식 소속된 구성원은 뺀다 (BR-01).
async function candidates(actor, crewId, { type, ...query }) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  const { rows, total } = await userModel.searchCandidates(crewId, { ...query, roles: CREW_MEMBER_ROLES, regularOnly: type === 'REGULAR' });
  const refs = await loadRefs({ crewIds: rows.map((u) => u.regularCrewId) });
  const contactIds = await access.contactIdsFor(actor);
  return {
    data: rows.map((u) => P.presentUserFor(u, access.visibilityOf(actor, u, contactIds), { crew: P.crewBrief(refs.crews.get(u.regularCrewId)) })),
    meta: pageMeta(query, total),
  };
}

// #43 편성 변경 이력 (가입·제외·이동 등, 종료된 소속 포함)
async function history(actor, crewId, query) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  const { rows, total } = await membershipModel.searchHistoryByCrew(crewId, query);
  const refs = await loadRefs(P.membershipRefIds(rows));
  return { data: rows.map((m) => P.presentMembership(m, refs)), meta: pageMeta(query, total) };
}

// ---------------------------------------------------------------------------
// 편성 변경

// #37 구성원 편성 (BR-01, BR-05)
async function addMember(actor, crewId, { userId, type, note }, ctx) {
  const { crew, user, membershipId } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    access.assertCanManageCrew(actor, c);
    const u = await requireUser(userId, conn, { forUpdate: true });
    const id = await enrollment.enroll(conn, { crew: c, user: u, type, actor, note });
    return { crew: c, user: u, membershipId: id };
  });
  await auditService.record(addedLog(actor, user, crew, { type, joinMethod: 'ADDED' }, ctx));
  return presentOne(membershipId, actor);
}

// #38 일괄 편성. 모든 행을 먼저 검사하고, 한 건이라도 실패하면 아무도 편성하지 않는다.
async function bulkAdd(actor, crewId, { members, note }, ctx) {
  const ids = members.map((m) => m.userId);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) throw badRequest('같은 구성원이 여러 번 들어 있습니다.', [{ field: 'body.members', message: `구성원 ID ${dup}가 중복되었습니다.` }]);

  const { crew, created } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    access.assertCanManageCrew(actor, c);

    // 잠금 순서를 일정하게 해서 교착 상태를 피한다.
    const users = new Map();
    for (const id of [...ids].sort((a, b) => a - b)) users.set(id, await userModel.findById(id, conn, { forUpdate: true }));

    const errors = [];
    for (const [index, m] of members.entries()) {
      const u = users.get(m.userId);
      try {
        if (!u) throw notFound(`구성원(ID ${m.userId})을 찾을 수 없습니다.`);
        await enrollment.checkEnroll(conn, { crew: c, user: u, type: m.type });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        errors.push({ index, userId: m.userId, code: err.code, message: err.message });
      }
    }
    if (errors.length > 0) throw bulkRejected(members.length, errors);

    const rows = [];
    for (const m of members) {
      const u = users.get(m.userId);
      rows.push({ user: u, type: m.type, membershipId: await enrollment.insertMembership(conn, { crew: c, user: u, type: m.type, actor, note }) });
    }
    return { crew: c, created: rows };
  });

  await auditService.recordMany(created.map((r) => addedLog(actor, r.user, crew, { type: r.type, joinMethod: 'ADDED' }, ctx)));
  return { addedCount: created.length, members: await Promise.all(created.map((r) => presentOne(r.membershipId, actor))) };
}

// #39 소속 유형 변경. 이력을 남기기 위해 기존 소속을 끝내고 새 유형의 소속을 만든다.
async function changeType(actor, crewId, userId, { type, note }, ctx) {
  const { crew, user, before, membershipId } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    access.assertCanManageCrew(actor, c);
    const u = await requireUser(userId, conn, { forUpdate: true });
    const current = await requireActiveMembership(c, userId, conn, { forUpdate: true });
    if (current.type === type) throw conflict(`이미 ${MEMBERSHIP_TYPE_INFO[type].label} 소속입니다.`);
    if (type === 'TEMPORARY') assertNotCapo(c, userId, '임시 소속으로 변경');
    if (type === 'REGULAR') await enrollment.assertNoRegularMembership(conn, u);

    await membershipModel.end(current.id, { reason: 'TYPE_CHANGED', endedBy: actor.id }, conn);
    const id = await enrollment.insertMembership(conn, { crew: c, user: u, type, actor, joinMethod: 'TYPE_CHANGE', note });
    return { crew: c, user: u, before: current, membershipId: id };
  });
  await auditService.record({
    actor, action: 'MEMBERSHIP_TYPE_CHANGED', target: userTarget(user), related: [crewTarget(crew)],
    before: { crewId: crew.id, type: before.type }, after: { crewId: crew.id, type }, reason: note, ip: ctx.ip,
  });
  return presentOne(membershipId, actor);
}

// #40 구성원 제외. 소속 기록은 지우지 않고 종료일을 남긴다.
async function removeMember(actor, crewId, userId, ctx) {
  const { crew, user, membership } = await withTransaction(async (conn) => {
    const c = await requireCrew(crewId, conn, { forUpdate: true });
    access.assertCanManageCrew(actor, c);
    const m = await requireActiveMembership(c, userId, conn, { forUpdate: true });
    assertNotCapo(c, userId, '제외');
    await membershipModel.end(m.id, { reason: 'REMOVED', endedBy: actor.id }, conn);
    return { crew: c, user: await userModel.findById(userId, conn), membership: m };
  });
  await auditService.record({
    actor, action: 'MEMBERSHIP_ENDED', target: userTarget(user), related: [crewTarget(crew)],
    before: { crewId: crew.id, type: membership.type }, after: { endReason: 'REMOVED' }, ip: ctx.ip,
  });
  return presentOne(membership.id, actor);
}

// #41 다른 Crew로 이동 (Underboss·Boss). 기존 소속 종료와 새 소속 생성을 한 트랜잭션으로 처리한다.
async function transfer(actor, crewId, userId, { targetCrewId, type, note }, ctx) {
  if (targetCrewId === crewId) {
    throw badRequest('같은 Crew로는 이동할 수 없습니다.', [{ field: 'body.targetCrewId', message: '현재 Crew와 다른 Crew를 지정하세요.' }]);
  }
  const outcome = await withTransaction(async (conn) => {
    // 두 Crew를 ID 순서로 잠근다.
    const locked = new Map();
    for (const id of [crewId, targetCrewId].sort((a, b) => a - b)) locked.set(id, await requireCrew(id, conn, { forUpdate: true }));
    const source = locked.get(crewId);
    const target = locked.get(targetCrewId);
    enrollment.assertCrewActive(target);

    const current = await requireActiveMembership(source, userId, conn, { forUpdate: true });
    assertNotCapo(source, userId, '이동');
    const user = await requireUser(userId, conn, { forUpdate: true });
    const newType = type ?? current.type;

    await membershipModel.end(current.id, { reason: 'TRANSFERRED', endedBy: actor.id, toCrewId: target.id }, conn);
    await enrollment.checkEnroll(conn, { crew: target, user, type: newType, requireActive: false });
    const membershipId = await enrollment.insertMembership(conn, {
      crew: target, user, type: newType, actor, joinMethod: 'TRANSFER', fromCrewId: source.id, note,
    });
    return { source, target, user, before: current, newType, membershipId };
  });

  const { source, target, user, before, newType, membershipId } = outcome;
  await auditService.record({
    actor, action: 'MEMBERSHIP_TRANSFERRED', target: userTarget(user), related: [crewTarget(source), crewTarget(target)],
    before: { crewId: source.id, type: before.type }, after: { crewId: target.id, type: newType }, reason: note, ip: ctx.ip,
  });
  return presentOne(membershipId, actor);
}

// #44 두 Crew 병합 (Underboss·Boss). 원 Crew의 소속원을 대상 Crew로 옮기고 원 Crew는 해산한다.
// 이미 대상 Crew에 소속된 구성원은 그대로 두되, 원 Crew 정식 + 대상 Crew 임시였으면 정식으로 바꾼다.
async function merge(actor, { sourceCrewId, targetCrewId, reason }, ctx) {
  if (sourceCrewId === targetCrewId) {
    throw badRequest('같은 Crew끼리는 병합할 수 없습니다.', [{ field: 'body.targetCrewId', message: '원 Crew와 다른 Crew를 지정하세요.' }]);
  }
  const outcome = await withTransaction(async (conn) => {
    const locked = new Map();
    for (const id of [sourceCrewId, targetCrewId].sort((a, b) => a - b)) locked.set(id, await requireCrew(id, conn, { forUpdate: true }));
    const source = locked.get(sourceCrewId);
    const target = locked.get(targetCrewId);
    enrollment.assertCrewActive(source);
    enrollment.assertCrewActive(target);

    const ended = await crewService.disband(conn, source, actor, { endReason: 'MERGED', toCrewId: target.id, cancelReason: 'Crew 병합' });
    const moved = [];
    let kept = 0;
    for (const m of ended) {
      const user = await userModel.findById(m.userId, conn, { forUpdate: true });
      const existing = await membershipModel.findActive(target.id, m.userId, conn, { forUpdate: true });
      if (existing) {
        if (m.type === 'REGULAR' && existing.type === 'TEMPORARY') {
          await membershipModel.end(existing.id, { reason: 'TYPE_CHANGED', endedBy: actor.id }, conn);
          await enrollment.insertMembership(conn, { crew: target, user, type: 'REGULAR', actor, joinMethod: 'MERGE', fromCrewId: source.id, note: reason });
          moved.push({ user, type: 'REGULAR' });
        } else {
          kept += 1;
        }
        continue;
      }
      await enrollment.insertMembership(conn, { crew: target, user, type: m.type, actor, joinMethod: 'MERGE', fromCrewId: source.id, note: reason });
      moved.push({ user, type: m.type });
    }
    return { source, target, moved, kept };
  });

  const { source, target, moved, kept } = outcome;
  await auditService.recordMany([
    {
      actor, action: 'CREW_MERGED', target: crewTarget(source), related: [crewTarget(target)],
      before: { status: source.status }, after: { status: 'DISBANDED', mergedInto: target.id, movedCount: moved.length, alreadyMemberCount: kept },
      reason, ip: ctx.ip,
    },
    ...moved.map((r) => ({
      actor, action: 'MEMBERSHIP_TRANSFERRED', target: userTarget(r.user), related: [crewTarget(source), crewTarget(target)],
      before: { crewId: source.id }, after: { crewId: target.id, type: r.type, joinMethod: 'MERGE' }, reason, ip: ctx.ip,
    })),
  ]);

  const [sourceView, targetView] = await Promise.all([crewService.get(actor, source.id), crewService.get(actor, target.id)]);
  return { sourceCrew: sourceView, targetCrew: targetView, movedCount: moved.length, alreadyMemberCount: kept };
}

module.exports = {
  listMembers,
  getMember,
  candidates,
  history,
  addMember,
  bulkAdd,
  changeType,
  removeMember,
  transfer,
  merge,
};
