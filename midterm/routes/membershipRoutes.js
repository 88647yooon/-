// Crew 편성 API (API 목록표 단계 2: #35~#44)
const express = require('express');
const membershipController = require('../controllers/membershipController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const crewIdParams = { params: { crewId: fields.id } };
const memberParams = { params: { crewId: fields.id, userId: fields.id } };
const regularByDefault = { ...enums.membershipType, default: 'REGULAR' };

/**
 * @openapi
 * /api/crews/merge:
 *   post:
 *     tags: [Crew 편성]
 *     summary: 두 Crew 병합
 *     description: |
 *       [FR-06] 원 Crew(sourceCrewId)의 모든 소속원을 대상 Crew(targetCrewId)로 옮기고 원 Crew를 해산한다. 한 트랜잭션으로 처리된다.
 *       원 Crew의 소속은 '병합'으로 끝나고 대상 Crew에 같은 유형으로 새 소속이 생긴다. 이미 대상 Crew에 소속된 구성원은 그대로 두되,
 *       원 Crew 정식 + 대상 Crew 임시였다면 정식으로 바꾼다. 원 Crew의 책임자는 대상 Crew의 정식 소속원이 된다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceCrewId, targetCrewId]
 *             properties:
 *               sourceCrewId: { type: integer, description: 해산될 원 Crew, example: 3 }
 *               targetCrewId: { type: integer, description: 소속원을 받을 Crew, example: 1 }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200:
 *         description: 병합 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sourceCrew: { $ref: '#/components/schemas/Crew' }
 *                     targetCrew: { $ref: '#/components/schemas/Crew' }
 *                     movedCount: { type: integer, description: 대상 Crew로 옮긴 인원 }
 *                     alreadyMemberCount: { type: integer, description: 이미 대상 Crew 소속이라 그대로 둔 인원 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/merge',
  requirePermission('crew.merge'),
  validate({ body: { sourceCrewId: fields.id, targetCrewId: fields.id, reason: fields.reason } }),
  membershipController.merge,
);

/**
 * @openapi
 * /api/crews/{crewId}/members:
 *   get:
 *     tags: [Crew 편성]
 *     summary: Crew 현재 소속원 목록
 *     description: |
 *       [FR-05] Crew의 현재 소속원을 정식·임시 구분과 함께 돌려준다. 소속 유형·역할로 거르고 이름으로 검색할 수 있다.
 *       그 Crew의 현재 소속원이나 Underboss·Boss만 볼 수 있고, 연락처는 Crew 책임자와 Underboss·Boss에게만 보인다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/MembershipTypeFilter'
 *       - $ref: '#/components/parameters/CrewMemberRoleFilter'
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/MemberSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Crew 편성]
 *     summary: 구성원 편성
 *     description: |
 *       [FR-06, BR-01, BR-05] 활동중인 Associate·Soldier·Capo를 이 Crew에 편성한다. type 기본값은 정식(REGULAR)이다.
 *       다른 Crew에 정식 소속된 구성원을 정식으로 편성하면 409 BR-01이다(임시 편성은 가능).
 *       Capo는 자신이 책임자인 Crew에만 편성할 수 있다(403, details.rule=BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: integer, example: 13 }
 *               type: { allOf: [{ $ref: '#/components/schemas/MembershipType' }], default: REGULAR }
 *               note: { type: string, maxLength: 200 }
 *     responses:
 *       201: { $ref: '#/components/responses/MembershipOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get(
  '/:crewId/members',
  requirePermission('crew.read'),
  validate({ ...crewIdParams, query: { type: enums.membershipType, role: enums.crewMemberRole, q: fields.q, ...paging('members') } }),
  membershipController.listMembers,
);
router.post(
  '/:crewId/members',
  requirePermission('crew.members.manage'),
  validate({ ...crewIdParams, body: { userId: fields.id, type: regularByDefault, note: fields.note } }),
  membershipController.addMember,
);

/**
 * @openapi
 * /api/crews/{crewId}/members/bulk:
 *   post:
 *     tags: [Crew 편성]
 *     summary: 여러 명 일괄 편성
 *     description: |
 *       [FR-06, BR-01, BR-05] 최대 50명을 한 트랜잭션으로 편성한다. 모든 행을 먼저 검사하고, 한 명이라도 편성할 수 없으면
 *       아무도 편성하지 않고 409 BULK_REJECTED와 행별 오류(code에 BR-01·CONFLICT·NOT_FOUND 등)를 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [members]
 *             properties:
 *               members:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [userId]
 *                   properties:
 *                     userId: { type: integer }
 *                     type: { allOf: [{ $ref: '#/components/schemas/MembershipType' }], default: REGULAR }
 *               note: { type: string, maxLength: 200 }
 *             example:
 *               members:
 *                 - { userId: 13, type: REGULAR }
 *                 - { userId: 8, type: TEMPORARY }
 *     responses:
 *       201:
 *         description: 편성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     addedCount: { type: integer, example: 2 }
 *                     members: { type: array, items: { $ref: '#/components/schemas/Membership' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/BulkRejected' }
 */
router.post(
  '/:crewId/members/bulk',
  requirePermission('crew.members.manage'),
  validate({
    ...crewIdParams,
    body: {
      members: { type: 'array', required: true, min: 1, max: 50, items: { type: 'object', fields: { userId: fields.id, type: regularByDefault } } },
      note: fields.note,
    },
  }),
  membershipController.bulkAdd,
);

/**
 * @openapi
 * /api/crews/{crewId}/members/{userId}:
 *   get:
 *     tags: [Crew 편성]
 *     summary: 소속원의 소속 상세
 *     description: |
 *       [FR-05] 이 Crew에 현재 소속된 구성원의 소속 정보(유형, 가입일, 편성한 사람, 소속 경위)를 보여 준다. 현재 소속원이 아니면 404다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Crew 편성]
 *     summary: 소속 유형 변경
 *     description: |
 *       [FR-06, BR-01] 임시 ↔ 정식으로 바꾼다. 이력을 남기기 위해 기존 소속을 '소속 유형 변경'으로 끝내고 새 소속을 만든다.
 *       정식으로 바꿀 때 다른 Crew에 정식 소속이 있으면 409 BR-01이고, 책임자는 임시로 바꿀 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type: { $ref: '#/components/schemas/MembershipType' }
 *               note: { type: string, maxLength: 200 }
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Crew 편성]
 *     summary: 구성원 제외
 *     description: |
 *       [FR-06, BR-05] 구성원을 Crew에서 제외한다. 소속 기록은 지우지 않고 종료일과 종료 이유(제외)를 남긴다.
 *       책임자는 먼저 책임자를 해제해야 제외할 수 있다(409). Capo는 자신이 책임자인 Crew에서만 제외할 수 있다(403, BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:crewId/members/:userId', requirePermission('crew.read'), validate(memberParams), membershipController.getMember);
router.patch(
  '/:crewId/members/:userId',
  requirePermission('crew.members.manage'),
  validate({ ...memberParams, body: { type: { ...enums.membershipType, required: true }, note: fields.note } }),
  membershipController.changeType,
);
router.delete('/:crewId/members/:userId', requirePermission('crew.members.manage'), validate(memberParams), membershipController.removeMember);

/**
 * @openapi
 * /api/crews/{crewId}/members/{userId}/transfer:
 *   post:
 *     tags: [Crew 편성]
 *     summary: 다른 Crew로 이동
 *     description: |
 *       [FR-06, BR-01, BR-05] 소속원을 다른 Crew로 옮긴다. 기존 소속 종료(종료 이유: 다른 Crew로 이동)와 새 소속 생성을 한 트랜잭션으로 처리한다.
 *       type을 생략하면 기존 소속 유형을 그대로 쓴다. 두 Crew의 편성이 함께 바뀌므로 Underboss·Boss만 할 수 있다.
 *       책임자는 먼저 책임자를 해제해야 한다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetCrewId]
 *             properties:
 *               targetCrewId: { type: integer, example: 2 }
 *               type: { $ref: '#/components/schemas/MembershipType' }
 *               note: { type: string, maxLength: 200 }
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:crewId/members/:userId/transfer',
  requirePermission('crew.members.transfer'),
  validate({ ...memberParams, body: { targetCrewId: fields.id, type: enums.membershipType, note: fields.note } }),
  membershipController.transfer,
);

/**
 * @openapi
 * /api/crews/{crewId}/candidates:
 *   get:
 *     tags: [Crew 편성]
 *     summary: 편성 후보
 *     description: |
 *       [FR-06, BR-01] 이 Crew에 편성할 수 있는 구성원(활동중, Associate·Soldier·Capo, 이 Crew의 현재 소속원이 아님)을 돌려준다.
 *       type=REGULAR(기본)이면 다른 Crew에 정식 소속된 구성원은 뺀다. type=TEMPORARY면 그런 구성원도 포함한다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - { name: type, in: query, schema: { allOf: [{ $ref: '#/components/schemas/MembershipType' }], default: REGULAR } }
 *       - $ref: '#/components/parameters/CrewMemberRoleFilter'
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/CandidateSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/UserPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:crewId/candidates',
  requirePermission('crew.members.manage'),
  validate({ ...crewIdParams, query: { type: regularByDefault, role: enums.crewMemberRole, q: fields.q, ...paging('candidates') } }),
  membershipController.candidates,
);

/**
 * @openapi
 * /api/crews/{crewId}/membership-history:
 *   get:
 *     tags: [Crew 편성]
 *     summary: Crew 편성 변경 이력
 *     description: |
 *       [FR-06, BR-10] 이 Crew의 모든 소속 기록(현재·종료)을 최근 변경 순으로 돌려준다. 가입 경위(편성·신청 승인·이동·병합 등)와
 *       종료 이유(제외·이동·해산·병합·탈퇴 등), 처리한 사람을 함께 보여 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - { name: status, in: query, description: 'active면 현재 소속만, ended면 종료된 소속만', schema: { type: string, enum: [active, ended] } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/MembershipPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:crewId/membership-history',
  requirePermission('crew.members.manage'),
  validate({ ...crewIdParams, query: { status: { type: 'string', enum: ['active', 'ended'] }, ...paging() } }),
  membershipController.history,
);

module.exports = router;
