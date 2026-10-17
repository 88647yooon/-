// 자원 점검 API (API 목록표 단계 4: #125~#129). /resources/... 와 /maintenances 두 경로를 쓰므로 /api에 바로 붙인다.
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/resources', '/maintenances'], authenticate);

const resourceParams = { params: { resourceId: fields.id } };
const maintenanceParams = { params: { resourceId: fields.id, maintenanceId: fields.id } };

/**
 * @openapi
 * /api/resources/{resourceId}/maintenances:
 *   post:
 *     tags: [자원 점검]
 *     summary: 점검 등록
 *     description: |
 *       [FR-16, BR-08] 점검 사유와 예정 완료 시각을 등록하고 자원을 점검중으로 바꾼다. 점검중 자원은 새로 배정할 수 없다.
 *       이미 진행 중인 점검이 있거나(409) 사용 중인 자원이면(409, 사용자가 고장 신고를 한다) 등록할 수 없다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 정기 점검 (타이어·브레이크) }
 *               expectedEndAt: { type: string, format: date-time, description: '예정 완료 시각 (지금보다 늦어야 한다)' }
 *     responses:
 *       201: { $ref: '#/components/responses/MaintenanceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [자원 점검]
 *     summary: 자원별 점검 이력
 *     description: |
 *       [FR-15, FR-16] 한 자원의 점검 기록(진행 중·완료)을 최근 순으로 돌려준다. 점검 경위(점검 등록·고장 신고·손상 반환)와 결과가 들어 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/MaintenancePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/resources/:resourceId/maintenances',
  requirePermission('resource.operate'),
  validate({ ...resourceParams, body: { reason: fields.requiredReason, expectedEndAt: fields.optionalDatetime } }),
  ctrl.createMaintenance,
);
router.get('/resources/:resourceId/maintenances', requirePermission('resource.monitor'), validate({ ...resourceParams, query: paging() }), ctrl.listMaintenances);

/**
 * @openapi
 * /api/resources/{resourceId}/maintenances/{maintenanceId}:
 *   patch:
 *     tags: [자원 점검]
 *     summary: 점검 내용·예정일 수정
 *     description: |
 *       [FR-16] 진행 중인 점검의 사유와 예정 완료 시각을 고친다. 완료된 점검은 고칠 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - $ref: '#/components/parameters/MaintenanceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *               expectedEndAt: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200: { $ref: '#/components/responses/MaintenanceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/resources/:resourceId/maintenances/:maintenanceId',
  requirePermission('resource.operate'),
  validate({
    ...maintenanceParams,
    body: { reason: { type: 'string', min: 1, max: 500 }, expectedEndAt: { ...fields.optionalDatetime, nullable: true } },
    bodyMinFields: 1,
  }),
  ctrl.updateMaintenance,
);

/**
 * @openapi
 * /api/resources/{resourceId}/maintenances/{maintenanceId}/complete:
 *   post:
 *     tags: [자원 점검]
 *     summary: 점검 완료
 *     description: |
 *       [FR-16] 점검을 끝낸다. 결과가 정상 복구(RESTORED)면 사용가능(아직 반환되지 않았으면 사용중)으로, 수리 불가(UNREPAIRABLE)면 사용불가로 바뀐다.
 *       바뀐 자원 상태를 resourceStatus로 함께 돌려주고 상태 이력에 남긴다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - $ref: '#/components/parameters/MaintenanceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [result]
 *             properties:
 *               result: { $ref: '#/components/schemas/MaintenanceResult' }
 *               note: { type: string, maxLength: 500, example: 브레이크 패드 교체 }
 *     responses:
 *       200: { $ref: '#/components/responses/MaintenanceCompleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/resources/:resourceId/maintenances/:maintenanceId/complete',
  requirePermission('resource.operate'),
  validate({ ...maintenanceParams, body: { result: { ...enums.maintenanceResult, required: true }, note: fields.reason } }),
  ctrl.completeMaintenance,
);

/**
 * @openapi
 * /api/maintenances:
 *   get:
 *     tags: [자원 점검]
 *     summary: 진행 중인 점검 전체 목록
 *     description: |
 *       [FR-16] 끝나지 않은 점검을 예정 완료 시각이 이른 순으로 돌려준다. 예정 시각이 지난 점검은 overdue=true다.
 *       overdue로 예정일이 지난 점검만(또는 지나지 않은 점검만) 거를 수 있다.
 *     parameters:
 *       - { name: overdue, in: query, schema: { type: boolean } }
 *       - { name: categoryId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: source, in: query, schema: { $ref: '#/components/schemas/MaintenanceSource' } }
 *       - { name: q, in: query, description: 자원 이름·관리 번호·점검 사유 검색어, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/MaintenancePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/maintenances',
  requirePermission('resource.monitor'),
  validate({ query: { overdue: { type: 'boolean' }, categoryId: fields.optionalId, source: enums.maintenanceSource, q: fields.q, ...paging() } }),
  ctrl.openMaintenances,
);

module.exports = router;
