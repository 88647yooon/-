// 평판 API (API 목록표 단계 5: #171~#175). 여러 경로(/users, /reputation-events, /reputation)를 쓰므로 /api에 바로 붙인다.
const express = require('express');
const ctrl = require('../controllers/recordController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/users', '/reputation-events', '/reputation'], authenticate);

const userParams = { params: { userId: fields.id } };

/**
 * @openapi
 * /api/users/{userId}/reputation:
 *   get:
 *     tags: [평판]
 *     summary: 평판 요약
 *     description: |
 *       [FR-18, FR-19] 평판 점수(평균 평가 점수 × 20 + 공로·징계 점수 합계, 0~100, 평가가 없으면 평가 부분 50), 유효한 평가 수와 평균,
 *       항목별 평균, 최근 6개월 월별 추세, 공로·징계 합계와 최근 기록을 돌려준다. MongoDB aggregate로 집계한다.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200: { $ref: '#/components/responses/ReputationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/users/:userId/reputation', requirePermission('reputation.read'), validate(userParams), ctrl.reputation);

/**
 * @openapi
 * /api/users/{userId}/reputation-events:
 *   post:
 *     tags: [평판]
 *     summary: 공로·징계 기록
 *     description: |
 *       [FR-18, BR-10] 업무 밖의 공로(MERIT, +점수)나 징계(DISCIPLINE, -점수)를 1~10점으로 기록한다. 평판 점수에 바로 반영된다.
 *       Underboss·Boss가 하고, 자신과 같거나 높은 역할의 구성원이나 본인에게는 기록할 수 없다(403 BR-04).
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, points, title]
 *             properties:
 *               kind: { $ref: '#/components/schemas/ReputationKind' }
 *               points: { type: integer, minimum: 1, maximum: 10, example: 3, description: '점수 크기 (징계면 음수로 저장된다)' }
 *               title: { type: string, maxLength: 100, example: 긴급 상황 대응 }
 *               description: { type: string, maxLength: 500 }
 *     responses:
 *       201: { $ref: '#/components/responses/ReputationEventOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [평판]
 *     summary: 공로·징계 기록 목록
 *     description: |
 *       [FR-19] 구성원의 공로·징계 기록을 최근 순으로 돌려준다. 취소된 기록은 includeCancelled=true일 때만.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: includeCancelled, in: query, schema: { type: boolean, default: false } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ReputationEventPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/users/:userId/reputation-events',
  requirePermission('reputation.record'),
  validate({
    ...userParams,
    body: { kind: { ...enums.reputationKind, required: true }, points: fields.reputationPoints, title: { type: 'string', required: true, max: 100 }, description: fields.reason },
  }),
  ctrl.recordReputationEvent,
);
router.get(
  '/users/:userId/reputation-events',
  requirePermission('reputation.read'),
  validate({ ...userParams, query: { includeCancelled: { type: 'boolean', default: false }, ...paging() } }),
  ctrl.reputationEvents,
);

/**
 * @openapi
 * /api/reputation-events/{eventId}:
 *   delete:
 *     tags: [평판]
 *     summary: 공로·징계 기록 취소
 *     description: |
 *       [FR-18, BR-10] 잘못된 기록을 사유를 남기고 취소한다. 기록은 지우지 않고 취소 표시만 하며 평판 점수에서 빠진다.
 *       Underboss·Boss가 하고, 대상이 자신과 같거나 높은 역할이면 403 BR-04, 이미 취소된 기록은 409.
 *     parameters:
 *       - $ref: '#/components/parameters/EventId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 다른 구성원에게 기록해야 할 내용 }
 *     responses:
 *       200: { $ref: '#/components/responses/ReputationEventOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete(
  '/reputation-events/:eventId',
  requirePermission('reputation.record'),
  validate({ params: { eventId: fields.docId }, body: { reason: fields.requiredReason } }),
  ctrl.cancelReputationEvent,
);

/**
 * @openapi
 * /api/reputation/rankings:
 *   get:
 *     tags: [평판]
 *     summary: 평판 순위
 *     description: |
 *       [FR-22] 활동중인 운영 계층 구성원을 평판 점수 순(같으면 평가 수가 많은 순)으로 돌려준다. crewId는 그 Crew의 현재 소속원으로,
 *       from·to는 그 기간에 작성된 평가와 공로·징계 기록으로 집계를 좁힌다. Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: role, in: query, description: 역할 (Administrator 제외), schema: { $ref: '#/components/schemas/AssignableRole' } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/RankingPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/reputation/rankings',
  requirePermission('reputation.ranking'),
  validate({ query: { crewId: fields.optionalId, role: enums.assignableRole, from: fields.optionalDatetime, to: fields.optionalDatetime, ...paging() } }),
  ctrl.rankings,
);

module.exports = router;
