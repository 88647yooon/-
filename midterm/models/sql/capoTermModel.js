// crew_capo_terms 테이블 접근. Crew 책임자 임기 기록 (BR-10).
const { getPool } = require('../../config/database');
const { limitOffset } = require('../../utils/pagination');

const COLUMNS = 'id, crew_id, user_id, started_at, ended_at, end_reason, assigned_by, ended_by, reason';

function toTerm(row) {
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    assignedBy: row.assigned_by,
    endedBy: row.ended_by,
    reason: row.reason,
  };
}

async function start({ crewId, userId, assignedBy = null, reason = null }, db = getPool()) {
  await db.query(
    'INSERT INTO crew_capo_terms (crew_id, user_id, assigned_by, reason) VALUES (?, ?, ?, ?)',
    [crewId, userId, assignedBy, reason],
  );
}

async function endActive(crewId, { reason, endedBy = null }, db = getPool()) {
  await db.query(
    'UPDATE crew_capo_terms SET ended_at = NOW(), end_reason = ?, ended_by = ? WHERE crew_id = ? AND ended_at IS NULL',
    [reason, endedBy, crewId],
  );
}

async function searchByCrew(crewId, paging, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM crew_capo_terms WHERE crew_id = ? ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
    [crewId, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM crew_capo_terms WHERE crew_id = ?', [crewId]);
  return { rows: rows.map(toTerm), total };
}

module.exports = { start, endActive, searchByCrew };
