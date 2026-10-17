// 경로의 ID로 대상을 찾고, 없으면 404를 던진다.
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const taskModel = require('../models/sql/taskModel');
const taskTypeModel = require('../models/sql/taskTypeModel');
const resourceModel = require('../models/sql/resourceModel');
const resourceCategoryModel = require('../models/sql/resourceCategoryModel');
const { notFound } = require('../utils/errors');

async function requireUser(id, db, options) {
  const user = await userModel.findById(id, db, options);
  if (!user) throw notFound(`구성원(ID ${id})을 찾을 수 없습니다.`);
  return user;
}

async function requireCrew(id, db, options) {
  const crew = await crewModel.findById(id, db, options);
  if (!crew) throw notFound(`Crew(ID ${id})를 찾을 수 없습니다.`);
  return crew;
}

async function requireTask(id, db, options) {
  const task = await taskModel.findById(id, db, options);
  if (!task) throw notFound(`업무(ID ${id})를 찾을 수 없습니다.`);
  return task;
}

async function requireTaskType(id, db) {
  const type = await taskTypeModel.findById(id, db);
  if (!type) throw notFound(`업무 유형(ID ${id})을 찾을 수 없습니다.`);
  return type;
}

async function requireResource(id, db, options) {
  const resource = await resourceModel.findById(id, db, options);
  if (!resource) throw notFound(`자원(ID ${id})을 찾을 수 없습니다.`);
  return resource;
}

async function requireResourceCategory(id, db) {
  const category = await resourceCategoryModel.findById(id, db);
  if (!category) throw notFound(`자원 분류(ID ${id})를 찾을 수 없습니다.`);
  return category;
}

module.exports = { requireUser, requireCrew, requireTask, requireTaskType, requireResource, requireResourceCategory };
