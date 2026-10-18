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

// 평가할 수 있는 참여: since 이후에 완료된 업무에 실제로 참여한 구성원 (excludeUserId 본인 제외).
// crewId를 주면 그 Crew의 업무로 범위를 좁힌다 (Capo의 관리 범위).
async function listEvaluable({ since, crewId, excludeUserId }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT p.task_id, p.user_id, t.title, t.crew_id, t.completed_at
       FROM task_participations p JOIN tasks t ON t.id = p.task_id
      WHERE t.status = 'COMPLETED' AND t.completed_at >= ? AND p.participated = 1 AND p.user_id <> ?
        ${crewId !== undefined ? 'AND t.crew_id = ?' : ''}
      ORDER BY t.completed_at DESC, p.task_id, p.user_id`,
    [since, excludeUserId, ...(crewId !== undefined ? [crewId] : [])],
  );
  return rows.map((r) => ({ taskId: r.task_id, userId: r.user_id, title: r.title, crewId: r.crew_id, completedAt: r.completed_at }));
}

module.exports = { upsertParticipation, findParticipation, listParticipations, listEvaluable };
