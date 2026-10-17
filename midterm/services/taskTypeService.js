// 업무 유형 (FR-07)
const taskTypeModel = require('../models/sql/taskTypeModel');
const auditService = require('./auditService');
const { requireTaskType } = require('./lookup');
const P = require('./presenters');
const { conflict } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

const typeTarget = (type) => ({ entity: 'taskType', id: String(type.id), label: type.name });

async function assertNameAvailable(name, exceptId) {
  const same = await taskTypeModel.findByName(name);
  if (same && same.id !== exceptId) throw conflict('이미 같은 이름의 업무 유형이 있습니다.', { field: 'body.name' }, 'DUPLICATE');
}

async function presentById(id) {
  const type = (await taskTypeModel.listWithUsage()).find((t) => t.id === id);
  return P.presentTaskType(type);
}

// #56 업무 유형 등록
async function create(actor, { name, description }, ctx) {
  await assertNameAvailable(name);
  const id = await taskTypeModel.insert({ name, description });
  await auditService.record({ actor, action: 'TASK_TYPE_CREATED', target: typeTarget({ id, name }), after: { name, description }, ip: ctx.ip });
  return presentById(id);
}

// #57 업무 유형 목록 (유형별 업무 수 포함)
async function list() {
  return (await taskTypeModel.listWithUsage()).map(P.presentTaskType);
}

// #58 업무 유형 수정
async function update(actor, typeId, changes, ctx) {
  const type = await requireTaskType(typeId);
  if (changes.name !== undefined) await assertNameAvailable(changes.name, typeId);
  const { before, after, changed } = changedFields(type, changes);
  if (changed) {
    await taskTypeModel.update(typeId, after);
    await auditService.record({ actor, action: 'TASK_TYPE_UPDATED', target: typeTarget(type), before, after, ip: ctx.ip });
  }
  return presentById(typeId);
}

// #59 사용되지 않은 유형 삭제
async function remove(actor, typeId, ctx) {
  const type = await requireTaskType(typeId);
  const taskCount = await taskTypeModel.usage(typeId);
  if (taskCount > 0) throw conflict(`이 유형을 쓰는 업무가 ${taskCount}건 있어 삭제할 수 없습니다.`, { taskCount });
  await taskTypeModel.remove(typeId);
  await auditService.record({ actor, action: 'TASK_TYPE_DELETED', target: typeTarget(type), before: { name: type.name }, ip: ctx.ip });
  return { id: typeId, deleted: true };
}

module.exports = { create, list, update, remove };
