// 자원 점검 (FR-16). 점검중 자원은 정상 자원과 구분해 관리하고 새로 배정하지 않는다 (BR-08).
// 점검 등록·고장 신고·손상 반환이 점검을 열고, 점검 완료가 결과에 따라 사용가능 또는 사용불가로 되돌린다.
const { withTransaction } = require('../config/database');
const resourceModel = require('../models/sql/resourceModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const maintenanceModel = require('../models/sql/maintenanceModel');
const auditService = require('./auditService');
const resourceService = require('./resourceService');
const { requireResource } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { MAINTENANCE_RESULT_INFO, RESOURCE_STATUS_INFO } = require('../config/constants');
const { badRequest, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { resourceTarget } = auditService;

async function presentMaintenances(rows, db) {
  const refs = await loadRefs({
    resourceIds: rows.map((m) => m.resourceId), userIds: rows.flatMap((m) => [m.startedBy, m.completedBy]),
  }, db);
  return rows.map((m) => P.presentMaintenance(m, refs));
}

const presentById = async (id) => (await presentMaintenances([await maintenanceModel.findById(id)]))[0];

function assertFuture(expectedEndAt) {
  if (expectedEndAt && expectedEndAt <= new Date()) {
    throw badRequest('예정 완료 시각은 지금보다 늦어야 합니다.', [{ field: 'body.expectedEndAt', message: '지금보다 늦은 시각을 지정하세요.' }]);
  }
}

async function requireMaintenance(resourceId, maintenanceId, conn, options) {
  const m = await maintenanceModel.findById(maintenanceId, conn, options);
  if (!m || m.resourceId !== resourceId) throw notFound(`이 자원의 점검(ID ${maintenanceId})을 찾을 수 없습니다.`);
  return m;
}

// 점검을 열고 자원을 점검중으로 바꾼다. 호출하는 쪽이 자원 행을 잠근 트랜잭션 안에서 부른다.
// 이미 진행 중인 점검이 있으면 409. 바뀌기 전 상태를 돌려준다.
async function openMaintenance(conn, { resource, source, reason, expectedEndAt = null, usageId = null, actor }) {
  const open = await maintenanceModel.findOpenByResource(resource.id, conn);
  if (open) throw conflict(`'${resource.name}'은 이미 점검 중입니다. (점검 ID ${open.id})`, { maintenanceId: open.id });
  const id = await maintenanceModel.insert({ resourceId: resource.id, source, reason, expectedEndAt, usageId, startedBy: actor.id }, conn);
  if (resource.status !== 'MAINTENANCE') await resourceModel.setStatus(resource.id, 'MAINTENANCE', conn);
  return id;
}

// 점검을 연 활동 기록 (점검 등록과 상태 변경)
function openedEntries({ actor, resource, maintenanceId, source, reason, cause, ip }) {
  const entries = [{
    actor, action: 'MAINTENANCE_STARTED', target: resourceTarget(resource), after: { maintenanceId, source }, reason, ip,
  }];
  if (resource.status !== 'MAINTENANCE') {
    entries.push(resourceService.statusChangeEntry({ actor, resource, from: resource.status, to: 'MAINTENANCE', cause, reason, ip }));
  }
  return entries;
}

// #125 점검 등록 (사유, 예정 완료 시각). 사용 중인 자원은 반환 뒤에 등록한다 (사용 중 고장은 고장 신고).
async function create(actor, resourceId, { reason, expectedEndAt }, ctx) {
  assertFuture(expectedEndAt);
  const { resource, maintenanceId } = await withTransaction(async (conn) => {
    const current = await requireResource(resourceId, conn, { forUpdate: true });
    if (await resourceUsageModel.findOpenByResource(resourceId, conn)) {
      throw conflict('사용 중인 자원입니다. 반환된 뒤에 점검을 등록하거나, 사용자가 고장 신고를 하세요.');
    }
    const id = await openMaintenance(conn, { resource: current, source: 'MANUAL', reason, expectedEndAt, actor });
    return { resource: current, maintenanceId: id };
  });
  await auditService.recordMany(openedEntries({ actor, resource, maintenanceId, source: 'MANUAL', reason, cause: 'MAINTENANCE_START', ip: ctx.ip }));
  return presentById(maintenanceId);
}

// #126 자원별 점검 이력 (최근 순)
async function listByResource(actor, resourceId, query) {
  await requireResource(resourceId);
  const { rows, total } = await maintenanceModel.searchByResource(resourceId, query);
  return { data: await presentMaintenances(rows), meta: pageMeta(query, total) };
}

// #127 진행 중인 점검의 사유·예정 완료 시각 수정
async function update(actor, resourceId, maintenanceId, changes, ctx) {
  assertFuture(changes.expectedEndAt);
  const resource = await requireResource(resourceId);
  const m = await requireMaintenance(resourceId, maintenanceId);
  if (m.completedAt) throw conflict('완료된 점검은 수정할 수 없습니다.', { maintenanceId });
  await maintenanceModel.update(maintenanceId, changes);
  await auditService.record({
    actor, action: 'MAINTENANCE_UPDATED', target: resourceTarget(resource),
    before: { maintenanceId, reason: m.reason, expectedEndAt: m.expectedEndAt }, after: { maintenanceId, ...changes }, ip: ctx.ip,
  });
  return presentById(maintenanceId);
}

// #128 점검 완료. 정상 복구면 사용가능(아직 반환되지 않았으면 사용중), 수리 불가면 사용불가로 바꾼다.
async function complete(actor, resourceId, maintenanceId, { result, note }, ctx) {
  const { resource, to } = await withTransaction(async (conn) => {
    const current = await requireResource(resourceId, conn, { forUpdate: true });
    const m = await requireMaintenance(resourceId, maintenanceId, conn, { forUpdate: true });
    if (m.completedAt) throw conflict('이미 완료된 점검입니다.', { maintenanceId });
    let status = MAINTENANCE_RESULT_INFO[result].status;
    if (status === 'AVAILABLE' && (await resourceUsageModel.findOpenByResource(resourceId, conn))) status = 'IN_USE';
    await maintenanceModel.complete(maintenanceId, { result, note, completedBy: actor.id }, conn);
    if (current.status !== status) await resourceModel.setStatus(resourceId, status, conn);
    return { resource: current, to: status };
  });
  const entries = [{
    actor, action: 'MAINTENANCE_COMPLETED', target: resourceTarget(resource), after: { maintenanceId, result }, reason: note, ip: ctx.ip,
  }];
  if (resource.status !== to) {
    entries.push(resourceService.statusChangeEntry({
      actor, resource, from: resource.status, to, cause: 'MAINTENANCE_COMPLETE', reason: note ?? MAINTENANCE_RESULT_INFO[result].label, ip: ctx.ip,
    }));
  }
  await auditService.recordMany(entries);
  return { ...(await presentById(maintenanceId)), resourceStatus: to, resourceStatusLabel: RESOURCE_STATUS_INFO[to].label };
}

// #129 진행 중인 점검 전체 (예정일이 지난 것은 overdue=true)
async function listOpen(actor, query) {
  const { rows, total } = await maintenanceModel.searchOpen(query);
  return { data: await presentMaintenances(rows), meta: pageMeta(query, total) };
}

module.exports = { openMaintenance, openedEntries, create, listByResource, update, complete, listOpen };
