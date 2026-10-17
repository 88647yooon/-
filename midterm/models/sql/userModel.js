// users 테이블 접근. 모든 함수는 트랜잭션 안에서 쓸 수 있도록 마지막 인자로 연결(db)을 받는다.
const { getPool } = require('../../config/database');
const { where, like, orderBy, RANK_SQL } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');
const { ASSIGNABLE_ROLES, OPEN_TASK_STATUSES } = require('../../config/constants');

const FIELDS = ['id', 'username', 'password_hash', 'name', 'nickname', 'phone', 'email', 'role', 'status',
  'failed_login_count', 'last_login_at', 'locked_at', 'locked_reason', 'password_changed_at', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const U_COLUMNS = FIELDS.map((f) => `u.${f}`).join(', ');

// 본인이 수정할 수 있는 항목(/api/me)과 관리자가 수정할 수 있는 기본 정보 → 컬럼
const PROFILE_COLUMNS = { nickname: 'nickname', phone: 'phone', email: 'email' };
const BASIC_COLUMNS = { name: 'name', ...PROFILE_COLUMNS };

const SORT_COLUMNS = { name: 'u.name', username: 'u.username', createdAt: 'u.created_at', rank: RANK_SQL('u.role') };

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

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toUser(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE id IN (?)`, [ids]);
  return rows.map(toUser);
}

async function findByUsername(username, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE username = ?`, [username]);
  return toUser(rows[0]);
}

async function findByUsernames(usernames, db = getPool()) {
  if (usernames.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE username IN (?) ORDER BY id`, [usernames]);
  return rows.map(toUser);
}

async function listByRole(role, { status } = {}, db = getPool()) {
  const w = where([['role = ?', role], status && ['status = ?', status]]);
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM users ${w.sql} ORDER BY id`, w.params);
  return rows.map(toUser);
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM users');
  return row.cnt;
}

async function insert(u, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO users (username, password_hash, name, nickname, phone, email, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [u.username, u.passwordHash, u.name, u.nickname ?? null, u.phone ?? null, u.email ?? null, u.role, u.status],
  );
  return result.insertId;
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

async function updateColumns(id, fields, allowed, db) {
  const entries = Object.entries(fields).filter(([key]) => allowed[key]);
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${allowed[key]} = ?`).join(', ');
  await db.query(`UPDATE users SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

const updateProfile = (id, fields, db = getPool()) => updateColumns(id, fields, PROFILE_COLUMNS, db);
const updateBasic = (id, fields, db = getPool()) => updateColumns(id, fields, BASIC_COLUMNS, db);

async function updateRole(id, role, db = getPool()) {
  await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
}

async function updateStatus(id, status, db = getPool()) {
  await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
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

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM users WHERE id = ?', [id]);
}

// 삭제 가능 여부 판단용. 하나라도 0이 아니면 활동 기록이 있는 구성원이다.
async function activitySummary(id, db = getPool()) {
  const [[row]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM crew_memberships WHERE user_id = ?) AS memberships,
       (SELECT COUNT(*) FROM crews WHERE capo_id = ? OR underboss_id = ?) AS crewRoles,
       (SELECT COUNT(*) FROM crew_capo_terms WHERE user_id = ?) AS capoTerms,
       (SELECT COUNT(*) FROM crew_join_requests WHERE user_id = ?) AS joinRequests,
       (SELECT COUNT(*) FROM role_change_requests WHERE user_id = ? OR requested_by = ?) AS roleRequests,
       (SELECT COUNT(*) FROM task_assignees WHERE user_id = ?) AS taskAssignments,
       (SELECT COUNT(*) FROM task_swap_requests WHERE from_user_id = ? OR to_user_id = ?) AS swapRequests,
       (SELECT COUNT(*) FROM task_participations WHERE user_id = ?) AS participations,
       (SELECT COUNT(*) FROM resource_allocations WHERE user_id = ?) AS resourceAllocations,
       (SELECT COUNT(*) FROM resource_requests WHERE user_id = ?) AS resourceRequests,
       (SELECT COUNT(*) FROM resource_usages WHERE user_id = ?) AS resourceUsages`,
    [id, id, id, id, id, id, id, id, id, id, id, id, id, id],
  );
  return row;
}

// 업무 배정 후보 (BR-02, BR-03): 활동중, 업무를 맡을 수 있는 역할, 이 업무에 아직 배정되지 않았고,
// 업무 시간대에 다른 진행 중 배정이 없는 구성원. crewId를 주면 그 Crew의 현재 소속원으로 좁힌다.
async function searchAssignable({ taskId, startAt, endAt, crewId, role, q, sort = 'name', ...paging }, db = getPool()) {
  const w = where([
    ["u.status = 'ACTIVE'"],
    ['u.role IN (?)', ASSIGNABLE_ROLES],
    role && ['u.role = ?', role],
    crewId && ['EXISTS (SELECT 1 FROM crew_memberships cm WHERE cm.user_id = u.id AND cm.crew_id = ? AND cm.left_at IS NULL)', crewId],
    ['NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = ? AND a.user_id = u.id AND a.released_at IS NULL)', taskId],
    [`NOT EXISTS (SELECT 1 FROM task_assignees a JOIN tasks t ON t.id = a.task_id
        WHERE a.user_id = u.id AND a.released_at IS NULL AND t.status IN (?) AND t.id <> ? AND ? < t.end_at AND t.start_at < ?)`,
    OPEN_TASK_STATUSES, taskId, startAt, endAt],
    q && ['(u.name LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)', like(q), like(q), like(q)],
  ]);
  const from = `FROM users u
    LEFT JOIN crew_memberships rm ON rm.user_id = u.id AND rm.type = 'REGULAR' AND rm.left_at IS NULL`;
  const [rows] = await db.query(
    `SELECT ${U_COLUMNS}, rm.crew_id AS regular_crew_id ${from} ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'u.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${w.sql}`, w.params);
  return { rows: rows.map((r) => ({ ...toUser(r), regularCrewId: r.regular_crew_id })), total };
}

// 구성원 목록 검색. 각 행에 현재 정식 소속 Crew ID(regularCrewId)를 붙인다.
async function search({ role, status, crewId, q, excludeRoles, excludeStatuses, excludeUserId, sort = 'name', ...paging }, db = getPool()) {
  const w = where([
    role && ['u.role = ?', role],
    status && ['u.status = ?', status],
    excludeRoles?.length && ['u.role NOT IN (?)', excludeRoles],
    excludeStatuses?.length && ['u.status NOT IN (?)', excludeStatuses],
    excludeUserId && ['u.id <> ?', excludeUserId],
    crewId && ['EXISTS (SELECT 1 FROM crew_memberships cm WHERE cm.user_id = u.id AND cm.crew_id = ? AND cm.left_at IS NULL)', crewId],
    q && ['(u.name LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)', like(q), like(q), like(q)],
  ]);
  const [rows] = await db.query(
    `SELECT ${U_COLUMNS}, rm.crew_id AS regular_crew_id
     FROM users u
     LEFT JOIN crew_memberships rm ON rm.user_id = u.id AND rm.type = 'REGULAR' AND rm.left_at IS NULL
     ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'u.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${w.sql}`, w.params);
  return { rows: rows.map((r) => ({ ...toUser(r), regularCrewId: r.regular_crew_id })), total };
}

// Crew 편성 후보: 활동중, Crew 소속 가능 역할, 이 Crew의 현재 소속원이 아님.
// regularOnly면 다른 Crew에 정식 소속된 구성원도 뺀다 (BR-01).
async function searchCandidates(crewId, { regularOnly, roles, role, q, sort = 'name', ...paging }, db = getPool()) {
  const w = where([
    ["u.status = 'ACTIVE'"],
    ['u.role IN (?)', roles],
    role && ['u.role = ?', role],
    ['NOT EXISTS (SELECT 1 FROM crew_memberships x WHERE x.user_id = u.id AND x.crew_id = ? AND x.left_at IS NULL)', crewId],
    regularOnly && ['rm.id IS NULL'],
    q && ['(u.name LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)', like(q), like(q), like(q)],
  ]);
  const from = `FROM users u
    LEFT JOIN crew_memberships rm ON rm.user_id = u.id AND rm.type = 'REGULAR' AND rm.left_at IS NULL`;
  const [rows] = await db.query(
    `SELECT ${U_COLUMNS}, rm.crew_id AS regular_crew_id ${from} ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'u.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${w.sql}`, w.params);
  return { rows: rows.map((r) => ({ ...toUser(r), regularCrewId: r.regular_crew_id })), total };
}

module.exports = {
  findById,
  findByIds,
  findByUsername,
  findByUsernames,
  listByRole,
  count,
  insert,
  insertMany,
  updateProfile,
  updateBasic,
  updateRole,
  updateStatus,
  updatePassword,
  recordLoginSuccess,
  recordLoginFailure,
  remove,
  activitySummary,
  search,
  searchCandidates,
  searchAssignable,
};
