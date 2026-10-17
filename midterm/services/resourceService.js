// 공용 자원 (FR-13~FR-16, BR-07, BR-08). 자원 등록·조회·수정·삭제, 상태·이용 최소 역할 변경, 상태 이력,
// 이용 가능 자원, 한 자원의 시간대 가용 여부와 예약 일정.
const { withTransaction } = require('../config/database');
const resourceModel = require('../models/sql/resourceModel');
const resourceCategoryModel = require('../models/sql/resourceCategoryModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const maintenanceModel = require('../models/sql/maintenanceModel');
const scheduleModel = require('../models/sql/resourceScheduleModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const auditService = require('./auditService');
const rules = require('./resourceRules');
const { requireResource, requireResourceCategory } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { ROLE_INFO, RESOURCE_STATUS_INFO } = require('../config/constants');
const { forbidden, conflict, bulkRejected } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { changedFields } = require('../utils/diff');

const { resourceTarget } = auditService;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// 자원 상태가 바뀐 경위. 상태 이력(#124)에 함께 보여 준다.
const STATUS_CAUSES = {
  CREATED: '등록',
  MANUAL: '상태 변경',
  CHECKOUT: '사용 시작',
  RETURN: '반환',
  MAINTENANCE_START: '점검 등록',
  MAINTENANCE_COMPLETE: '점검 완료',
  DAMAGE_REPORT: '고장 신고',
};

// 상태 변경 활동 기록. 자원 상태를 바꾸는 모든 서비스가 이 형태로 기록한다 (FR-15, BR-10).
const statusChangeEntry = ({ actor, resource, from, to, cause, reason, related, ip }) => ({
  actor, action: 'RESOURCE_STATUS_CHANGED', target: resourceTarget(resource), related,
  before: { status: from }, after: { status: to, cause }, reason, ip,
});

// 여러 자원을 응답 형태로 바꾼다 (분류·현재 사용자·진행 중 점검을 한 번에 불러온다).
async function presentResources(resources, db) {
  const ids = resources.map((r) => r.id);
  const [usages, maintenances] = await Promise.all([
    resourceUsageModel.findOpenByResources(ids, db),
    maintenanceModel.findOpenByResources(ids, db),
  ]);
  const openUsages = [...usages.values()];
  const refs = await loadRefs({
    categoryIds: resources.map((r) => r.categoryId),
    userIds: [...resources.map((r) => r.createdBy), ...openUsages.map((u) => u.userId)],
    taskIds: openUsages.map((u) => u.taskId),
  }, db);
  return resources.map((r) => P.presentResource(r, refs, { usage: usages.get(r.id), maintenance: maintenances.get(r.id) }));
}

const presentById = async (id, db) => (await presentResources([await resourceModel.findById(id, db)], db))[0];

// 상세·가용 여부·일정: 자원 관리 역할(Capo 이상)이거나 내 역할이 이용 최소 역할 이상이어야 한다 (FR-14).
function assertCanSee(actor, resource) {
  if (rules.isResourceManager(actor) || rules.meetsMinRole(actor, resource)) return;
  throw forbidden(`'${resource.name}'은 ${ROLE_INFO[resource.minRole].label} 이상만 이용할 수 있는 자원입니다.`,
    { resourceId: resource.id, minRole: resource.minRole });
}

async function assertCodeAvailable(code, exceptId, db) {
  const [same] = await resourceModel.findByCodes([code], db);
  if (same && same.id !== exceptId) throw conflict(`이미 같은 관리 번호(${code})의 자원이 있습니다.`, { field: 'body.code' }, 'DUPLICATE');
}

// ---------------------------------------------------------------------------
// 등록·조회·수정·삭제

// #114 자원 등록. 처음 상태는 사용가능이다.
async function create(actor, input, ctx) {
  await requireResourceCategory(input.categoryId);
  await assertCodeAvailable(input.code);
  let id;
  try {
    id = await resourceModel.insert({ ...input, createdBy: actor.id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict(`이미 같은 관리 번호(${input.code})의 자원이 있습니다.`, { field: 'body.code' }, 'DUPLICATE');
    throw err;
  }
  const resource = await resourceModel.findById(id);
  await auditService.record({
    actor, action: 'RESOURCE_CREATED', target: resourceTarget(resource),
    after: { status: 'AVAILABLE', categoryId: resource.categoryId, minRole: resource.minRole, location: resource.location }, ip: ctx.ip,
  });
  return presentById(id);
}

// #115 자원 일괄 등록. 모든 행을 먼저 검사하고, 한 행이라도 안 되면 아무것도 등록하지 않는다 (409 BULK_REJECTED).
async function bulkCreate(actor, { resources }, ctx) {
  const ids = await withTransaction(async (conn) => {
    const categories = new Map((await resourceCategoryModel.findByIds([...new Set(resources.map((r) => r.categoryId))], conn)).map((c) => [c.id, c]));
    const existing = new Set((await resourceModel.findByCodes(resources.map((r) => r.code), conn)).map((r) => r.code));
    const seen = new Set();
    const failures = [];
    resources.forEach((r, index) => {
      const fail = (code, message) => failures.push({ index, code, message, value: r.code });
      if (!categories.has(r.categoryId)) fail('NOT_FOUND', `자원 분류(ID ${r.categoryId})를 찾을 수 없습니다.`);
      else if (existing.has(r.code)) fail('DUPLICATE', `이미 같은 관리 번호(${r.code})의 자원이 있습니다.`);
      else if (seen.has(r.code)) fail('DUPLICATE', `같은 관리 번호(${r.code})가 요청 안에 여러 번 있습니다.`);
      seen.add(r.code);
    });
    if (failures.length > 0) throw bulkRejected(resources.length, failures);
    const inserted = [];
    for (const r of resources) inserted.push(await resourceModel.insert({ ...r, createdBy: actor.id }, conn));
    return inserted;
  });
  const created = await resourceModel.findByIds(ids);
  await auditService.recordMany(created.map((r) => ({
    actor, action: 'RESOURCE_CREATED', target: resourceTarget(r), after: { status: 'AVAILABLE', categoryId: r.categoryId, minRole: r.minRole },
    reason: '일괄 등록', ip: ctx.ip,
  })));
  return presentResources(ids.map((id) => created.find((r) => r.id === id)));
}

// #116 관리용 전체 자원 목록 (Capo 이상)
async function list(actor, query) {
  const { rows, total } = await resourceModel.search(query);
  return { data: await presentResources(rows), meta: pageMeta(query, total) };
}

// #117 이용 가능한 자원 (FR-14): 내 역할이 이용 최소 역할 이상이고, 배정 가능한 상태이며, 지정 시간대(기본: 지금부터 1시간)가 비어 있는 자원
async function available(actor, { from, to, ...query }) {
  const startAt = from ?? new Date(Math.floor(Date.now() / 1000) * 1000);
  const endAt = to ?? new Date(startAt.getTime() + HOUR);
  rules.assertPeriod(startAt, endAt, 'query.to');
  const { rows, total } = await resourceModel.searchAvailable({ ...query, rank: ROLE_INFO[actor.role].rank, startAt, endAt });
  return { data: await presentResources(rows), meta: { ...pageMeta(query, total), from: startAt, to: endAt } };
}

// #118 자원 상세 (현재 상태, 현재 사용자, 진행 중 점검)
async function get(actor, resourceId) {
  const resource = await requireResource(resourceId);
  assertCanSee(actor, resource);
  return presentById(resourceId);
}

// #119 기본 정보 수정 (관리 번호·이름·분류·위치·설명)
async function update(actor, resourceId, changes, ctx) {
  const resource = await requireResource(resourceId);
  if (changes.categoryId !== undefined) await requireResourceCategory(changes.categoryId);
  if (changes.code !== undefined) await assertCodeAvailable(changes.code, resourceId);
  const { before, after, changed } = changedFields(resource, changes);
  if (changed) {
    await resourceModel.update(resourceId, after);
    await auditService.record({ actor, action: 'RESOURCE_UPDATED', target: resourceTarget(resource), before, after, ip: ctx.ip });
  }
  return presentById(resourceId);
}

// #120 사용 이력이 없는 자원 삭제. 할당·배정·신청·사용·점검 기록이 하나라도 있으면 사용불가로 바꾸도록 안내한다.
async function remove(actor, resourceId, ctx) {
  const resource = await requireResource(resourceId);
  const usage = await resourceModel.usage(resourceId);
  if (Object.values(usage).some((n) => n > 0)) {
    throw conflict('배정·사용·점검 기록이 있는 자원은 삭제할 수 없습니다. 더 쓰지 않을 자원은 사용불가로 바꾸세요.', usage);
  }
  await resourceModel.remove(resourceId);
  await auditService.record({ actor, action: 'RESOURCE_DELETED', target: resourceTarget(resource), before: { status: resource.status }, ip: ctx.ip });
  return { id: resourceId, deleted: true };
}

// ---------------------------------------------------------------------------
// 상태·이용 최소 역할

// 지금부터 잡혀 있는 진행 중 예약 전부 (자원이 배정할 수 없는 상태가 되면 영향을 받는다)
const FAR_FUTURE = new Date(Date.UTC(9999, 0, 1));
async function upcomingReservations(resourceId, db) {
  const entries = await scheduleModel.findConflicts(resourceId, { startAt: new Date(), endAt: FAR_FUTURE }, db);
  return rules.presentConflicts(entries, db);
}

// #121 상태 변경 (사용가능·점검중·사용불가). 사용중은 사용 시작·반환으로만 바뀌고, 진행 중인 점검은 점검 완료로 끝낸다.
// 점검중·사용불가가 되면 새 배정은 막히고(BR-08), 이미 잡힌 예약은 affectedReservations로 알려 준다.
async function changeStatus(actor, resourceId, { status, reason }, ctx) {
  const resource = await withTransaction(async (conn) => {
    const current = await requireResource(resourceId, conn, { forUpdate: true });
    const from = RESOURCE_STATUS_INFO[current.status];
    if (current.status === status) throw conflict(`이미 ${from.label} 상태입니다.`);
    if (await resourceUsageModel.findOpenByResource(resourceId, conn)) {
      throw conflict('사용 중인 자원은 반환된 뒤에 상태를 바꿀 수 있습니다. 사용 중 고장은 고장 신고를 이용하세요.', { status: current.status });
    }
    const open = await maintenanceModel.findOpenByResource(resourceId, conn);
    if (open) {
      throw conflict('진행 중인 점검이 있습니다. 점검 완료 처리로 상태를 바꾸세요.', { maintenanceId: open.id });
    }
    if (!from.next.includes(status)) {
      throw conflict(`${from.label} 상태에서 ${RESOURCE_STATUS_INFO[status].label} 상태로 바꿀 수 없습니다.`,
        { from: current.status, to: status, allowed: from.next });
    }
    await resourceModel.setStatus(resourceId, status, conn);
    return current;
  });
  await auditService.record(statusChangeEntry({ actor, resource, from: resource.status, to: status, cause: 'MANUAL', reason, ip: ctx.ip }));
  const presented = await presentById(resourceId);
  return { ...presented, affectedReservations: presented.assignable ? [] : await upcomingReservations(resourceId) };
}

// #122 이용 가능한 최소 역할 변경 (FR-14). 이미 잡힌 배정은 그대로 두고 새 배정·신청부터 적용한다.
async function changeAccessLevel(actor, resourceId, { minRole, reason }, ctx) {
  const resource = await requireResource(resourceId);
  if (resource.minRole === minRole) throw conflict(`이미 ${ROLE_INFO[minRole].label} 이상이 이용할 수 있는 자원입니다.`);
  await resourceModel.setMinRole(resourceId, minRole);
  await auditService.record({
    actor, action: 'RESOURCE_ACCESS_LEVEL_CHANGED', target: resourceTarget(resource),
    before: { minRole: resource.minRole }, after: { minRole }, reason, ip: ctx.ip,
  });
  return presentById(resourceId);
}

// #123 자원 상태 목록과 상태별 배정 가능 여부
function statuses() {
  const how = {
    AVAILABLE: '상태 변경 API, 반환, 점검 완료(정상 복구)',
    IN_USE: '사용 시작 (반환하면 사용가능으로 돌아온다)',
    MAINTENANCE: '상태 변경 API, 점검 등록, 고장 신고, 손상 반환',
    UNAVAILABLE: '상태 변경 API, 점검 완료(수리 불가), 분실 반환',
  };
  return Object.entries(RESOURCE_STATUS_INFO).map(([status, info]) => ({
    status,
    label: info.label,
    assignable: info.assignable,
    setBy: how[status],
    next: info.next.map((s) => ({ status: s, label: RESOURCE_STATUS_INFO[s].label })),
  }));
}

// #124 자원 상태 변경 이력 (MongoDB 활동 기록, 시간순)
async function statusHistory(actor, resourceId, query) {
  await requireResource(resourceId);
  const filter = { 'target.entity': 'resource', 'target.id': String(resourceId), action: { $in: ['RESOURCE_CREATED', 'RESOURCE_STATUS_CHANGED'] } };
  const [docs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: 1, _id: 1 }).skip((query.page - 1) * query.size).limit(query.size).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  const label = (s) => (s ? RESOURCE_STATUS_INFO[s].label : null);
  return {
    data: docs.map((d) => {
      const cause = d.action === 'RESOURCE_CREATED' ? 'CREATED' : d.after?.cause;
      return {
        at: d.createdAt,
        from: d.before?.status ?? null,
        fromLabel: label(d.before?.status),
        to: d.after?.status,
        toLabel: label(d.after?.status),
        cause,
        causeLabel: STATUS_CAUSES[cause] ?? null,
        actor: d.actor ?? null,
        reason: d.reason ?? null,
      };
    }),
    meta: pageMeta(query, total),
  };
}

// ---------------------------------------------------------------------------
// 가용 여부·예약 일정

// #135 한 자원의 지정 시간대 가용 여부와 겹치는 예약 (BR-07, BR-08)
async function availability(actor, resourceId, { from, to }) {
  rules.assertPeriod(from, to, 'query.to');
  const resource = await requireResource(resourceId);
  assertCanSee(actor, resource);
  const conflicts = await rules.presentConflicts(await scheduleModel.findConflicts(resourceId, { startAt: from, endAt: to }));
  const info = RESOURCE_STATUS_INFO[resource.status];
  let unassignableReason = null;
  if (!info.assignable) unassignableReason = `${info.label} 상태라 배정할 수 없습니다. (BR-08)`;
  else if (!rules.meetsMinRole(actor, resource)) unassignableReason = `${ROLE_INFO[resource.minRole].label} 이상만 이용할 수 있습니다.`;
  const refs = await loadRefs({ categoryIds: [resource.categoryId] });
  return {
    resource: P.resourceBrief(resource, refs),
    from,
    to,
    available: info.assignable && conflicts.length === 0,
    usableByMe: unassignableReason === null && conflicts.length === 0,
    unassignableReason,
    conflicts,
  };
}

// #136 자원 예약 일정 (업무 할당·구성원 배정·사용 기록 타임라인). 기본 기간: 지금부터 14일
async function schedule(actor, resourceId, { from, to }) {
  const resource = await requireResource(resourceId);
  assertCanSee(actor, resource);
  const start = from ?? new Date();
  const end = to ?? new Date(start.getTime() + 14 * DAY);
  rules.assertPeriod(start, end, 'query.to');
  const entries = await scheduleModel.listSchedule(resourceId, { from: start, to: end });
  const refs = await loadRefs({ taskIds: entries.map((e) => e.taskId), userIds: entries.map((e) => e.userId), categoryIds: [resource.categoryId] });
  return {
    resource: P.resourceBrief(resource, refs),
    from: start,
    to: end,
    items: entries.map((e) => P.presentScheduleEntry(e, refs)),
  };
}

module.exports = {
  STATUS_CAUSES,
  statusChangeEntry,
  presentResources,
  presentById,
  create,
  bulkCreate,
  list,
  available,
  get,
  update,
  remove,
  changeStatus,
  changeAccessLevel,
  statuses,
  statusHistory,
  availability,
  schedule,
};
