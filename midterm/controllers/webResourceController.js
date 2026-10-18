// 공용 자원 웹 화면 (CR-02): 공용 자원, 자원 상세, 내 자원 (FR-13~FR-17).
// REST API와 같은 서비스 계층을 호출하므로 자원 배정 규칙(BR-07·BR-08)과 관리 범위(BR-05)가 API와 똑같이 적용된다.
const resourceCategoryService = require('../services/resourceCategoryService');
const resourceService = require('../services/resourceService');
const maintenanceService = require('../services/maintenanceService');
const taskResourceService = require('../services/taskResourceService');
const allocationService = require('../services/resourceAllocationService');
const requestService = require('../services/resourceRequestService');
const usageService = require('../services/resourceUsageService');
const { userIdOf, resourceIdOf, localDate, action, nothingChanged } = require('./webHelpers');
const { contextOf } = require('../utils/context');

const rid = (req) => req.valid.params.resourceId;
const body = (req) => req.valid.body;

// 결과 메시지의 날짜 (화면과 같은 한국 시간 형식)
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const shortDate = (value) => dateFormat.format(new Date(value));

// 화면의 기간 조회 조건. 끝이 시작보다 빠르면 끝을 무시한다.
function windowOf(query) {
  const from = localDate(query.from);
  let to = localDate(query.to);
  if (from && to && to <= from) to = undefined;
  return { from, to };
}

// ---------------------------------------------------------------------------
// 화면

async function resourcesPage(req, res) {
  const query = req.valid.query;
  const monitor = res.locals.can('resource.monitor');
  const { from, to } = windowOf(query);
  const listQuery = { status: query.status, categoryId: query.categoryId, assignable: query.assignable, q: query.q, sort: query.sort, page: query.page, size: query.size };
  const [categories, available, list, maintenances, overdue] = await Promise.all([
    resourceCategoryService.list(),
    resourceService.available(req.user, { from, to, categoryId: query.categoryId, q: query.q, page: 1, size: 50, sort: 'code' }),
    monitor ? resourceService.list(req.user, listQuery) : null,
    monitor ? maintenanceService.listOpen(req.user, { page: 1, size: 20 }) : null,
    monitor ? usageService.overdue(req.user, { page: 1, size: 20 }) : null,
  ]);
  res.render('resources', {
    title: '자원',
    query,
    categories,
    available: available.data,
    window: { from: available.meta.from, to: available.meta.to },
    resources: list?.data ?? null,
    meta: list?.meta ?? null,
    maintenances: maintenances?.data ?? [],
    overdue: overdue?.data ?? [],
  });
}

async function resourcePage(req, res) {
  const resourceId = rid(req);
  const resource = await resourceService.get(req.user, resourceId);
  const monitor = res.locals.can('resource.monitor');
  const { from, to } = windowOf(req.valid.query);
  const [schedule, usages, maintenances, history, categories, availability] = await Promise.all([
    resourceService.schedule(req.user, resourceId, {}),
    monitor ? usageService.listByResource(req.user, resourceId, { page: 1, size: 20, sort: '-startedAt' }) : null,
    monitor ? maintenanceService.listByResource(req.user, resourceId, { page: 1, size: 20 }) : null,
    monitor ? resourceService.statusHistory(req.user, resourceId, { page: 1, size: 50 }) : null,
    resourceCategoryService.list(),
    from && to ? resourceService.availability(req.user, resourceId, { from, to }) : null,
  ]);
  res.render('resource', {
    title: resource.name,
    resource,
    usage: resource.currentUsage,
    mine: resource.currentUsage?.user.id === req.user.id,
    schedule,
    usages: usages?.data ?? [],
    maintenances: maintenances?.data ?? [],
    history: history?.data ?? [],
    categories,
    availability,
    query: req.valid.query,
  });
}

async function myResourcesPage(req, res) {
  const can = res.locals.can;
  const [usages, allocations, requests, review] = await Promise.all([
    usageService.myOpenUsages(req.user),
    allocationService.listByUser(req.user, req.user.id, { page: 1, size: 50, sort: 'startAt' }),
    can('resource.request') ? requestService.list(req.user, { box: 'mine', page: 1, size: 30 }) : null,
    can('resource.request.review') ? requestService.list(req.user, { box: 'review', status: 'PENDING', page: 1, size: 30 }) : null,
  ]);
  res.render('my-resources', {
    title: '내 자원',
    usages,
    allocations: allocations.data,
    requests: requests?.data ?? [],
    review: review?.data ?? [],
  });
}

// ---------------------------------------------------------------------------
// 분류·자원 관리

const createCategory = action(async (req) => {
  const c = await resourceCategoryService.create(req.user, body(req), contextOf(req));
  return { message: `'${c.name}' 분류를 등록했습니다.` };
});

const deleteCategory = action(async (req) => {
  await resourceCategoryService.remove(req.user, req.valid.params.categoryId, contextOf(req));
  return { message: '분류를 삭제했습니다.' };
});

const createResource = action(async (req) => {
  const r = await resourceService.create(req.user, body(req), contextOf(req));
  return { message: `'${r.name}'(${r.code})을 사용가능 상태로 등록했습니다.`, redirect: `/resources/${r.id}` };
});

const updateResource = action(async (req) => {
  if (Object.keys(body(req)).length === 0) return nothingChanged;
  await resourceService.update(req.user, rid(req), body(req), contextOf(req));
  return { message: '자원 정보를 수정했습니다.' };
});

const changeStatus = action(async (req) => {
  const r = await resourceService.changeStatus(req.user, rid(req), body(req), contextOf(req));
  const affected = r.affectedReservations.length ? ` 이미 잡힌 예약 ${r.affectedReservations.length}건은 정상 상태로 돌아올 때까지 쓸 수 없습니다.` : '';
  return { message: `자원을 ${r.statusLabel} 상태로 바꿨습니다.${affected}` };
});

const changeAccessLevel = action(async (req) => {
  const r = await resourceService.changeAccessLevel(req.user, rid(req), body(req), contextOf(req));
  return { message: `이제 ${r.minRoleLabel} 이상이 이용할 수 있습니다.` };
});

const deleteResource = action(async (req) => {
  await resourceService.remove(req.user, rid(req), contextOf(req));
  return { message: '자원을 삭제했습니다.', redirect: '/resources' };
});

// ---------------------------------------------------------------------------
// 점검

const createMaintenance = action(async (req) => {
  await maintenanceService.create(req.user, rid(req), body(req), contextOf(req));
  return { message: '점검을 등록했습니다. 자원이 점검중이 되어 새로 배정할 수 없습니다.' };
});

const completeMaintenance = action(async (req) => {
  const m = await maintenanceService.complete(req.user, rid(req), req.valid.params.maintenanceId, body(req), contextOf(req));
  return { message: `점검을 완료했습니다. 자원이 ${m.resourceStatusLabel} 상태가 되었습니다.` };
});

// ---------------------------------------------------------------------------
// 구성원 자원 배정·사용 신청

const allocateToMember = action(async (req) => {
  const { username, ...rest } = body(req);
  await allocationService.allocate(req.user, rid(req), { ...rest, userId: await userIdOf(username) }, contextOf(req));
  return { message: `${username}님에게 자원을 배정했습니다. 배정 시간대에 내 자원 화면에서 사용을 시작할 수 있습니다.` };
});

const cancelAllocation = action(async (req) => {
  await allocationService.cancel(req.user, req.valid.params.allocationId, contextOf(req));
  return { message: '자원 배정을 취소했습니다.' };
});

const createRequest = action(async (req) => {
  const { code, ...rest } = body(req);
  await requestService.create(req.user, { ...rest, resourceId: await resourceIdOf(code) }, contextOf(req));
  return { message: '자원 사용을 신청했습니다. 담당 Crew 책임자나 Underboss·Boss가 승인하면 배정됩니다.' };
});

const approveRequest = action(async (req) => {
  await requestService.approve(req.user, req.valid.params.requestId, body(req), contextOf(req));
  return { message: '사용 신청을 승인했습니다. 신청자에게 자원이 배정되었습니다.' };
});

const rejectRequest = action(async (req) => {
  await requestService.reject(req.user, req.valid.params.requestId, body(req), contextOf(req));
  return { message: '사용 신청을 거절했습니다.' };
});

const cancelRequest = action(async (req) => {
  await requestService.cancel(req.user, req.valid.params.requestId, contextOf(req));
  return { message: '사용 신청을 취소했습니다.' };
});

// ---------------------------------------------------------------------------
// 사용·반환

const checkout = action(async (req) => {
  const u = await usageService.checkout(req.user, rid(req), body(req), contextOf(req));
  return { message: `'${u.resource.name}' 사용을 시작했습니다. 반환 예정: ${shortDate(u.dueAt)}` };
});

const returnResource = action(async (req) => {
  const u = await usageService.returnResource(req.user, rid(req), body(req), contextOf(req));
  return { message: `반환했습니다(${u.returnConditionLabel}). 자원이 ${u.resourceStatusLabel} 상태가 되었고 사용 이력에 남았습니다.` };
});

const extendUsage = action(async (req) => {
  await usageService.extend(req.user, req.valid.params.usageId, body(req), contextOf(req));
  return { message: '반환 예정 시각을 연장했습니다.' };
});

const handover = action(async (req) => {
  const { username, ...rest } = body(req);
  await usageService.handover(req.user, req.valid.params.usageId, { ...rest, toUserId: await userIdOf(username) }, contextOf(req));
  return { message: `${username}님에게 인계했습니다.` };
});

const reportDamage = action(async (req) => {
  await usageService.reportDamage(req.user, req.valid.params.usageId, body(req), contextOf(req));
  return { message: '고장을 신고했습니다. 점검이 등록되고 자원이 점검중이 되었습니다. 자원은 따로 반환하세요.' };
});

// ---------------------------------------------------------------------------
// 업무 자원 할당 (업무 화면)

const tid = (req) => req.valid.params.taskId;

const allocateToTask = action(async (req) => {
  const { code, ...rest } = body(req);
  await taskResourceService.allocate(req.user, tid(req), { ...rest, resourceId: await resourceIdOf(code) }, contextOf(req));
  return { message: `자원(${code})을 업무에 할당했습니다.` };
});

const adjustTaskResource = action(async (req) => {
  if (Object.keys(body(req)).length === 0) return nothingChanged;
  await taskResourceService.adjust(req.user, tid(req), rid(req), body(req), contextOf(req));
  return { message: '할당 시간대를 바꿨습니다.' };
});

const releaseTaskResource = action(async (req) => {
  await taskResourceService.release(req.user, tid(req), rid(req), contextOf(req));
  return { message: '자원 할당을 해제했습니다.' };
});

const returnTaskResources = action(async (req) => {
  const result = await taskResourceService.returnAll(req.user, tid(req), body(req), contextOf(req));
  return { message: `이 업무로 사용 중인 자원 ${result.returnedCount}개를 반환했습니다.` };
});

module.exports = {
  resourcesPage, resourcePage, myResourcesPage,
  createCategory, deleteCategory, createResource, updateResource, changeStatus, changeAccessLevel, deleteResource,
  createMaintenance, completeMaintenance,
  allocateToMember, cancelAllocation, createRequest, approveRequest, rejectRequest, cancelRequest,
  checkout, returnResource, extendUsage, handover, reportDamage,
  allocateToTask, adjustTaskResource, releaseTaskResource, returnTaskResources,
};
