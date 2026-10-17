// 소속 신청 API (API 목록표 단계 2: #45~#49. #50 내 신청 현황은 meRoutes.js)
const express = require('express');
const joinRequestController = require('../controllers/joinRequestController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const crewIdParams = { params: { crewId: fields.id } };
const requestParams = { params: { crewId: fields.id, requestId: fields.id } };

/**
 * @openapi
 * /api/crews/{crewId}/join-requests:
 *   post:
 *     tags: [소속 신청]
 *     summary: Crew 소속 신청
 *     description: |
 *       [FR-06] 로그인한 본인이 이 Crew에 소속을 신청한다. Associate·Soldier·Capo만 신청할 수 있다.
 *       편성과 같은 기준으로 미리 검사해서, 이미 다른 Crew에 정식 소속인데 정식으로 신청하면 409 BR-01이다(임시 신청은 가능).
 *       같은 Crew에 처리 대기 중인 신청이 있으면 409다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { allOf: [{ $ref: '#/components/schemas/MembershipType' }], default: REGULAR }
 *               message: { type: string, maxLength: 500, example: 이 Crew에서 활동하고 싶습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/JoinRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [소속 신청]
 *     summary: Crew의 소속 신청 목록
 *     description: |
 *       [FR-06] 이 Crew에 들어온 소속 신청을 최근 순으로 돌려준다. 처리 상태로 거를 수 있다.
 *       Capo는 자신이 책임자인 Crew의 신청만 볼 수 있다(403, BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/RequestStatusFilter'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/JoinRequestPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:crewId/join-requests',
  requirePermission('crew.joinRequest.apply'),
  validate({ ...crewIdParams, body: { type: { ...enums.membershipType, default: 'REGULAR' }, message: fields.reason } }),
  joinRequestController.apply,
);
router.get(
  '/:crewId/join-requests',
  requirePermission('crew.joinRequest.review'),
  validate({ ...crewIdParams, query: { status: enums.requestStatus, ...paging() } }),
  joinRequestController.listForCrew,
);

/**
 * @openapi
 * /api/crews/{crewId}/join-requests/{requestId}/approve:
 *   post:
 *     tags: [소속 신청]
 *     summary: 소속 신청 승인
 *     description: |
 *       [FR-06, BR-01, BR-05] 신청을 승인하고 신청한 유형으로 편성한다. 승인 시점에 편성 규칙을 다시 검사하므로,
 *       신청 이후 다른 Crew에 정식 소속되었다면 409 BR-01이다. 처리 대기 중인 신청만 승인할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/JoinRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:crewId/join-requests/:requestId/approve',
  requirePermission('crew.joinRequest.review'),
  validate(requestParams),
  joinRequestController.approve,
);

/**
 * @openapi
 * /api/crews/{crewId}/join-requests/{requestId}/reject:
 *   post:
 *     tags: [소속 신청]
 *     summary: 소속 신청 거절
 *     description: |
 *       [FR-06, BR-05] 신청을 거절한다. 거절 사유는 필수이며 신청 기록에 남는다. 처리 대기 중인 신청만 거절할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 현재 인원이 충분합니다. }
 *     responses:
 *       200: { $ref: '#/components/responses/JoinRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:crewId/join-requests/:requestId/reject',
  requirePermission('crew.joinRequest.review'),
  validate({ ...requestParams, body: { reason: fields.requiredReason } }),
  joinRequestController.reject,
);

/**
 * @openapi
 * /api/crews/{crewId}/join-requests/{requestId}:
 *   delete:
 *     tags: [소속 신청]
 *     summary: 소속 신청 취소
 *     description: |
 *       [FR-06] 신청한 본인이 처리 대기 중인 신청을 취소한다. 기록은 지우지 않고 취소 상태로 남긴다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       200: { $ref: '#/components/responses/JoinRequestOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete(
  '/:crewId/join-requests/:requestId',
  requirePermission('crew.joinRequest.apply'),
  validate(requestParams),
  joinRequestController.cancel,
);

module.exports = router;
