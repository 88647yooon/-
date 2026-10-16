// users 테이블 접근. 모든 함수는 트랜잭션 안에서 쓸 수 있도록 마지막 인자로 연결(db)을 받는다.
const { getPool } = require('../../config/database');

const COLUMNS = `id, username, password_hash, name, nickname, phone, email, role, status,
  failed_login_count, last_login_at, locked_at, locked_reason, password_changed_at, created_at, updated_at`;

// 본인이 수정할 수 있는 프로필 항목 → 컬럼
const PROFILE_COLUMNS = { nickname: 'nickname', phone: 'phone', email: 'email' };

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    nickname: row.nickname,
    phone: row.phone,
    email: row.email,
    role: row.role,
    status: row.status,
    failedLoginCount: row.failed_login_count,
    lastLoginAt: row.last_login_at,
    lockedAt: row.locked_at,
    lockedReason: row.locked_reason,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
  return toUser(rows[0]);
}

async function findByUsername(username, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE username = ?`, [username]);
  return toUser(rows[0]);
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM users');
  return row.cnt;
}

async function insertMany(users, db = getPool()) {
  const values = users.map((u) => [u.username, u.passwordHash, u.name, u.nickname ?? null,
    u.phone ?? null, u.email ?? null, u.role, u.status]);
  const [result] = await db.query(
    'INSERT INTO users (username, password_hash, name, nickname, phone, email, role, status) VALUES ?',
    [values],
  );
  return result.affectedRows;
}

async function updateProfile(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => PROFILE_COLUMNS[key]);
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${PROFILE_COLUMNS[key]} = ?`).join(', ');
  await db.query(`UPDATE users SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

async function updatePassword(id, passwordHash, db = getPool()) {
  await db.query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [passwordHash, id]);
}

async function recordLoginSuccess(id, db = getPool()) {
  await db.query('UPDATE users SET last_login_at = NOW(), failed_login_count = 0 WHERE id = ?', [id]);
}

async function recordLoginFailure(id, db = getPool()) {
  await db.query('UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?', [id]);
}

module.exports = {
  findById,
  findByUsername,
  count,
  insertMany,
  updateProfile,
  updatePassword,
  recordLoginSuccess,
  recordLoginFailure,
};
