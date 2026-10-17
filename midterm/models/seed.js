// 서버 시작 시 비어 있는 테이블에만 시드 데이터를 넣는다. 이미 데이터가 있으면 건드리지 않는다.
const bcrypt = require('bcryptjs');
const config = require('../config');
const { withTransaction } = require('../config/database');
const userModel = require('./sql/userModel');
const crewModel = require('./sql/crewModel');
const membershipModel = require('./sql/membershipModel');
const capoTermModel = require('./sql/capoTermModel');
const joinRequestModel = require('./sql/joinRequestModel');
const roleRequestModel = require('./sql/roleRequestModel');
const seedData = require('./seedData');

async function seedUsers() {
  if ((await userModel.count()) > 0) return 0;
  const passwordHash = await bcrypt.hash(config.seedPassword, config.auth.bcryptRounds);
  return userModel.insertMany(seedData.users.map((u) => ({ ...u, passwordHash })));
}

// Crew, 소속, 책임자 임기, 대기 중인 소속 신청·역할 변경 요청
async function seedCrews() {
  if ((await crewModel.count()) > 0) return 0;
  const users = await userModel.findByUsernames(seedData.users.map((u) => u.username));
  const byName = new Map(users.map((u) => [u.username, u]));
  const boss = byName.get('boss');

  return withTransaction(async (conn) => {
    for (const c of seedData.crews) {
      const crewId = await crewModel.insert({
        name: c.name, region: c.region, description: c.description, underbossId: byName.get(c.underboss).id, createdBy: boss.id,
      }, conn);
      for (const [username, type] of c.members) {
        await membershipModel.insert({ crewId, userId: byName.get(username).id, type, addedBy: boss.id, note: '초기 편성' }, conn);
      }
      const capo = byName.get(c.capo);
      await crewModel.setCapo(crewId, capo.id, conn);
      await capoTermModel.start({ crewId, userId: capo.id, assignedBy: boss.id, reason: '초기 편성' }, conn);
    }
    for (const r of seedData.joinRequests) {
      const crew = await crewModel.findByName(r.crew, conn);
      await joinRequestModel.insert({ crewId: crew.id, userId: byName.get(r.username).id, type: r.type, message: r.message }, conn);
    }
    for (const r of seedData.roleRequests) {
      const user = byName.get(r.username);
      await roleRequestModel.insert({
        userId: user.id, requestedBy: byName.get(r.requestedBy).id, fromRole: user.role, toRole: r.toRole, reason: r.reason,
      }, conn);
    }
    return seedData.crews.length;
  });
}

async function seed() {
  const users = await seedUsers();
  const crews = await seedCrews();
  return { users, crews };
}

module.exports = { seed };
