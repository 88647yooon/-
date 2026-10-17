// 자원 분류 (FR-13)
const resourceCategoryModel = require('../models/sql/resourceCategoryModel');
const auditService = require('./auditService');
const { requireResourceCategory } = require('./lookup');
const P = require('./presenters');
const { conflict } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

const categoryTarget = (c) => ({ entity: 'resourceCategory', id: String(c.id), label: c.name });

async function assertNameAvailable(name, exceptId) {
  const same = await resourceCategoryModel.findByName(name);
  if (same && same.id !== exceptId) throw conflict('이미 같은 이름의 자원 분류가 있습니다.', { field: 'body.name' }, 'DUPLICATE');
}

async function presentById(id) {
  return P.presentCategory((await resourceCategoryModel.listWithCounts()).find((c) => c.id === id));
}

// #110 자원 분류 등록
async function create(actor, { name, description }, ctx) {
  await assertNameAvailable(name);
  const id = await resourceCategoryModel.insert({ name, description });
  await auditService.record({ actor, action: 'RESOURCE_CATEGORY_CREATED', target: categoryTarget({ id, name }), after: { name, description }, ip: ctx.ip });
  return presentById(id);
}

// #111 분류 목록 (분류별 자원 수와 사용가능 자원 수)
async function list() {
  return (await resourceCategoryModel.listWithCounts()).map(P.presentCategory);
}

// #112 분류 수정
async function update(actor, categoryId, changes, ctx) {
  const category = await requireResourceCategory(categoryId);
  if (changes.name !== undefined) await assertNameAvailable(changes.name, categoryId);
  const { before, after, changed } = changedFields(category, changes);
  if (changed) {
    await resourceCategoryModel.update(categoryId, after);
    await auditService.record({ actor, action: 'RESOURCE_CATEGORY_UPDATED', target: categoryTarget(category), before, after, ip: ctx.ip });
  }
  return presentById(categoryId);
}

// #113 자원이 없는 분류 삭제. 업무의 필요 자원으로 지정된 분류도 지울 수 없다.
async function remove(actor, categoryId, ctx) {
  const category = await requireResourceCategory(categoryId);
  const usage = await resourceCategoryModel.usage(categoryId);
  if (usage.resources > 0) throw conflict(`이 분류에 자원이 ${usage.resources}개 있어 삭제할 수 없습니다.`, usage);
  if (usage.requirements > 0) throw conflict(`이 분류를 필요 자원으로 지정한 업무가 ${usage.requirements}건 있어 삭제할 수 없습니다.`, usage);
  await resourceCategoryModel.remove(categoryId);
  await auditService.record({ actor, action: 'RESOURCE_CATEGORY_DELETED', target: categoryTarget(category), before: { name: category.name }, ip: ctx.ip });
  return { id: categoryId, deleted: true };
}

module.exports = { create, list, update, remove };
