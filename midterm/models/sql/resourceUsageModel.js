// resource_usages 테이블 접근. 자원 사용·반환 기록 (FR-15, DR-03). 사용 중 = returned_at이 NULL인 행
const { getPool } = require('../../config/database');
const { where, orderBy } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'resource_id', 'user_id', 'task_id', 'task_resource_id', 'allocation_id', 'started_at', 'due_at',
  'returned_at', 'return_condition', 'return_note', 'returned_by', 'handed_over_to', 'handover_from_id',
  'damage_reported_at', 'damage_note'];
const COLUMNS = FIELDS.join(', ');

const SORT_COLUMNS = { startedAt: 'started_at', dueAt: 'due_at', returnedAt: 'returned_at' };

function toUsage(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    userId: row.user_id,
    taskId: row.task_id,
    taskResourceId: row.task_resource_id,
    allocationId: row.allocation_id,
    startedAt: row.started_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    returnCondition: row.return_condition,
    returnNote: row.return_note,
    returnedBy: row.returned_by,
    handedOverTo: row.handed_over_to,
    handoverFromId: row.handover_from_id,
    damageReportedAt: row.damage_reported_at,
    damageNote: row.damage_note,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_usages WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toUsage(rows[0]);
}

async function findOpenByResource(resourceId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_usages WHERE resource_id = ? AND returned_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [resourceId],
  );
  return toUsage(rows[0]);
}

// 자원별 현재 사용 기록 (목록 화면에서 현재 사용자를 한 번에 보여 주기 위해)
async function findOpenByResources(resourceIds, db = getPool()) {
  if (resourceIds.length === 0) return new Map();
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_usages WHERE resource_id IN (?) AND returned_at IS NULL`, [resourceIds]);
  return new Map(rows.map((r) => [r.resource_id, toUsage(r)]));
}

async function listOpenByTask(taskId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_usages WHERE task_id = ? AND returned_at IS NULL ORDER BY resource_id${forUpdate ? ' FOR UPDATE' : ''}`,
    [taskId],
  );
  return rows.map(toUsage);
}

async function countByTask(taskId, db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM resource_usages WHERE task_id = ?', [taskId]);
  return row.cnt;
}

async function insert(u, db = getPool()) {
  const [result] = await db.query(
    `INSERT INTO resource_usages (resource_id, user_id, task_id, task_resource_id, allocation_id, due_at, handover_from_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [u.resourceId, u.userId, u.taskId ?? null, u.taskResourceId ?? null, u.allocationId ?? null, u.dueAt, u.handoverFromId ?? null],
  );
  return result.insertId;
}

async function markReturned(id, { condition, note = null, returnedBy, handedOverTo = null }, db = getPool()) {
  await db.query(
    `UPDATE resource_usages SET returned_at = NOW(), return_condition = ?, return_note = ?, returned_by = ?, handed_over_to = ?
     WHERE id = ? AND returned_at IS NULL`,
    [condition, note, returnedBy, handedOverTo, id],
  );
}

async function setDueAt(id, dueAt, db = getPool()) {
  await db.query('UPDATE resource_usages SET due_at = ? WHERE id = ?', [dueAt, id]);
}

async function markDamaged(id, note, db = getPool()) {
  await db.query('UPDATE resource_usages SET damage_reported_at = NOW(), damage_note = ? WHERE id = ?', [note, id]);
}

// #150 자원별 사용·반환 이력 (최근 순 기본). open=true면 반환되지 않은 것만, false면 반환된 것만.
async function searchByResource(resourceId, { userId, taskId, open, from, to, sort = '-startedAt', ...paging }, db = getPool()) {
  const w = where([
    ['resource_id = ?', resourceId],
    userId && ['user_id = ?', userId],
    taskId && ['task_id = ?', taskId],
    open === true && ['returned_at IS NULL'],
    open === false && ['returned_at IS NOT NULL'],
    from && ['IFNULL(returned_at, NOW()) > ?', from],
    to && ['started_at < ?', to],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_usages ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resource_usages ${w.sql}`, w.params);
  return { rows: rows.map(toUsage), total };
}

// #154 반환 예정 시각이 지난 미반환 사용 (오래 늦은 순)
async function searchOverdue({ userId, ...paging }, db = getPool()) {
  const w = where([['returned_at IS NULL AND due_at < NOW()'], userId && ['user_id = ?', userId]]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_usages ${w.sql} ORDER BY due_at, id LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resource_usages ${w.sql}`, w.params);
  return { rows: rows.map(toUsage), total };
}

// 내가 지금 사용 중인 자원
async function listOpenByUser(userId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_usages WHERE user_id = ? AND returned_at IS NULL ORDER BY started_at`, [userId]);
  return rows.map(toUsage);
}

module.exports = {
  findById,
  findOpenByResource,
  findOpenByResources,
  listOpenByTask,
  countByTask,
  insert,
  markReturned,
  setDueAt,
  markDamaged,
  searchByResource,
  searchOverdue,
  listOpenByUser,
};
