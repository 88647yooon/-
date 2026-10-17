// 구성원 API (API 목록표 단계 2: #10~#21)
const express = require('express');
const userController = require('../controllers/userController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const userIdParams = { params: { userId: fields.id } };
const newUserFields = {
  username: fields.username,
  password: fields.password,
  name: fields.name,
  nickname: fields.nickname,
  phone: fields.phone,
  email: fields.email,
};

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [구성원]
 *     summary: 구성원 등록
 *     description: |
 *       [FR-01] 새 구성원을 등록한다. 처음에는 Associate 역할, 대기(PENDING) 상태로 만들어지며
 *       역할·상태는 역할 변경·상태 변경 API로 바꾼다. 아이디는 영문 소문자·숫자·. _ - 로 3~50자,
 *       비밀번호는 8~72자이고 영문자와 숫자를 포함해야 한다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, name]
 *             properties:
 *               username: { type: string, example: new.member }
 *               password: { type: string, example: Welcome2026 }
 *               name: { type: string, maxLength: 50, example: Tony Russo }
 *               nickname: { type: string, nullable: true, maxLength: 50 }
 *               phone: { type: string, nullable: true, example: 010-2000-0001 }
 *               email: { type: string, nullable: true, format: email }
 *     responses:
 *       201: { $ref: '#/components/responses/UserOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [구성원]
 *     summary: 구성원 목록
 *     description: |
 *       [FR-01, FR-21, AR-03] 역할·상태·Crew로 거르고, 이름·아이디·별명으로 검색하고, 정렬·페이지 단위로 조회한다.
 *       보는 사람에 따라 공개 범위(visibility)가 다르다. Soldier는 기본 정보만, Capo는 자기 Crew 소속원의 연락처까지,
 *       Underboss·Boss·Administrator는 전체를 본다.
 *     parameters:
 *       - $ref: '#/components/parameters/RoleFilter'
 *       - $ref: '#/components/parameters/MemberStatusFilter'
 *       - { name: crewId, in: query, description: 이 Crew의 현재 소속원만, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/UserSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/UserPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', requirePermission('user.create'), validate({ body: newUserFields }), userController.create);
router.get(
  '/',
  requirePermission('user.list'),
  validate({ query: { role: enums.role, status: enums.memberStatus, crewId: fields.optionalId, q: fields.q, ...paging('users') } }),
  userController.list,
);

/**
 * @openapi
 * /api/users/bulk:
 *   post:
 *     tags: [구성원]
 *     summary: 구성원 일괄 등록
 *     description: |
 *       [FR-01] 최대 50명을 한 번에 등록한다. 모두 Associate·대기 상태로 만들어진다.
 *       아이디가 이미 있거나 요청 안에서 겹치는 행이 하나라도 있으면 아무도 등록하지 않고 409 BULK_REJECTED와 행별 오류를 돌려준다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [users]
 *             properties:
 *               users:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [username, password, name]
 *                   properties:
 *                     username: { type: string }
 *                     password: { type: string }
 *                     name: { type: string }
 *                     nickname: { type: string, nullable: true }
 *                     phone: { type: string, nullable: true }
 *                     email: { type: string, nullable: true }
 *             example:
 *               users:
 *                 - { username: bulk.one, password: Welcome2026, name: Bulk One }
 *                 - { username: bulk.two, password: Welcome2026, name: Bulk Two }
 *     responses:
 *       201:
 *         description: 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     createdCount: { type: integer, example: 2 }
 *                     users: { type: array, items: { $ref: '#/components/schemas/UserView' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/BulkRejected' }
 */
router.post(
  '/bulk',
  requirePermission('user.bulkCreate'),
  validate({ body: { users: { type: 'array', required: true, min: 1, max: 50, items: { type: 'object', fields: newUserFields } } } }),
  userController.bulkCreate,
);

/**
 * @openapi
 * /api/users/check-username:
 *   get:
 *     tags: [구성원]
 *     summary: 아이디 사용 가능 여부
 *     description: |
 *       [FR-01] 구성원 등록 전에 아이디를 쓸 수 있는지 확인한다. 형식이 맞지 않으면 400을 돌려준다.
 *     parameters:
 *       - { name: username, in: query, required: true, schema: { type: string, example: new.member } }
 *     responses:
 *       200:
 *         description: 확인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     username: { type: string, example: new.member }
 *                     available: { type: boolean, example: true }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/check-username',
  requirePermission('user.create'),
  validate({ query: { username: fields.username } }),
  userController.checkUsername,
);

/**
 * @openapi
 * /api/users/{userId}:
 *   get:
 *     tags: [구성원]
 *     summary: 구성원 상세
 *     description: |
 *       [FR-01, FR-19] 구성원 정보와 현재 소속(정식·임시), 맡고 있는 Crew(책임자·담당 Underboss)를 보여 준다.
 *       공개 범위는 목록과 같다. Associate는 본인 정보만 조회할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200: { $ref: '#/components/responses/UserOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [구성원]
 *     summary: 구성원 기본 정보 수정
 *     description: |
 *       [FR-01] 이름·별명·전화번호·이메일을 수정한다. 보낸 항목만 바뀌고, 바뀐 값은 변경 전후가 활동 기록에 남는다.
 *       자신과 같거나 높은 역할의 구성원은 수정할 수 없고(403, BR-04), Capo는 자기 Crew 소속원만 수정할 수 있다(403, BR-05).
 *       본인 정보는 PATCH /api/me로 수정한다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string, maxLength: 50 }
 *               nickname: { type: string, nullable: true, maxLength: 50 }
 *               phone: { type: string, nullable: true }
 *               email: { type: string, nullable: true, format: email }
 *     responses:
 *       200: { $ref: '#/components/responses/UserOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [구성원]
 *     summary: 잘못 등록된 구성원 삭제
 *     description: |
 *       [FR-01] 로그인한 적도, 소속·신청·요청 기록도 없는 구성원만 삭제할 수 있다.
 *       활동 기록이 있으면 409 CONFLICT를 돌려주며, 이 경우 상태를 탈퇴(WITHDRAWN)로 바꿔야 한다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
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
router.get('/:userId', requirePermission('user.read'), validate(userIdParams), userController.get);
router.patch(
  '/:userId',
  requirePermission('user.update'),
  validate({
    ...userIdParams,
    body: { name: { ...fields.name, required: false }, nickname: fields.nickname, phone: fields.phone, email: fields.email },
    bodyMinFields: 1,
  }),
  userController.update,
);
router.delete('/:userId', requirePermission('user.delete'), validate(userIdParams), userController.remove);

/**
 * @openapi
 * /api/users/{userId}/role:
 *   patch:
 *     tags: [구성원]
 *     summary: 역할 변경
 *     description: |
 *       [FR-03, BR-04] 구성원의 역할을 바꾼다. 자신과 같거나 높은 역할의 구성원은 바꿀 수 없고, 자신보다 높은 역할로 올릴 수도 없다(403, details.rule=BR-04).
 *       Boss 지정·해제는 Boss만, Administrator 지정·해제는 Administrator만 할 수 있다.
 *       Crew 책임자·담당 Underboss로 지정된 구성원이나 Crew 소속원이 그 자리와 맞지 않는 역할이 되려 하면 409 CONFLICT다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { $ref: '#/components/schemas/Role' }
 *               reason: { type: string, maxLength: 500, example: 업무 성과 반영 }
 *     responses:
 *       200: { $ref: '#/components/responses/UserOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:userId/role',
  requirePermission('user.role.change'),
  validate({ ...userIdParams, body: { role: { ...enums.role, required: true }, reason: fields.reason } }),
  userController.changeRole,
);

/**
 * @openapi
 * /api/users/{userId}/status:
 *   patch:
 *     tags: [구성원]
 *     summary: 상태 변경
 *     description: |
 *       [FR-03, FR-04] 구성원 상태를 바꾼다. 허용된 전이만 가능하다(GET /api/member-statuses의 next).
 *       정지·탈퇴로 바꾸면 그 구성원의 로그인 세션이 모두 종료된다. 탈퇴하면 모든 Crew 소속이 끝나고 대기 중인 신청·요청도 정리된다.
 *       자신과 같거나 높은 역할의 구성원은 바꿀 수 없고(BR-04), Capo는 자기 Crew 소속원만 바꿀 수 있다(BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { $ref: '#/components/schemas/MemberStatus' }
 *               reason: { type: string, maxLength: 500, example: 활동 시작 }
 *     responses:
 *       200: { $ref: '#/components/responses/UserOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:userId/status',
  requirePermission('user.status.change'),
  validate({ ...userIdParams, body: { status: { ...enums.memberStatus, required: true }, reason: fields.reason } }),
  userController.changeStatus,
);

/**
 * @openapi
 * /api/users/{userId}/memberships:
 *   get:
 *     tags: [구성원]
 *     summary: 소속 이력
 *     description: |
 *       [FR-02, FR-19, BR-10] 구성원의 Crew 소속 이력을 최근 순으로 돌려준다. 종료된 소속도 언제, 왜(제외·이동·해산 등) 끝났는지와 함께 남아 있다.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: active, in: query, description: 'true면 현재 소속만, false면 종료된 소속만', schema: { type: boolean } }
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
  '/:userId/memberships',
  requirePermission('user.records.read'),
  validate({ ...userIdParams, query: { active: { type: 'boolean' }, ...paging() } }),
  userController.memberships,
);

/**
 * @openapi
 * /api/users/{userId}/subordinates:
 *   get:
 *     tags: [구성원]
 *     summary: 지휘 하위 구성원
 *     description: |
 *       [FR-05] 구성원의 지휘 아래에 있는 구성원 목록. Boss는 조직 전체(탈퇴·Administrator 제외),
 *       Underboss는 담당하는 활성 Crew들의 소속원, Capo는 자신이 책임자인 Crew의 소속원이다. 그 밖의 역할은 빈 목록이다.
 *       본인 또는 Underboss·Boss만 조회할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/SubordinateSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       relation: { type: string, enum: [ORGANIZATION, CREW_CAPO, CREW_MEMBER] }
 *                       user: { $ref: '#/components/schemas/UserView' }
 *                       membershipType: { $ref: '#/components/schemas/MembershipType' }
 *                       membershipTypeLabel: { type: string }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:userId/subordinates',
  requirePermission('user.records.read'),
  validate({ ...userIdParams, query: { q: fields.q, ...paging('subordinates') } }),
  userController.subordinates,
);

/**
 * @openapi
 * /api/users/{userId}/chain-of-command:
 *   get:
 *     tags: [구성원]
 *     summary: 상위 지휘 계통
 *     description: |
 *       [FR-02, FR-05] 구성원의 정식 소속 Crew를 기준으로 책임자(Capo) → 담당 Underboss → Boss 순서의 지휘 계통을 돌려준다.
 *       Underboss는 Boss만, Boss와 Administrator는 빈 목록이다. 본인 또는 Capo 이상만 조회할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
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
 *                     user: { $ref: '#/components/schemas/UserBrief' }
 *                     crew: { allOf: [{ $ref: '#/components/schemas/CrewBrief' }], nullable: true }
 *                     chain:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           level: { type: string, enum: [CAPO, UNDERBOSS, BOSS] }
 *                           levelLabel: { type: string, example: Capo }
 *                           user: { $ref: '#/components/schemas/UserBrief' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:userId/chain-of-command', requirePermission('user.records.read'), validate(userIdParams), userController.chainOfCommand);

module.exports = router;
