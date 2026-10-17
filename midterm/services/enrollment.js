// Crew 편성의 핵심 규칙 (FR-06, BR-01). 편성, 일괄 편성, 소속 신청 승인, 이동, 병합, 책임자 지정이
// 모두 이 모듈을 거친다. 호출하는 쪽은 트랜잭션 안에서 crew와 user 행을 FOR UPDATE로 먼저 잠근다.
// BR-01은 여기서 먼저 검사하고, crew_memberships의 UNIQUE 인덱스가 동시 요청까지 한 번 더 막는다.
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const { ROLE_INFO, MEMBER_STATUS_INFO, MEMBERSHIP_TYPE_INFO, CREW_MEMBER_ROLES } = require('../config/constants');
const { conflict, ruleViolation } = require('../utils/errors');

function brOneViolation(user, crew) {
  return ruleViolation(
    'BR-01',
    `${user.name}님은 이미 '${crew.name}' Crew에 정식 소속되어 있습니다. 한 구성원은 동시에 둘 이상의 Crew에 정식 소속될 수 없습니다.`,
    { userId: user.id, currentCrewId: crew.id, currentCrewName: crew.name },
  );
}

function assertCrewActive(crew) {
  if (crew.status !== 'ACTIVE') throw conflict(`해산된 Crew('${crew.name}')에는 편성할 수 없습니다.`, { crewId: crew.id });
}

// BR-01: 이 구성원에게 종료되지 않은 정식 소속이 이미 있으면 거부한다.
async function assertNoRegularMembership(conn, user) {
  const regular = await membershipModel.findActiveRegularByUser(user.id, conn);
  if (regular) throw brOneViolation(user, await crewModel.findById(regular.crewId, conn));
}

// requireActive: 새로 편성할 때는 활동중인 구성원만 받는다. 이미 소속된 구성원을 옮길 때(이동·병합)는 상태를 보지 않는다.
async function checkEnroll(conn, { crew, user, type, requireActive = true }) {
  assertCrewActive(crew);
  if (requireActive && user.status !== 'ACTIVE') {
    throw conflict(`활동중인 구성원만 편성할 수 있습니다. (현재 상태: ${MEMBER_STATUS_INFO[user.status].label})`,
      { userId: user.id, status: user.status });
  }
  if (!CREW_MEMBER_ROLES.includes(user.role)) {
    throw conflict(`${ROLE_INFO[user.role].label} 역할은 Crew에 소속될 수 없습니다. Crew에는 Associate·Soldier·Capo만 소속됩니다.`,
      { userId: user.id, role: user.role });
  }
  const existing = await membershipModel.findActive(crew.id, user.id, conn);
  if (existing) {
    throw conflict(`${user.name}님은 이미 '${crew.name}' Crew에 ${MEMBERSHIP_TYPE_INFO[existing.type].label} 소속입니다.`,
      { userId: user.id, membershipId: existing.id });
  }
  if (type === 'REGULAR') await assertNoRegularMembership(conn, user);
}

// UNIQUE 인덱스 위반(동시 요청)을 업무 규칙 오류로 바꾼다.
async function translateDuplicate(err, conn, user, crew) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  if (err.sqlMessage.includes('uq_membership_active_regular')) {
    const regular = await membershipModel.findActiveRegularByUser(user.id, conn);
    return brOneViolation(user, regular ? await crewModel.findById(regular.crewId, conn) : crew);
  }
  if (err.sqlMessage.includes('uq_membership_active_member')) {
    return conflict(`${user.name}님은 이미 '${crew.name}' Crew에 소속되어 있습니다.`, { userId: user.id });
  }
  return err;
}

async function insertMembership(conn, { crew, user, type, actor, joinMethod = 'ADDED', fromCrewId = null, note = null }) {
  try {
    return await membershipModel.insert(
      { crewId: crew.id, userId: user.id, type, joinMethod, fromCrewId, addedBy: actor.id, note }, conn);
  } catch (err) {
    throw await translateDuplicate(err, conn, user, crew);
  }
}

// 검사 후 소속을 만든다. 새 소속 ID를 돌려준다.
async function enroll(conn, options) {
  await checkEnroll(conn, options);
  return insertMembership(conn, options);
}

module.exports = { assertCrewActive, assertNoRegularMembership, checkEnroll, insertMembership, enroll };
