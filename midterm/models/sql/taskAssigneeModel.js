// task_assignees 테이블 접근. 진행 중인 배정 = released_at이 NULL인 행 (FR-08, DR-02).
const { getPool } = require('../../config/database');
const { where, orderBy } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

const FIELDS = ['id', 'task_id', 'user_id', 'role', 'response', 'response_note', 'responded_at', 'assigned_by', 'assigned_at',
  'released_at', 'release_reason', 'released_by', 'replaced_by'];
const COLUMNS = FIELDS.join(', ');
const A_COLUMNS = FIELDS.map((f) => `a.${f}`).join(', ');
const TASK_COLUMNS = 't.id, t.title, t.status, t.start_at, t.end_at, t.crew_id';

function toAssignee(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    role: row.role,
    response: row.response,
    responseNote: row.response_note,
    respondedAt: row.responded_at,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    releasedBy: row.released_by,
    replacedBy: row.replaced_by,
  };
}

const toOverlap = (r) => ({ taskId: r.id, title: r.title, status: r.status, startAt: r.start_at, endAt: r.end_at, crewId: r.crew_id });

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_assignees WHERE id = ?`, [id]);
  return toAssignee(rows[0]);
}

async function findActive(taskId, userId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_assignees WHERE task_id = ? AND user_id = ? AND released_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [taskId, userId],
  );
  return toAssignee(rows[0]);
}

// 리더가 먼저 오도록 정렬한다.
async function listActiveByTask(taskId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_assignees WHERE task_id = ? AND released_at IS NULL
     ORDER BY role = 'LEADER' DESC, assigned_at, id${forUpdate ? ' FOR UPDATE' : ''}`,
    [taskId],
  );
  return rows.map(toAssignee);
}

// 업무별 진행 중 배정 수 (전체·수락·응답 대기)
async function countsByTasks(taskIds, db = getPool()) {
  const counts = new Map(taskIds.map((id) => [id, { assigneeCount: 0, acceptedCount: 0, pendingCount: 0 }]));
  if (taskIds.length === 0) return counts;
  const [rows] = await db.query(
    `SELECT task_id, COUNT(*) AS total, SUM(response = 'ACCEPTED') AS accepted, SUM(response = 'PENDING') AS pending
     FROM task_assignees WHERE released_at IS NULL AND task_id IN (?) GROUP BY task_id`,
    [taskIds],
  );
  for (const r of rows) counts.set(r.task_id, { assigneeCount: r.total, acceptedCount: Number(r.accepted), pendingCount: Number(r.pending) });
  return counts;
}

async function wasAssigned(taskId, userId, db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM task_assignees WHERE task_id = ? AND user_id = ?', [taskId, userId]);
  return row.cnt > 0;
}

async function insert({ taskId, userId, role = 'MEMBER', assignedBy = null }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO task_assignees (task_id, user_id, role, assigned_by) VALUES (?, ?, ?, ?)',
    [taskId, userId, role, assignedBy],
  );
  return result.insertId;
}

async function release(id, { reason, releasedBy = null, replacedBy = null }, db = getPool()) {
  await db.query(
    'UPDATE task_assignees SET released_at = NOW(), release_reason = ?, released_by = ?, replaced_by = ? WHERE id = ? AND released_at IS NULL',
    [reason, releasedBy, replacedBy, id],
  );
}

async function releaseAllByTask(taskId, { reason, releasedBy = null }, db = getPool()) {
  const [result] = await db.query(
    'UPDATE task_assignees SET released_at = NOW(), release_reason = ?, released_by = ? WHERE task_id = ? AND released_at IS NULL',
    [reason, releasedBy, taskId],
  );
  return result.affectedRows;
}

// 구성원이 탈퇴하면 아직 끝나지 않은 업무의 배정을 모두 끝낸다. 끝낸 배정을 돌려준다.
async function releaseOpenByUser(userId, { reason, releasedBy = null }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${A_COLUMNS} FROM task_assignees a JOIN tasks t ON t.id = a.task_id
     WHERE a.user_id = ? AND a.released_at IS NULL AND t.status IN (?) FOR UPDATE`,
    [userId, OPEN_TASK_STATUSES],
  );
  for (const r of rows) await release(r.id, { reason, releasedBy }, db);
  return rows.map(toAssignee);
}

async function setRole(id, role, db = getPool()) {
  await db.query('UPDATE task_assignees SET role = ? WHERE id = ?', [role, id]);
}

// 업무의 리더는 한 명이다. 새 리더를 정하기 전에 기존 리더를 일반 참여자로 바꾼다.
async function demoteLeaders(taskId, db = getPool()) {
  await db.query(
    "UPDATE task_assignees SET role = 'MEMBER' WHERE task_id = ? AND released_at IS NULL AND role = 'LEADER'",
    [taskId],
  );
}

async function respond(id, { response, note = null }, db = getPool()) {
  await db.query('UPDATE task_assignees SET response = ?, response_note = ?, responded_at = NOW() WHERE id = ?', [response, note, id]);
}

// BR-03: 이 구성원의 다른 진행 중 배정 가운데 [startAt, endAt)과 시간이 겹치는 업무.
// 겹침 조건: 새 시작 < 기존 종료 AND 기존 시작 < 새 종료. 완료·취소된 업무는 제외한다.
async function findOverlaps(userId, { startAt, endAt, excludeTaskId = 0 }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${TASK_COLUMNS} FROM task_assignees a JOIN tasks t ON t.id = a.task_id
     WHERE a.user_id = ? AND a.released_at IS NULL AND t.status IN (?) AND t.id <> ?
       AND ? < t.end_at AND t.start_at < ?
     ORDER BY t.start_at`,
    [userId, OPEN_TASK_STATUSES, excludeTaskId, startAt, endAt],
  );
  return rows.map(toOverlap);
}

// 업무의 배정 이력 (진행 중·끝난 배정 모두, 최근 순)
async function searchByTask(taskId, paging, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_assignees WHERE task_id = ? ORDER BY assigned_at DESC, id DESC LIMIT ? OFFSET ?`,
    [taskId, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM task_assignees WHERE task_id = ?', [taskId]);
  return { rows: rows.map(toAssignee), total };
}

const MY_TASK_SORT = { startAt: 't.start_at', assignedAt: 'a.assigned_at' };

// 한 구성원의 진행 중 배정 (내 업무 목록)
async function searchByUser(userId, { status, response, from, to, sort = 'startAt', ...paging }, db = getPool()) {
  const w = where([
    ['a.user_id = ?', userId],
    ['a.released_at IS NULL'],
    status && ['t.status = ?', status],
    response && ['a.response = ?', response],
    from && ['t.end_at > ?', from],
    to && ['t.start_at < ?', to],
  ]);
  const from_ = 'FROM task_assignees a JOIN tasks t ON t.id = a.task_id';
  const [rows] = await db.query(
    `SELECT ${A_COLUMNS} ${from_} ${w.sql} ${orderBy(sort, MY_TASK_SORT, 'a.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from_} ${w.sql}`, w.params);
  return { rows: rows.map(toAssignee), total };
}

// 기간과 일정이 겹치는 내 업무 (취소된 업무 제외). 내 일정 타임라인에 쓴다.
async function listByUserInWindow(userId, { from, to }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${A_COLUMNS} FROM task_assignees a JOIN tasks t ON t.id = a.task_id
     WHERE a.user_id = ? AND a.released_at IS NULL AND t.status <> 'CANCELLED' AND t.end_at > ? AND t.start_at < ?
     ORDER BY t.start_at, t.id`,
    [userId, from, to],
  );
  return rows.map(toAssignee);
}

module.exports = {
  findById,
  findActive,
  listActiveByTask,
  countsByTasks,
  wasAssigned,
  insert,
  release,
  releaseAllByTask,
  releaseOpenByUser,
  setRole,
  demoteLeaders,
  respond,
  findOverlaps,
  searchByTask,
  searchByUser,
  listByUserInWindow,
};
