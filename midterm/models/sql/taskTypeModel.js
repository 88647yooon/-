// task_types 테이블 접근. 업무 유형 (FR-07).
const { getPool } = require('../../config/database');

const COLUMNS = 'id, name, description, created_at, updated_at';
const EDITABLE = { name: 'name', description: 'description' };

function toType(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_types WHERE id = ?`, [id]);
  return toType(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_types WHERE id IN (?)`, [ids]);
  return rows.map(toType);
}

async function findByName(name, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_types WHERE name = ?`, [name]);
  return toType(rows[0]);
}

// 유형별 업무 수와 함께 이름순으로 돌려준다.
async function listWithUsage(db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS}, (SELECT COUNT(*) FROM tasks t WHERE t.type_id = task_types.id) AS task_count
     FROM task_types ORDER BY name`,
  );
  return rows.map((r) => ({ ...toType(r), taskCount: r.task_count }));
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM task_types');
  return row.cnt;
}

async function insert({ name, description }, db = getPool()) {
  const [result] = await db.query('INSERT INTO task_types (name, description) VALUES (?, ?)', [name, description ?? null]);
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => EDITABLE[key]);
  if (entries.length === 0) return;
  await db.query(`UPDATE task_types SET ${entries.map(([k]) => `${EDITABLE[k]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, v]) => v), id]);
}

async function usage(id, db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM tasks WHERE type_id = ?', [id]);
  return row.cnt;
}

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM task_types WHERE id = ?', [id]);
}

module.exports = { findById, findByIds, findByName, listWithUsage, count, insert, update, usage, remove };
