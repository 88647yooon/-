// 역할 순위와 관리 범위 검사 (NFR-03, BR-04, BR-05). 역할만으로 판단할 수 없는 권한을 여기서 검사한다.
// 관리 범위: Underboss·Boss는 모든 Crew, Capo는 자신이 책임자인 Crew만 관리한다.
// Administrator는 운영 계층 밖의 기술 관리자라서 Crew 편성·구성원 상태에는 관여하지 않는다.
const { ROLE_INFO } = require('../config/constants');
const crewModel = require('../models/sql/crewModel');
const membershipModel = require('../models/sql/membershipModel');
const { forbidden } = require('../utils/errors');

const rankOf = (role) => ROLE_INFO[role]?.rank ?? null;
const isOrgManager = (user) => user.role === 'UNDERBOSS' || user.role === 'BOSS';
const isAdmin = (user) => user.role === 'ADMIN';

// 운영 계층에서 actor가 target보다 높은지. Administrator는 계층 밖이라 항상 false.
function outranks(actor, target) {
  const a = rankOf(actor.role);
  const t = rankOf(target.role);
  return a !== null && t !== null && a > t;
}

function canManageCrew(actor, crew) {
  return isOrgManager(actor) || (actor.role === 'CAPO' && crew.capoId === actor.id);
}

// BR-05: Crew 책임자는 자신이 관리하지 않는 Crew의 편성을 바꿀 수 없다.
function assertCanManageCrew(actor, crew) {
  if (!canManageCrew(actor, crew)) {
    throw forbidden(
      `'${crew.name}' Crew를 관리할 권한이 없습니다. Capo는 자신이 책임자인 Crew만 관리할 수 있습니다.`,
      { rule: 'BR-05', crewId: crew.id },
    );
  }
}

// Crew 내부 정보(구성원 목록, 조직도): 그 Crew의 현재 소속원이거나 Underboss·Boss
async function assertCanViewCrewInside(actor, crew, db) {
  if (isOrgManager(actor)) return;
  if (await membershipModel.findActive(crew.id, actor.id, db)) return;
  throw forbidden(`'${crew.name}' Crew의 소속원이나 Underboss·Boss만 볼 수 있습니다.`, { crewId: crew.id });
}

// Capo가 책임자인 Crew의 현재 소속원인지
async function isInCapoCrew(capo, userId, db) {
  if (capo.role !== 'CAPO') return false;
  const crew = await crewModel.findByCapo(capo.id, db);
  return Boolean(crew && (await membershipModel.findActive(crew.id, userId, db)));
}

// 다른 구성원의 기본 정보·상태를 바꿀 수 있는지.
// BR-04: 자신과 같거나 높은 역할의 구성원은 관리할 수 없다. BR-05: Capo는 자기 Crew 소속원만.
async function assertCanManageUser(actor, target, { allowAdmin = false, db } = {}) {
  if (actor.id === target.id) throw forbidden('본인의 정보·상태는 이 기능으로 바꿀 수 없습니다.');
  if (isAdmin(actor)) {
    if (allowAdmin) return;
    throw forbidden('Administrator는 이 작업을 할 수 없습니다.');
  }
  if (isAdmin(target)) throw forbidden('Administrator 계정은 Administrator만 관리할 수 있습니다.');
  if (!outranks(actor, target)) {
    throw forbidden('자신과 같거나 높은 역할의 구성원은 관리할 수 없습니다.',
      { rule: 'BR-04', actorRole: actor.role, targetRole: target.role });
  }
  if (isOrgManager(actor)) return;
  if (await isInCapoCrew(actor, target.id, db)) return;
  throw forbidden('Capo는 자신이 책임자인 Crew의 소속원만 관리할 수 있습니다.', { rule: 'BR-05' });
}

// 소속 이력 열람: 본인, Underboss·Boss, 그 구성원이 속한 Crew의 책임자
async function assertCanViewMemberRecords(actor, target, db) {
  if (actor.id === target.id || isOrgManager(actor)) return;
  if (await isInCapoCrew(actor, target.id, db)) return;
  throw forbidden('본인, 소속 Crew의 책임자, Underboss·Boss만 볼 수 있습니다.');
}

// BR-04: 역할 변경 권한. 대상의 현재 역할과 새 역할 모두 요청자보다 낮아야 한다.
// Boss 지정·해제는 Boss만, Administrator 지정·해제는 Administrator만 할 수 있다 (작업지시서 3장).
function assertCanChangeRole(actor, target, newRole) {
  if (actor.id === target.id) throw forbidden('본인의 역할은 바꿀 수 없습니다.');
  if ((target.role === 'BOSS' || newRole === 'BOSS') && actor.role !== 'BOSS') {
    throw forbidden('Boss 역할의 지정·해제는 Boss만 할 수 있습니다.', { rule: 'BR-04' });
  }
  if (isAdmin(actor)) return;
  if (target.role === 'ADMIN' || newRole === 'ADMIN') {
    throw forbidden('Administrator 역할의 지정·해제는 Administrator만 할 수 있습니다.');
  }
  if (!outranks(actor, target)) {
    throw forbidden('자신과 같거나 높은 역할의 구성원은 역할을 바꿀 수 없습니다.',
      { rule: 'BR-04', actorRole: actor.role, targetRole: target.role });
  }
  if (rankOf(newRole) > rankOf(actor.role)) {
    throw forbidden('자신보다 높은 역할로 올릴 수 없습니다.', { rule: 'BR-04', actorRole: actor.role, newRole });
  }
}

// 응답에 보여 줄 구성원 정보 범위: basic(누구나) < contact(+연락처) < full(+계정 시각 정보)
function visibilityOf(viewer, user, contactIds) {
  if (viewer.id === user.id || isOrgManager(viewer) || isAdmin(viewer)) return 'full';
  if (contactIds?.has(user.id)) return 'contact';
  return 'basic';
}

// Capo는 자기 Crew 소속원의 연락처를 볼 수 있다.
async function contactIdsFor(viewer, db) {
  if (viewer.role !== 'CAPO') return null;
  const crew = await crewModel.findByCapo(viewer.id, db);
  return crew ? new Set(await membershipModel.activeUserIdsOfCrew(crew.id, db)) : null;
}

module.exports = {
  rankOf,
  isOrgManager,
  isAdmin,
  outranks,
  canManageCrew,
  assertCanManageCrew,
  assertCanViewCrewInside,
  isInCapoCrew,
  assertCanManageUser,
  assertCanViewMemberRecords,
  assertCanChangeRole,
  visibilityOf,
  contactIdsFor,
};
