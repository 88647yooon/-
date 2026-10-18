// 구성원 활동 타임라인의 SQL 부분 (FR-19): 업무 배정·배정 끝·참여 기록, 자원 사용 시작·반환.
// 여러 테이블의 사건을 한 줄로 모아 시각 역순으로 돌려준다. 평가·평판은 MongoDB에서 따로 읽는다.
const { getPool } = require('../../config/database');

// kind별 사건 조회. 어느 조회가 UNION의 맨 앞에 와도 열 이름이 같도록 모든 열에 별칭을 붙인다.
const cols = (type, at, taskId, taskTitle, resourceId, resourceName, detail, note) =>
  `SELECT '${type}' AS type, ${at} AS at, ${taskId} AS task_id, ${taskTitle} AS task_title, ${resourceId} AS resource_id, `
  + `${resourceName} AS resource_name, ${detail} AS detail, ${note} AS note`;
const SOURCES = {
  task: [
    `${cols('TASK_ASSIGNED', 'a.assigned_at', 'a.task_id', 't.title', 'NULL', 'NULL', 'a.role', 'NULL')}
       FROM task_assignees a JOIN tasks t ON t.id = a.task_id WHERE a.user_id = ?`,
    `${cols('TASK_RELEASED', 'a.released_at', 'a.task_id', 't.title', 'NULL', 'NULL', 'a.release_reason', 'NULL')}
       FROM task_assignees a JOIN tasks t ON t.id = a.task_id WHERE a.user_id = ? AND a.released_at IS NOT NULL`,
    `${cols('TASK_PARTICIPATION', 't.completed_at', 'p.task_id', 't.title', 'NULL', 'NULL', "IF(p.participated, 'Y', 'N')", 'p.contribution')}
       FROM task_participations p JOIN tasks t ON t.id = p.task_id WHERE p.user_id = ? AND t.completed_at IS NOT NULL`,
  ],
  resource: [
    `${cols('RESOURCE_CHECKED_OUT', 'u.started_at', 'u.task_id', 't.title', 'u.resource_id', 'r.name', 'NULL', 'NULL')}
       FROM resource_usages u JOIN resources r ON r.id = u.resource_id LEFT JOIN tasks t ON t.id = u.task_id WHERE u.user_id = ?`,
    `${cols('RESOURCE_RETURNED', 'u.returned_at', 'u.task_id', 't.title', 'u.resource_id', 'r.name', 'u.return_condition', "IF(u.handed_over_to IS NULL, NULL, 'HANDOVER')")}
       FROM resource_usages u JOIN resources r ON r.id = u.resource_id LEFT JOIN tasks t ON t.id = u.task_id
      WHERE u.user_id = ? AND u.returned_at IS NOT NULL`,
  ],
};

function union(userId, kinds, { from, to }) {
  const parts = kinds.flatMap((k) => SOURCES[k]);
  if (parts.length === 0) return null;
  const conds = [from && 'x.at >= ?', to && 'x.at < ?'].filter(Boolean);
  return {
    sql: `FROM (${parts.join(' UNION ALL ')}) x ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}`,
    params: [...parts.map(() => userId), ...(from ? [from] : []), ...(to ? [to] : [])],
  };
}

// 최근 limit건과 전체 건수
async function userTimeline(userId, { kinds, from, to, limit }, db = getPool()) {
  const q = union(userId, kinds, { from, to });
  if (!q) return { rows: [], total: 0 };
  const [rows] = await db.query(`SELECT x.* ${q.sql} ORDER BY x.at DESC LIMIT ?`, [...q.params, limit]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${q.sql}`, q.params);
  return {
    rows: rows.map((r) => ({
      type: r.type, at: r.at, taskId: r.task_id, taskTitle: r.task_title, resourceId: r.resource_id, resourceName: r.resource_name, detail: r.detail, note: r.note,
    })),
    total,
  };
}

module.exports = { userTimeline };
