// 응답에 들어갈 사용자·Crew 요약을 한 번에 불러온다 (행마다 따로 조회하지 않도록).
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');

const uniq = (ids) => [...new Set(ids.filter((id) => id != null))];

async function loadRefs({ userIds = [], crewIds = [] }, db) {
  const [users, crews] = await Promise.all([
    userModel.findByIds(uniq(userIds), db),
    crewModel.findByIds(uniq(crewIds), db),
  ]);
  return {
    users: new Map(users.map((u) => [u.id, u])),
    crews: new Map(crews.map((c) => [c.id, c])),
  };
}

module.exports = { loadRefs };
