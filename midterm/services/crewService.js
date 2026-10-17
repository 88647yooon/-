// Crew 관리 (FR-05, FR-06, BR-04, BR-05, BR-10)
const { withTransaction } = require('../config/database');
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const capoTermModel = require('../models/sql/capoTermModel');
const joinRequestModel = require('../models/sql/joinRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const enrollment = require('./enrollment');
const { requireUser, requireCrew } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, ROLE_INFO } = require('../config/constants');
const { forbidden, conflict } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { changedFields } = require('../utils/diff');

const { userTarget, crewTarget } = auditService;
const snapshot = (c) => ({ name: c.name, region: c.region, description: c.description, status: c.status, underbossId: c.underbossId });

async function present(crew, db) {
  const [counts, refs] = await Promise.all([
    crewModel.memberCounts([crew.id], db),
    loadRefs({ userIds: [crew.capoId, crew.underbossId] }, db),
  ]);
  return P.presentCrew(crew, refs, counts.get(crew.id));
}

const presentById = async (crewId) => present(await crewModel.findById(crewId));

function assertActive(crew) {
  if (crew.status !== 'ACTIVE') throw conflict(`해산된 Crew('${crew.name}')는 바꿀 수 없습니다. 먼저 활성 상태로 되돌리세요.`, { crewId: crew.id });
}

function assertUnderbossCandidate(user) {
  if (user.role !== 'UNDERBOSS') {
    throw conflict('Underboss 역할인 구성원만 담당 Underboss로 지정할 수 있습니다.', { userId: user.id, role: user.role });
  }
  if (user.status !== 'ACTIVE') throw conflict('활동중인 구성원만 담당 Underboss로 지정할 수 있습니다.', { userId: user.id, status: user.status });
}

async function assertNameAvailable(name, exceptId) {
  const same = await crewModel.findByName(name);
  if (same && same.id !== exceptId) throw conflict('이미 같은 이름의 Crew가 있습니다.', { field: 'body.name' }, 'DUPLICATE');
}

// ---------------------------------------------------------------------------
// 생성·조회·수정·삭제

// #24 Crew 생성. Underboss가 만들면 자신이 담당 Underboss가 된다.
async function create(actor, { name, region, description, underbossId }, ctx) {
  let assigned = underbossId ?? null;
  if (actor.role === 'UNDERBOSS') {
    if (assigned !== null && assigned !== actor.id) {
      throw forbidden('Underboss는 자신이 담당하는 Crew만 만들 수 있습니다. 다른 Underboss 지정은 Boss만 할 수 있습니다.');
    }
    assigned = actor.id;
  } else if (assigned !== null) {
    assertUnderbossCandidate(await requireUser(assigned));
  }
  await assertNameAvailable(name);

  const id = await crewModel.insert({ name, region, description, underbossId: assigned, createdBy: actor.id });
  const crew = await crewModel.findById(id);
  await auditService.record({ actor, action: 'CREW_CREATED', target: crewTarget(crew), after: snapshot(crew), ip: ctx.ip });
  return present(crew);
}

// #25 Crew 목록
async function list(actor, query) {
  const { rows, total } = await crewModel.search(query);
  const [counts, refs] = await Promise.all([
    crewModel.memberCounts(rows.map((c) => c.id)),
    loadRefs({ userIds: rows.flatMap((c) => [c.capoId, c.underbossId]) }),
  ]);
  return { data: rows.map((c) => P.presentCrew(c, refs, counts.get(c.id))), meta: pageMeta(query, total) };
}

// #26 Crew 상세
async function get(actor, crewId) {
  return present(await requireCrew(crewId));
}

// #27 이름·지역·설명 수정 (Capo는 자신이 책임자인 Crew만)
async function update(actor, crewId, changes, ctx) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  assertActive(crew);
  if (changes.name !== undefined) await assertNameAvailable(changes.name, crew.id);

  const { before, after, changed } = changedFields(crew, changes);
  if (changed) {
    await crewModel.update(crewId, after);
    await auditService.record({ actor, action: 'CREW_UPDATED', target: crewTarget(crew), before, after, ip: ctx.ip });
  }
  return presentById(crewId);
}

// #28 삭제. 한 번도 쓰이지 않은 Crew만 지울 수 있고, 그 밖에는 해산 처리를 안내한다.
async function remove(actor, crewId, ctx) {
  const crew = await requireCrew(crewId);
  const usage = await crewModel.usage(crewId);
  if (Object.values(usage).some((n) => n > 0)) {
    throw conflict('편성·신청·책임자 기록이 있는 Crew는 삭제할 수 없습니다. 상태를 해산(DISBANDED)으로 바꿔 주세요.', usage);
  }
  await crewModel.remove(crewId);
  await auditService.record({ actor, action: 'CREW_DELETED', target: crewTarget(crew), before: snapshot(crew), ip: ctx.ip });
  return { id: crewId, deleted: true };
}

// ---------------------------------------------------------------------------
// 해산·책임자

// Crew를 해산 상태로 만든다. 소속·책임자 임기를 끝내고 대기 중인 신청을 취소한다.
// 해산(#29)과 병합(#44)이 함께 쓴다. 끝난 소속 목록을 돌려준다.
async function disband(conn, crew, actor, { endReason, toCrewId = null, cancelReason }) {
  const ended = await membershipModel.listActiveByCrew(crew.id, conn, { forUpdate: true });
  for (const m of ended) await membershipModel.end(m.id, { reason: endReason, endedBy: actor.id, toCrewId }, conn);
  if (crew.capoId) await capoTermModel.endActive(crew.id, { reason: endReason, endedBy: actor.id }, conn);
  await crewModel.setCapo(crew.id, null, conn);
  await crewModel.setUnderboss(crew.id, null, conn);
  await joinRequestModel.cancelPending({ crewId: crew.id }, { reason: cancelReason, decidedBy: actor.id }, conn);
  await crewModel.setStatus(crew.id, 'DISBANDED', conn);
  return ended;
}

// #29 활성·해산 전환
async function changeStatus(actor, crewId, { status, reason }, ctx) {
  const { crew, ended } = await withTransaction(async (conn) => {
    const current = await requireCrew(crewId, conn, { forUpdate: true });
    if (current.status === status) throw conflict(`이미 ${CREW_STATUS_INFO[status].label} 상태입니다.`);
    let memberships = [];
    if (status === 'DISBANDED') {
      memberships = await disband(conn, current, actor, { endReason: 'DISBANDED', cancelReason: 'Crew 해산' });
    } else {
      await crewModel.setStatus(crewId, status, conn);
    }
    return { crew: current, ended: memberships };
  });

  const refs = await loadRefs({ userIds: ended.map((m) => m.userId) });
  await auditService.recordMany([
    { actor, action: 'CREW_STATUS_CHANGED', target: crewTarget(crew), before: { status: crew.status }, after: { status, endedMemberships: ended.length }, reason, ip: ctx.ip },
    ...ended.map((m) => ({
      actor, action: 'MEMBERSHIP_ENDED', target: userTarget(refs.users.get(m.userId)), related: [crewTarget(crew)],
      before: { crewId: crew.id, type: m.type }, after: { endReason: 'DISBANDED' }, reason, ip: ctx.ip,
    })),
  ]);
  return presentById(crewId);
}

// #30 책임자 지정·교체. 대상은 활동중인 Capo 역할이어야 하고, 이 Crew의 정식 소속원이 된다.
// 아직 어느 Crew에도 정식 소속이 없으면 이 Crew에 정식 소속으로 함께 편성한다 (BR-01 검사 포함).
async function assignCapo(actor, crewId, { userId, reason }, ctx) {
  const outcome = await withTransaction(async (conn) => {
    const crew = await requireCrew(crewId, conn, { forUpdate: true });
    assertActive(crew);
    const user = await requireUser(userId, conn, { forUpdate: true });
    if (crew.capoId === userId) throw conflict('이미 이 Crew의 책임자입니다.');
    if (user.status !== 'ACTIVE') throw conflict('활동중인 구성원만 책임자로 지정할 수 있습니다.', { userId, status: user.status });
    if (user.role !== 'CAPO') {
      throw conflict(`Capo 역할인 구성원만 책임자로 지정할 수 있습니다. (현재 역할: ${ROLE_INFO[user.role].label}) 먼저 역할을 Capo로 바꾸세요.`,
        { userId, role: user.role });
    }

    const membership = await membershipModel.findActive(crewId, userId, conn, { forUpdate: true });
    if (membership && membership.type !== 'REGULAR') {
      throw conflict('임시 소속인 구성원은 책임자가 될 수 없습니다. 먼저 정식 소속으로 바꾸세요.', { membershipId: membership.id });
    }
    const enrolledId = membership ? null : await enrollment.enroll(conn, {
      crew, user, type: 'REGULAR', actor, joinMethod: 'CAPO_ASSIGNMENT', note: '책임자 지정',
    });

    if (crew.capoId) await capoTermModel.endActive(crewId, { reason: 'REPLACED', endedBy: actor.id }, conn);
    await crewModel.setCapo(crewId, userId, conn);
    await capoTermModel.start({ crewId, userId, assignedBy: actor.id, reason }, conn);
    return { crew, user, enrolledId };
  });

  const { crew, user, enrolledId } = outcome;
  await auditService.recordMany([
    {
      actor, action: 'CREW_CAPO_ASSIGNED', target: crewTarget(crew), related: [userTarget(user)],
      before: { capoId: crew.capoId }, after: { capoId: user.id }, reason, ip: ctx.ip,
    },
    ...(enrolledId ? [{
      actor, action: 'MEMBERSHIP_ADDED', target: userTarget(user), related: [crewTarget(crew)],
      after: { crewId: crew.id, type: 'REGULAR', joinMethod: 'CAPO_ASSIGNMENT' }, ip: ctx.ip,
    }] : []),
  ]);
  return presentById(crewId);
}

// #31 책임자 해제. 해제된 구성원은 Crew에 정식 소속으로 남는다.
async function removeCapo(actor, crewId, ctx) {
  const crew = await withTransaction(async (conn) => {
    const current = await requireCrew(crewId, conn, { forUpdate: true });
    if (!current.capoId) throw conflict('이 Crew에는 지정된 책임자가 없습니다.');
    await capoTermModel.endActive(crewId, { reason: 'REMOVED', endedBy: actor.id }, conn);
    await crewModel.setCapo(crewId, null, conn);
    return current;
  });
  await auditService.record({
    actor, action: 'CREW_CAPO_REMOVED', target: crewTarget(crew), related: [{ entity: 'user', id: String(crew.capoId) }],
    before: { capoId: crew.capoId }, after: { capoId: null }, ip: ctx.ip,
  });
  return presentById(crewId);
}

// #32 담당 Underboss 지정 (Boss만)
async function assignUnderboss(actor, crewId, { userId }, ctx) {
  const crew = await requireCrew(crewId);
  assertActive(crew);
  if (crew.underbossId === userId) throw conflict('이미 이 Crew의 담당 Underboss입니다.');
  const user = await requireUser(userId);
  assertUnderbossCandidate(user);
  await crewModel.setUnderboss(crewId, userId);
  await auditService.record({
    actor, action: 'CREW_UNDERBOSS_ASSIGNED', target: crewTarget(crew), related: [userTarget(user)],
    before: { underbossId: crew.underbossId }, after: { underbossId: userId }, ip: ctx.ip,
  });
  return presentById(crewId);
}

// #33 책임자 교체 이력
async function capoHistory(actor, crewId, query) {
  await requireCrew(crewId);
  const { rows, total } = await capoTermModel.searchByCrew(crewId, query);
  const refs = await loadRefs({ userIds: rows.flatMap((t) => [t.userId, t.assignedBy, t.endedBy]) });
  return { data: rows.map((t) => P.presentCapoTerm(t, refs)), meta: pageMeta(query, total) };
}

// #34 Crew 조직도: 담당 Underboss → 책임자(Capo) → 소속원 (역할 순위가 높은 순)
async function hierarchy(actor, crewId) {
  const crew = await requireCrew(crewId);
  await access.assertCanViewCrewInside(actor, crew);
  const members = await membershipModel.listActiveByCrew(crewId);
  const refs = await loadRefs({ userIds: [crew.capoId, crew.underbossId, ...members.map((m) => m.userId)] });

  const children = members
    .filter((m) => m.userId !== crew.capoId)
    .map((m) => ({
      position: 'MEMBER',
      user: P.userBrief(refs.users.get(m.userId)),
      membershipType: m.type,
      membershipTypeLabel: MEMBERSHIP_TYPE_INFO[m.type].label,
      joinedAt: m.joinedAt,
    }))
    .sort((a, b) => (access.rankOf(b.user.role) - access.rankOf(a.user.role)) || a.user.name.localeCompare(b.user.name));

  return {
    crew: P.crewBrief(crew),
    tree: {
      position: 'UNDERBOSS',
      user: P.userBrief(refs.users.get(crew.underbossId)),
      children: [{ position: 'CAPO', user: P.userBrief(refs.users.get(crew.capoId)), children }],
    },
  };
}

module.exports = {
  create,
  list,
  get,
  update,
  remove,
  disband,
  changeStatus,
  assignCapo,
  removeCapo,
  assignUnderboss,
  capoHistory,
  hierarchy,
};
