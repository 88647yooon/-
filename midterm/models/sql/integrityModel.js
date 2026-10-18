// 데이터 무결성 점검 쿼리 (DR-01, BR-01, BR-03, BR-07, #209). 규칙이 지켜지고 있으면 모두 빈 결과다.
// 제약·트랜잭션이 막고 있는 규칙도, DB를 직접 고친 경우 등을 대비해 데이터에서 다시 확인한다.
const { getPool } = require('../../config/database');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

const LIMIT = 200;

// BR-01: 끝나지 않은 정식 소속이 둘 이상인 구성원
async function multipleRegularMemberships(db = getPool()) {
  const [rows] = await db.query(
    `SELECT m.user_id, u.username, COUNT(*) AS cnt, GROUP_CONCAT(c.name ORDER BY c.name) AS crews
       FROM crew_memberships m JOIN users u ON u.id = m.user_id JOIN crews c ON c.id = m.crew_id
      WHERE m.type = 'REGULAR' AND m.left_at IS NULL
      GROUP BY m.user_id, u.username HAVING COUNT(*) > 1 LIMIT ?`,
    [LIMIT],
  );
  return rows.map((r) => ({ userId: r.user_id, username: r.username, count: r.cnt, crews: r.crews.split(',') }));
}

// 설계 결정: 활성 Crew의 책임자는 그 Crew의 정식 소속원이어야 한다.
async function capoNotRegularMember(db = getPool()) {
  const [rows] = await db.query(
    `SELECT c.id AS crew_id, c.name, u.id AS user_id, u.username FROM crews c JOIN users u ON u.id = c.capo_id
      WHERE c.status = 'ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM crew_memberships m WHERE m.crew_id = c.id AND m.user_id = c.capo_id AND m.type = 'REGULAR' AND m.left_at IS NULL)
      LIMIT ?`,
    [LIMIT],
  );
  return rows.map((r) => ({ crewId: r.crew_id, crewName: r.name, userId: r.user_id, username: r.username }));
}

// BR-03: 같은 구성원이 시간이 겹치는 끝나지 않은 업무 두 개에 배정된 경우
async function overlappingAssignments(db = getPool()) {
  const [rows] = await db.query(
    `SELECT a1.user_id, u.username, t1.id AS task_id, t1.title, t2.id AS other_task_id, t2.title AS other_title
       FROM task_assignees a1
       JOIN tasks t1 ON t1.id = a1.task_id
       JOIN task_assignees a2 ON a2.user_id = a1.user_id AND a2.task_id > a1.task_id AND a2.released_at IS NULL
       JOIN tasks t2 ON t2.id = a2.task_id
       JOIN users u ON u.id = a1.user_id
      WHERE a1.released_at IS NULL AND t1.status IN (?) AND t2.status IN (?)
        AND t1.start_at < t2.end_at AND t2.start_at < t1.end_at
      LIMIT ?`,
    [OPEN_TASK_STATUSES, OPEN_TASK_STATUSES, LIMIT],
  );
  return rows.map((r) => ({ userId: r.user_id, username: r.username, taskId: r.task_id, title: r.title, otherTaskId: r.other_task_id, otherTitle: r.other_title }));
}

// BR-07: 같은 자원의 진행 중 예약(끝나지 않은 업무의 할당, 구성원 배정)끼리 시간이 겹치는 경우
async function overlappingReservations(db = getPool()) {
  const [rows] = await db.query(
    `WITH r AS (
       SELECT 'TASK' AS kind, tr.id, tr.resource_id, tr.start_at, tr.end_at
         FROM task_resources tr JOIN tasks t ON t.id = tr.task_id WHERE tr.released_at IS NULL AND t.status IN (?)
       UNION ALL
       SELECT 'MEMBER', ra.id, ra.resource_id, ra.start_at, ra.end_at FROM resource_allocations ra WHERE ra.released_at IS NULL
     )
     SELECT r1.resource_id, res.code, res.name, r1.kind, r1.id, r2.kind AS other_kind, r2.id AS other_id
       FROM r r1 JOIN r r2 ON r2.resource_id = r1.resource_id AND (r1.kind < r2.kind OR (r1.kind = r2.kind AND r1.id < r2.id))
        AND r1.start_at < r2.end_at AND r2.start_at < r1.end_at
       JOIN resources res ON res.id = r1.resource_id
      LIMIT ?`,
    [OPEN_TASK_STATUSES, LIMIT],
  );
  return rows.map((r) => ({
    resourceId: r.resource_id, code: r.code, name: r.name, reservation: { kind: r.kind, id: r.id }, other: { kind: r.other_kind, id: r.other_id },
  }));
}

// DR-03: 사용중인데 반환되지 않은 사용 기록이 없거나, 사용가능인데 반환되지 않은 사용 기록이 있는 자원
async function resourceStatusMismatch(db = getPool()) {
  const [rows] = await db.query(
    `SELECT r.id, r.code, r.name, r.status, u.id AS usage_id
       FROM resources r LEFT JOIN resource_usages u ON u.resource_id = r.id AND u.returned_at IS NULL
      WHERE (r.status = 'IN_USE' AND u.id IS NULL) OR (r.status = 'AVAILABLE' AND u.id IS NOT NULL)
      LIMIT ?`,
    [LIMIT],
  );
  return rows.map((r) => ({ resourceId: r.id, code: r.code, name: r.name, status: r.status, openUsageId: r.usage_id }));
}

module.exports = { multipleRegularMemberships, capoNotRegularMember, overlappingAssignments, overlappingReservations, resourceStatusMismatch };
