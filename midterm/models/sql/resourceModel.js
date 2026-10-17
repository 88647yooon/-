// resources 테이블 접근. 자원과 현재 상태, 이용 최소 역할 (FR-13, FR-14, FR-16).
const { getPool } = require('../../config/database');
const { where, like, orderBy, RANK_SQL } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');
const { RESOURCE_STATUS_INFO } = require('../../config/constants');
const { freeCondition } = require('./resourceScheduleModel');

const FIELDS = ['id', 'code', 'name', 'category_id', 'location', 'description', 'status', 'min_role', 'status_changed_at',
  'created_by', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const R_COLUMNS = FIELDS.map((f) => `r.${f}`).join(', ');

const EDITABLE = { code: 'code', name: 'name', categoryId: 'category_id', location: 'location', description: 'description' };
const STATUS_SQL = "FIELD(r.status, 'AVAILABLE', 'IN_USE', 'MAINTENANCE', 'UNAVAILABLE')";
const SORT_COLUMNS = { code: 'r.code', name: 'r.name', status: STATUS_SQL, location: 'r.location', createdAt: 'r.created_at' };
const ASSIGNABLE_STATUSES = Object.keys(RESOURCE_STATUS_INFO).filter((s) => RESOURCE_STATUS_INFO[s].assignable);

function toResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.category_id,
    location: row.location,
    description: row.description,
    status: row.status,
    minRole: row.min_role,
    statusChangedAt: row.status_changed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resources WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toResource(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resources WHERE id IN (?)`, [ids]);
  return rows.map(toResource);
}

async function findByCodes(codes, db = getPool()) {
  if (codes.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resources WHERE code IN (?)`, [codes]);
  return rows.map(toResource);
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM resources');
  return row.cnt;
}

async function insert(r, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO resources (code, name, category_id, location, description, min_role, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [r.code, r.name, r.categoryId, r.location ?? null, r.description ?? null, r.minRole, r.createdBy ?? null],
  );
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => EDITABLE[key]);
  if (entries.length === 0) return;
  await db.query(`UPDATE resources SET ${entries.map(([k]) => `${EDITABLE[k]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, v]) => v), id]);
}

async function setStatus(id, status, db = getPool()) {
  await db.query('UPDATE resources SET status = ?, status_changed_at = NOW() WHERE id = ?', [status, id]);
}

async function setMinRole(id, minRole, db = getPool()) {
  await db.query('UPDATE resources SET min_role = ? WHERE id = ?', [minRole, id]);
}

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM resources WHERE id = ?', [id]);
}

// 삭제 가능 여부 판단용. 하나라도 0이 아니면 사용 이력이 있는 자원이다.
async function usage(id, db = getPool()) {
  const [[row]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM task_resources WHERE resource_id = ?) AS taskAllocations,
            (SELECT COUNT(*) FROM resource_allocations WHERE resource_id = ?) AS memberAllocations,
            (SELECT COUNT(*) FROM resource_requests WHERE resource_id = ?) AS requests,
            (SELECT COUNT(*) FROM resource_usages WHERE resource_id = ?) AS usages,
            (SELECT COUNT(*) FROM resource_maintenances WHERE resource_id = ?) AS maintenances`,
    [id, id, id, id, id],
  );
  return row;
}

const commonConds = ({ categoryId, location, q }) => [
  categoryId && ['r.category_id = ?', categoryId],
  location && ['r.location LIKE ?', like(location)],
  q && ['(r.name LIKE ? OR r.code LIKE ? OR r.description LIKE ?)', like(q), like(q), like(q)],
];

async function page(w, sort, paging, db) {
  const [rows] = await db.query(
    `SELECT ${R_COLUMNS} FROM resources r ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'r.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resources r ${w.sql}`, w.params);
  return { rows: rows.map(toResource), total };
}

// #116 관리용 전체 자원 목록 (FR-13, FR-16). assignable=false면 점검중·사용불가 자원만 본다.
async function search({ status, categoryId, location, minRole, assignable, q, sort = 'code', ...paging }, db = getPool()) {
  const w = where([
    status && ['r.status = ?', status],
    minRole && ['r.min_role = ?', minRole],
    assignable === true && ['r.status IN (?)', ASSIGNABLE_STATUSES],
    assignable === false && ['r.status NOT IN (?)', ASSIGNABLE_STATUSES],
    ...commonConds({ categoryId, location, q }),
  ]);
  return page(w, sort, paging, db);
}

// #117 이용 가능한 자원 (FR-14): 내 역할 순위가 최소 역할 이상이고, 배정 가능한 상태이며, 그 시간대가 비어 있는 자원
async function searchAvailable({ rank, startAt, endAt, categoryId, location, q, sort = 'code', ...paging }, db = getPool()) {
  const w = where([
    [`${RANK_SQL('r.min_role')} <= ?`, rank],
    ['r.status IN (?)', ASSIGNABLE_STATUSES],
    freeCondition('r', { startAt, endAt }),
    ...commonConds({ categoryId, location, q }),
  ]);
  return page(w, sort, paging, db);
}

// #134 업무 자원 후보 (FR-17, BR-07, BR-08): 배정 가능한 상태, 업무 시간대가 비어 있고, 이 업무에 아직 할당되지 않은 자원.
// categoryIds를 주면 그 분류들로 좁힌다 (필요 자원 분류 일치).
async function searchTaskCandidates({ taskId, startAt, endAt, categoryIds, location, q, sort = 'code', ...paging }, db = getPool()) {
  const w = where([
    ['r.status IN (?)', ASSIGNABLE_STATUSES],
    freeCondition('r', { startAt, endAt }),
    ['NOT EXISTS (SELECT 1 FROM task_resources x WHERE x.task_id = ? AND x.resource_id = r.id AND x.released_at IS NULL)', taskId],
    categoryIds?.length && ['r.category_id IN (?)', categoryIds],
    ...commonConds({ location, q }),
  ]);
  return page(w, sort, paging, db);
}

module.exports = {
  ASSIGNABLE_STATUSES,
  findById,
  findByIds,
  findByCodes,
  count,
  insert,
  update,
  setStatus,
  setMinRole,
  remove,
  usage,
  search,
  searchAvailable,
  searchTaskCandidates,
};
