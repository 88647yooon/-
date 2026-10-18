// 내 정보 API (API 목록표 단계 1: #6~#9, 단계 2: #50, 단계 3: #94~#96)
const express = require('express');
const meController = require('../controllers/meController');
const joinRequestController = require('../controllers/joinRequestController');
const taskController = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

/**
 * @openapi
 * /api/me:
 *   get:
 *     tags: [내 정보]
 *     summary: 내 정보 조회
 *     description: |
 *       [FR-02] 로그인한 사용자의 계정, 역할, 상태와 현재 소속을 조회한다.
 *       정식 소속 Crew와 그 책임자(crew), 임시 소속 Crew(temporaryCrews), 내가 맡고 있는 Crew(leadership)를 함께 보여 준다.
 *     responses:
 *       200: { $ref: '#/components/responses/MeOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   patch:
 *     tags: [내 정보]
 *     summary: 내 연락처·별명 수정
 *     description: |
 *       [FR-01] 본인이 바꿀 수 있는 항목(별명, 전화번호, 이메일)만 수정한다. 보낸 항목만 바뀌며 null을 보내면 값을 지운다.
 *       이름·역할·상태는 관리자 기능에서 바꾼다. 실제로 바뀐 값은 변경 전후가 활동 기록에 남는다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               nickname: { type: string, minLength: 1, nullable: true, maxLength: 50, example: 'The Hand' }
 *               phone: { type: string, pattern: '^[0-9+\-\s]{7,20}$', nullable: true, example: '010-1234-5678' }
 *               email: { type: string, maxLength: 100, nullable: true, format: email, example: 'me@family.local' }
 *     responses:
 *       200: { $ref: '#/components/responses/MeOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', requirePermission('me.read'), meController.getMe);
router.patch(
  '/',
  requirePermission('me.update'),
  validate({
    body: {
      nickname: { type: 'string', nullable: true, min: 1, max: 50 },
      phone: { type: 'string', nullable: true, format: 'phone' },
      email: { type: 'string', nullable: true, format: 'email', max: 100 },
    },
    bodyMinFields: 1,
  }),
  meController.updateMe,
);

/**
 * @openapi
 * /api/me/password:
 *   put:
 *     tags: [내 정보]
 *     summary: 비밀번호 변경
 *     description: |
 *       [FR-01] 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다. 새 비밀번호는 8~72자이고 영문자와 숫자를 포함해야 한다.
 *       변경하면 지금 사용 중인 세션만 남기고 다른 기기의 세션은 모두 종료된다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, maxLength: 72, example: 'Family2026!' }
 *               newPassword: { type: string, pattern: '^(?=.*[A-Za-z])(?=.*\d)', minLength: 8, maxLength: 72, example: 'NewPass2026' }
 *     responses:
 *       200:
 *         description: 변경 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     passwordChangedAt: { type: string, format: date-time }
 *                     revokedSessionCount: { type: integer, example: 1, description: 종료된 다른 기기 세션 수 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put(
  '/password',
  requirePermission('me.password'),
  validate({
    body: {
      currentPassword: { type: 'string', required: true, max: 72, trim: false },
      newPassword: {
        type: 'string',
        required: true,
        min: 8,
        max: 72,
        trim: false,
        pattern: /^(?=.*[A-Za-z])(?=.*\d)/,
        patternMessage: '영문자와 숫자를 각각 1자 이상 포함해야 합니다.',
      },
    },
  }),
  meController.changePassword,
);

/**
 * @openapi
 * /api/me/permissions:
 *   get:
 *     tags: [내 정보]
 *     summary: 내가 사용할 수 있는 기능 목록
 *     description: |
 *       [FR-02, NFR-03] 내 역할에 허용된 권한 목록. 서버의 권한 검사(RBAC)와 같은 기준을 사용하므로,
 *       화면은 이 목록으로 메뉴를 보여 줄 수 있다.
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
 *                     role: { type: string, example: CAPO }
 *                     roleLabel: { type: string, example: Capo }
 *                     rank: { type: integer, nullable: true, example: 3 }
 *                     roleDescription: { type: string }
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: me.update }
 *                           description: { type: string, example: 내 연락처·별명 수정 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/permissions', requirePermission('me.read'), meController.getPermissions);

/**
 * @openapi
 * /api/me/join-requests:
 *   get:
 *     tags: [내 정보]
 *     summary: 내 Crew 소속 신청 현황
 *     description: |
 *       [FR-02, FR-06] 내가 여러 Crew에 낸 소속 신청과 처리 결과(승인·거절·취소, 거절 사유)를 최근 순으로 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/RequestStatusFilter'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/JoinRequestPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/join-requests',
  requirePermission('me.read'),
  validate({ query: { status: enums.requestStatus, ...paging() } }),
  joinRequestController.listMine,
);

/**
 * @openapi
 * /api/me/tasks:
 *   get:
 *     tags: [내 업무]
 *     summary: 내게 배정된 업무 목록
 *     description: |
 *       [FR-09] 내가 현재 참여 중인 업무와 내 역할·배정 응답을 돌려준다. 업무 상태·배정 응답·기간으로 거를 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskStatusFilter'
 *       - { name: response, in: query, schema: { $ref: '#/components/schemas/AssignmentResponse' } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/MyTaskSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/MyTaskPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/tasks',
  requirePermission('me.read'),
  validate({
    query: {
      status: enums.taskStatus, response: enums.assignmentResponse, from: fields.optionalDatetime, to: fields.optionalDatetime, ...paging('myTasks'),
    },
  }),
  taskController.myTasks,
);

/**
 * @openapi
 * /api/me/tasks/{taskId}:
 *   get:
 *     tags: [내 업무]
 *     summary: 내 업무 상세 (참여자 관점)
 *     description: |
 *       [FR-09] 내가 참여 중인 업무에서 내가 확인해야 할 정보를 한 번에 돌려준다: 업무 정보, 내 역할·응답, 나에게 온 지시사항, 함께하는 참여자, 체크리스트,
 *       업무에 할당된 자원(시간대와 지금 누가 쓰는지). 내게 배정된 업무가 아니면 404다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/MyTaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/tasks/:taskId', requirePermission('me.read'), validate({ params: { taskId: fields.id } }), taskController.myTask);

/**
 * @openapi
 * /api/me/schedule:
 *   get:
 *     tags: [내 업무]
 *     summary: 내 일정
 *     description: |
 *       [FR-09] 기간과 겹치는 내 업무(취소된 업무 제외, 업무에 할당된 자원 포함)와 나에게 배정된 자원(kind=RESOURCE, 지금 사용 중인지 포함)을
 *       시작 시각 순으로 돌려준다. from을 생략하면 지금부터, to를 생략하면 from부터 14일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *     responses:
 *       200: { $ref: '#/components/responses/ScheduleOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/schedule',
  requirePermission('me.read'),
  validate({ query: { from: fields.optionalDatetime, to: fields.optionalDatetime } }),
  taskController.mySchedule,
);

module.exports = router;
