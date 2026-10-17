// 경로의 ID로 대상을 찾고, 없으면 404를 던진다.
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
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

module.exports = { requireUser, requireCrew };
