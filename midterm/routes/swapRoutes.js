// 업무 교대 요청 API (API 목록표 단계 3: #98~#101. #97 요청 생성은 assignmentRoutes.js)
const express = require('express');
const ctrl = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const requestParams = { params: { requestId: fields.id } };

/**
 * @openapi
 * /api/swap-requests:
 *   get:
 *     tags: [업무 교대 요청]
 *     summary: 교대 요청 목록
 *     description: |
 *       [FR-08] 내가 보낸 요청(box=sent), 내가 받은 요청(box=received), 내가 승인할 수 있는 요청(box=review)을 최근 순으로 돌려준다.
 *       box를 생략하면 셋을 모두 보여 준다. 승인할 수 있는 요청은 Capo는 자기 Crew 업무, Underboss·Boss는 전체다.
 *     parameters:
 *       - { name: box, in: query, schema: { type: string, enum: [sent, received, review] } }
 *       - $ref: '#/components/parameters/RequestStatusFilter'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/SwapPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', requirePermission('task.swap'), validate({ query: { box: enums.swapBox, status: enums.requestStatus, ...paging() } }), ctrl.listSwaps);

/**
 * @openapi
 * /api/swap-requests/{requestId}/approve:
 *   post:
 *     tags: [업무 교대 요청]
 *     summary: 교대 요청 승인
 *     description: |
 *       [FR-08, BR-02, BR-03] 담당 Crew 책임자나 Underboss·Boss가 승인한다. 승인 시점에 받을 사람에게 배정 규칙을 다시 검사하고
 *       (정지·탈퇴면 409 BR-02, 시간이 겹치면 409 BR-03, Capo가 다른 Crew 소속원에게 넘기면 403 BR-05),
 *       요청한 사람의 배정을 '교대'로 끝낸 뒤 받을 사람을 같은 역할로 배정한다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/SwapOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:requestId/approve', requirePermission('task.swap.review'), validate(requestParams), ctrl.approveSwap);

/**
 * @openapi
 * /api/swap-requests/{requestId}/reject:
 *   post:
 *     tags: [업무 교대 요청]
 *     summary: 교대 요청 거절
 *     description: |
 *       [FR-08] 교대를 요청받은 구성원이나 담당 Crew 책임자, Underboss·Boss가 거절한다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 같은 날 다른 일정이 있습니다. }
 *     responses:
 *       200: { $ref: '#/components/responses/SwapOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:requestId/reject', requirePermission('task.swap'), validate({ ...requestParams, body: { reason: fields.reason } }), ctrl.rejectSwap);

/**
 * @openapi
 * /api/swap-requests/{requestId}:
 *   delete:
 *     tags: [업무 교대 요청]
 *     summary: 교대 요청 취소
 *     description: |
 *       [FR-08] 요청한 본인이 처리 대기 중인 요청을 취소한다. 기록은 취소 상태로 남는다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/SwapOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete('/:requestId', requirePermission('task.swap'), validate(requestParams), ctrl.cancelSwap);

module.exports = router;
