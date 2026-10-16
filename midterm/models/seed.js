// 서버 시작 시 비어 있는 테이블에만 시드 데이터를 넣는다. 이미 데이터가 있으면 건드리지 않는다.
const bcrypt = require('bcryptjs');
const config = require('../config');
const userModel = require('./sql/userModel');
const seedData = require('./seedData');

async function seedUsers() {
  if ((await userModel.count()) > 0) return 0;
  const passwordHash = await bcrypt.hash(config.seedPassword, config.auth.bcryptRounds);
  return userModel.insertMany(seedData.users.map((u) => ({ ...u, passwordHash })));
}

async function seed() {
  const result = { users: await seedUsers() };
  return result;
}

module.exports = { seed };
