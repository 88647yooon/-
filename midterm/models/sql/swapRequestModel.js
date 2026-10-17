// task_swap_requests 테이블 접근. 업무 배정 교대 요청 (FR-08).
const { getPool } = require('../../config/database');
const { where } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'task_id', 'from_user_id', 'to_user_id', 'reason', 'status', 'decided_by', 'decided_at', 'decision_reason', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const S_COLUMNS = FIELDS.map((f) => `s.${f}`).join(', ');

function toRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insert({ taskId, fromUserId, toUserId, reason }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO task_swap_requests (task_id, from_user_id, to_user_id, reason) VALUES (?, ?, ?, ?)',
    [taskId, fromUserId, toUserId, reason ?? null],
  );
  return result.insertId;
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_swap_requests WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toRequest(rows[0]);
}

async function findPending(taskId, fromUserId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM task_swap_requests WHERE task_id = ? AND from_user_id = ? AND status = 'PENDING'`,
    [taskId, fromUserId],
  );
  return toRequest(rows[0]);
}

// box: sent(내가 보낸) | received(내가 받은) | review(내가 승인할 수 있는). 없으면 셋 모두.
// review 범위: reviewAll이면 전체(Underboss·Boss), reviewCrewId면 그 Crew의 업무(Capo).
async function search({ userId, box, reviewAll = false, reviewCrewId = null, status, ...paging }, db = getPool()) {
  const reviewSql = reviewAll ? 'TRUE' : reviewCrewId ? 't.crew_id = ?' : 'FALSE';
  const reviewParams = !reviewAll && reviewCrewId ? [reviewCrewId] : [];
  const scope = {
    sent: ['s.from_user_id = ?', userId],
    received: ['s.to_user_id = ?', userId],
    review: [reviewSql, ...reviewParams],
  };
  const any = [`s.from_user_id = ? OR s.to_user_id = ? OR ${reviewSql}`, userId, userId, ...reviewParams];
  const w = where([box ? scope[box] : any, status && ['s.status = ?', status]]);
  const from = 'FROM task_swap_requests s JOIN tasks t ON t.id = s.task_id';
  const [rows] = await db.query(
    `SELECT ${S_COLUMNS} ${from} ${w.sql} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${w.sql}`, w.params);
  return { rows: rows.map(toRequest), total };
}

async function decide(id, { status, decidedBy, reason = null }, db = getPool()) {
  await db.query(
    `UPDATE task_swap_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ?
     WHERE id = ? AND status = 'PENDING'`,
    [status, decidedBy, reason, id],
  );
}

// 업무 취소·완료나 구성원 탈퇴로 처리할 수 없게 된 대기 요청을 취소한다.
async function cancelPending({ taskId, userId }, { reason, decidedBy = null }, db = getPool()) {
  const w = where([
    ["status = 'PENDING'"],
    taskId && ['task_id = ?', taskId],
    userId && ['(from_user_id = ? OR to_user_id = ?)', userId, userId],
  ]);
  const [result] = await db.query(
    `UPDATE task_swap_requests SET status = 'CANCELLED', decided_by = ?, decided_at = NOW(), decision_reason = ? ${w.sql}`,
    [decidedBy, reason, ...w.params],
  );
  return result.affectedRows;
}

module.exports = { insert, findById, findPending, search, decide, cancelPending };
