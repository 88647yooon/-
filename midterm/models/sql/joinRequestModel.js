// crew_join_requests 테이블 접근. Crew 소속 신청 (FR-06).
const { getPool } = require('../../config/database');
const { where } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const COLUMNS = `id, crew_id, user_id, type, message, status, decided_by, decided_at, decision_reason,
  membership_id, created_at, updated_at`;

function toRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    membershipId: row.membership_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insert({ crewId, userId, type, message }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO crew_join_requests (crew_id, user_id, type, message) VALUES (?, ?, ?, ?)',
    [crewId, userId, type, message ?? null],
  );
  return result.insertId;
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crew_join_requests WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toRequest(rows[0]);
}

async function findPending(crewId, userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_join_requests WHERE crew_id = ? AND user_id = ? AND status = 'PENDING'`,
    [crewId, userId],
  );
  return toRequest(rows[0]);
}

async function search({ crewId, userId, status, ...paging }, db = getPool()) {
  const w = where([
    crewId && ['crew_id = ?', crewId],
    userId && ['user_id = ?', userId],
    status && ['status = ?', status],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_join_requests ${w.sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM crew_join_requests ${w.sql}`, w.params);
  return { rows: rows.map(toRequest), total };
}

async function decide(id, { status, decidedBy, reason = null, membershipId = null }, db = getPool()) {
  await db.query(
    `UPDATE crew_join_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ?, membership_id = ?
     WHERE id = ? AND status = 'PENDING'`,
    [status, decidedBy, reason, membershipId, id],
  );
}

// Crew 해산·병합이나 구성원 탈퇴로 더 이상 처리할 수 없게 된 대기 신청을 취소한다.
async function cancelPending({ crewId, userId }, { reason, decidedBy = null }, db = getPool()) {
  const w = where([["status = 'PENDING'"], crewId && ['crew_id = ?', crewId], userId && ['user_id = ?', userId]]);
  const [result] = await db.query(
    `UPDATE crew_join_requests SET status = 'CANCELLED', decided_by = ?, decided_at = NOW(), decision_reason = ? ${w.sql}`,
    [decidedBy, reason, ...w.params],
  );
  return result.affectedRows;
}

module.exports = { insert, findById, findPending, search, decide, cancelPending };
