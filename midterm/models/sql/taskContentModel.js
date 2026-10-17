// 업무 세부 정보 테이블 접근: 지시사항(task_notes), 체크리스트(task_checklist_items), 선행 업무(task_dependencies).
const { getPool } = require('../../config/database');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

// ---------------------------------------------------------------------------
// 지시사항 (FR-09)

const NOTE_COLUMNS = 'id, task_id, author_id, target_user_id, content, created_at, updated_at';

function toNote(row) {
  if (!row) return null;
  return {
    id: row.id, taskId: row.task_id, authorId: row.author_id, targetUserId: row.target_user_id,
    content: row.content, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function insertNote({ taskId, authorId, targetUserId = null, content }, db = getPool()) {
  const [result] = await db.query('INSERT INTO task_notes (task_id, author_id, target_user_id, content) VALUES (?, ?, ?, ?)',
    [taskId, authorId, targetUserId, content]);
  return result.insertId;
}

async function findNote(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${NOTE_COLUMNS} FROM task_notes WHERE id = ?`, [id]);
  return toNote(rows[0]);
}

// forUserId를 주면 참여자 전체 대상이거나 그 사람에게 온 지시사항만 돌려준다.
async function listNotes(taskId, { forUserId } = {}, db = getPool()) {
  const filter = forUserId ? 'AND (target_user_id IS NULL OR target_user_id = ?)' : '';
  const [rows] = await db.query(
    `SELECT ${NOTE_COLUMNS} FROM task_notes WHERE task_id = ? ${filter} ORDER BY created_at, id`,
    forUserId ? [taskId, forUserId] : [taskId],
  );
  return rows.map(toNote);
}

async function updateNote(id, content, db = getPool()) {
  await db.query('UPDATE task_notes SET content = ? WHERE id = ?', [content, id]);
}

async function removeNote(id, db = getPool()) {
  await db.query('DELETE FROM task_notes WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// 체크리스트 (FR-07, FR-10)

const ITEM_COLUMNS = 'id, task_id, content, position, done_by, done_at, created_by, created_at, updated_at';

function toItem(row) {
  if (!row) return null;
  return {
    id: row.id, taskId: row.task_id, content: row.content, position: row.position,
    doneBy: row.done_by, doneAt: row.done_at, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// 새 항목은 목록 맨 뒤에 붙는다.
async function insertItem({ taskId, content, createdBy }, db = getPool()) {
  const [result] = await db.query(
    `INSERT INTO task_checklist_items (task_id, content, position, created_by)
     SELECT ?, ?, COALESCE(MAX(position), 0) + 1, ? FROM task_checklist_items WHERE task_id = ?`,
    [taskId, content, createdBy, taskId],
  );
  return result.insertId;
}

async function findItem(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${ITEM_COLUMNS} FROM task_checklist_items WHERE id = ?`, [id]);
  return toItem(rows[0]);
}

async function listItems(taskId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${ITEM_COLUMNS} FROM task_checklist_items WHERE task_id = ? ORDER BY position, id`, [taskId]);
  return rows.map(toItem);
}

async function updateItem(id, { content, position }, db = getPool()) {
  const sets = [];
  const params = [];
  if (content !== undefined) { sets.push('content = ?'); params.push(content); }
  if (position !== undefined) { sets.push('position = ?'); params.push(position); }
  if (sets.length === 0) return;
  await db.query(`UPDATE task_checklist_items SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

async function setItemDone(id, { done, userId }, db = getPool()) {
  await db.query(
    'UPDATE task_checklist_items SET done_by = ?, done_at = IF(?, NOW(), NULL) WHERE id = ?',
    [done ? userId : null, done, id],
  );
}

async function removeItem(id, db = getPool()) {
  await db.query('DELETE FROM task_checklist_items WHERE id = ?', [id]);
}

// 업무 복제 시 체크리스트 항목을 완료 표시 없이 복사한다.
async function copyItems(fromTaskId, toTaskId, createdBy, db = getPool()) {
  await db.query(
    `INSERT INTO task_checklist_items (task_id, content, position, created_by)
     SELECT ?, content, position, ? FROM task_checklist_items WHERE task_id = ? ORDER BY position, id`,
    [toTaskId, createdBy, fromTaskId],
  );
}

// ---------------------------------------------------------------------------
// 선행 업무

async function insertDependency({ taskId, dependsOnId, createdBy }, db = getPool()) {
  await db.query('INSERT INTO task_dependencies (task_id, depends_on_id, created_by) VALUES (?, ?, ?)', [taskId, dependsOnId, createdBy]);
}

async function dependencyExists(taskId, dependsOnId, db = getPool()) {
  const [rows] = await db.query('SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?', [taskId, dependsOnId]);
  return rows.length > 0;
}

async function removeDependency(taskId, dependsOnId, db = getPool()) {
  const [result] = await db.query('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?', [taskId, dependsOnId]);
  return result.affectedRows;
}

// 이 업무가 기다리는 업무(선행)와 이 업무를 기다리는 업무(후행)의 ID
async function listPredecessorIds(taskId, db = getPool()) {
  const [rows] = await db.query('SELECT depends_on_id FROM task_dependencies WHERE task_id = ? ORDER BY created_at', [taskId]);
  return rows.map((r) => r.depends_on_id);
}

async function listSuccessorIds(taskId, db = getPool()) {
  const [rows] = await db.query('SELECT task_id FROM task_dependencies WHERE depends_on_id = ? ORDER BY created_at', [taskId]);
  return rows.map((r) => r.task_id);
}

// taskId → dependsOnId 관계를 더하면 순환이 생기는지: dependsOnId가 (거슬러 올라가) 이미 taskId를 기다리고 있으면 순환이다.
async function wouldCreateCycle(taskId, dependsOnId, db = getPool()) {
  const [rows] = await db.query(
    `WITH RECURSIVE upstream (id) AS (
       SELECT depends_on_id FROM task_dependencies WHERE task_id = ?
       UNION
       SELECT d.depends_on_id FROM task_dependencies d JOIN upstream u ON d.task_id = u.id
     )
     SELECT 1 FROM upstream WHERE id = ? LIMIT 1`,
    [dependsOnId, taskId],
  );
  return rows.length > 0;
}

// 아직 끝나지 않은 선행 업무 (취소된 선행 업무는 기다리지 않는다)
async function unfinishedPredecessors(taskId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT t.id, t.title, t.status FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id
     WHERE d.task_id = ? AND t.status IN (?) ORDER BY t.start_at`,
    [taskId, OPEN_TASK_STATUSES],
  );
  return rows.map((r) => ({ taskId: r.id, title: r.title, status: r.status }));
}

module.exports = {
  insertNote, findNote, listNotes, updateNote, removeNote,
  insertItem, findItem, listItems, updateItem, setItemDone, removeItem, copyItems,
  insertDependency, dependencyExists, removeDependency, listPredecessorIds, listSuccessorIds, wouldCreateCycle, unfinishedPredecessors,
};
