// 업무 배정의 핵심 규칙 (FR-08, BR-02, BR-03). 배정, 교체, 교대 승인, 일정 변경이 모두 이 모듈을 거친다.
// 호출하는 쪽은 트랜잭션 안에서 업무 행과 구성원 행을 FOR UPDATE로 먼저 잠근다.
// BR-03은 UNIQUE 인덱스로 표현할 수 없으므로, 구성원 행 잠금으로 같은 구성원의 배정 변경을 한 줄로 세워 동시 요청을 막는다.
const membershipModel = require('../models/sql/membershipModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const taskAccess = require('./taskAccess');
const { ASSIGNABLE_ROLES, MEMBER_STATUS_INFO } = require('../config/constants');
const { conflict, forbidden, ruleViolation } = require('../utils/errors');

// BR-03: 같은 시간대에 끝나지 않은 다른 업무에 배정되어 있으면 거부한다.
async function assertNoOverlap(conn, user, { startAt, endAt, excludeTaskId }) {
  const overlaps = await taskAssigneeModel.findOverlaps(user.id, { startAt, endAt, excludeTaskId }, conn);
  if (overlaps.length > 0) {
    throw ruleViolation(
      'BR-03',
      `${user.name}님은 같은 시간대에 다른 업무('${overlaps[0].title}')에 배정되어 있습니다. 동시에 수행할 수 없는 업무는 중복 배정할 수 없습니다.`,
      { userId: user.id, conflicts: overlaps },
    );
  }
}

// 이 구성원을 이 업무에 새로 배정할 수 있는지 검사한다.
// actor를 주면 관리 범위도 검사한다 (Capo는 자신이 책임자인 Crew의 소속원만 배정, BR-05).
async function checkAssignable(conn, { task, user, actor }) {
  taskAccess.assertTaskOpen(task);
  if (!ASSIGNABLE_ROLES.includes(user.role)) {
    throw conflict('Administrator는 업무에 배정할 수 없습니다.', { userId: user.id });
  }
  if (user.status === 'SUSPENDED' || user.status === 'WITHDRAWN') {
    throw ruleViolation('BR-02', `${MEMBER_STATUS_INFO[user.status].label} 상태의 구성원(${user.name})은 새 업무에 배정할 수 없습니다.`,
      { userId: user.id, status: user.status });
  }
  if (user.status !== 'ACTIVE') {
    throw conflict(`${MEMBER_STATUS_INFO[user.status].label} 상태의 구성원(${user.name})은 활동중으로 바꾼 뒤 배정할 수 있습니다.`,
      { userId: user.id, status: user.status });
  }
  if (actor?.role === 'CAPO' && !(await membershipModel.findActive(task.crewId, user.id, conn))) {
    throw forbidden(`Capo는 자신이 책임자인 Crew의 소속원만 배정할 수 있습니다. (${user.name}님은 이 Crew 소속이 아닙니다)`,
      { rule: 'BR-05', userId: user.id });
  }
  if (await taskAssigneeModel.findActive(task.id, user.id, conn)) {
    throw conflict(`${user.name}님은 이미 이 업무에 배정되어 있습니다.`, { userId: user.id });
  }
  await assertNoOverlap(conn, user, { startAt: task.startAt, endAt: task.endAt, excludeTaskId: task.id });
}

async function insertAssignment(conn, { task, user, role = 'MEMBER', actor }) {
  try {
    return await taskAssigneeModel.insert({ taskId: task.id, userId: user.id, role, assignedBy: actor.id }, conn);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict(`${user.name}님은 이미 이 업무에 배정되어 있습니다.`, { userId: user.id });
    throw err;
  }
}

module.exports = { assertNoOverlap, checkAssignable, insertAssignment };
