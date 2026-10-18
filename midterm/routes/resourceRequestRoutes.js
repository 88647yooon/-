// 자원 사용 신청 API (API 목록표 단계 4: #141~#146)
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const requestParams = { params: { requestId: fields.id } };

/**
 * @openapi
 * /api/resource-requests:
 *   post:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청
 *     description: |
 *       [FR-14, FR-17, BR-07, BR-08] 자원과 시간대, 사유를 정해 사용을 신청한다. 신청할 때 이용 최소 역할(403), 자원 상태(점검중·사용불가면 409 BR-08),
 *       시간 겹침(409 BR-07)을 먼저 확인한다. 같은 자원에 대기 중인 신청은 한 사람당 하나다(409 DUPLICATE).
 *       담당 Crew 책임자나 Underboss·Boss가 승인하면 구성원 자원 배정이 만들어진다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceId, startAt, endAt, reason]
 *             properties:
 *               resourceId: { type: integer, minimum: 1, example: 2 }
 *               startAt: { type: string, format: date-time, example: '2026-10-25T13:00:00+09:00' }
 *               endAt: { type: string, format: date-time, example: '2026-10-25T17:00:00+09:00' }
 *               reason: { type: string, maxLength: 500, example: 거래처 방문 }
 *     responses:
 *       201: { $ref: '#/components/responses/ResourceRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청 목록
 *     description: |
 *       [FR-17] 내 신청(box=mine)과 내가 처리할 수 있는 신청(box=review: Capo는 자기 Crew 소속원의 신청, Underboss·Boss는 전체)을 돌려준다.
 *       box를 생략하면 둘 다다. 대기 중인 신청이 먼저, 그다음 최근 순이다.
 *     parameters:
 *       - { name: box, in: query, schema: { type: string, enum: [mine, review] } }
 *       - $ref: '#/components/parameters/RequestStatusFilter'
 *       - { name: resourceId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceRequestPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/',
  requirePermission('resource.request'),
  validate({ body: { resourceId: { ...fields.optionalId, required: true }, startAt: fields.datetime, endAt: fields.datetime, reason: fields.requiredReason } }),
  ctrl.createRequest,
);
router.get(
  '/',
  requirePermission('resource.request'),
  validate({ query: { box: enums.requestBox, status: enums.requestStatus, resourceId: fields.optionalId, ...paging() } }),
  ctrl.listRequests,
);

/**
 * @openapi
 * /api/resource-requests/{requestId}:
 *   get:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청 상세
 *     description: |
 *       [FR-17] 신청 내용과 처리 결과, 승인으로 만들어진 배정 ID를 보여 준다. 신청자, 신청자 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청 취소
 *     description: |
 *       [FR-17] 신청자 본인이 대기 중인 신청을 취소한다. 이미 처리된 신청은 409.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:requestId', requirePermission('resource.request'), validate(requestParams), ctrl.getRequest);
router.delete('/:requestId', requirePermission('resource.request'), validate(requestParams), ctrl.cancelRequest);

/**
 * @openapi
 * /api/resource-requests/{requestId}/approve:
 *   post:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청 승인
 *     description: |
 *       [FR-17, BR-07, BR-08] 신청을 승인하고 신청자에게 구성원 자원 배정을 만든다. 승인 시점에 이용 최소 역할(409), 자원 상태(409 BR-08),
 *       시간 겹침(409 BR-07)을 다시 검사한다. Capo는 자기 Crew 소속원의 신청만(403 BR-05), 본인 신청은 처리할 수 없다(403).
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:requestId/approve', requirePermission('resource.request.review'), validate({ ...requestParams, body: { note: fields.reason } }), ctrl.approveRequest);

/**
 * @openapi
 * /api/resource-requests/{requestId}/reject:
 *   post:
 *     tags: [자원 사용 신청]
 *     summary: 자원 사용 신청 거절
 *     description: |
 *       [FR-17] 사유를 남기고 신청을 거절한다. Capo는 자기 Crew 소속원의 신청만(403 BR-05), 이미 처리된 신청은 409.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 같은 날 업무에 필요한 차량입니다. }
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:requestId/reject', requirePermission('resource.request.review'), validate({ ...requestParams, body: { reason: fields.requiredReason } }), ctrl.rejectRequest);

module.exports = router;
