// 업무 열람·관리 권한 (NFR-03, BR-05)과 완료 업무 잠금 (BR-06).
// Crew 업무는 그 Crew의 책임자(Capo)와 Underboss·Boss가 관리하고, Crew가 없는 조직 업무는 Underboss·Boss만 관리한다.
// 업무의 현재 참여자(진행 중 배정)는 그 업무를 볼 수 있다.
const access = require('./accessService');
const crewModel = require('../models/sql/crewModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const { forbidden, conflict, ruleViolation } = require('../utils/errors');

// Capo가 책임자인 Crew의 ID (없으면 null)
async function capoCrewId(actor, db) {
  if (actor.role !== 'CAPO') return null;
  const crew = await crewModel.findByCapo(actor.id, db);
  return crew ? crew.id : null;
}

async function canManageTask(actor, task, db) {
  if (access.isOrgManager(actor)) return true;
  if (actor.role !== 'CAPO' || !task.crewId) return false;
  return (await capoCrewId(actor, db)) === task.crewId;
}

async function assertCanManageTask(actor, task, db) {
  if (await canManageTask(actor, task, db)) return;
  if (actor.role === 'CAPO') {
    throw forbidden('이 업무를 관리할 권한이 없습니다. Capo는 자신이 책임자인 Crew의 업무만 관리할 수 있습니다.',
      { rule: 'BR-05', taskId: task.id });
  }
  throw forbidden('이 업무를 관리할 권한이 없습니다.', { taskId: task.id });
}

// 볼 수 있으면 관계('manager' 또는 'participant')를 돌려준다.
async function assertCanViewTask(actor, task, db) {
  if (await canManageTask(actor, task, db)) return 'manager';
  if (await taskAssigneeModel.findActive(task.id, actor.id, db)) return 'participant';
  throw forbidden('이 업무의 참여자, 담당 Crew 책임자, Underboss·Boss만 볼 수 있습니다.', { taskId: task.id });
}

// BR-06: 완료된 업무의 내용·배정·결과는 바꿀 수 없다. 취소된 업무도 바꿀 수 없다.
function assertTaskOpen(task) {
  if (task.status === 'COMPLETED') {
    throw ruleViolation('BR-06', '완료된 업무의 내용·배정·결과는 바꿀 수 없습니다. 결과 정정은 Underboss·Boss만 할 수 있습니다.',
      { taskId: task.id });
  }
  if (task.status === 'CANCELLED') throw conflict('취소된 업무는 바꿀 수 없습니다.', { taskId: task.id });
}

module.exports = { capoCrewId, canManageTask, assertCanManageTask, assertCanViewTask, assertTaskOpen };
