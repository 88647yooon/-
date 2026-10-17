// resource_maintenances 테이블 접근. 자원 점검 기록 (FR-16). 진행 중인 점검 = completed_at이 NULL인 행
const { getPool } = require('../../config/database');
const { where, like } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'resource_id', 'source', 'reason', 'expected_end_at', 'usage_id', 'started_at', 'started_by',
  'completed_at', 'completed_by', 'result', 'result_note', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const M_COLUMNS = FIELDS.map((f) => `m.${f}`).join(', ');

function toMaintenance(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    source: row.source,
    reason: row.reason,
    expectedEndAt: row.expected_end_at,
    usageId: row.usage_id,
    startedAt: row.started_at,
    startedBy: row.started_by,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    result: row.result,
    resultNote: row.result_note,
    updatedAt: row.updated_at,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_maintenances WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toMaintenance(rows[0]);
}

async function findOpenByResource(resourceId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_maintenances WHERE resource_id = ? AND completed_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [resourceId],
  );
  return toMaintenance(rows[0]);
}

async function findOpenByResources(resourceIds, db = getPool()) {
  if (resourceIds.length === 0) return new Map();
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_maintenances WHERE resource_id IN (?) AND completed_at IS NULL`, [resourceIds]);
  return new Map(rows.map((r) => [r.resource_id, toMaintenance(r)]));
}

async function insert({ resourceId, source = 'MANUAL', reason, expectedEndAt = null, usageId = null, startedBy }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO resource_maintenances (resource_id, source, reason, expected_end_at, usage_id, started_by) VALUES (?, ?, ?, ?, ?, ?)',
    [resourceId, source, reason, expectedEndAt, usageId, startedBy],
  );
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const columns = { reason: 'reason', expectedEndAt: 'expected_end_at' };
  const entries = Object.entries(fields).filter(([key]) => columns[key]);
  if (entries.length === 0) return;
  await db.query(`UPDATE resource_maintenances SET ${entries.map(([k]) => `${columns[k]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, v]) => v), id]);
}

async function complete(id, { result, note = null, completedBy }, db = getPool()) {
  await db.query(
    'UPDATE resource_maintenances SET completed_at = NOW(), completed_by = ?, result = ?, result_note = ? WHERE id = ? AND completed_at IS NULL',
    [completedBy, result, note, id],
  );
}

// #126 자원별 점검 이력 (최근 순)
async function searchByResource(resourceId, paging, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_maintenances WHERE resource_id = ? ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
    [resourceId, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM resource_maintenances WHERE resource_id = ?', [resourceId]);
  return { rows: rows.map(toMaintenance), total };
}

// #129 진행 중인 점검 전체 (예정일이 지난 것부터). overdue=true면 예정일이 지난 것만.
async function searchOpen({ overdue, categoryId, source, q, ...paging }, db = getPool()) {
  const w = where([
    ['m.completed_at IS NULL'],
    overdue === true && ['m.expected_end_at < NOW()'],
    overdue === false && ['(m.expected_end_at IS NULL OR m.expected_end_at >= NOW())'],
    categoryId && ['r.category_id = ?', categoryId],
    source && ['m.source = ?', source],
    q && ['(r.name LIKE ? OR r.code LIKE ? OR m.reason LIKE ?)', like(q), like(q), like(q)],
  ]);
  const from = 'FROM resource_maintenances m JOIN resources r ON r.id = m.resource_id';
  const [rows] = await db.query(
    `SELECT ${M_COLUMNS} ${from} ${w.sql}
     ORDER BY m.expected_end_at IS NULL, m.expected_end_at, m.started_at, m.id LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${w.sql}`, w.params);
  return { rows: rows.map(toMaintenance), total };
}

module.exports = { findById, findOpenByResource, findOpenByResources, insert, update, complete, searchByResource, searchOpen };
