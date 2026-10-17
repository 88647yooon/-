// resource_categories 테이블 접근. 자원 분류 (FR-13).
const { getPool } = require('../../config/database');

const COLUMNS = 'id, name, description, created_at, updated_at';
const EDITABLE = { name: 'name', description: 'description' };

function toCategory(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function findById(id, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_categories WHERE id = ?`, [id]);
  return toCategory(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_categories WHERE id IN (?)`, [ids]);
  return rows.map(toCategory);
}

async function findByName(name, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM resource_categories WHERE name = ?`, [name]);
  return toCategory(rows[0]);
}

// 분류별 자원 수(전체와 사용가능)와 함께 이름순으로 돌려준다.
async function listWithCounts(db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS},
       (SELECT COUNT(*) FROM resources r WHERE r.category_id = resource_categories.id) AS resource_count,
       (SELECT COUNT(*) FROM resources r WHERE r.category_id = resource_categories.id AND r.status = 'AVAILABLE') AS available_count
     FROM resource_categories ORDER BY name`,
  );
  return rows.map((r) => ({ ...toCategory(r), resourceCount: r.resource_count, availableCount: r.available_count }));
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM resource_categories');
  return row.cnt;
}

async function insert({ name, description }, db = getPool()) {
  const [result] = await db.query('INSERT INTO resource_categories (name, description) VALUES (?, ?)', [name, description ?? null]);
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => EDITABLE[key]);
  if (entries.length === 0) return;
  await db.query(`UPDATE resource_categories SET ${entries.map(([k]) => `${EDITABLE[k]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, v]) => v), id]);
}

// 삭제 가능 여부 판단용: 이 분류의 자원 수와 이 분류를 필요 자원으로 지정한 업무 수
async function usage(id, db = getPool()) {
  const [[row]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM resources WHERE category_id = ?) AS resources,
            (SELECT COUNT(*) FROM task_resource_requirements WHERE category_id = ?) AS requirements`,
    [id, id],
  );
  return row;
}

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM resource_categories WHERE id = ?', [id]);
}

module.exports = { findById, findByIds, findByName, listWithCounts, count, insert, update, usage, remove };
