// 자원 배정의 핵심 규칙 (FR-14, FR-17, BR-07, BR-08)과 자원 관리 범위 (BR-05).
// 업무 자원 할당, 구성원 자원 배정, 사용 신청 승인, 반환 예정 연장, 인계, 업무 일정 변경이 모두 이 모듈을 거친다.
// 호출하는 쪽은 트랜잭션 안에서 자원 행을 FOR UPDATE로 먼저 잠근다. 잠금 순서: 업무 → 신청 → 구성원 → 자원(ID 순).
// BR-07은 UNIQUE 인덱스로 표현할 수 없으므로, 자원 행 잠금으로 같은 자원의 예약 변경을 한 줄로 세워 동시 요청을 막는다.
const resourceModel = require('../models/sql/resourceModel');
const scheduleModel = require('../models/sql/resourceScheduleModel');
const access = require('./accessService');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { ROLE_INFO, RESOURCE_STATUS_INFO, MEMBER_STATUS_INFO } = require('../config/constants');
const { badRequest, forbidden, conflict, ruleViolation } = require('../utils/errors');

// 자원을 관리하는 역할 (상태·점검·사용 이력): Capo 이상. 관리 범위가 따로 없는 공용 자원이다.
const isResourceManager = (user) => user.role === 'CAPO' || access.isOrgManager(user);

// 이 구성원의 역할로 이 자원을 이용할 수 있는지 (FR-14)
const meetsMinRole = (user, resource) => (ROLE_INFO[user.role].rank ?? 0) >= ROLE_INFO[resource.minRole].rank;

function assertPeriod(startAt, endAt, field = 'body.endAt') {
  if (endAt <= startAt) throw badRequest('종료 시각은 시작 시각보다 늦어야 합니다.', [{ field, message: '시작 시각보다 늦어야 합니다.' }]);
}

// 이미 끝난 시간대에는 배정하지 않는다.
function assertNotPast(endAt, field = 'body.endAt') {
  if (endAt <= new Date()) throw badRequest('이미 지난 시간대에는 배정할 수 없습니다.', [{ field, message: '지금보다 늦은 시각을 지정하세요.' }]);
}

// BR-08: 점검중·사용불가 자원은 새로 배정할 수 없다.
function assertAssignable(resource) {
  const info = RESOURCE_STATUS_INFO[resource.status];
  if (!info.assignable) {
    throw ruleViolation('BR-08', `${info.label} 상태의 자원('${resource.name}')은 배정할 수 없습니다. 정상 자원으로 돌아온 뒤 배정하세요.`,
      { resourceId: resource.id, status: resource.status });
  }
}

// 시간 충돌 목록을 응답 형태로 바꾼다.
async function presentConflicts(entries, db) {
  const refs = await loadRefs({ taskIds: entries.map((e) => e.taskId), userIds: entries.map((e) => e.userId) }, db);
  return entries.map((e) => P.presentScheduleEntry(e, refs));
}

// BR-07: 같은 자원의 겹치는 시간대에 다른 예약(업무 할당·구성원 배정·사용 중)이 있으면 거부한다.
async function assertNoConflict(conn, resource, { startAt, endAt, ...exclude }) {
  const entries = await scheduleModel.findConflicts(resource.id, { startAt, endAt, ...exclude }, conn);
  if (entries.length === 0) return;
  const conflicts = await presentConflicts(entries, conn);
  const first = conflicts[0];
  const who = first.user?.name ?? '다른 구성원';
  const holder = {
    TASK: `업무 '${first.task?.title}'에 할당되어 있습니다`,
    MEMBER: `${who}님에게 배정되어 있습니다`,
    USAGE: first.overdue ? `${who}님이 반환 예정 시각이 지나도록 반환하지 않아 사용 중입니다` : `${who}님이 사용 중입니다`,
  }[first.kind];
  throw ruleViolation('BR-07', `자원('${resource.name}')은 같은 시간대에 이미 ${holder}. 같은 시간대에 중복 배정할 수 없습니다.`,
    { resourceId: resource.id, conflicts });
}

// 구성원에게 직접 배정·인계할 수 있는지: 활동중, 운영 계층 역할, 최소 역할 충족
function assertMemberCanUse(user, resource) {
  if (user.role === 'ADMIN') throw conflict('Administrator에게는 자원을 배정할 수 없습니다.', { userId: user.id });
  if (user.status !== 'ACTIVE') {
    throw conflict(`${MEMBER_STATUS_INFO[user.status].label} 상태의 구성원(${user.name})에게는 자원을 배정할 수 없습니다.`,
      { userId: user.id, status: user.status });
  }
  if (!meetsMinRole(user, resource)) {
    throw conflict(`'${resource.name}'은 ${ROLE_INFO[resource.minRole].label} 이상만 이용할 수 있습니다. (${user.name}님: ${ROLE_INFO[user.role].label})`,
      { userId: user.id, minRole: resource.minRole, role: user.role });
  }
}

// BR-05: Capo는 자신이 책임자인 Crew의 소속원에게만 자원을 배정하고 그 배정을 관리한다.
async function assertCanManageMemberResources(actor, user, db) {
  if (access.isOrgManager(actor)) return;
  if (actor.role === 'CAPO' && (await access.isInCapoCrew(actor, user.id, db))) return;
  if (actor.role === 'CAPO') {
    throw forbidden(`Capo는 자신이 책임자인 Crew의 소속원에게만 자원을 배정할 수 있습니다. (${user.name}님은 이 Crew 소속이 아닙니다)`,
      { rule: 'BR-05', userId: user.id });
  }
  throw forbidden('구성원 자원 배정을 관리할 권한이 없습니다.');
}

// 자원 행을 ID 순서로 잠근다 (교착 상태 방지).
async function lockResources(conn, ids) {
  const resources = new Map();
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) resources.set(id, await resourceModel.findById(id, conn, { forUpdate: true }));
  return resources;
}

module.exports = {
  isResourceManager,
  meetsMinRole,
  assertPeriod,
  assertNotPast,
  assertAssignable,
  presentConflicts,
  assertNoConflict,
  assertMemberCanUse,
  assertCanManageMemberResources,
  lockResources,
};
