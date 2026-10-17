// task_participations 테이블 접근. 참여자별 실제 참여 여부와 기여 내용 (FR-11).
const { getPool } = require('../../config/database');

const COLUMNS = 'task_id, user_id, participated, contribution, recorded_by, recorded_at';

function toParticipation(row) {
  return {
    taskId: row.task_id,
    userId: row.user_id,
    participated: Boolean(row.participated),
    contribution: row.contribution,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

async function upsertParticipation({ taskId, userId, participated, contribution = null, recordedBy }, db = getPool()) {
  await db.query(
    `INSERT INTO task_participations (task_id, user_id, participated, contribution, recorded_by)
     VALUES (?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE participated = new.participated, contribution = new.contribution, recorded_by = new.recorded_by`,
    [taskId, userId, participated ? 1 : 0, contribution, recordedBy],
  );
}

async function findParticipation(taskId, userId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_participations WHERE task_id = ? AND user_id = ?`, [taskId, userId]);
  return rows[0] ? toParticipation(rows[0]) : null;
}

async function listParticipations(taskId, db = getPool()) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM task_participations WHERE task_id = ? ORDER BY participated DESC, user_id`, [taskId]);
  return rows.map(toParticipation);
}

module.exports = { upsertParticipation, findParticipation, listParticipations };
