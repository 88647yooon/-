// 내 정보 API (API 목록표 단계 1: #6~#9)
const express = require('express');
const meController = require('../controllers/meController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');

const router = express.Router();
router.use(authenticate);

/**
 * @openapi
 * /api/me:
 *   get:
 *     tags: [내 정보]
 *     summary: 내 정보 조회
 *     description: |
 *       [FR-02] 로그인한 사용자의 계정, 역할, 상태를 조회한다.
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
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
 *               nickname: { type: string, nullable: true, maxLength: 50, example: 'The Hand' }
 *               phone: { type: string, nullable: true, example: '010-1234-5678' }
 *               email: { type: string, nullable: true, format: email, example: 'me@family.local' }
 *     responses:
 *       200:
 *         description: 수정 성공. 수정된 내 정보를 돌려준다
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
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
 *               currentPassword: { type: string, example: 'Family2026!' }
 *               newPassword: { type: string, minLength: 8, maxLength: 72, example: 'NewPass2026' }
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

module.exports = router;
