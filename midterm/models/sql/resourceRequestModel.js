// resource_requests 테이블 접근. 자원 사용 신청 (FR-14, FR-17).
const { getPool } = require('../../config/database');
const { where } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'resource_id', 'user_id', 'start_at', 'end_at', 'reason', 'status', 'decided_by', 'decided_at',
  'decision_reason', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const Q_COLUMNS = FIELDS.map((f) => `q.${f}`).join(', ');

function toRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    userId: row.user_id,
    startAt: row.start_at,
    endAt: row.end_at,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insert({ resourceId, userId, startAt, endAt, reason }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO resource_requests (resource_id, user_id, start_at, end_at, reason) VALUES (?, ?, ?, ?, ?)',
    [resourceId, userId, startAt, endAt, reason],
  );
  return result.insertId;
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_requests WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toRequest(rows[0]);
}

async function decide(id, { status, decidedBy, reason = null }, db = getPool()) {
  await db.query(
    'UPDATE resource_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ? WHERE id = ?',
    [status, decidedBy, reason, id],
  );
}

// 구성원이 탈퇴하면 대기 중인 신청을 취소한다.
async function cancelPendingByUser(userId, { reason, decidedBy = null }, db = getPool()) {
  const [result] = await db.query(
    "UPDATE resource_requests SET status = 'CANCELLED', decided_by = ?, decided_at = NOW(), decision_reason = ? WHERE user_id = ? AND status = 'PENDING'",
    [decidedBy, reason, userId],
  );
  return result.affectedRows;
}

// box: mine(내 신청) | review(내가 처리할 수 있는 신청, 본인 신청 제외). 없으면 둘 모두.
// review 범위: reviewAll이면 전체(Underboss·Boss), reviewCrewId면 그 Crew 소속원의 신청(Capo), 둘 다 없으면 없음.
async function search({ userId, box, reviewAll = false, reviewCrewId = null, status, resourceId, ...paging }, db = getPool()) {
  let reviewSql = 'FALSE';
  let reviewParams = [];
  if (reviewAll) {
    reviewSql = 'q.user_id <> ?';
    reviewParams = [userId];
  } else if (reviewCrewId) {
    reviewSql = 'q.user_id <> ? AND EXISTS (SELECT 1 FROM crew_memberships cm WHERE cm.user_id = q.user_id AND cm.crew_id = ? AND cm.left_at IS NULL)';
    reviewParams = [userId, reviewCrewId];
  }
  const scope = {
    mine: ['q.user_id = ?', userId],
    review: [reviewSql, ...reviewParams],
  };
  const w = where([
    box ? scope[box] : [`q.user_id = ? OR (${reviewSql})`, userId, ...reviewParams],
    status && ['q.status = ?', status],
    resourceId && ['q.resource_id = ?', resourceId],
  ]);
  const [rows] = await db.query(
    `SELECT ${Q_COLUMNS} FROM resource_requests q ${w.sql} ORDER BY q.status = 'PENDING' DESC, q.created_at DESC, q.id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resource_requests q ${w.sql}`, w.params);
  return { rows: rows.map(toRequest), total };
}

module.exports = { insert, findById, decide, cancelPendingByUser, search };
