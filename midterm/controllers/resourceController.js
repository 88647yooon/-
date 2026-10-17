// 자원 분류·자원·점검·업무 자원 할당·구성원 자원 배정·사용 신청·사용 반환 API 컨트롤러 (단계 4)
const resourceCategoryService = require('../services/resourceCategoryService');
const resourceService = require('../services/resourceService');
const maintenanceService = require('../services/maintenanceService');
const taskResourceService = require('../services/taskResourceService');
const allocationService = require('../services/resourceAllocationService');
const requestService = require('../services/resourceRequestService');
const usageService = require('../services/resourceUsageService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const p = (req) => req.valid.params;
const b = (req) => req.valid.body;
const q = (req) => req.valid.query;

module.exports = {
  // 자원 분류 (#110~#113)
  createCategory: async (req, res) => created(res, await resourceCategoryService.create(req.user, b(req), contextOf(req))),
  listCategories: async (req, res) => ok(res, await resourceCategoryService.list()),
  updateCategory: async (req, res) => ok(res, await resourceCategoryService.update(req.user, p(req).categoryId, b(req), contextOf(req))),
  removeCategory: async (req, res) => ok(res, await resourceCategoryService.remove(req.user, p(req).categoryId, contextOf(req))),

  // 자원 (#114~#124)
  create: async (req, res) => created(res, await resourceService.create(req.user, b(req), contextOf(req))),
  bulkCreate: async (req, res) => created(res, await resourceService.bulkCreate(req.user, b(req), contextOf(req))),
  list: async (req, res) => okPage(res, await resourceService.list(req.user, q(req))),
  available: async (req, res) => okPage(res, await resourceService.available(req.user, q(req))),
  get: async (req, res) => ok(res, await resourceService.get(req.user, p(req).resourceId)),
  update: async (req, res) => ok(res, await resourceService.update(req.user, p(req).resourceId, b(req), contextOf(req))),
  remove: async (req, res) => ok(res, await resourceService.remove(req.user, p(req).resourceId, contextOf(req))),
  changeStatus: async (req, res) => ok(res, await resourceService.changeStatus(req.user, p(req).resourceId, b(req), contextOf(req))),
  changeAccessLevel: async (req, res) => ok(res, await resourceService.changeAccessLevel(req.user, p(req).resourceId, b(req), contextOf(req))),
  statuses: async (req, res) => ok(res, resourceService.statuses()),
  statusHistory: async (req, res) => okPage(res, await resourceService.statusHistory(req.user, p(req).resourceId, q(req))),

  // 자원 점검 (#125~#129)
  createMaintenance: async (req, res) => created(res, await maintenanceService.create(req.user, p(req).resourceId, b(req), contextOf(req))),
  listMaintenances: async (req, res) => okPage(res, await maintenanceService.listByResource(req.user, p(req).resourceId, q(req))),
  updateMaintenance: async (req, res) => ok(res, await maintenanceService.update(req.user, p(req).resourceId, p(req).maintenanceId, b(req), contextOf(req))),
  completeMaintenance: async (req, res) => ok(res, await maintenanceService.complete(req.user, p(req).resourceId, p(req).maintenanceId, b(req), contextOf(req))),
  openMaintenances: async (req, res) => okPage(res, await maintenanceService.listOpen(req.user, q(req))),

  // 업무 자원 할당 (#130~#136, #149)
  allocateToTask: async (req, res) => created(res, await taskResourceService.allocate(req.user, p(req).taskId, b(req), contextOf(req))),
  listTaskResources: async (req, res) => ok(res, await taskResourceService.list(req.user, p(req).taskId)),
  adjustTaskResource: async (req, res) => ok(res, await taskResourceService.adjust(req.user, p(req).taskId, p(req).resourceId, b(req), contextOf(req))),
  releaseTaskResource: async (req, res) => ok(res, await taskResourceService.release(req.user, p(req).taskId, p(req).resourceId, contextOf(req))),
  taskCandidates: async (req, res) => okPage(res, await taskResourceService.candidates(req.user, p(req).taskId, q(req))),
  availability: async (req, res) => ok(res, await resourceService.availability(req.user, p(req).resourceId, q(req))),
  schedule: async (req, res) => ok(res, await resourceService.schedule(req.user, p(req).resourceId, q(req))),
  returnTaskResources: async (req, res) => ok(res, await taskResourceService.returnAll(req.user, p(req).taskId, b(req), contextOf(req))),

  // 구성원 자원 배정 (#137~#140)
  allocate: async (req, res) => created(res, await allocationService.allocate(req.user, p(req).resourceId, b(req), contextOf(req))),
  userAllocations: async (req, res) => okPage(res, await allocationService.listByUser(req.user, p(req).userId, q(req))),
  updateAllocation: async (req, res) => ok(res, await allocationService.update(req.user, p(req).allocationId, b(req), contextOf(req))),
  cancelAllocation: async (req, res) => ok(res, await allocationService.cancel(req.user, p(req).allocationId, contextOf(req))),

  // 자원 사용 신청 (#141~#146)
  createRequest: async (req, res) => created(res, await requestService.create(req.user, b(req), contextOf(req))),
  listRequests: async (req, res) => okPage(res, await requestService.list(req.user, q(req))),
  getRequest: async (req, res) => ok(res, await requestService.get(req.user, p(req).requestId)),
  approveRequest: async (req, res) => ok(res, await requestService.approve(req.user, p(req).requestId, b(req), contextOf(req))),
  rejectRequest: async (req, res) => ok(res, await requestService.reject(req.user, p(req).requestId, b(req), contextOf(req))),
  cancelRequest: async (req, res) => ok(res, await requestService.cancel(req.user, p(req).requestId, contextOf(req))),

  // 자원 사용·반환 (#147~#154)
  checkout: async (req, res) => created(res, await usageService.checkout(req.user, p(req).resourceId, b(req), contextOf(req))),
  returnResource: async (req, res) => ok(res, await usageService.returnResource(req.user, p(req).resourceId, b(req), contextOf(req))),
  usages: async (req, res) => okPage(res, await usageService.listByResource(req.user, p(req).resourceId, q(req))),
  extendUsage: async (req, res) => ok(res, await usageService.extend(req.user, p(req).usageId, b(req), contextOf(req))),
  handover: async (req, res) => created(res, await usageService.handover(req.user, p(req).usageId, b(req), contextOf(req))),
  reportDamage: async (req, res) => created(res, await usageService.reportDamage(req.user, p(req).usageId, b(req), contextOf(req))),
  overdue: async (req, res) => okPage(res, await usageService.overdue(req.user, q(req))),
};
