// 감사 기록 API (API 목록표 단계 5: #176~#179). 고정 경로(/audit-logs/export)를 파라미터 경로(/audit-logs/:logId)보다 먼저 등록한다.
const express = require('express');
const ctrl = require('../controllers/recordController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/audit-logs', '/security-events'], authenticate);

const logQuery = {
  actorId: fields.optionalId, action: enums.action, targetEntity: { type: 'string', max: 30 }, targetId: { type: 'string', max: 30 },
  from: fields.optionalDatetime, to: fields.optionalDatetime, q: fields.q,
};

/**
 * @openapi
 * /api/audit-logs:
 *   get:
 *     tags: [감사 기록]
 *     summary: 감사 기록 검색
 *     description: |
 *       [FR-20, FR-23] 단계 1부터 모든 상태 변경·관리 활동이 남긴 기록을 행위자·행위 코드·대상 유형·대상 ID·기간·검색어(대상 이름, 사유, 행위자 아이디)로 찾는다.
 *       기본은 최근 순이다. 변경 전후 값은 상세에서 본다. Boss와 Administrator만 볼 수 있다.
 *     parameters:
 *       - { name: actorId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: action, in: query, description: '행위 코드 (예: USER_ROLE_CHANGED)', schema: { type: string } }
 *       - { name: targetEntity, in: query, description: '대상 유형 (user, crew, task, resource, evaluation, reputationEvent 등)', schema: { type: string } }
 *       - { name: targetId, in: query, schema: { type: string } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: q, in: query, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/AuditSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ActivityLogPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/audit-logs', requirePermission('audit.read'), validate({ query: { ...logQuery, ...paging('auditLogs') } }), ctrl.auditLogs);

/**
 * @openapi
 * /api/audit-logs/export:
 *   get:
 *     tags: [감사 기록]
 *     summary: 감사 기록 CSV 내보내기
 *     description: |
 *       [FR-20] 검색 조건에 맞는 기록을 CSV 파일(UTF-8, 엑셀용 BOM, 최대 5000건)로 내려 준다. 공통 JSON 응답 형식의 예외로 파일을 그대로 돌려주며,
 *       X-Total-Count 헤더에 담긴 건수가 있다. Administrator만 쓸 수 있다.
 *     parameters:
 *       - { name: actorId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: action, in: query, schema: { type: string } }
 *       - { name: targetEntity, in: query, schema: { type: string } }
 *       - { name: targetId, in: query, schema: { type: string } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: q, in: query, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/AuditSort'
 *     responses:
 *       200:
 *         description: CSV 파일
 *         headers:
 *           X-Total-Count: { description: 내보낸 건수, schema: { type: integer } }
 *         content:
 *           text/csv:
 *             schema: { type: string, example: "시각(KST),행위 코드,행위,행위자,...\r\n2026-10-20 09:00:00,USER_ROLE_CHANGED,역할 변경,boss,..." }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/audit-logs/export', requirePermission('audit.export'), validate({ query: { ...logQuery, sort: paging('auditLogs').sort } }), ctrl.exportAuditLogs);

/**
 * @openapi
 * /api/audit-logs/{logId}:
 *   get:
 *     tags: [감사 기록]
 *     summary: 감사 기록 상세
 *     description: |
 *       [FR-20] 한 기록의 행위자, 대상, 관련 대상, 변경 전후 값, 사유, IP를 보여 준다. Boss와 Administrator만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/LogId'
 *     responses:
 *       200: { $ref: '#/components/responses/ActivityLogOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/audit-logs/:logId', requirePermission('audit.read'), validate({ params: { logId: fields.docId } }), ctrl.auditLog);

/**
 * @openapi
 * /api/security-events:
 *   get:
 *     tags: [감사 기록]
 *     summary: 권한 거부 기록
 *     description: |
 *       [BR-09, NFR-03] 로그인한 사용자가 권한 없는 API·화면에 접근해 거부(403)된 기록을 최근 순으로 돌려준다 (사용자, 방법, 경로, 이유, IP).
 *       userId·기간·경로 검색어로 거를 수 있다. Administrator만 볼 수 있다.
 *     parameters:
 *       - { name: userId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: q, in: query, description: 경로 검색어, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/SecurityEventPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/security-events',
  requirePermission('security.read'),
  validate({ query: { userId: fields.optionalId, from: fields.optionalDatetime, to: fields.optionalDatetime, q: fields.q, ...paging() } }),
  ctrl.securityEvents,
);

module.exports = router;
