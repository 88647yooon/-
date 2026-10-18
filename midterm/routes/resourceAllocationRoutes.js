// 구성원 자원 배정 API (API 목록표 단계 4: #137~#140). 세 경로(/resources, /users, /resource-allocations)를 쓰므로 /api에 바로 붙인다.
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, fields } = require('./rules');

const router = express.Router();
router.use(['/resources', '/users', '/resource-allocations'], authenticate);

const allocationParams = { params: { allocationId: fields.id } };

/**
 * @openapi
 * /api/resources/{resourceId}/allocations:
 *   post:
 *     tags: [구성원 자원 배정]
 *     summary: 구성원에게 자원 배정
 *     description: |
 *       [FR-17, BR-07, BR-08] 구성원에게 시간대를 정해 자원을 배정한다. 받는 구성원은 활동중이고 이용 최소 역할 이상이어야 한다(409).
 *       점검중·사용불가 자원은 409 BR-08, 같은 시간대에 다른 예약이 있으면 409 BR-07(details.conflicts).
 *       Capo는 자신이 책임자인 Crew의 소속원에게만 배정한다(403 BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, startAt, endAt]
 *             properties:
 *               userId: { type: integer, minimum: 1, example: 8 }
 *               startAt: { type: string, format: date-time, example: '2026-10-25T09:00:00+09:00' }
 *               endAt: { type: string, format: date-time, example: '2026-10-25T18:00:00+09:00' }
 *               purpose: { type: string, maxLength: 500, example: 거래처 방문 }
 *     responses:
 *       201: { $ref: '#/components/responses/AllocationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/resources/:resourceId/allocations',
  requirePermission('resource.allocate'),
  validate({
    params: { resourceId: fields.id },
    body: { userId: { ...fields.optionalId, required: true }, startAt: fields.datetime, endAt: fields.datetime, purpose: fields.reason },
  }),
  ctrl.allocate,
);

/**
 * @openapi
 * /api/users/{userId}/allocations:
 *   get:
 *     tags: [구성원 자원 배정]
 *     summary: 구성원에게 배정된 자원 목록
 *     description: |
 *       [FR-14, FR-17] 구성원에게 배정된 자원을 시간순으로 돌려준다. 기본은 끝나지 않은 배정만이고 includeReleased=true면 끝난 배정(반환·취소·인계)도 포함한다.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: includeReleased, in: query, schema: { type: boolean, default: false } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/AllocationSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/AllocationPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/users/:userId/allocations',
  requirePermission('resource.allocation.read'),
  validate({
    params: { userId: fields.id },
    query: { includeReleased: { type: 'boolean', default: false }, from: fields.optionalDatetime, to: fields.optionalDatetime, ...paging('allocations') },
  }),
  ctrl.userAllocations,
);

/**
 * @openapi
 * /api/resource-allocations/{allocationId}:
 *   patch:
 *     tags: [구성원 자원 배정]
 *     summary: 배정 기간 변경
 *     description: |
 *       [FR-17, BR-07, BR-08] 배정 시간대를 바꾼다(생략한 쪽은 그대로). 새 기간으로 다른 예약과의 겹침(409 BR-07)과 자원 상태(409 BR-08)를 다시 검사한다.
 *       사용 중인 배정은 반환 예정 연장으로 바꾼다(409). 끝난 배정은 바꿀 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/AllocationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               startAt: { type: string, format: date-time }
 *               endAt: { type: string, format: date-time }
 *     responses:
 *       200: { $ref: '#/components/responses/AllocationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [구성원 자원 배정]
 *     summary: 배정 취소
 *     description: |
 *       [FR-17] 배정을 취소해 그 시간대를 비운다. 기록은 남는다. 사용 중이면 먼저 반환해야 한다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/AllocationId'
 *     responses:
 *       200: { $ref: '#/components/responses/AllocationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/resource-allocations/:allocationId',
  requirePermission('resource.allocate'),
  validate({ ...allocationParams, body: { startAt: fields.optionalDatetime, endAt: fields.optionalDatetime }, bodyMinFields: 1 }),
  ctrl.updateAllocation,
);
router.delete('/resource-allocations/:allocationId', requirePermission('resource.allocate'), validate(allocationParams), ctrl.cancelAllocation);

module.exports = router;
