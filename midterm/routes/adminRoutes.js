// 관리자 API (API 목록표 단계 6: #199~#210). 모두 Administrator만 쓸 수 있고, 다른 역할이 주소로 직접 들어오면 403이며 권한 거부 기록이 남는다 (BR-09).
const express = require('express');
const ctrl = require('../controllers/opsController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const userParams = { params: { userId: fields.id } };
const reasonBody = { body: { reason: fields.reason } };
const accounts = requirePermission('admin.accounts');

/**
 * @openapi
 * /api/admin/accounts:
 *   get:
 *     tags: [관리자]
 *     summary: 계정 보안 현황
 *     description: |
 *       [FR-23] 계정마다 마지막 로그인, 연속 로그인 실패 횟수, 잠금 여부·이유, 비밀번호 변경 시각, 유효한 세션 수를 보여 준다.
 *       잠긴 계정만(locked=true), 실패 횟수가 몇 번 이상인 계정만(minFailed) 거를 수 있다.
 *     parameters:
 *       - { name: locked, in: query, schema: { type: boolean } }
 *       - { name: minFailed, in: query, schema: { type: integer, minimum: 0 } }
 *       - $ref: '#/components/parameters/RoleFilter'
 *       - $ref: '#/components/parameters/MemberStatusFilter'
 *       - $ref: '#/components/parameters/Q'
 *       - $ref: '#/components/parameters/AccountSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/AccountPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/accounts',
  accounts,
  validate({
    query: {
      locked: { type: 'boolean' }, minFailed: { type: 'integer', min: 0 }, role: enums.role, status: enums.memberStatus, q: fields.q, ...paging('accounts'),
    },
  }),
  ctrl.accounts,
);

/**
 * @openapi
 * /api/admin/accounts/{userId}/lock:
 *   put:
 *     tags: [관리자]
 *     summary: 계정 잠금
 *     description: |
 *       [FR-23, NFR-03] 계정을 잠가 로그인을 막고 유효한 세션을 모두 끊는다(이미 발급된 토큰도 바로 쓸 수 없다). 본인 계정은 403, 이미 잠긴 계정은 409.
 *       연속 로그인 실패가 운영 설정의 잠금 기준에 이르면 자동으로도 잠긴다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 계정 공유 의심 }
 *     responses:
 *       200: { $ref: '#/components/responses/AccountOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [관리자]
 *     summary: 계정 잠금 해제
 *     description: |
 *       [FR-23] 잠금을 풀고 연속 로그인 실패 횟수를 0으로 되돌린다. 잠기지 않은 계정은 409.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/AccountOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put('/accounts/:userId/lock', accounts, validate({ ...userParams, body: { reason: fields.requiredReason } }), ctrl.lock);
router.delete('/accounts/:userId/lock', accounts, validate({ ...userParams, ...reasonBody }), ctrl.unlock);

/**
 * @openapi
 * /api/admin/accounts/{userId}/password-reset:
 *   post:
 *     tags: [관리자]
 *     summary: 임시 비밀번호 발급
 *     description: |
 *       [FR-23] 비밀번호 규칙을 만족하는 12자 임시 비밀번호로 바꾸고 응답으로 한 번만 보여 준다. 기존 세션은 모두 끊긴다. 본인 계정은 403(내 정보에서 바꾼다).
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 비밀번호 분실 }
 *     responses:
 *       200: { $ref: '#/components/responses/PasswordResetOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/accounts/:userId/password-reset', accounts, validate({ ...userParams, ...reasonBody }), ctrl.resetPassword);

/**
 * @openapi
 * /api/admin/accounts/{userId}/sessions:
 *   delete:
 *     tags: [관리자]
 *     summary: 강제 로그아웃
 *     description: |
 *       [FR-23, NFR-03] 대상 계정의 유효한 세션을 모두 끊는다. 잠그지는 않으므로 다시 로그인할 수 있다. 본인 계정은 403.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/ForceLogoutOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/accounts/:userId/sessions', accounts, validate({ ...userParams, ...reasonBody }), ctrl.forceLogout);

/**
 * @openapi
 * /api/admin/login-history:
 *   get:
 *     tags: [관리자]
 *     summary: 로그인 이력
 *     description: |
 *       [FR-23] 로그인 성공·실패 기록(MongoDB)을 최근 순으로 돌려준다. 사용자 ID, 아이디 검색어, 성공 여부, 실패 이유(WRONG_PASSWORD, ACCOUNT_LOCKED 등), 기간으로 거른다.
 *     parameters:
 *       - { name: userId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: q, in: query, description: 아이디 검색어, schema: { type: string, maxLength: 50 } }
 *       - { name: success, in: query, schema: { type: boolean } }
 *       - { name: reason, in: query, schema: { type: string, maxLength: 40, example: WRONG_PASSWORD } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/LoginHistoryPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/login-history',
  accounts,
  validate({
    query: {
      userId: fields.optionalId, q: fields.q, success: { type: 'boolean' }, reason: { type: 'string', max: 40 },
      from: fields.optionalDatetime, to: fields.optionalDatetime, ...paging(),
    },
  }),
  ctrl.loginHistory,
);

/**
 * @openapi
 * /api/admin/permissions:
 *   get:
 *     tags: [관리자]
 *     summary: 역할별 권한 매트릭스
 *     description: |
 *       [FR-23, NFR-03] 권한 키마다 역할별 허용 여부(allowed), 기본값(default), 기본값과 다른지(overridden)를 보여 준다.
 *       서버의 모든 권한 검사(RBAC 미들웨어)가 이 값을 쓴다.
 *     responses:
 *       200: { $ref: '#/components/responses/PermissionMatrixOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/permissions', requirePermission('admin.permissions'), ctrl.permissions);

/**
 * @openapi
 * /api/admin/permissions/{role}:
 *   put:
 *     tags: [관리자]
 *     summary: 역할별 권한 수정
 *     description: |
 *       [FR-23, NFR-03] 한 역할이 가질 권한 키 목록을 통째로 바꾼다. 기본값과 다른 것만 저장되고, RBAC 미들웨어에 바로 반영된다(다음 요청부터 적용).
 *       기본값으로 되돌리려면 매트릭스의 default가 true인 키들을 보낸다. 모르는 키는 400, Administrator에게서 admin.permissions를 빼면 409.
 *       관리 범위(BR-05)·역할 순위(BR-04) 같은 서비스 계층 검사는 그대로 적용된다.
 *     parameters:
 *       - { name: role, in: path, required: true, schema: { $ref: '#/components/schemas/Role' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [keys]
 *             properties:
 *               keys: { type: array, maxItems: 200, items: { type: string, maxLength: 80 }, example: [me.read, me.update, session.manage, reference.read, crew.read] }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/RolePermissionsOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put(
  '/permissions/:role',
  requirePermission('admin.permissions'),
  validate({ params: { role: { ...enums.role, required: true } }, body: { keys: { type: 'array', required: true, max: 200, items: { type: 'string', max: 80 } }, reason: fields.reason } }),
  ctrl.setRolePermissions,
);

/**
 * @openapi
 * /api/admin/settings:
 *   get:
 *     tags: [관리자]
 *     summary: 운영 설정 조회
 *     description: |
 *       [FR-23] 평가 수정 기한, 평가 작성 기한, 로그인 실패 잠금 기준, 반환 연체 기준, 장기 점검 기준의 지금 값·기본값·허용 범위·마지막 변경을 보여 준다.
 *     responses:
 *       200: { $ref: '#/components/responses/SettingList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   put:
 *     tags: [관리자]
 *     summary: 운영 설정 변경
 *     description: |
 *       [FR-23] 보낸 항목만 바꾸고 바로 반영한다(예: 평가 수정 기한은 새로 작성하는 평가부터). 모르는 항목·범위를 벗어난 값은 400, 바뀐 값이 없으면 409.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: object
 *                 additionalProperties: { type: integer }
 *                 example: { evaluationEditDays: 10, loginLockThreshold: 3 }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/SettingList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/settings', requirePermission('admin.settings'), ctrl.settings);
router.put('/settings', requirePermission('admin.settings'), validate({ body: { settings: { type: 'object', required: true }, reason: fields.reason } }), ctrl.updateSettings);

/**
 * @openapi
 * /api/admin/integrity-check:
 *   get:
 *     tags: [관리자]
 *     summary: 데이터 무결성 점검
 *     description: |
 *       [DR-01, BR-01, BR-03, BR-07] 업무 규칙이 데이터에서 실제로 지켜지는지 SQL로 다시 확인한다: 둘 이상의 정식 소속(BR-01), 자기 Crew의 정식 소속원이 아닌 책임자(DR-01),
 *       같은 시간대 끝나지 않은 업무 중복 배정(BR-03), 같은 자원의 중복 예약(BR-07), 사용 기록과 맞지 않는 자원 상태(DR-03). 정상이면 ok=true이고 모든 항목이 0건이다.
 *     responses:
 *       200: { $ref: '#/components/responses/IntegrityOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/integrity-check', requirePermission('admin.system'), ctrl.integrityCheck);

/**
 * @openapi
 * /api/admin/health:
 *   get:
 *     tags: [관리자]
 *     summary: DB 연결 상태
 *     description: |
 *       [FR-23, NFR-02] MySQL·MongoDB에 실제로 질의해 연결 여부와 응답 시간을 확인하고, 서버 가동 시간과 Node.js 버전을 보여 준다. 하나라도 안 되면 status=degraded.
 *     responses:
 *       200: { $ref: '#/components/responses/HealthOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/health', requirePermission('admin.system'), ctrl.health);

module.exports = router;
