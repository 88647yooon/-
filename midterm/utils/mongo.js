// MongoDB 조회 도구: 문서 ID 확인, 기간 조건, 검색어, 목록 페이지 (AR-03, NFR-04)
const mongoose = require('mongoose');

// 경로로 받은 문서 ID가 올바른 ObjectId 문자열인지 (아니면 찾을 수 없는 것으로 본다)
const isObjectId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === id;

// 검색어를 정규식 글자 그대로 찾도록 이스케이프한다.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (q) => ({ $regex: escapeRegex(q), $options: 'i' });

// field가 [from, to) 안에 있는 문서 (둘 다 없으면 조건 없음)
const periodFilter = (field, from, to) => (from || to ? { [field]: { ...(from && { $gte: from }), ...(to && { $lt: to }) } } : {});

// 정렬 문자열('createdAt' 또는 '-createdAt')을 MongoDB 정렬로 바꾼다. 같은 값이면 _id로 순서를 고정한다.
function sortOf(sort, fields) {
  const desc = sort.startsWith('-');
  return { [fields[desc ? sort.slice(1) : sort]]: desc ? -1 : 1, _id: desc ? -1 : 1 };
}

async function findPage(Model, filter, { sort, page, size }) {
  const [docs, total] = await Promise.all([
    Model.find(filter).sort(sort).skip((page - 1) * size).limit(size).lean(),
    Model.countDocuments(filter),
  ]);
  return { docs, total };
}

module.exports = { isObjectId, escapeRegex, contains, periodFilter, sortOf, findPage };
