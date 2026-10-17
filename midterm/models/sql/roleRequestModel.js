// role_change_requests 테이블 접근. 역할 변경 요청(추천) (FR-03).
const { getPool } = require('../../config/database');
const { where } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const COLUMNS = `id, user_id, requested_by, from_role, to_role, reason, status, decided_by, decided_at,
  decision_reason, created_at, updated_at`;

function toRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    requestedBy: row.requested_by,
    fromRole: row.from_role,
    toRole: row.to_role,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insert({ userId, requestedBy, fromRole, toRole, reason }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO role_change_requests (user_id, requested_by, from_role, to_role, reason) VALUES (?, ?, ?, ?, ?)',
    [userId, requestedBy, fromRole, toRole, reason],
  );
  return result.insertId;
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM role_change_requests WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toRequest(rows[0]);
}

async function findPendingByUser(userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM role_change_requests WHERE user_id = ? AND status = 'PENDING'`,
    [userId],
  );
  return toRequest(rows[0]);
}

async function search({ requestedBy, userId, status, ...paging }, db = getPool()) {
  const w = where([
    requestedBy && ['requested_by = ?', requestedBy],
    userId && ['user_id = ?', userId],
    status && ['status = ?', status],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM role_change_requests ${w.sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM role_change_requests ${w.sql}`, w.params);
  return { rows: rows.map(toRequest), total };
}

async function decide(id, { status, decidedBy, reason = null }, db = getPool()) {
  await db.query(
    `UPDATE role_change_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ?
     WHERE id = ? AND status = 'PENDING'`,
    [status, decidedBy, reason, id],
  );
}

// 대상 구성원이 탈퇴하면 대기 중인 요청을 거절 처리한다.
async function rejectPendingByUser(userId, { reason, decidedBy = null }, db = getPool()) {
  const [result] = await db.query(
    `UPDATE role_change_requests SET status = 'REJECTED', decided_by = ?, decided_at = NOW(), decision_reason = ?
     WHERE user_id = ? AND status = 'PENDING'`,
    [decidedBy, reason, userId],
  );
  return result.affectedRows;
}

module.exports = { insert, findById, findPendingByUser, search, decide, rejectPendingByUser };
