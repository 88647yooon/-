// 자원 API (API 목록표 단계 4: #114~#122, #124, #135~#136. #123 자원 상태 목록은 referenceRoutes.js)
// 고정 경로(/bulk, /available)를 파라미터 경로(/:resourceId)보다 먼저 등록한다.
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const resourceParams = { params: { resourceId: fields.id } };
const resourceFields = {
  code: fields.resourceCode,
  name: fields.resourceName,
  categoryId: { ...fields.optionalId, required: true },
  location: fields.location,
  description: fields.resourceDescription,
  minRole: { ...enums.resourceMinRole, default: 'SOLDIER' },
};
const filterQuery = { categoryId: fields.optionalId, location: { type: 'string', max: 100 }, q: fields.q };
const windowQuery = { from: fields.optionalDatetime, to: fields.optionalDatetime };

/**
 * @openapi
 * /api/resources:
 *   post:
 *     tags: [자원]
 *     summary: 자원 등록
 *     description: |
 *       [FR-13] 공용 자원을 사용가능 상태로 등록한다. 관리 번호(code)는 겹칠 수 없다(409 DUPLICATE).
 *       minRole은 이 자원을 이용할 수 있는 최소 역할이다(기본 Soldier). Underboss·Boss만 할 수 있다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResourceInput' }
 *     responses:
 *       201: { $ref: '#/components/responses/ResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [자원]
 *     summary: 관리용 전체 자원 목록
 *     description: |
 *       [FR-13, FR-16, FR-21, AR-03] 모든 자원을 상태·분류·위치·최소 역할로 거르고 정렬한다. assignable=false면 점검중·사용불가 자원만,
 *       true면 정상 자원(사용가능·사용중)만 본다. 각 자원에 현재 사용자와 진행 중인 점검을 함께 보여 준다. Capo 이상만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceStatusFilter'
 *       - { name: categoryId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: location, in: query, description: 위치 검색어, schema: { type: string, maxLength: 100 } }
 *       - { name: minRole, in: query, schema: { $ref: '#/components/schemas/ResourceMinRole' } }
 *       - { name: assignable, in: query, description: 'true: 정상 자원만, false: 점검중·사용불가 자원만', schema: { type: boolean } }
 *       - { name: q, in: query, description: 이름·관리 번호·설명 검색어, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/ResourceSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourcePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', requirePermission('resource.manage'), validate({ body: resourceFields }), ctrl.create);
router.get(
  '/',
  requirePermission('resource.monitor'),
  validate({ query: { status: enums.resourceStatus, minRole: enums.resourceMinRole, assignable: { type: 'boolean' }, ...filterQuery, ...paging('resources') } }),
  ctrl.list,
);

/**
 * @openapi
 * /api/resources/bulk:
 *   post:
 *     tags: [자원]
 *     summary: 자원 일괄 등록
 *     description: |
 *       [FR-13] 여러 자원을 한 번에 등록한다. 모든 행을 먼저 검사하고 한 행이라도 안 되면(없는 분류, 겹치는 관리 번호) 아무것도 등록하지 않는다
 *       (409 BULK_REJECTED, details에 행별 오류).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resources]
 *             properties:
 *               resources: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/ResourceInput' } }
 *     responses:
 *       201: { $ref: '#/components/responses/ResourceList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/BulkRejected' }
 */
router.post(
  '/bulk',
  requirePermission('resource.manage'),
  validate({ body: { resources: { type: 'array', required: true, min: 1, max: 50, items: { type: 'object', fields: resourceFields } } } }),
  ctrl.bulkCreate,
);

/**
 * @openapi
 * /api/resources/available:
 *   get:
 *     tags: [자원]
 *     summary: 이용 가능한 자원
 *     description: |
 *       [FR-14, BR-07, BR-08] 내 역할이 이용 최소 역할 이상이고, 배정할 수 있는 상태(점검중·사용불가 제외)이며,
 *       지정 시간대(from~to, 기본: 지금부터 1시간)에 다른 예약이 없는 자원만 돌려준다. meta에 확인한 시간대를 담는다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: categoryId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: location, in: query, schema: { type: string, maxLength: 100 } }
 *       - { name: q, in: query, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/ResourceSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourcePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/available', requirePermission('resource.read'), validate({ query: { ...windowQuery, ...filterQuery, ...paging('resources') } }), ctrl.available);

/**
 * @openapi
 * /api/resources/{resourceId}:
 *   get:
 *     tags: [자원]
 *     summary: 자원 상세
 *     description: |
 *       [FR-13] 자원 정보와 현재 상태, 현재 사용자(사용 중이면), 진행 중인 점검을 보여 준다.
 *       Capo 이상이거나 내 역할이 이 자원의 이용 최소 역할 이상이어야 한다(아니면 403).
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [자원]
 *     summary: 자원 기본 정보 수정
 *     description: |
 *       [FR-13] 관리 번호·이름·분류·위치·설명을 수정한다. 상태는 상태 변경 API, 이용 최소 역할은 이용 권한 변경 API로 바꾼다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               code: { type: string, maxLength: 30 }
 *               name: { type: string, maxLength: 100 }
 *               categoryId: { type: integer }
 *               location: { type: string, nullable: true, maxLength: 100 }
 *               description: { type: string, nullable: true, maxLength: 1000 }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [자원]
 *     summary: 자원 삭제
 *     description: |
 *       [FR-13] 잘못 등록한 자원을 지운다. 업무 할당·구성원 배정·사용 신청·사용·점검 기록이 하나라도 있으면 409다 (이력을 지키기 위해 사용불가로 바꾼다).
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:resourceId', requirePermission('resource.read'), validate(resourceParams), ctrl.get);
router.patch(
  '/:resourceId',
  requirePermission('resource.manage'),
  validate({
    ...resourceParams,
    body: {
      code: { ...fields.resourceCode, required: false }, name: { ...fields.resourceName, required: false }, categoryId: fields.optionalId,
      location: fields.location, description: fields.resourceDescription,
    },
    bodyMinFields: 1,
  }),
  ctrl.update,
);
router.delete('/:resourceId', requirePermission('resource.manage'), validate(resourceParams), ctrl.remove);

/**
 * @openapi
 * /api/resources/{resourceId}/status:
 *   patch:
 *     tags: [자원]
 *     summary: 자원 상태 변경
 *     description: |
 *       [FR-13, FR-16, BR-08] 사용가능·점검중·사용불가 사이에서 상태를 바꾼다(사유 필수). 사용중은 사용 시작·반환으로만 바뀌므로
 *       사용 중인 자원은 바꿀 수 없고(409), 진행 중인 점검이 있으면 점검 완료로 바꿔야 한다(409). 점검중·사용불가가 되면 새 배정이 막히고,
 *       이미 잡힌 예약을 affectedReservations로 알려 준다. 변경은 상태 이력에 남는다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, reason]
 *             properties:
 *               status: { type: string, enum: [AVAILABLE, MAINTENANCE, UNAVAILABLE], example: UNAVAILABLE }
 *               reason: { type: string, maxLength: 500, example: 엔진 고장으로 운행 불가 }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceStatusChanged' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:resourceId/status',
  requirePermission('resource.operate'),
  validate({ ...resourceParams, body: { status: { ...enums.manualResourceStatus, required: true }, reason: fields.requiredReason } }),
  ctrl.changeStatus,
);

/**
 * @openapi
 * /api/resources/{resourceId}/access-level:
 *   patch:
 *     tags: [자원]
 *     summary: 이용 최소 역할 변경
 *     description: |
 *       [FR-14] 이 자원을 이용할 수 있는 최소 역할을 바꾼다. 이용 가능 자원 조회, 사용 신청, 구성원 배정에 바로 적용되고 이미 잡힌 배정은 그대로 둔다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [minRole]
 *             properties:
 *               minRole: { $ref: '#/components/schemas/ResourceMinRole' }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:resourceId/access-level',
  requirePermission('resource.manage'),
  validate({ ...resourceParams, body: { minRole: { ...enums.resourceMinRole, required: true }, reason: fields.reason } }),
  ctrl.changeAccessLevel,
);

/**
 * @openapi
 * /api/resources/{resourceId}/status-history:
 *   get:
 *     tags: [자원]
 *     summary: 자원 상태 변경 이력
 *     description: |
 *       [FR-15] 등록부터 지금까지의 상태 변경을 시간순으로 돌려준다 (변경 전후 상태, 경위: 상태 변경·사용 시작·반환·점검 등록·점검 완료·고장 신고, 처리자, 사유).
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceStatusHistoryPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:resourceId/status-history', requirePermission('resource.monitor'), validate({ ...resourceParams, query: paging() }), ctrl.statusHistory);

/**
 * @openapi
 * /api/resources/{resourceId}/availability:
 *   get:
 *     tags: [업무 자원 할당]
 *     summary: 자원의 시간대 가용 여부
 *     description: |
 *       [BR-07, BR-08] 한 자원을 지정 시간대(from~to, 필수)에 배정할 수 있는지와 겹치는 예약(업무 할당·구성원 배정·사용 중)을 보여 준다.
 *       available은 자원 상태와 시간대 기준, usableByMe는 내 역할(이용 최소 역할)까지 따진 결과다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - { name: from, in: query, required: true, schema: { type: string, format: date-time } }
 *       - { name: to, in: query, required: true, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceAvailabilityOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:resourceId/availability',
  requirePermission('resource.read'),
  validate({ ...resourceParams, query: { from: fields.datetime, to: fields.datetime } }),
  ctrl.availability,
);

/**
 * @openapi
 * /api/resources/{resourceId}/schedule:
 *   get:
 *     tags: [업무 자원 할당]
 *     summary: 자원 예약 일정
 *     description: |
 *       [FR-15] 기간(기본: 지금부터 14일)과 겹치는 업무 할당·구성원 배정과 사용 기록(반환된 것 포함)을 시간순 타임라인으로 보여 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceScheduleOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:resourceId/schedule', requirePermission('resource.read'), validate({ ...resourceParams, query: windowQuery }), ctrl.schedule);

module.exports = router;
