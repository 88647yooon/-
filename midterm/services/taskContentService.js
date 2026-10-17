// 업무 세부 정보: 지시사항(FR-09), 체크리스트(FR-07, FR-10), 선행 업무(FR-07)
const { withTransaction } = require('../config/database');
const taskContentModel = require('../models/sql/taskContentModel');
const taskAssigneeModel = require('../models/sql/taskAssigneeModel');
const auditService = require('./auditService');
const access = require('./accessService');
const taskAccess = require('./taskAccess');
const { requireTask } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { badRequest, forbidden, conflict, notFound } = require('../utils/errors');

const { taskTarget } = auditService;

// ---------------------------------------------------------------------------
// 지시사항

async function requireNote(task, noteId) {
  const note = await taskContentModel.findNote(noteId);
  if (!note || note.taskId !== task.id) throw notFound(`이 업무의 지시사항(ID ${noteId})을 찾을 수 없습니다.`);
  return note;
}

async function presentNotes(notes) {
  const refs = await loadRefs({ userIds: notes.flatMap((n) => [n.authorId, n.targetUserId]) });
  return notes.map((n) => P.presentNote(n, refs));
}

// #71 지시사항 등록. targetUserId를 주면 그 참여자에게만 보인다.
async function createNote(actor, taskId, { content, targetUserId }, ctx) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  if (task.status === 'CANCELLED') throw conflict('취소된 업무에는 지시사항을 남길 수 없습니다.');
  if (targetUserId && !(await taskAssigneeModel.findActive(taskId, targetUserId))) {
    throw conflict('지시 대상은 이 업무에 배정된 참여자여야 합니다.', { targetUserId });
  }
  const id = await taskContentModel.insertNote({ taskId, authorId: actor.id, targetUserId, content });
  await auditService.record({ actor, action: 'TASK_NOTE_CREATED', target: taskTarget(task), after: { noteId: id, targetUserId: targetUserId ?? null }, ip: ctx.ip });
  return (await presentNotes([await taskContentModel.findNote(id)]))[0];
}

// #72 지시사항 목록. 참여자는 참여자 전체 대상이거나 자신에게 온 지시사항만 본다.
async function listNotes(actor, taskId) {
  const task = await requireTask(taskId);
  const relation = await taskAccess.assertCanViewTask(actor, task);
  const notes = await taskContentModel.listNotes(taskId, relation === 'participant' ? { forUserId: actor.id } : {});
  return presentNotes(notes);
}

// #73 지시사항 수정 (작성자만)
async function updateNote(actor, taskId, noteId, { content }) {
  const task = await requireTask(taskId);
  const note = await requireNote(task, noteId);
  if (note.authorId !== actor.id) throw forbidden('지시사항은 작성자만 수정할 수 있습니다.');
  await taskContentModel.updateNote(noteId, content);
  return (await presentNotes([await taskContentModel.findNote(noteId)]))[0];
}

// #74 지시사항 삭제 (작성자, Underboss·Boss)
async function deleteNote(actor, taskId, noteId) {
  const task = await requireTask(taskId);
  const note = await requireNote(task, noteId);
  if (note.authorId !== actor.id && !access.isOrgManager(actor)) throw forbidden('지시사항은 작성자나 Underboss·Boss만 삭제할 수 있습니다.');
  await taskContentModel.removeNote(noteId);
  return { id: noteId, deleted: true };
}

// ---------------------------------------------------------------------------
// 체크리스트

async function requireItem(task, itemId) {
  const item = await taskContentModel.findItem(itemId);
  if (!item || item.taskId !== task.id) throw notFound(`이 업무의 체크리스트 항목(ID ${itemId})을 찾을 수 없습니다.`);
  return item;
}

async function presentItems(items) {
  const refs = await loadRefs({ userIds: items.map((i) => i.doneBy) });
  return items.map((i) => P.presentChecklistItem(i, refs));
}

const presentItem = async (itemId) => (await presentItems([await taskContentModel.findItem(itemId)]))[0];

// #75 항목 추가 (목록 맨 뒤)
async function addItem(actor, taskId, { content }) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  return presentItem(await taskContentModel.insertItem({ taskId, content, createdBy: actor.id }));
}

// #76 체크리스트와 완료 현황
async function listItems(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  const items = await presentItems(await taskContentModel.listItems(taskId));
  return { taskId, total: items.length, doneCount: items.filter((i) => i.done).length, items };
}

// #77 항목 내용·순서 수정
async function updateItem(actor, taskId, itemId, changes) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  await requireItem(task, itemId);
  await taskContentModel.updateItem(itemId, changes);
  return presentItem(itemId);
}

// #78 항목 완료 표시 (참여자·관리자). done=false면 완료 표시를 지운다.
async function checkItem(actor, taskId, itemId, { done }) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  taskAccess.assertTaskOpen(task);
  const item = await requireItem(task, itemId);
  if ((item.doneAt !== null) === done) throw conflict(done ? '이미 완료 표시된 항목입니다.' : '완료 표시되지 않은 항목입니다.');
  await taskContentModel.setItemDone(itemId, { done, userId: actor.id });
  return presentItem(itemId);
}

// #79 항목 삭제
async function removeItem(actor, taskId, itemId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  await requireItem(task, itemId);
  await taskContentModel.removeItem(itemId);
  return { id: itemId, deleted: true };
}

// ---------------------------------------------------------------------------
// 선행 업무

// #80 선행 업무 지정. 이 업무는 선행 업무가 끝나야 시작할 수 있다. 순환 관계는 거부한다.
async function addDependency(actor, taskId, { dependsOnId }, ctx) {
  if (dependsOnId === taskId) {
    throw badRequest('업무 자신을 선행 업무로 지정할 수 없습니다.', [{ field: 'body.dependsOnId', message: '다른 업무를 지정하세요.' }]);
  }
  const { task, predecessor } = await withTransaction(async (conn) => {
    // 두 업무를 ID 순서로 잠가, 반대 방향 관계가 동시에 생겨 순환이 만들어지는 것을 막는다.
    const locked = new Map();
    for (const id of [taskId, dependsOnId].sort((a, b) => a - b)) locked.set(id, await requireTask(id, conn, { forUpdate: true }));
    const current = locked.get(taskId);
    const dep = locked.get(dependsOnId);
    await taskAccess.assertCanManageTask(actor, current, conn);
    taskAccess.assertTaskOpen(current);
    if (dep.status === 'CANCELLED') throw conflict('취소된 업무는 선행 업무로 지정할 수 없습니다.', { dependsOnId });
    if (await taskContentModel.dependencyExists(taskId, dependsOnId, conn)) throw conflict('이미 지정된 선행 업무입니다.');
    if (await taskContentModel.wouldCreateCycle(taskId, dependsOnId, conn)) {
      throw conflict(`'${dep.title}' 업무가 이미 이 업무를 (직접 또는 간접으로) 기다리고 있어 순환 관계가 됩니다.`, { taskId, dependsOnId });
    }
    await taskContentModel.insertDependency({ taskId, dependsOnId, createdBy: actor.id }, conn);
    return { task: current, predecessor: dep };
  });
  await auditService.record({
    actor, action: 'TASK_DEPENDENCY_ADDED', target: taskTarget(task), related: [taskTarget(predecessor)], after: { dependsOnId }, ip: ctx.ip,
  });
  return listDependencies(actor, taskId);
}

// #81 선행·후행 업무 목록
async function listDependencies(actor, taskId) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanViewTask(actor, task);
  const [before, after] = await Promise.all([taskContentModel.listPredecessorIds(taskId), taskContentModel.listSuccessorIds(taskId)]);
  const refs = await loadRefs({ taskIds: [...before, ...after] });
  const crewRefs = await loadRefs({ crewIds: [...refs.tasks.values()].map((t) => t.crewId) });
  const brief = (id) => P.taskBrief(refs.tasks.get(id), crewRefs);
  return {
    taskId,
    predecessors: before.map(brief),
    successors: after.map(brief),
    waitingFor: before.filter((id) => ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'].includes(refs.tasks.get(id).status)).length,
  };
}

// #82 선행 관계 삭제
async function removeDependency(actor, taskId, dependsOnId, ctx) {
  const task = await requireTask(taskId);
  await taskAccess.assertCanManageTask(actor, task);
  taskAccess.assertTaskOpen(task);
  if ((await taskContentModel.removeDependency(taskId, dependsOnId)) === 0) {
    throw notFound(`업무(ID ${dependsOnId})는 이 업무의 선행 업무가 아닙니다.`);
  }
  await auditService.record({ actor, action: 'TASK_DEPENDENCY_REMOVED', target: taskTarget(task), before: { dependsOnId }, ip: ctx.ip });
  return listDependencies(actor, taskId);
}

module.exports = {
  createNote, listNotes, updateNote, deleteNote,
  addItem, listItems, updateItem, checkItem, removeItem,
  addDependency, listDependencies, removeDependency,
};
