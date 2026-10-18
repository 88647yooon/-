// 이력 조회 API (API 목록표 단계 5: #155~#157). /users/... 와 /crews/... 경로를 쓰므로 /api에 바로 붙인다.
const express = require('express');
const ctrl = require('../controllers/recordController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/users', '/crews'], authenticate);

const period = { from: fields.optionalDatetime, to: fields.optionalDatetime };

/**
 * @openapi
 * /api/users/{userId}/change-history:
 *   get:
 *     tags: [이력 조회]
 *     summary: 구성원 변경 이력
 *     description: |
 *       [FR-19, BR-10] 구성원의 계정 등록·역할·상태·소속·평가(공로·징계 포함) 변경 이력을 시간순(오래된 것부터)으로 돌려준다.
 *       type으로 한 유형만 볼 수 있고, 항목마다 변경 전후 값, 처리자, 사유, 한 줄 요약(summary)이 있다.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: type, in: query, schema: { $ref: '#/components/schemas/ChangeType' } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/HistorySort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ChangeHistoryPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/users/:userId/change-history',
  requirePermission('member.history.read'),
  validate({ params: { userId: fields.id }, query: { type: enums.changeType, ...period, ...paging('history') } }),
  ctrl.changeHistory,
);

/**
 * @openapi
 * /api/users/{userId}/activity:
 *   get:
 *     tags: [이력 조회]
 *     summary: 구성원 활동 타임라인
 *     description: |
 *       [FR-19] 구성원의 활동을 최근 순으로 모아 보여 준다: 업무 배정·배정 끝·참여 기록(TASK), 자원 사용 시작·반환(RESOURCE),
 *       받은 평가(EVALUATION), 공로·징계(REPUTATION). kind로 한 종류만 볼 수 있다. 업무·자원은 SQL, 평가·평판은 MongoDB에서 읽는다.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: kind, in: query, schema: { type: string, enum: [TASK, RESOURCE, EVALUATION, REPUTATION] } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ActivityPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/users/:userId/activity',
  requirePermission('member.history.read'),
  validate({ params: { userId: fields.id }, query: { kind: enums.activityKind, ...period, ...paging() } }),
  ctrl.userActivity,
);

/**
 * @openapi
 * /api/crews/{crewId}/activity:
 *   get:
 *     tags: [이력 조회]
 *     summary: Crew 활동 타임라인
 *     description: |
 *       [FR-19, FR-22] Crew에 관한 활동 기록을 최근 순으로 돌려준다: Crew 정보·상태·책임자 변경, 소속 변경, 그 Crew 업무의 등록·배정·상태 변경·완료,
 *       그 업무의 자원 할당과 평가. action으로 한 행위만 볼 수 있다. 그 Crew의 책임자와 Underboss·Boss만 볼 수 있다(그 밖의 Capo는 403 BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - { name: action, in: query, description: '행위 코드 (예: TASK_COMPLETED, MEMBERSHIP_ADDED)', schema: { type: string } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ActivityLogPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/crews/:crewId/activity',
  requirePermission('crew.activity.read'),
  validate({ params: { crewId: fields.id }, query: { action: enums.action, ...period, ...paging() } }),
  ctrl.crewActivity,
);

module.exports = router;
