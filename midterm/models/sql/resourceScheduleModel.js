// 자원 예약 시간표 (BR-07). 업무 자원 할당, 구성원 자원 배정, 반환되지 않은 사용을 한데 모아 시간 겹침을 찾는다.
// 겹침 조건은 BR-03과 같다: 새 시작 < 기존 종료 AND 기존 시작 < 새 종료 (맞닿은 시간은 허용).
// - 업무 할당: 해제되지 않았고 업무가 끝나지 않은 것 (완료·취소된 업무의 할당은 제외)
// - 구성원 배정: 해제되지 않은 것
// - 반환되지 않은 사용: 시작부터 반환 예정 시각까지. 반환 예정 시각이 지났으면 언제 돌아올지 모르므로 반환될 때까지 계속 사용 중으로 본다.
const { getPool } = require('../../config/database');
const { OPEN_TASK_STATUSES } = require('../../config/constants');

// 겹침 검사에 쓰는 반환되지 않은 사용의 끝 (반환 예정 시각이 지났으면 반환될 때까지)
const USAGE_BLOCK_END_SQL = "IF(u.due_at > NOW(), u.due_at, '9999-12-31 23:59:59')";
// 일정 화면에 보여 주는 반환되지 않은 사용의 끝 (지났으면 지금까지)
const USAGE_SHOWN_END_SQL = 'GREATEST(u.due_at, NOW())';

const toEntry = (r) => ({
  kind: r.kind,
  id: r.id,
  taskId: r.task_id,
  userId: r.user_id,
  startAt: r.start_at,
  endAt: r.end_at,
  overdue: Boolean(r.overdue),
  taskResourceId: r.task_resource_id,
  allocationId: r.allocation_id,
});

// 사용 기록이 근거로 삼은 예약이 이미 목록에 있으면 같은 예약을 두 번 보여 주지 않는다.
function dedupe(entries) {
  const reserved = new Set(entries.filter((e) => e.kind !== 'USAGE').map((e) => `${e.kind}:${e.id}`));
  return entries.filter((e) => e.kind !== 'USAGE'
    || !(reserved.has(`TASK:${e.taskResourceId}`) || reserved.has(`MEMBER:${e.allocationId}`)));
}

// BR-07: 자원의 [startAt, endAt)과 겹치는 진행 중 예약. exclude*로 지금 바꾸려는 예약 자신과 그 사용 기록은 뺀다.
async function findConflicts(resourceId, { startAt, endAt, excludeTaskResourceId = 0, excludeAllocationId = 0, excludeUsageId = 0 }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT 'TASK' AS kind, tr.id, tr.task_id, NULL AS user_id, tr.start_at, tr.end_at, 0 AS overdue, tr.id AS task_resource_id, NULL AS allocation_id
       FROM task_resources tr JOIN tasks t ON t.id = tr.task_id
      WHERE tr.resource_id = ? AND tr.released_at IS NULL AND t.status IN (?) AND tr.id <> ?
        AND ? < tr.end_at AND tr.start_at < ?
     UNION ALL
     SELECT 'MEMBER', ra.id, NULL, ra.user_id, ra.start_at, ra.end_at, 0, NULL, ra.id
       FROM resource_allocations ra
      WHERE ra.resource_id = ? AND ra.released_at IS NULL AND ra.id <> ?
        AND ? < ra.end_at AND ra.start_at < ?
     UNION ALL
     SELECT 'USAGE', u.id, u.task_id, u.user_id, u.started_at, u.due_at, u.due_at <= NOW(), u.task_resource_id, u.allocation_id
       FROM resource_usages u
      WHERE u.resource_id = ? AND u.returned_at IS NULL AND u.id <> ?
        AND NOT (u.task_resource_id <=> ?) AND NOT (u.allocation_id <=> ?)
        AND ? < ${USAGE_BLOCK_END_SQL} AND u.started_at < ?
     ORDER BY start_at`,
    [
      resourceId, OPEN_TASK_STATUSES, excludeTaskResourceId, startAt, endAt,
      resourceId, excludeAllocationId, startAt, endAt,
      resourceId, excludeUsageId, excludeTaskResourceId, excludeAllocationId, startAt, endAt,
    ],
  );
  return dedupe(rows.map(toEntry));
}

// 목록 검색용 SQL 조건: alias 자원이 [startAt, endAt) 동안 비어 있다 (BR-07).
function freeCondition(alias, { startAt, endAt }) {
  return [
    `NOT EXISTS (SELECT 1 FROM task_resources tr JOIN tasks t ON t.id = tr.task_id
        WHERE tr.resource_id = ${alias}.id AND tr.released_at IS NULL AND t.status IN (?) AND ? < tr.end_at AND tr.start_at < ?)
     AND NOT EXISTS (SELECT 1 FROM resource_allocations ra
        WHERE ra.resource_id = ${alias}.id AND ra.released_at IS NULL AND ? < ra.end_at AND ra.start_at < ?)
     AND NOT EXISTS (SELECT 1 FROM resource_usages u
        WHERE u.resource_id = ${alias}.id AND u.returned_at IS NULL AND ? < ${USAGE_BLOCK_END_SQL} AND u.started_at < ?)`,
    OPEN_TASK_STATUSES, startAt, endAt, startAt, endAt, startAt, endAt,
  ];
}

// #136 자원 예약 일정: 기간과 겹치는 업무 할당(취소된 업무 제외)·구성원 배정(해제되지 않은 것)과 사용 기록(반환된 것 포함)
async function listSchedule(resourceId, { from, to }, db = getPool()) {
  const [rows] = await db.query(
    `SELECT 'TASK' AS kind, tr.id, tr.task_id, NULL AS user_id, tr.start_at, tr.end_at, 0 AS overdue, tr.id AS task_resource_id, NULL AS allocation_id
       FROM task_resources tr JOIN tasks t ON t.id = tr.task_id
      WHERE tr.resource_id = ? AND tr.released_at IS NULL AND t.status <> 'CANCELLED' AND ? < tr.end_at AND tr.start_at < ?
     UNION ALL
     SELECT 'MEMBER', ra.id, NULL, ra.user_id, ra.start_at, ra.end_at, 0, NULL, ra.id
       FROM resource_allocations ra
      WHERE ra.resource_id = ? AND ra.released_at IS NULL AND ? < ra.end_at AND ra.start_at < ?
     UNION ALL
     SELECT 'USAGE', u.id, u.task_id, u.user_id, u.started_at, IFNULL(u.returned_at, ${USAGE_SHOWN_END_SQL}),
            u.returned_at IS NULL AND u.due_at <= NOW(), u.task_resource_id, u.allocation_id
       FROM resource_usages u
      WHERE u.resource_id = ? AND ? < IFNULL(u.returned_at, ${USAGE_SHOWN_END_SQL}) AND u.started_at < ?
     ORDER BY start_at`,
    [resourceId, from, to, resourceId, from, to, resourceId, from, to],
  );
  return rows.map(toEntry);
}

module.exports = { findConflicts, freeCondition, listSchedule };
