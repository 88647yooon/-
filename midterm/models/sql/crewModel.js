// crews 테이블 접근.
const { getPool } = require('../../config/database');
const { where, like, orderBy } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'name', 'region', 'description', 'status', 'capo_id', 'underboss_id', 'created_by',
  'disbanded_at', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const C_COLUMNS = FIELDS.map((f) => `c.${f}`).join(', ');
const EDITABLE = { name: 'name', region: 'region', description: 'description' };

const MEMBER_COUNT_SQL = '(SELECT COUNT(*) FROM crew_memberships m WHERE m.crew_id = c.id AND m.left_at IS NULL)';
const SORT_COLUMNS = { name: 'c.name', region: 'c.region', createdAt: 'c.created_at', memberCount: 'member_count' };

function toCrew(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    description: row.description,
    status: row.status,
    capoId: row.capo_id,
    underbossId: row.underboss_id,
    createdBy: row.created_by,
    disbandedAt: row.disbanded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crews WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toCrew(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crews WHERE id IN (?)`, [ids]);
  return rows.map(toCrew);
}

async function findByName(name, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crews WHERE name = ?`, [name]);
  return toCrew(rows[0]);
}

async function findByCapo(userId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crews WHERE capo_id = ?`, [userId]);
  return toCrew(rows[0]);
}

async function listByUnderboss(userId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM crews WHERE underboss_id = ? ORDER BY name`, [userId]);
  return rows.map(toCrew);
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM crews');
  return row.cnt;
}

async function insert({ name, region, description, underbossId, createdBy }, db = getPool()) {
  const [result] = await db.query(
    'INSERT INTO crews (name, region, description, underboss_id, created_by) VALUES (?, ?, ?, ?, ?)',
    [name, region, description ?? null, underbossId ?? null, createdBy ?? null],
  );
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => EDITABLE[key]);
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${EDITABLE[key]} = ?`).join(', ');
  await db.query(`UPDATE crews SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

async function setCapo(id, userId, db = getPool()) {
  await db.query('UPDATE crews SET capo_id = ? WHERE id = ?', [userId, id]);
}

async function setUnderboss(id, userId, db = getPool()) {
  await db.query('UPDATE crews SET underboss_id = ? WHERE id = ?', [userId, id]);
}

async function setStatus(id, status, db = getPool()) {
  await db.query(
    "UPDATE crews SET status = ?, disbanded_at = IF(? = 'DISBANDED', NOW(), NULL) WHERE id = ?",
    [status, status, id],
  );
}

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM crews WHERE id = ?', [id]);
}

// 삭제 가능 여부 판단용. 편성·신청·책임자 이력이 하나라도 있으면 사용된 Crew다.
async function usage(id, db = getPool()) {
  const [[row]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM crew_memberships WHERE crew_id = ? OR from_crew_id = ? OR to_crew_id = ?) AS memberships,
       (SELECT COUNT(*) FROM crew_join_requests WHERE crew_id = ?) AS joinRequests,
       (SELECT COUNT(*) FROM crew_capo_terms WHERE crew_id = ?) AS capoTerms`,
    [id, id, id, id, id],
  );
  return row;
}

// Crew별 현재 인원 수 (정식·임시)
async function memberCounts(ids, db = getPool()) {
  const counts = new Map(ids.map((id) => [id, { memberCount: 0, regularCount: 0, temporaryCount: 0 }]));
  if (ids.length === 0) return counts;
  const [rows] = await db.query(
    `SELECT crew_id, COUNT(*) AS total, SUM(type = 'REGULAR') AS regular
     FROM crew_memberships WHERE left_at IS NULL AND crew_id IN (?) GROUP BY crew_id`,
    [ids],
  );
  for (const r of rows) {
    const regular = Number(r.regular);
    counts.set(r.crew_id, { memberCount: r.total, regularCount: regular, temporaryCount: r.total - regular });
  }
  return counts;
}

async function search({ region, status, underbossId, q, sort = 'name', ...paging }, db = getPool()) {
  const w = where([
    region && ['c.region = ?', region],
    status && ['c.status = ?', status],
    underbossId && ['c.underboss_id = ?', underbossId],
    q && ['(c.name LIKE ? OR c.description LIKE ?)', like(q), like(q)],
  ]);
  const [rows] = await db.query(
    `SELECT ${C_COLUMNS}, ${MEMBER_COUNT_SQL} AS member_count FROM crews c
     ${w.sql} ${orderBy(sort, SORT_COLUMNS, 'c.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM crews c ${w.sql}`, w.params);
  return { rows: rows.map(toCrew), total };
}

module.exports = {
  findById,
  findByIds,
  findByName,
  findByCapo,
  listByUnderboss,
  count,
  insert,
  update,
  setCapo,
  setUnderboss,
  setStatus,
  remove,
  usage,
  memberCounts,
  search,
};
