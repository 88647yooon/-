// system_settings 테이블 접근. 운영 설정 (FR-23).
const { getPool } = require('../../config/database');

async function list(db = getPool()) {
  const [rows] = await db.query('SELECT setting_key, setting_value, updated_by, updated_at FROM system_settings');
  return rows.map((r) => ({ key: r.setting_key, value: r.setting_value, updatedBy: r.updated_by, updatedAt: r.updated_at }));
}

async function upsertMany(values, updatedBy, db = getPool()) {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES ?
     AS new ON DUPLICATE KEY UPDATE setting_value = new.setting_value, updated_by = new.updated_by`,
    [entries.map(([key, value]) => [key, String(value), updatedBy])],
  );
}

module.exports = { list, upsertMany };
