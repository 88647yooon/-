// 운영 현황 통계의 SQL 집계 (FR-22, DR-05). 기간 단위(일·주·월) 묶음은 한국 시간 기준이다.
const { getPool } = require('../../config/database');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

const KST = (column) => `CONVERT_TZ(${column}, '+00:00', '+09:00')`;
// 기간 단위 → 묶음 키 형식 (JS의 bucketKeys와 같은 형식)
const BUCKET_FORMAT = { day: '%Y-%m-%d', week: '%x-W%v', month: '%Y-%m' };
const bucket = (column, interval) => `DATE_FORMAT(${KST(column)}, '${BUCKET_FORMAT[interval]}')`;
const crewMemberCond = (alias) => `EXISTS (SELECT 1 FROM crew_memberships cm WHERE cm.user_id = ${alias}.id AND cm.crew_id = ? AND cm.left_at IS NULL)`;

// 상태별 구성원 수 (Administrator 제외)
async function memberStatusCounts(db = getPool()) {
  const [rows] = await db.query("SELECT status, COUNT(*) AS cnt FROM users WHERE role <> 'ADMIN' GROUP BY status");
  return rows;
}

// 역할 × 상태 구성원 수. crewId를 주면 그 Crew의 현재 소속원만
async function memberMatrix({ crewId }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT u.role, u.status, COUNT(*) AS cnt FROM users u ${crewId ? `WHERE ${crewMemberCond('u')}` : ''} GROUP BY u.role, u.status`,
    crewId ? [crewId] : [],
  );
  return rows;
}

async function crewStatusCounts(db = getPool()) {
  const [rows] = await db.query('SELECT status, COUNT(*) AS cnt FROM crews GROUP BY status');
  return rows;
}

async function taskStatusCounts(db = getPool()) {
  const [rows] = await db.query('SELECT status, COUNT(*) AS cnt FROM tasks GROUP BY status');
  return rows;
}

async function resourceStatusCounts(db = getPool()) {
  const [rows] = await db.query('SELECT status, COUNT(*) AS cnt FROM resources GROUP BY status');
  return rows;
}

// Crew별 소속원 수와 기간 안(일정 시작 기준) 업무의 상태별 수
async function crewComparison({ from, to, status }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.region, c.status, c.capo_id,
            (SELECT COUNT(*) FROM crew_memberships m WHERE m.crew_id = c.id AND m.left_at IS NULL AND m.type = 'REGULAR') AS regular_count,
            (SELECT COUNT(*) FROM crew_memberships m WHERE m.crew_id = c.id AND m.left_at IS NULL AND m.type = 'TEMPORARY') AS temporary_count,
            COUNT(t.id) AS task_count,
            SUM(t.status = 'COMPLETED') AS completed, SUM(t.status = 'CANCELLED') AS cancelled,
            SUM(t.status IN (?)) AS open_count
       FROM crews c LEFT JOIN tasks t ON t.crew_id = c.id AND t.start_at >= ? AND t.start_at < ?
      ${status ? 'WHERE c.status = ?' : ''}
      GROUP BY c.id ORDER BY c.name`,
    [OPEN_TASK_STATUSES, from, to, ...(status ? [status] : [])],
  );
  return rows;
}

// 지역별 활성 Crew 수, 현재 소속원 수(중복 없이), 업무 수
async function regions(db = getPool()) {
  const [rows] = await db.query(
    `SELECT c.region,
            COUNT(DISTINCT CASE WHEN c.status = 'ACTIVE' THEN c.id END) AS active_crews,
            COUNT(DISTINCT c.id) AS crews,
            (SELECT COUNT(DISTINCT m.user_id) FROM crew_memberships m JOIN crews c2 ON c2.id = m.crew_id WHERE c2.region = c.region AND m.left_at IS NULL) AS members,
            (SELECT COUNT(*) FROM tasks t JOIN crews c3 ON c3.id = t.crew_id WHERE c3.region = c.region) AS tasks
       FROM crews c GROUP BY c.region ORDER BY c.region`,
  );
  return rows;
}

// 기간별 업무 수 (일정 시작 기준으로 묶고 지금 상태로 나눈다)
async function taskTrend({ from, to, interval, crewId }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT ${bucket('start_at', interval)} AS period, status, COUNT(*) AS cnt FROM tasks
      WHERE start_at >= ? AND start_at < ? ${crewId ? 'AND crew_id = ?' : ''}
      GROUP BY period, status`,
    [from, to, ...(crewId ? [crewId] : [])],
  );
  return rows;
}

// 중요도별 완료 업무 소요 시간 (기간: 완료 시각)
async function leadTimes({ from, to, crewId }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT priority, COUNT(*) AS cnt,
            AVG(TIMESTAMPDIFF(MINUTE, IFNULL(started_at, start_at), completed_at)) / 60 AS lead_hours,
            AVG(TIMESTAMPDIFF(MINUTE, start_at, end_at)) / 60 AS planned_hours,
            AVG(GREATEST(0, TIMESTAMPDIFF(MINUTE, end_at, completed_at))) / 60 AS delay_hours
       FROM tasks WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ? ${crewId ? 'AND crew_id = ?' : ''}
      GROUP BY priority`,
    [from, to, ...(crewId ? [crewId] : [])],
  );
  return rows;
}

// 사용 시간 중 [from, to)와 겹치는 초 (반환되지 않았으면 지금까지)
const USED_SECONDS = 'GREATEST(0, TIMESTAMPDIFF(SECOND, GREATEST(u.started_at, ?), LEAST(IFNULL(u.returned_at, NOW()), ?)))';

// 분류별 자원 상태 분포와 기간 안 사용 시간
async function resourcesByCategory({ from, to }, db = getPool()) {
  const [statusRows] = await db.query(
    `SELECT c.id AS category_id, c.name, r.status, COUNT(r.id) AS cnt
       FROM resource_categories c LEFT JOIN resources r ON r.category_id = c.id GROUP BY c.id, c.name, r.status`,
  );
  const [usageRows] = await db.query(
    `SELECT r.category_id, SUM(${USED_SECONDS}) AS used_seconds
       FROM resource_usages u JOIN resources r ON r.id = u.resource_id
      WHERE u.started_at < ? AND IFNULL(u.returned_at, NOW()) > ? GROUP BY r.category_id`,
    [from, to, to, from],
  );
  return { statusRows, usageRows };
}

// 자원별 기간 안 사용 횟수(시작 기준)·사용 시간 순위. 기간과 겹치는 사용이 있는 자원만 나온다.
async function usageRanking({ from, to, categoryId, limit, offset }, db = getPool()) {
  const cat = categoryId ? [categoryId] : [];
  const base = `FROM resources r
      JOIN resource_usages u ON u.resource_id = r.id AND u.started_at < ? AND IFNULL(u.returned_at, NOW()) > ?
      ${categoryId ? 'WHERE r.category_id = ?' : ''}`;
  const [rows] = await db.query(
    `SELECT r.id, r.code, r.name, r.category_id, r.status,
            SUM(u.started_at >= ? AND u.started_at < ?) AS usage_count, SUM(${USED_SECONDS}) AS used_seconds
       ${base} GROUP BY r.id ORDER BY used_seconds DESC, usage_count DESC, r.code LIMIT ? OFFSET ?`,
    [from, to, from, to, to, from, ...cat, limit, offset],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(DISTINCT r.id) AS total ${base}`, [to, from, ...cat]);
  return { rows, total };
}

// 기간별 소속 변화: 시작(편성·신청 승인·책임자 지정), 이동(이동·병합), 제외(제외·해산), 탈퇴
async function membershipChanges({ from, to, interval, crewId }, db = getPool()) {
  const crew = crewId ? 'AND crew_id = ?' : '';
  const [joins] = await db.query(
    `SELECT ${bucket('joined_at', interval)} AS period, join_method AS kind, COUNT(*) AS cnt FROM crew_memberships
      WHERE joined_at >= ? AND joined_at < ? ${crew} GROUP BY period, kind`,
    [from, to, ...(crewId ? [crewId] : [])],
  );
  const [leaves] = await db.query(
    `SELECT ${bucket('left_at', interval)} AS period, end_reason AS kind, COUNT(*) AS cnt FROM crew_memberships
      WHERE left_at >= ? AND left_at < ? ${crew} GROUP BY period, kind`,
    [from, to, ...(crewId ? [crewId] : [])],
  );
  return { joins, leaves };
}

// 운영 경고: 일정이 지났는데 끝나지 않은 업무 (최근에 지난 것부터 50건과 전체 건수)
async function overdueTasks(db = getPool()) {
  const cond = 'status IN (?) AND end_at < NOW()';
  const [rows] = await db.query(
    `SELECT id, title, status, crew_id, start_at, end_at, TIMESTAMPDIFF(HOUR, end_at, NOW()) AS hours_late
       FROM tasks WHERE ${cond} ORDER BY end_at DESC LIMIT 50`,
    [OPEN_TASK_STATUSES],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM tasks WHERE ${cond}`, [OPEN_TASK_STATUSES]);
  return { rows, total };
}

// 운영 경고: 오래 걸리거나 예정일이 지난 점검 (최근 시작한 것부터 50건과 전체 건수)
async function longMaintenances(days, db = getPool()) {
  const cond = 'm.completed_at IS NULL AND (m.started_at < NOW() - INTERVAL ? DAY OR m.expected_end_at < NOW())';
  const [rows] = await db.query(
    `SELECT m.id, m.resource_id, r.code, r.name, m.reason, m.started_at, m.expected_end_at, TIMESTAMPDIFF(DAY, m.started_at, NOW()) AS days_open
       FROM resource_maintenances m JOIN resources r ON r.id = m.resource_id
      WHERE ${cond} ORDER BY m.started_at DESC LIMIT 50`,
    [days],
  );
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM resource_maintenances m WHERE ${cond}`, [days]);
  return { rows, total };
}

// Crew 소속원별 기간 안 배정 업무 수·시간 (취소된 업무 제외)
async function crewWorkload(crewId, { from, to }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT u.id, u.username, u.name, u.role, u.status, m.type,
            COUNT(t.id) AS task_count,
            SUM(t.status IN (?)) AS open_count,
            SUM(a.role = 'LEADER') AS leader_count,
            IFNULL(SUM(GREATEST(0, TIMESTAMPDIFF(MINUTE, GREATEST(t.start_at, ?), LEAST(t.end_at, ?)))), 0) / 60 AS hours,
            MIN(CASE WHEN t.start_at > NOW() THEN t.start_at END) AS next_start
       FROM crew_memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN task_assignees a ON a.user_id = u.id AND a.released_at IS NULL
       LEFT JOIN tasks t ON t.id = a.task_id AND t.status <> 'CANCELLED' AND t.start_at < ? AND t.end_at > ?
      WHERE m.crew_id = ? AND m.left_at IS NULL
      GROUP BY u.id, u.username, u.name, u.role, u.status, m.type
      ORDER BY hours DESC, task_count DESC, u.name`,
    [OPEN_TASK_STATUSES, from, to, to, from, crewId],
  );
  return rows;
}

module.exports = {
  memberStatusCounts, memberMatrix, crewStatusCounts, taskStatusCounts, resourceStatusCounts, crewComparison, regions,
  taskTrend, leadTimes, resourcesByCategory, usageRanking, membershipChanges, overdueTasks, longMaintenances, crewWorkload,
};
