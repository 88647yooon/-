// 통합 검색과 저장 검색 (FR-21, NFR-04). 구성원·Crew·업무·자원을 한 번에 찾되, 종류마다 요청자의 권한 범위 안에서만 찾는다.
// - 구성원: 구성원 목록 권한(user.list)이 있을 때 (Associate는 볼 수 없다)
// - Crew: 모든 로그인 사용자
// - 업무: 업무 탐색 권한(task.list)이 있으면 관리 범위의 업무(Capo는 자기 Crew), 없으면 내가 참여 중인 업무만
// - 자원: 관리용 목록 권한(resource.monitor)이 있으면 전체, 이용 권한(resource.read)만 있으면 내 역할로 이용할 수 있는 자원만
const SavedSearch = require('../models/mongo/SavedSearch');
const taskModel = require('../models/sql/taskModel');
const resourceModel = require('../models/sql/resourceModel');
const permissionService = require('./permissionService');
const userService = require('./userService');
const crewService = require('./crewService');
const taskService = require('./taskService');
const resourceService = require('./resourceService');
const { ROLE_INFO } = require('../config/constants');
const { forbidden, conflict, notFound } = require('../utils/errors');
const { isObjectId } = require('../utils/mongo');

const SEARCH_TYPES = ['users', 'crews', 'tasks', 'resources'];
const SAVED_SEARCH_LIMIT = 20;

const restricted = (message) => ({ restricted: true, message, total: 0, items: [] });
const found = ({ data, meta }) => ({ restricted: false, total: meta.total, items: data });

const SEARCHERS = {
  async users(actor, q, paging) {
    if (!(await permissionService.has(actor.role, 'user.list'))) return restricted('구성원 목록을 볼 권한이 없습니다.');
    return found(await userService.list(actor, { q, sort: 'name', ...paging }));
  },
  async crews(actor, q, paging) {
    return found(await crewService.list(actor, { q, sort: 'name', ...paging }));
  },
  async tasks(actor, q, paging) {
    if (await permissionService.has(actor.role, 'task.list')) return found(await taskService.list(actor, { q, sort: 'startAt', ...paging }));
    if (!(await permissionService.has(actor.role, 'task.read'))) return restricted('업무를 볼 권한이 없습니다.');
    const { rows, total } = await taskModel.search({ assigneeId: actor.id, q, sort: 'startAt', ...paging });
    return { restricted: false, scope: 'participant', total, items: await taskService.presentTasks(rows) };
  },
  async resources(actor, q, paging) {
    if (await permissionService.has(actor.role, 'resource.monitor')) return found(await resourceService.list(actor, { q, sort: 'code', ...paging }));
    if (!(await permissionService.has(actor.role, 'resource.read'))) return restricted('자원을 볼 권한이 없습니다.');
    const { rows, total } = await resourceModel.search({ q, maxRank: ROLE_INFO[actor.role].rank, sort: 'code', ...paging });
    return { restricted: false, scope: 'usable', total, items: await resourceService.presentResources(rows) };
  },
};

// #180 통합 검색. types로 종류를 고르고(기본: 전부), page·size는 종류마다 적용한다.
async function search(actor, { q, types, page = 1, size = 5 }) {
  const selected = types?.length ? SEARCH_TYPES.filter((t) => types.includes(t)) : SEARCH_TYPES;
  const results = {};
  for (const type of selected) results[type] = await SEARCHERS[type](actor, q, { page, size });
  return { q, types: selected, page, size, total: Object.values(results).reduce((sum, r) => sum + r.total, 0), results };
}

const presentSaved = (s) => ({
  id: String(s._id), name: s.name, q: s.params.q, types: s.params.types?.length ? s.params.types : SEARCH_TYPES,
  runCount: s.runCount, lastRunAt: s.lastRunAt ?? null, createdAt: s.createdAt,
});

// #181 검색 조건 저장 (한 사람당 20개, 이름은 겹칠 수 없다)
async function save(actor, { name, q, types }) {
  if ((await SavedSearch.countDocuments({ userId: actor.id })) >= SAVED_SEARCH_LIMIT) {
    throw conflict(`검색 조건은 ${SAVED_SEARCH_LIMIT}개까지 저장할 수 있습니다. 쓰지 않는 조건을 지우세요.`);
  }
  try {
    const doc = await SavedSearch.create({ userId: actor.id, name, params: { q, types: types ?? [] } });
    return presentSaved(doc.toObject());
  } catch (err) {
    if (err.code === 11000) throw conflict(`같은 이름('${name}')의 저장 검색이 있습니다.`, { field: 'body.name' }, 'DUPLICATE');
    throw err;
  }
}

// #182 내 저장 검색 목록 (최근 실행·저장 순)
async function list(actor) {
  const docs = await SavedSearch.find({ userId: actor.id }).sort({ lastRunAt: -1, createdAt: -1 }).lean();
  return docs.map(presentSaved);
}

async function requireOwn(actor, searchId) {
  const doc = isObjectId(searchId) ? await SavedSearch.findById(searchId).lean() : null;
  if (!doc) throw notFound(`저장 검색(ID ${searchId})을 찾을 수 없습니다.`);
  if (doc.userId !== actor.id) throw forbidden('본인이 저장한 검색만 쓸 수 있습니다.');
  return doc;
}

// #183 저장된 조건으로 검색 실행 (실행할 때의 권한 범위로 찾는다)
async function run(actor, searchId, paging) {
  const doc = await requireOwn(actor, searchId);
  await SavedSearch.updateOne({ _id: doc._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } });
  return { savedSearch: presentSaved({ ...doc, runCount: doc.runCount + 1, lastRunAt: new Date() }), ...(await search(actor, { ...doc.params, ...paging })) };
}

// #184 저장 검색 삭제
async function remove(actor, searchId) {
  const doc = await requireOwn(actor, searchId);
  await SavedSearch.deleteOne({ _id: doc._id });
  return { id: String(doc._id), deleted: true };
}

module.exports = { SEARCH_TYPES, search, save, list, run, remove };
