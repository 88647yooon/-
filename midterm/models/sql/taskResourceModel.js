// task_resources·task_resource_requirements 테이블 접근. 업무 자원 할당과 필요 자원 분류 (FR-07, FR-17).
// 진행 중인 할당 = released_at이 NULL인 행
const { getPool } = require('../../config/database');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

const FIELDS = ['id', 'task_id', 'resource_id', 'start_at', 'end_at', 'note', 'allocated_by', 'allocated_at',
  'released_at', 'release_reason', 'released_by'];
const COLUMNS = FIELDS.join(', ');
const TR_COLUMNS = FIELDS.map((f) => `tr.${f}`).join(', ');

function toAllocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    resourceId: row.resource_id,
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note,
    allocatedBy: row.allocated_by,
    allocatedAt: row.allocated_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    releasedBy: row.released_by,
  };
}

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_resources WHERE id = ?`, [id]);
  return toAllocation(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_resources WHERE id IN (?)`, [ids]);
  return rows.map(toAllocation);
}

async function findActive(taskId, resourceId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_resources WHERE task_id = ? AND resource_id = ? AND released_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [taskId, resourceId],
  );
  return toAllocation(rows[0]);
}

async function listActiveByTask(taskId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_resources WHERE task_id = ? AND released_at IS NULL ORDER BY start_at, id${forUpdate ? ' FOR UPDATE' : ''}`,
    [taskId],
  );
  return rows.map(toAllocation);
}

async function listActiveByTasks(taskIds, db = getPool()) {
  if (taskIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_resources WHERE task_id IN (?) AND released_at IS NULL ORDER BY start_at, id`,
    [taskIds],
  );
  return rows.map(toAllocation);
}

async function insert({ taskId, resourceId, startAt, endAt, note = null, allocatedBy = null }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO task_resources (task_id, resource_id, start_at, end_at, note, allocated_by) VALUES (?, ?, ?, ?, ?, ?)',
    [taskId, resourceId, startAt, endAt, note, allocatedBy],
  );
  return result.insertId;
}

async function setWindow(id, { startAt, endAt }, db = getPool()) {
  await db.query('UPDATE task_resources SET start_at = ?, end_at = ? WHERE id = ?', [startAt, endAt, id]);
}

async function release(id, { reason, releasedBy = null }, db = getPool()) {
  await db.query(
    'UPDATE task_resources SET released_at = NOW(), release_reason = ?, released_by = ? WHERE id = ? AND released_at IS NULL',
    [reason, releasedBy, id],
  );
}

// 업무를 삭제할 때 할당 기록도 지운다 (사용 기록이 없는 계획 상태 업무만 삭제할 수 있다).
async function removeByTask(taskId, db = getPool()) {
  await db.query('DELETE FROM task_resources WHERE task_id = ?', [taskId]);
}

// 사용 시작 근거: userId가 현재 참여 중인 끝나지 않은 업무에서, 지금이 할당 시간대 안에 있는 이 자원의 할당
async function findUsableByParticipant(resourceId, userId, { taskId } = {}, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${TR_COLUMNS} FROM task_resources tr
       JOIN tasks t ON t.id = tr.task_id
       JOIN task_assignees a ON a.task_id = tr.task_id AND a.user_id = ? AND a.released_at IS NULL
      WHERE tr.resource_id = ? AND tr.released_at IS NULL AND t.status IN (?)
        AND tr.start_at <= NOW() AND NOW() < tr.end_at ${taskId ? 'AND tr.task_id = ?' : ''}
      ORDER BY tr.start_at, tr.id LIMIT 1`,
    [userId, resourceId, OPEN_TASK_STATUSES, ...(taskId ? [taskId] : [])],
  );
  return toAllocation(rows[0]);
}

// ---------------------------------------------------------------------------
// 필요 자원 분류

async function listRequirements(taskId, db = getPool()) {
  const [rows] = await db.query(
    'SELECT category_id, quantity FROM task_resource_requirements WHERE task_id = ? ORDER BY category_id',
    [taskId],
  );
  return rows.map((r) => ({ categoryId: r.category_id, quantity: r.quantity }));
}

async function replaceRequirements(taskId, items, db = getPool()) {
  await db.query('DELETE FROM task_resource_requirements WHERE task_id = ?', [taskId]);
  if (items.length === 0) return;
  await db.query('INSERT INTO task_resource_requirements (task_id, category_id, quantity) VALUES ?',
    [items.map((i) => [taskId, i.categoryId, i.quantity])]);
}

// 업무에 할당된 자원 수 (분류별)
async function countActiveByCategory(taskId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT r.category_id, COUNT(*) AS cnt FROM task_resources tr JOIN resources r ON r.id = tr.resource_id
      WHERE tr.task_id = ? AND tr.released_at IS NULL GROUP BY r.category_id`,
    [taskId],
  );
  return new Map(rows.map((r) => [r.category_id, r.cnt]));
}

module.exports = {
  findById,
  findByIds,
  findActive,
  listActiveByTask,
  listActiveByTasks,
  insert,
  setWindow,
  release,
  removeByTask,
  findUsableByParticipant,
  listRequirements,
  replaceRequirements,
  countActiveByCategory,
};
