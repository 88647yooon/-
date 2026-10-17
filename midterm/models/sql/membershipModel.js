// crew_memberships 테이블 접근. 현재 소속 = left_at이 NULL인 행.
const { getPool } = require('../../config/database');
const { where, like, orderBy, RANK_SQL } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'crew_id', 'user_id', 'type', 'join_method', 'from_crew_id', 'joined_at', 'left_at',
  'end_reason', 'to_crew_id', 'added_by', 'ended_by', 'note'];
const COLUMNS = FIELDS.join(', ');
const M_COLUMNS = FIELDS.map((f) => `m.${f}`).join(', ');

const MEMBER_SORT = { name: 'u.name', joinedAt: 'm.joined_at', rank: RANK_SQL('u.role') };

function toMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    type: row.type,
    joinMethod: row.join_method,
    fromCrewId: row.from_crew_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    endReason: row.end_reason,
    toCrewId: row.to_crew_id,
    addedBy: row.added_by,
    endedBy: row.ended_by,
    note: row.note,
  };
}

async function findActive(crewId, userId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships WHERE crew_id = ? AND user_id = ? AND left_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
    [crewId, userId],
  );
  return toMembership(rows[0]);
}

async function findActiveRegularByUser(userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships WHERE user_id = ? AND type = 'REGULAR' AND left_at IS NULL`,
    [userId],
  );
  return toMembership(rows[0]);
}

// 정식 소속이 먼저 오도록 정렬한다.
async function listActiveByUser(userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships WHERE user_id = ? AND left_at IS NULL
     ORDER BY type = 'REGULAR' DESC, joined_at`,
    [userId],
  );
  return rows.map(toMembership);
}

async function listActiveByCrew(crewId, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships WHERE crew_id = ? AND left_at IS NULL ORDER BY user_id${forUpdate ? ' FOR UPDATE' : ''}`,
    [crewId],
  );
  return rows.map(toMembership);
}

async function activeUserIdsOfCrew(crewId, db = getPool()) {
  const [rows] = await db.query('SELECT user_id FROM crew_memberships WHERE crew_id = ? AND left_at IS NULL', [crewId]);
  return rows.map((r) => r.user_id);
}

async function insert({ crewId, userId, type, joinMethod = 'ADDED', fromCrewId = null, addedBy = null, note = null }, db = getPool()) {
  const [result] = await db.query(
    `INSERT INTO crew_memberships (crew_id, user_id, type, join_method, from_crew_id, added_by, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crewId, userId, type, joinMethod, fromCrewId, addedBy, note],
  );
  return result.insertId;
}

async function end(id, { reason, endedBy = null, toCrewId = null }, db = getPool()) {
  await db.query(
    'UPDATE crew_memberships SET left_at = NOW(), end_reason = ?, ended_by = ?, to_crew_id = ? WHERE id = ? AND left_at IS NULL',
    [reason, endedBy, toCrewId, id],
  );
}

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crew_memberships WHERE id = ?`, [id]);
  return toMembership(rows[0]);
}

// 한 구성원의 소속 이력 (종료된 소속 포함)
async function searchByUser(userId, { active, ...paging }, db = getPool()) {
  const w = where([
    ['user_id = ?', userId],
    active === true && ['left_at IS NULL'],
    active === false && ['left_at IS NOT NULL'],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships ${w.sql} ORDER BY joined_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM crew_memberships ${w.sql}`, w.params);
  return { rows: rows.map(toMembership), total };
}

// 여러 Crew의 현재 소속원 (Crew 소속원 목록, 지휘 하위 구성원 조회에 사용)
async function searchActiveMembers(crewIds, { type, role, q, excludeUserId, sort = '-rank', ...paging }, db = getPool()) {
  if (crewIds.length === 0) return { rows: [], total: 0 };
  const w = where([
    ['m.crew_id IN (?)', crewIds],
    ['m.left_at IS NULL'],
    type && ['m.type = ?', type],
    role && ['u.role = ?', role],
    excludeUserId && ['m.user_id <> ?', excludeUserId],
    q && ['(u.name LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)', like(q), like(q), like(q)],
  ]);
  const from = 'FROM crew_memberships m JOIN users u ON u.id = m.user_id';
  const [rows] = await db.query(
    `SELECT ${M_COLUMNS} ${from} ${w.sql} ${orderBy(sort, MEMBER_SORT, 'm.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${w.sql}`, w.params);
  return { rows: rows.map(toMembership), total };
}

// 한 Crew의 편성 변경 이력 (현재·종료된 소속 모두). 최근 변경이 먼저 온다.
async function searchHistoryByCrew(crewId, { status, ...paging }, db = getPool()) {
  const w = where([
    ['crew_id = ?', crewId],
    status === 'active' && ['left_at IS NULL'],
    status === 'ended' && ['left_at IS NOT NULL'],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_memberships ${w.sql}
     ORDER BY COALESCE(left_at, joined_at) DESC, id DESC LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM crew_memberships ${w.sql}`, w.params);
  return { rows: rows.map(toMembership), total };
}

module.exports = {
  findById,
  findActive,
  findActiveRegularByUser,
  listActiveByUser,
  listActiveByCrew,
  activeUserIdsOfCrew,
  insert,
  end,
  searchByUser,
  searchActiveMembers,
  searchHistoryByCrew,
};
