// 응답에 들어갈 사용자·Crew·업무·업무 유형·자원·자원 분류 요약을 한 번에 불러온다 (행마다 따로 조회하지 않도록).
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const taskModel = require('../models/sql/taskModel');
const taskTypeModel = require('../models/sql/taskTypeModel');
const resourceModel = require('../models/sql/resourceModel');
const resourceCategoryModel = require('../models/sql/resourceCategoryModel');

const uniq = (ids) => [...new Set(ids.filter((id) => id != null))];
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

async function loadRefs({ userIds = [], crewIds = [], taskIds = [], typeIds = [], resourceIds = [], categoryIds = [] }, db) {
  // 업무와 자원을 먼저 불러와 그 Crew와 분류도 함께 채운다.
  const [tasks, resources] = await Promise.all([taskModel.findByIds(uniq(taskIds), db), resourceModel.findByIds(uniq(resourceIds), db)]);
  const [users, crews, types, categories] = await Promise.all([
    userModel.findByIds(uniq(userIds), db),
    crewModel.findByIds(uniq([...crewIds, ...tasks.map((t) => t.crewId)]), db),
    taskTypeModel.findByIds(uniq(typeIds), db),
    resourceCategoryModel.findByIds(uniq([...categoryIds, ...resources.map((r) => r.categoryId)]), db),
  ]);
  return {
    users: byId(users), crews: byId(crews), tasks: byId(tasks), types: byId(types), resources: byId(resources), categories: byId(categories),
  };
}

module.exports = { loadRefs };
