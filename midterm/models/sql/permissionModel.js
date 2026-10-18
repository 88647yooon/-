// role_permission_overrides 테이블 접근. 역할별 권한 가운데 기본값(config/permissions.js)과 다른 것 (FR-23, NFR-03).
const { getPool } = require('../../config/database');

async function listOverrides(db = getPool()) {
  const [rows] = await db.query('SELECT role, permission_key, allowed, updated_by, updated_at FROM role_permission_overrides');
  return rows.map((r) => ({ role: r.role, key: r.permission_key, allowed: Boolean(r.allowed), updatedBy: r.updated_by, updatedAt: r.updated_at }));
}

// 한 역할의 수정값을 통째로 바꾼다. items: [{ key, allowed }]
async function replaceForRole(role, items, updatedBy, db = getPool()) {
  await db.query('DELETE FROM role_permission_overrides WHERE role = ?', [role]);
  if (items.length === 0) return;
  await db.query('INSERT INTO role_permission_overrides (role, permission_key, allowed, updated_by) VALUES ?',
    [items.map((i) => [role, i.key, i.allowed ? 1 : 0, updatedBy])]);
}

module.exports = { listOverrides, replaceForRole };
