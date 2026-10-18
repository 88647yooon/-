// tasks 테이블 접근. 업무와 일정·중요도·상태, 필요 인원, 완료 결과 (FR-07, FR-10, FR-11, FR-12).
const { getPool } = require('../../config/database');
const { where, like, orderBy } = require('../../utils/sql');
const { limitOffset } = require('../../utils/pagination');

const FIELDS = ['id', 'title', 'description', 'type_id', 'crew_id', 'priority', 'status', 'location', 'start_at', 'end_at',
  'required_headcount', 'leader_required', 'started_at', 'completed_at', 'cancelled_at', 'cancel_reason',
  'result_outcome', 'result_summary', 'result_recorded_by', 'duplicated_from', 'created_by', 'created_at', 'updated_at'];
const COLUMNS = FIELDS.join(', ');
const T_COLUMNS = FIELDS.map((f) => `t.${f}`).join(', ');

const EDITABLE = { title: 'title', description: 'description', typeId: 'type_id', priority: 'priority', location: 'location' };
const PRIORITY_SQL = "FIELD(t.priority, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')";
const SORT_COLUMNS = { startAt: 't.start_at', createdAt: 't.created_at', title: 't.title', priority: PRIORITY_SQL };

function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    typeId: row.type_id,
    crewId: row.crew_id,
    priority: row.priority,
    status: row.status,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    requiredHeadcount: row.required_headcount,
    leaderRequired: Boolean(row.leader_required),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    resultOutcome: row.result_outcome,
    resultSummary: row.result_summary,
    resultRecordedBy: row.result_recorded_by,
    duplicatedFrom: row.duplicated_from,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(id, db = getPool(), { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM tasks WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toTask(rows[0]);
}

async function findByIds(ids, db = getPool()) {
  if (ids.length === 0) return [];
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM tasks WHERE id IN (?)`, [ids]);
  return rows.map(toTask);
}

async function listIdsByCrew(crewId, db = getPool()) {
  const [rows] = await db.query('SELECT id FROM tasks WHERE crew_id = ?', [crewId]);
  return rows.map((r) => r.id);
}

async function count(db = getPool()) {
  const [[row]] = await db.query('SELECT COUNT(*) AS cnt FROM tasks');
  return row.cnt;
}

async function insert(t, db = getPool()) {
  const [result] = await db.query(
    `INSERT INTO tasks (title, description, type_id, crew_id, priority, location, start_at, end_at,
       required_headcount, leader_required, duplicated_from, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.title, t.description ?? null, t.typeId ?? null, t.crewId ?? null, t.priority, t.location ?? null, t.startAt, t.endAt,
      t.requiredHeadcount ?? null, t.leaderRequired ? 1 : 0, t.duplicatedFrom ?? null, t.createdBy ?? null],
  );
  return result.insertId;
}

async function update(id, fields, db = getPool()) {
  const entries = Object.entries(fields).filter(([key]) => EDITABLE[key]);
  if (entries.length === 0) return;
  await db.query(`UPDATE tasks SET ${entries.map(([k]) => `${EDITABLE[k]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, v]) => v), id]);
}

async function setSchedule(id, { startAt, endAt }, db = getPool()) {
  await db.query('UPDATE tasks SET start_at = ?, end_at = ? WHERE id = ?', [startAt, endAt, id]);
}

// 처음 진행으로 바뀔 때 실제 시작 시각을 남긴다.
async function setStatus(id, status, db = getPool()) {
  await db.query(
    "UPDATE tasks SET status = ?, started_at = IF(? = 'IN_PROGRESS' AND started_at IS NULL, NOW(), started_at) WHERE id = ?",
    [status, status, id],
  );
}

async function setRequirements(id, { requiredHeadcount, leaderRequired }, db = getPool()) {
  await db.query('UPDATE tasks SET required_headcount = ?, leader_required = ? WHERE id = ?',
    [requiredHeadcount, leaderRequired ? 1 : 0, id]);
}

async function cancel(id, reason, db = getPool()) {
  await db.query("UPDATE tasks SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?", [reason, id]);
}

async function complete(id, { outcome, summary, recordedBy }, db = getPool()) {
  await db.query(
    `UPDATE tasks SET status = 'COMPLETED', completed_at = NOW(), result_outcome = ?, result_summary = ?, result_recorded_by = ?
     WHERE id = ?`,
    [outcome, summary, recordedBy, id],
  );
}

async function updateResult(id, { outcome, summary }, db = getPool()) {
  const sets = [];
  const params = [];
  if (outcome !== undefined) { sets.push('result_outcome = ?'); params.push(outcome); }
  if (summary !== undefined) { sets.push('result_summary = ?'); params.push(summary); }
  if (sets.length === 0) return;
  await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

async function remove(id, db = getPool()) {
  await db.query('DELETE FROM tasks WHERE id = ?', [id]);
}

// 업무 탐색 (FR-12). scopeCrewId를 주면 그 Crew의 업무로만 범위를 제한한다 (Capo의 관리 범위).
// 기간(from·to)은 그 기간과 일정이 겹치는 업무를 찾는다.
async function search({ scopeCrewId, crewId, typeId, status, priority, assigneeId, from, to, q, sort = 'startAt', ...paging }, db = getPool()) {
  const w = where([
    scopeCrewId !== undefined && ['t.crew_id = ?', scopeCrewId],
    crewId && ['t.crew_id = ?', crewId],
    typeId && ['t.type_id = ?', typeId],
    status && ['t.status = ?', status],
    priority && ['t.priority = ?', priority],
    assigneeId && ['EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ? AND a.released_at IS NULL)', assigneeId],
    from && ['t.end_at > ?', from],
    to && ['t.start_at < ?', to],
    q && ['(t.title LIKE ? OR t.description LIKE ? OR t.location LIKE ?)', like(q), like(q), like(q)],
  ]);
  const [rows] = await db.query(
    `SELECT ${T_COLUMNS} FROM tasks t ${w.sql} ${orderBy(sort, SORT_COLUMNS, 't.id')} LIMIT ? OFFSET ?`,
    [...w.params, ...limitOffset(paging)],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM tasks t ${w.sql}`, w.params);
  return { rows: rows.map(toTask), total };
}

module.exports = {
  findById,
  findByIds,
  listIdsByCrew,
  count,
  insert,
  update,
  setSchedule,
  setStatus,
  setRequirements,
  cancel,
  complete,
  updateResult,
  remove,
  search,
};
