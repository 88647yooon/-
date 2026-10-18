// 인증·세션 API (API 목록표 단계 1: #1~#5)
const express = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');

const router = express.Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [인증]
 *     summary: 로그인
 *     description: |
 *       [FR-02, NFR-03] 아이디와 비밀번호로 로그인하고 액세스 토큰과 리프레시 토큰을 발급한다.
 *       정지·탈퇴 상태이거나 잠긴 계정은 로그인할 수 없다(403). 성공·실패는 모두 로그인 이력에 남는다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, maxLength: 50, example: boss }
 *               password: { type: string, maxLength: 72, example: 'Family2026!' }
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/AuthTokens'
 *                     - type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/login',
  validate({
    body: {
      username: { type: 'string', required: true, max: 50 },
      password: { type: 'string', required: true, max: 72, trim: false },
    },
  }),
  authController.login,
);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [인증]
 *     summary: 액세스 토큰 재발급
 *     description: |
 *       [NFR-03] 리프레시 토큰으로 새 액세스 토큰을 발급한다.
 *       리프레시 토큰도 새 값으로 바뀌며, 이전 리프레시 토큰은 더 이상 쓸 수 없다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string, maxLength: 200, description: 로그인 또는 이전 재발급 응답의 refreshToken }
 *     responses:
 *       200:
 *         description: 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/AuthTokens' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/refresh',
  validate({ body: { refreshToken: { type: 'string', required: true, max: 200 } } }),
  authController.refresh,
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [인증]
 *     summary: 로그아웃 (현재 세션만 종료)
 *     description: |
 *       [NFR-03] 지금 요청에 사용한 세션만 종료한다. 이 세션의 액세스 토큰과 리프레시 토큰은 즉시 쓸 수 없게 된다.
 *       다른 기기의 세션은 유지된다.
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string, format: uuid }
 *                     revoked: { type: boolean, example: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @openapi
 * /api/auth/sessions:
 *   get:
 *     tags: [인증]
 *     summary: 내 로그인 세션 목록
 *     description: |
 *       [NFR-03] 내 계정으로 로그인되어 있는 유효한 세션 목록. 기기(User-Agent), IP, 마지막 사용 시각을 보여 주며
 *       지금 요청한 세션은 current가 true다.
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
 *                   items: { $ref: '#/components/schemas/Session' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   delete:
 *     tags: [인증]
 *     summary: 내 모든 세션 종료
 *     description: |
 *       [NFR-03] 지금 사용하는 세션을 포함해 다른 기기의 세션까지 모두 종료한다. 이후에는 다시 로그인해야 한다.
 *       이 작업은 활동 기록에 남는다.
 *     responses:
 *       200:
 *         description: 종료 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     revokedCount: { type: integer, example: 2 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/sessions', authenticate, requirePermission('session.manage'), authController.listSessions);
router.delete('/sessions', authenticate, requirePermission('session.manage'), authController.revokeAllSessions);

module.exports = router;
