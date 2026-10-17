// 역할 변경 요청 API (API 목록표 단계 2: #51~#55)
const express = require('express');
const roleRequestController = require('../controllers/roleRequestController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const requestParams = { params: { requestId: fields.id } };

/**
 * @openapi
 * /api/role-change-requests:
 *   post:
 *     tags: [역할 변경 요청]
 *     summary: 역할 변경 요청(추천)
 *     description: |
 *       [FR-03, BR-04] 구성원의 역할 변경을 요청한다. 요청자보다 낮은 역할의 구성원만 대상이 될 수 있다(403, BR-04).
 *       Capo는 역할을 직접 바꿀 수 없으므로 이 API로 자기 Crew 소속원의 역할 변경을 추천하며(다른 Crew 소속원이면 403, BR-05),
 *       Associate·Soldier·Capo 역할만 추천할 수 있다. 대상자당 처리 대기 중인 요청은 하나다(409).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, role, reason]
 *             properties:
 *               userId: { type: integer, example: 12 }
 *               role: { $ref: '#/components/schemas/Role' }
 *               reason: { type: string, maxLength: 500, example: 맡은 일을 꾸준히 해냈습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/RoleRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [역할 변경 요청]
 *     summary: 역할 변경 요청 목록
 *     description: |
 *       [FR-03] 역할 변경 요청을 최근 순으로 돌려준다. 처리 상태·대상자·요청자로 거를 수 있다. Capo는 자신이 한 요청만 본다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestStatusFilter'
 *       - { name: userId, in: query, description: 대상 구성원, schema: { type: integer, minimum: 1 } }
 *       - { name: requestedBy, in: query, description: 요청한 사람, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/RoleRequestPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/',
  requirePermission('roleRequest.create'),
  validate({ body: { userId: fields.id, role: { ...enums.role, required: true }, reason: fields.requiredReason } }),
  roleRequestController.create,
);
router.get(
  '/',
  requirePermission('roleRequest.read'),
  validate({ query: { status: enums.requestStatus, userId: fields.optionalId, requestedBy: fields.optionalId, ...paging() } }),
  roleRequestController.list,
);

/**
 * @openapi
 * /api/role-change-requests/{requestId}:
 *   get:
 *     tags: [역할 변경 요청]
 *     summary: 역할 변경 요청 상세
 *     description: |
 *       [FR-03] 요청 내용과 처리 결과를 보여 준다. Capo는 자신이 한 요청만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/RoleRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:requestId', requirePermission('roleRequest.read'), validate(requestParams), roleRequestController.get);

/**
 * @openapi
 * /api/role-change-requests/{requestId}/approve:
 *   post:
 *     tags: [역할 변경 요청]
 *     summary: 역할 변경 요청 승인
 *     description: |
 *       [FR-03, BR-04] 요청을 승인하고 대상의 역할을 바꾼다. 승인하는 사람 기준으로 역할 변경 규칙(BR-04)을 다시 검사한다.
 *       자신이 한 요청은 승인할 수 없고(403), 요청 이후 대상의 역할이 바뀌었으면 409다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/RoleRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:requestId/approve', requirePermission('roleRequest.review'), validate(requestParams), roleRequestController.approve);

/**
 * @openapi
 * /api/role-change-requests/{requestId}/reject:
 *   post:
 *     tags: [역할 변경 요청]
 *     summary: 역할 변경 요청 거절
 *     description: |
 *       [FR-03] 요청을 거절한다. 거절 사유는 필수이며 요청 기록에 남는다.
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
 *               reason: { type: string, maxLength: 500, example: 아직 경험이 부족합니다. }
 *     responses:
 *       200: { $ref: '#/components/responses/RoleRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:requestId/reject',
  requirePermission('roleRequest.review'),
  validate({ ...requestParams, body: { reason: fields.requiredReason } }),
  roleRequestController.reject,
);

module.exports = router;
