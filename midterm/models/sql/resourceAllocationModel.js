// resource_allocations 테이블 접근. 구성원 자원 배정 (FR-17). 진행 중인 배정 = released_at이 NULL인 행
const { getPool } = require('../../config/database');
const { where, orderBy } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'resource_id', 'user_id', 'start_at', 'end_at', 'purpose', 'request_id', 'handed_over_from',
  'allocated_by', 'allocated_at', 'released_at', 'release_reason', 'released_by'];
const COLUMNS = FIELDS.join(', ');

const SORT_COLUMNS = { startAt: 'start_at', allocatedAt: 'allocated_at' };

function toAllocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    userId: row.user_id,
    startAt: row.start_at,
    endAt: row.end_at,
    purpose: row.purpose,
    requestId: row.request_id,
    handedOverFrom: row.handed_over_from,
    allocatedBy: row.allocated_by,
    allocatedAt: row.allocated_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    releasedBy: row.released_by,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_allocations WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toAllocation(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_allocations WHERE id IN (?)`, [ids]);
  return rows.map(toAllocation);
}

async function findByRequestIds(requestIds, db = getPool()) {
  if (requestIds.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_allocations WHERE request_id IN (?)`, [requestIds]);
  return rows.map(toAllocation);
}

async function insert(a, db = getPool()) {
  const [result] = await db.query(
    `INSERT INTO resource_allocations (resource_id, user_id, start_at, end_at, purpose, request_id, handed_over_from, allocated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.resourceId, a.userId, a.startAt, a.endAt, a.purpose ?? null, a.requestId ?? null, a.handedOverFrom ?? null, a.allocatedBy ?? null],
  );
  return result.insertId;
}

async function setWindow(id, { startAt, endAt }, db = getPool()) {
  await db.query('UPDATE resource_allocations SET start_at = ?, end_at = ? WHERE id = ?', [startAt, endAt, id]);
}

async function release(id, { reason, releasedBy = null }, db = getPool()) {
  await db.query(
    'UPDATE resource_allocations SET released_at = NOW(), release_reason = ?, released_by = ? WHERE id = ? AND released_at IS NULL',
    [reason, releasedBy, id],
  );
}

// 사용 시작 근거: 지금이 배정 시간대 안에 있는 이 구성원의 배정
async function findUsable(resourceId, userId, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_allocations
      WHERE resource_id = ? AND user_id = ? AND released_at IS NULL AND start_at <= NOW() AND NOW() < end_at
      ORDER BY start_at, id LIMIT 1`,
    [resourceId, userId],
  );
  return toAllocation(rows[0]);
}

// 구성원이 탈퇴하면 아직 끝나지 않은 배정을 모두 끝낸다. 끝낸 배정을 돌려준다.
async function releaseOpenByUser(userId, { reason, releasedBy = null }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_allocations WHERE user_id = ? AND released_at IS NULL AND end_at > NOW() FOR UPDATE`,
    [userId],
  );
  for (const r of rows) await release(r.id, { reason, releasedBy }, db);
  return rows.map(toAllocation);
}

// #138 구성원에게 배정된 자원. 기본은 끝나지 않은 배정만, includeReleased면 해제·만료된 배정도 포함한다.
async function searchByUser(userId, { includeReleased = false, from, to, sort = 'startAt', ...paging }, db = getPool()) {
  const w = where([
    ['user_id = ?', userId],
    !includeReleased && ['released_at IS NULL AND end_at > NOW()'],
    from && ['end_at > ?', from],
    to && ['start_at < ?', to],
  ]);
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_allocations ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resource_allocations ${w.sql}`, w.params);
  return { rows: rows.map(toAllocation), total };
}

// 내 일정: 기간과 겹치는 내 진행 중 배정
async function listByUserInWindow(userId, { from, to }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM resource_allocations
      WHERE user_id = ? AND released_at IS NULL AND end_at > ? AND start_at < ? ORDER BY start_at, id`,
    [userId, from, to],
  );
  return rows.map(toAllocation);
}

module.exports = {
  findById,
  findByIds,
  findByRequestIds,
  insert,
  setWindow,
  release,
  findUsable,
  releaseOpenByUser,
  searchByUser,
  listByUserInWindow,
};
