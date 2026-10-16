// sessions 테이블 접근. 유효한 세션 = 종료되지 않았고 만료되지 않은 세션.
const { getPool } = require('../../config/database');

const COLUMNS = 'id, user_id, user_agent, ip, created_at, last_used_at, expires_at, revoked_at, revoke_reason';
const ACTIVE = 'revoked_at IS NULL AND expires_at > NOW()';

function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

async function create({ id, userId, refreshTokenHash, userAgent, ip, expiresAt }, db = getPool()) {
  await db.query(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, refreshTokenHash, userAgent?.slice(0, 255) ?? null, ip ?? null, expiresAt],
  );
}

async function findActiveById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM sessions WHERE id = ? AND ${ACTIVE}`, [id]);
  return toSession(rows[0]);
}

async function findActiveByTokenHash(refreshTokenHash, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM sessions WHERE refresh_token_hash = ? AND ${ACTIVE}`,
    [refreshTokenHash],
  );
  return toSession(rows[0]);
}

async function listActiveByUser(userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM sessions WHERE user_id = ? AND ${ACTIVE} ORDER BY last_used_at DESC`,
    [userId],
  );
  return rows.map(toSession);
}

// 리프레시 토큰을 새 값으로 교체한다. 이전 토큰은 더 이상 쓸 수 없다.
async function rotate(id, { refreshTokenHash, expiresAt, userAgent, ip }, db = getPool()) {
  await db.query(
    `UPDATE sessions SET refresh_token_hash = ?, expires_at = ?, user_agent = ?, ip = ?, last_used_at = NOW()
     WHERE id = ?`,
    [refreshTokenHash, expiresAt, userAgent?.slice(0, 255) ?? null, ip ?? null, id],
  );
}

async function touch(id, db = getPool()) {
  await db.query('UPDATE sessions SET last_used_at = NOW() WHERE id = ?', [id]);
}

async function revoke(id, reason, db = getPool()) {
  const [result] = await db.query(
    'UPDATE sessions SET revoked_at = NOW(), revoke_reason = ? WHERE id = ? AND revoked_at IS NULL',
    [reason, id],
  );
  return result.affectedRows;
}

// 사용자의 유효한 세션을 모두 종료한다. exceptId를 주면 그 세션은 남긴다.
async function revokeAllForUser(userId, reason, { exceptId = null } = {}, db = getPool()) {
  const [result] = await db.query(
    `UPDATE sessions SET revoked_at = NOW(), revoke_reason = ?
     WHERE user_id = ? AND ${ACTIVE} AND (? IS NULL OR id <> ?)`,
    [reason, userId, exceptId, exceptId],
  );
  return result.affectedRows;
}

module.exports = {
  create,
  findActiveById,
  findActiveByTokenHash,
  listActiveByUser,
  rotate,
  touch,
  revoke,
  revokeAllForUser,
};
