// Crew API (API 목록표 단계 2: #24~#34)
const express = require('express');
const crewController = require('../controllers/crewController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const crewIdParams = { params: { crewId: fields.id } };
const crewText = {
  region: { type: 'string', required: true, max: 50 },
  description: { type: 'string', nullable: true, max: 500 },
};

/**
 * @openapi
 * /api/crews:
 *   post:
 *     tags: [Crew]
 *     summary: Crew 생성
 *     description: |
 *       [FR-05] 새 Crew를 만든다. 책임자(Capo)는 만든 뒤 PUT /api/crews/{crewId}/capo로 지정한다.
 *       Underboss가 만들면 자신이 담당 Underboss가 되고, Boss는 underbossId로 담당 Underboss를 함께 지정할 수 있다.
 *       Crew 이름은 겹칠 수 없다(409 DUPLICATE).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, region]
 *             properties:
 *               name: { type: string, maxLength: 50, example: Eastside }
 *               region: { type: string, maxLength: 50, example: 서울 강동 }
 *               description: { type: string, nullable: true, maxLength: 500 }
 *               underbossId: { type: integer, description: 담당 Underboss (Boss만 지정 가능) }
 *     responses:
 *       201: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [Crew]
 *     summary: Crew 목록
 *     description: |
 *       [FR-05, FR-21] 지역·상태·담당 Underboss로 거르고, 이름·설명으로 검색하고, 정렬·페이지 단위로 조회한다.
 *       각 Crew의 책임자, 담당 Underboss, 현재 인원(정식·임시)을 함께 보여 준다.
 *     parameters:
 *       - { name: region, in: query, schema: { type: string, example: 서울 강북 } }
 *       - $ref: '#/components/parameters/CrewStatusFilter'
 *       - { name: underbossId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/CrewSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/CrewPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post(
  '/',
  requirePermission('crew.create'),
  validate({ body: { name: fields.name, ...crewText, underbossId: fields.optionalId } }),
  crewController.create,
);
router.get(
  '/',
  requirePermission('crew.read'),
  validate({
    query: {
      region: { type: 'string', max: 50 }, status: enums.crewStatus, underbossId: fields.optionalId, q: fields.q, ...paging('crews'),
    },
  }),
  crewController.list,
);

/**
 * @openapi
 * /api/crews/{crewId}:
 *   get:
 *     tags: [Crew]
 *     summary: Crew 상세
 *     description: |
 *       [FR-05] Crew 정보와 책임자(Capo), 담당 Underboss, 현재 인원(정식·임시)을 보여 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Crew]
 *     summary: Crew 정보 수정
 *     description: |
 *       [FR-05] 이름·지역·설명을 수정한다. Capo는 자신이 책임자인 Crew만 수정할 수 있다(403, BR-05).
 *       해산된 Crew는 수정할 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string, maxLength: 50 }
 *               region: { type: string, maxLength: 50 }
 *               description: { type: string, nullable: true, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Crew]
 *     summary: 사용하지 않은 Crew 삭제
 *     description: |
 *       [FR-05] 편성·소속 신청·책임자 기록이 하나도 없는 Crew만 삭제할 수 있다.
 *       기록이 있으면 409 CONFLICT를 돌려주며, 이 경우 상태를 해산(DISBANDED)으로 바꿔야 한다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     responses:
 *       200:
 *         description: 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     deleted: { type: boolean, example: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:crewId', requirePermission('crew.read'), validate(crewIdParams), crewController.get);
router.patch(
  '/:crewId',
  requirePermission('crew.update'),
  validate({
    ...crewIdParams,
    body: { name: { ...fields.name, required: false }, region: { ...crewText.region, required: false }, description: crewText.description },
    bodyMinFields: 1,
  }),
  crewController.update,
);
router.delete('/:crewId', requirePermission('crew.delete'), validate(crewIdParams), crewController.remove);

/**
 * @openapi
 * /api/crews/{crewId}/status:
 *   patch:
 *     tags: [Crew]
 *     summary: Crew 활성·해산 전환
 *     description: |
 *       [FR-05, FR-06] Crew를 해산(DISBANDED)하거나 다시 활성(ACTIVE)으로 되돌린다.
 *       해산하면 한 트랜잭션 안에서 모든 소속이 끝나고(종료 이유: Crew 해산), 책임자·담당 Underboss 지정이 풀리고, 대기 중인 소속 신청이 취소된다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { $ref: '#/components/schemas/CrewStatus' }
 *               reason: { type: string, maxLength: 500, example: 지역 재편 }
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:crewId/status',
  requirePermission('crew.status.change'),
  validate({ ...crewIdParams, body: { status: { ...enums.crewStatus, required: true }, reason: fields.reason } }),
  crewController.changeStatus,
);

/**
 * @openapi
 * /api/crews/{crewId}/capo:
 *   put:
 *     tags: [Crew]
 *     summary: 책임자(Capo) 지정·교체
 *     description: |
 *       [FR-05, BR-04] 활동중인 Capo 역할 구성원을 책임자로 지정한다. 이미 책임자가 있으면 교체되고, 이전 책임자는 정식 소속원으로 남는다.
 *       대상이 아직 어느 Crew에도 정식 소속이 없으면 이 Crew에 정식 소속으로 함께 편성하고,
 *       다른 Crew에 정식 소속되어 있으면 409 BR-01이다. 이 Crew의 임시 소속원이면 먼저 정식 소속으로 바꿔야 한다(409).
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
 *               userId: { type: integer, example: 5 }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Crew]
 *     summary: 책임자(Capo) 해제
 *     description: |
 *       [FR-05] 책임자 지정을 해제한다. 해제된 구성원은 이 Crew의 정식 소속원으로 남고, 임기 종료가 책임자 이력에 기록된다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put(
  '/:crewId/capo',
  requirePermission('crew.capo.assign'),
  validate({ ...crewIdParams, body: { userId: fields.id, reason: fields.reason } }),
  crewController.assignCapo,
);
router.delete('/:crewId/capo', requirePermission('crew.capo.assign'), validate(crewIdParams), crewController.removeCapo);

/**
 * @openapi
 * /api/crews/{crewId}/underboss:
 *   put:
 *     tags: [Crew]
 *     summary: 담당 Underboss 지정
 *     description: |
 *       [FR-05] 활동중인 Underboss 역할 구성원을 이 Crew의 담당 Underboss로 지정한다. Boss만 할 수 있다.
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
 *               userId: { type: integer, example: 3 }
 *     responses:
 *       200: { $ref: '#/components/responses/CrewOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put(
  '/:crewId/underboss',
  requirePermission('crew.underboss.assign'),
  validate({ ...crewIdParams, body: { userId: fields.id } }),
  crewController.assignUnderboss,
);

/**
 * @openapi
 * /api/crews/{crewId}/capo-history:
 *   get:
 *     tags: [Crew]
 *     summary: 책임자 교체 이력
 *     description: |
 *       [FR-05, BR-10] Crew 책임자(Capo)의 임기 기록을 최근 순으로 돌려준다. 누가 지정·해제했는지와 종료 이유(교체·해제·해산·병합)를 포함한다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/CapoTermPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:crewId/capo-history',
  requirePermission('crew.capoHistory.read'),
  validate({ ...crewIdParams, query: paging() }),
  crewController.capoHistory,
);

/**
 * @openapi
 * /api/crews/{crewId}/hierarchy:
 *   get:
 *     tags: [Crew]
 *     summary: Crew 조직도
 *     description: |
 *       [FR-05] 담당 Underboss → 책임자(Capo) → 소속원(역할 순위가 높은 순) 트리를 돌려준다.
 *       그 Crew의 현재 소속원이나 Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     crew: { $ref: '#/components/schemas/CrewBrief' }
 *                     tree:
 *                       type: object
 *                       description: 'position: UNDERBOSS → children[CAPO] → children[MEMBER]'
 *                       properties:
 *                         position: { type: string, example: UNDERBOSS }
 *                         user: { allOf: [{ $ref: '#/components/schemas/UserBrief' }], nullable: true }
 *                         children:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               position: { type: string, example: CAPO }
 *                               user: { allOf: [{ $ref: '#/components/schemas/UserBrief' }], nullable: true }
 *                               children:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     position: { type: string, example: MEMBER }
 *                                     user: { $ref: '#/components/schemas/UserBrief' }
 *                                     membershipType: { $ref: '#/components/schemas/MembershipType' }
 *                                     membershipTypeLabel: { type: string }
 *                                     joinedAt: { type: string, format: date-time }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:crewId/hierarchy', requirePermission('crew.read'), validate(crewIdParams), crewController.hierarchy);

module.exports = router;
