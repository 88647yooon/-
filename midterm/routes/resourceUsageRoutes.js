// 자원 사용·반환 API (API 목록표 단계 4: #147~#148, #150~#154. #149 업무 자원 일괄 반환은 taskResourceRoutes.js)
// /resources/... 와 /resource-usages 두 경로를 쓰므로 /api에 바로 붙인다. 고정 경로(/overdue)를 파라미터 경로보다 먼저 등록한다.
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/resources', '/resource-usages'], authenticate);

const resourceParams = { params: { resourceId: fields.id } };
const usageParams = { params: { usageId: fields.id } };

/**
 * @openapi
 * /api/resources/{resourceId}/checkout:
 *   post:
 *     tags: [자원 사용·반환]
 *     summary: 자원 사용 시작
 *     description: |
 *       [FR-15] 배정받은 자원을 사용하기 시작하고 자원을 사용중으로 바꾼다. 지금이 시간대 안에 있는 내 구성원 자원 배정,
 *       또는 내가 참여 중인 업무의 자원 할당이 있어야 한다(없으면 409). taskId를 주면 그 업무의 할당으로 시작한다(참여자가 아니면 403).
 *       자원이 사용가능 상태가 아니면(사용중·점검중·사용불가) 409. 반환 예정 시각은 배정(할당) 종료 시각이다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskId: { type: integer, description: '업무 자원 할당으로 사용할 때 그 업무 ID (생략하면 자동으로 찾는다)' }
 *     responses:
 *       201: { $ref: '#/components/responses/UsageOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/resources/:resourceId/checkout', requirePermission('resource.use'), validate({ ...resourceParams, body: { taskId: fields.optionalId } }), ctrl.checkout);

/**
 * @openapi
 * /api/resources/{resourceId}/return:
 *   post:
 *     tags: [자원 사용·반환]
 *     summary: 자원 반환
 *     description: |
 *       [FR-15, FR-16] 사용 중인 자원을 반환하고 반환 상태를 기록한다. 정상(GOOD)이면 사용가능, 손상(DAMAGED)이면 점검을 자동으로 열고 점검중,
 *       분실(LOST)이면 사용불가가 된다. 구성원 배정으로 쓴 경우 그 배정도 '반환'으로 끝나 남은 시간대가 비워진다.
 *       사용자 본인, 그 업무·구성원을 맡은 Capo, Underboss·Boss가 처리할 수 있다. 사용 중이 아니면 409.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               condition: { allOf: [{ $ref: '#/components/schemas/ReturnCondition' }], default: GOOD }
 *               note: { type: string, maxLength: 500, example: 앞 범퍼 긁힘 }
 *     responses:
 *       200: { $ref: '#/components/responses/UsageReturned' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/resources/:resourceId/return',
  requirePermission('resource.use'),
  validate({ ...resourceParams, body: { condition: { ...enums.returnCondition, default: 'GOOD' }, note: fields.reason } }),
  ctrl.returnResource,
);

/**
 * @openapi
 * /api/resources/{resourceId}/usages:
 *   get:
 *     tags: [자원 사용·반환]
 *     summary: 자원별 사용·반환 이력
 *     description: |
 *       [FR-15, DR-03] 한 자원의 사용 기록(누가, 어떤 근거로, 언제 시작·반환, 반환 상태, 인계, 고장 신고)을 돌려준다.
 *       open=true면 사용 중인 것만, false면 반환된 것만. 기본 정렬은 최근 사용 순이다.
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *       - { name: userId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: taskId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: open, in: query, schema: { type: boolean } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/UsageSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/UsagePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/resources/:resourceId/usages',
  requirePermission('resource.monitor'),
  validate({
    ...resourceParams,
    query: {
      userId: fields.optionalId, taskId: fields.optionalId, open: { type: 'boolean' },
      from: fields.optionalDatetime, to: fields.optionalDatetime, ...paging('usages'),
    },
  }),
  ctrl.usages,
);

/**
 * @openapi
 * /api/resource-usages/overdue:
 *   get:
 *     tags: [자원 사용·반환]
 *     summary: 미반환 목록
 *     description: |
 *       [FR-15] 반환 예정 시각이 지났는데 반환되지 않은 사용 기록을 가장 오래 늦은 순으로 돌려준다. userId로 한 구성원만 볼 수 있다.
 *     parameters:
 *       - { name: userId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/UsagePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/resource-usages/overdue', requirePermission('resource.monitor'), validate({ query: { userId: fields.optionalId, ...paging() } }), ctrl.overdue);

/**
 * @openapi
 * /api/resource-usages/{usageId}:
 *   patch:
 *     tags: [자원 사용·반환]
 *     summary: 반환 예정 시각 연장
 *     description: |
 *       [FR-15, BR-07] 사용 중인 자원의 반환 예정 시각을 늦춘다. 늘어난 시간대에 다른 예약이 있으면 409 BR-07이다.
 *       구성원 배정으로 쓰는 중이면 배정 종료 시각도 함께 늘어난다. 담당 Crew 책임자(업무 또는 사용자 기준)나 Underboss·Boss가 처리한다.
 *     parameters:
 *       - $ref: '#/components/parameters/UsageId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dueAt]
 *             properties:
 *               dueAt: { type: string, format: date-time }
 *               reason: { type: string, maxLength: 500, example: 업무가 길어져 연장 }
 *     responses:
 *       200: { $ref: '#/components/responses/UsageOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch('/resource-usages/:usageId', requirePermission('resource.allocate'), validate({ ...usageParams, body: { dueAt: fields.datetime, reason: fields.reason } }), ctrl.extendUsage);

/**
 * @openapi
 * /api/resource-usages/{usageId}/handover:
 *   post:
 *     tags: [자원 사용·반환]
 *     summary: 사용 중인 자원 인계
 *     description: |
 *       [FR-15, BR-07] 내가 사용 중인 자원을 다른 구성원에게 넘긴다. 한 트랜잭션에서 내 사용을 '인계'로 반환하고 받는 사람의 사용을 시작한다.
 *       업무 자원은 같은 업무의 참여자에게만(409), 구성원 배정은 이용 최소 역할 이상의 활동중 구성원에게 넘기며 배정도 함께 넘어간다.
 *       dueAt으로 반환 예정 시각을 늘리면 늘어난 시간대에 다른 예약이 있을 때 409 BR-07이다. 점검중 자원은 인계할 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/UsageId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [toUserId]
 *             properties:
 *               toUserId: { type: integer, example: 9 }
 *               dueAt: { type: string, format: date-time, description: '받는 사람의 반환 예정 시각 (생략하면 지금 예정 시각 그대로)' }
 *               note: { type: string, maxLength: 500 }
 *     responses:
 *       201: { $ref: '#/components/responses/UsageOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/resource-usages/:usageId/handover',
  requirePermission('resource.use'),
  validate({ ...usageParams, body: { toUserId: { ...fields.optionalId, required: true }, dueAt: fields.optionalDatetime, note: fields.reason } }),
  ctrl.handover,
);

/**
 * @openapi
 * /api/resource-usages/{usageId}/damage-reports:
 *   post:
 *     tags: [자원 사용·반환]
 *     summary: 사용 중 고장 신고
 *     description: |
 *       [FR-16, BR-08] 사용 중인 자원의 고장을 신고한다. 점검(경위: 사용 중 고장 신고)이 자동으로 등록되고 자원이 점검중이 되어 새 배정이 막힌다.
 *       반환은 따로 한다. 본인이 사용 중인 자원만 신고할 수 있고, 이미 신고했거나 진행 중인 점검이 있으면 409.
 *     parameters:
 *       - $ref: '#/components/parameters/UsageId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description]
 *             properties:
 *               description: { type: string, maxLength: 500, example: 운행 중 엔진 경고등이 켜졌습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/DamageReportOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/resource-usages/:usageId/damage-reports',
  requirePermission('resource.use'),
  validate({ ...usageParams, body: { description: fields.requiredReason } }),
  ctrl.reportDamage,
);

module.exports = router;
