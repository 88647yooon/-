// 평가 API (API 목록표 단계 5: #158~#170). 여러 경로(/tasks, /evaluations, /users, /evaluation-criteria, /evaluation-appeals)를 쓰므로 /api에 바로 붙인다.
// 고정 경로(/evaluations/pending)를 파라미터 경로(/evaluations/:evaluationId)보다 먼저 등록한다.
const express = require('express');
const ctrl = require('../controllers/recordController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/tasks', '/evaluations', '/users', '/evaluation-criteria', '/evaluation-appeals'], authenticate);

const evaluationParams = { params: { evaluationId: fields.docId } };

/**
 * @openapi
 * /api/tasks/{taskId}/evaluations:
 *   post:
 *     tags: [평가]
 *     summary: 완료 업무 참여자 평가
 *     description: |
 *       [FR-18] 완료된 업무에 실제로 참여한 구성원을 평가 항목별 점수(1~5)와 의견으로 평가한다. 점수는 가중치로 평균을 낸다(totalScore).
 *       완료되지 않은 업무는 409, 완료 후 30일이 지났으면 409, 참여 기록이 없는 구성원은 409, 본인은 403이다.
 *       평가자는 한 업무에서 같은 대상자를 한 번만 평가한다(409 DUPLICATE). 담당 Crew 책임자(아니면 403 BR-05)와 Underboss·Boss가 평가한다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [evaluateeId, scores]
 *             properties:
 *               evaluateeId: { type: integer, minimum: 1, example: 10 }
 *               scores:
 *                 type: object
 *                 description: '평가 항목 키별 점수 (모든 항목 필수, 1~5 정수). 항목은 GET /api/evaluation-criteria'
 *                 additionalProperties: { type: integer, minimum: 1, maximum: 5 }
 *                 example: { diligence: 5, performance: 4, teamwork: 4, discretion: 5 }
 *               comment: { type: string, nullable: true, maxLength: 1000, example: 보고서를 꼼꼼하게 정리했습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/EvaluationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [평가]
 *     summary: 업무별 평가 목록
 *     description: |
 *       [FR-11, FR-19] 한 업무의 평가를 작성순으로 돌려준다. 철회된 평가는 includeWithdrawn=true일 때만 보인다.
 *       담당 Crew 책임자와 Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - { name: includeWithdrawn, in: query, schema: { type: boolean, default: false } }
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/tasks/:taskId/evaluations',
  requirePermission('evaluation.write'),
  validate({ params: { taskId: fields.id }, body: { evaluateeId: { ...fields.optionalId, required: true }, scores: { ...fields.scores, required: true }, comment: fields.comment } }),
  ctrl.createEvaluation,
);
router.get(
  '/tasks/:taskId/evaluations',
  requirePermission('evaluation.write'),
  validate({ params: { taskId: fields.id }, query: { includeWithdrawn: { type: 'boolean', default: false } } }),
  ctrl.taskEvaluations,
);

/**
 * @openapi
 * /api/evaluations:
 *   get:
 *     tags: [평가]
 *     summary: 평가 검색
 *     description: |
 *       [FR-19, FR-21, AR-03] 기간(작성 시각)·Crew·평가자·대상자·업무·상태·최저 점수·검색어(업무 제목·의견)로 평가를 찾는다. Underboss·Boss만 쓸 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: evaluatorId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: evaluateeId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: taskId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: status, in: query, schema: { $ref: '#/components/schemas/EvaluationStatus' } }
 *       - { name: minScore, in: query, schema: { type: number, minimum: 1, maximum: 5 } }
 *       - { name: q, in: query, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/EvaluationSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/evaluations',
  requirePermission('evaluation.search'),
  validate({
    query: {
      from: fields.optionalDatetime, to: fields.optionalDatetime, crewId: fields.optionalId, evaluatorId: fields.optionalId, evaluateeId: fields.optionalId,
      taskId: fields.optionalId, status: enums.evaluationStatus, minScore: { type: 'number', min: 1, max: 5 }, q: fields.q, ...paging('evaluations'),
    },
  }),
  ctrl.searchEvaluations,
);

/**
 * @openapi
 * /api/evaluations/pending:
 *   get:
 *     tags: [평가]
 *     summary: 내가 작성해야 할 평가
 *     description: |
 *       [FR-18] 최근 30일 안에 완료된 내 관리 업무(Capo는 자기 Crew 업무, Underboss·Boss는 전체)에 실제로 참여했는데 내가 아직 평가하지 않은 구성원 목록이다.
 *       deadline은 평가할 수 있는 마지막 시각이다.
 *     responses:
 *       200: { $ref: '#/components/responses/PendingEvaluationList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/evaluations/pending', requirePermission('evaluation.write'), ctrl.pendingEvaluations);

/**
 * @openapi
 * /api/evaluations/{evaluationId}:
 *   get:
 *     tags: [평가]
 *     summary: 평가 상세
 *     description: |
 *       [FR-19, BR-10] 항목별 점수, 의견, 수정·정정 이력(변경 전후, 사유), 이의 제기를 보여 준다. 대상자, 평가자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/EvaluationId'
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationDetailOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [평가]
 *     summary: 평가 수정
 *     description: |
 *       [FR-18, BR-10] 평가자 본인이 작성 후 7일 안에 점수·의견을 고친다(그 뒤에는 409). 점수를 고치면 작성 당시 항목을 모두 다시 보내야 한다.
 *       변경 전후와 사유가 수정 이력(revisions)에 남는다. 철회된 평가나 바뀐 내용이 없으면 409.
 *     parameters:
 *       - $ref: '#/components/parameters/EvaluationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               scores: { type: object, additionalProperties: { type: integer, minimum: 1, maximum: 5 } }
 *               comment: { type: string, nullable: true, maxLength: 1000 }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationDetailOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [평가]
 *     summary: 평가 철회
 *     description: |
 *       [FR-18, BR-10] Underboss·Boss가 사유를 남기고 평가를 철회한다. 문서는 지우지 않고 철회 상태·처리자·사유를 남기며 평판 집계에서 빠진다.
 *       처리 대기 중인 이의 제기는 함께 끝난다. 본인이 받은 평가는 철회할 수 없고(403), 이미 철회된 평가는 409.
 *     parameters:
 *       - $ref: '#/components/parameters/EvaluationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 다른 업무와 혼동해 작성된 평가 }
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationDetailOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/evaluations/:evaluationId', requirePermission('evaluation.read'), validate(evaluationParams), ctrl.getEvaluation);
router.patch(
  '/evaluations/:evaluationId',
  requirePermission('evaluation.write'),
  validate({ ...evaluationParams, body: { scores: fields.scores, comment: fields.comment, reason: fields.reason }, bodyMinFields: 1 }),
  ctrl.updateEvaluation,
);
router.delete(
  '/evaluations/:evaluationId',
  requirePermission('evaluation.withdraw'),
  validate({ ...evaluationParams, body: { reason: fields.requiredReason } }),
  ctrl.withdrawEvaluation,
);

/**
 * @openapi
 * /api/evaluations/{evaluationId}/appeals:
 *   post:
 *     tags: [평가]
 *     summary: 받은 평가에 이의 제기
 *     description: |
 *       [FR-18, BR-10] 평가 대상자 본인이 이의를 제기한다. 한 평가에 처리 대기 중인 이의는 하나뿐이다(409 DUPLICATE). 철회된 평가는 409.
 *       Underboss·Boss가 기각하거나 평가를 정정한다.
 *     parameters:
 *       - $ref: '#/components/parameters/EvaluationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 협업 점수가 실제 역할보다 낮게 매겨졌습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/AppealOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/evaluations/:evaluationId/appeals',
  requirePermission('evaluation.appeal'),
  validate({ ...evaluationParams, body: { reason: fields.requiredReason } }),
  ctrl.appeal,
);

/**
 * @openapi
 * /api/users/{userId}/evaluations:
 *   get:
 *     tags: [평가]
 *     summary: 구성원이 받은 평가 이력
 *     description: |
 *       [FR-19] 구성원이 받은 평가를 최근 순으로 돌려준다. 철회된 평가는 includeWithdrawn=true일 때만.
 *       본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - { name: includeWithdrawn, in: query, schema: { type: boolean, default: false } }
 *       - $ref: '#/components/parameters/EvaluationSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/EvaluationPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/users/:userId/evaluations',
  requirePermission('evaluation.read'),
  validate({ params: { userId: fields.id }, query: { includeWithdrawn: { type: 'boolean', default: false }, ...paging('evaluations') } }),
  ctrl.userEvaluations,
);

/**
 * @openapi
 * /api/evaluation-criteria:
 *   get:
 *     tags: [평가]
 *     summary: 평가 항목 목록
 *     description: |
 *       [FR-18] 지금 쓰는 평가 항목과 가중치를 순서대로 돌려준다. 점수는 항목마다 1~5 정수다.
 *     responses:
 *       200: { $ref: '#/components/responses/CriterionList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   put:
 *     tags: [평가]
 *     summary: 평가 항목·가중치 설정
 *     description: |
 *       [FR-18] 평가 항목을 통째로 바꾼다(보낸 순서가 표시 순서). 빠진 항목은 쓰지 않음으로 바뀌고, 이미 작성된 평가는 작성 당시 항목과 가중치를 그대로 가진다.
 *       항목 키가 겹치면 400. Boss와 Administrator만 할 수 있다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [criteria]
 *             properties:
 *               criteria:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required: [key, label, weight]
 *                   properties:
 *                     key: { type: string, pattern: '^[a-z][a-z0-9_]{1,29}$', example: diligence }
 *                     label: { type: string, maxLength: 30, example: 성실성 }
 *                     description: { type: string, maxLength: 200 }
 *                     weight: { type: integer, minimum: 1, maximum: 10, example: 1 }
 *     responses:
 *       200: { $ref: '#/components/responses/CriterionList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/evaluation-criteria', requirePermission('evaluationCriteria.read'), ctrl.listCriteria);
router.put(
  '/evaluation-criteria',
  requirePermission('evaluationCriteria.manage'),
  validate({
    body: {
      criteria: {
        type: 'array', required: true, min: 1, max: 10,
        items: {
          type: 'object',
          fields: {
            key: { type: 'string', required: true, pattern: /^[a-z][a-z0-9_]{1,29}$/, patternMessage: '영문 소문자로 시작하는 2~30자(소문자, 숫자, _)여야 합니다.' },
            label: { type: 'string', required: true, max: 30 },
            description: { type: 'string', max: 200 },
            weight: { type: 'integer', required: true, min: 1, max: 10 },
          },
        },
      },
    },
  }),
  ctrl.replaceCriteria,
);

/**
 * @openapi
 * /api/evaluation-appeals:
 *   get:
 *     tags: [평가]
 *     summary: 이의 제기 목록
 *     description: |
 *       [FR-19] 이의 제기를 처리 대기 중인 것부터 최근 순으로 돌려준다. Underboss·Boss는 전체(appellantId로 거를 수 있음), 그 밖에는 본인이 낸 것만 보인다.
 *     parameters:
 *       - { name: status, in: query, schema: { $ref: '#/components/schemas/AppealStatus' } }
 *       - { name: appellantId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/AppealPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/evaluation-appeals',
  requirePermission('evaluation.appeal'),
  validate({ query: { status: enums.appealStatus, appellantId: fields.optionalId, ...paging() } }),
  ctrl.listAppeals,
);

/**
 * @openapi
 * /api/evaluation-appeals/{appealId}/resolve:
 *   post:
 *     tags: [평가]
 *     summary: 이의 제기 처리
 *     description: |
 *       [FR-18, BR-10] Underboss·Boss가 이의를 기각(DISMISS)하거나 평가를 정정(CORRECT)한다. 정정하면 점수(작성 당시 항목 전부)나 의견을 고치고
 *       변경 전후와 처리 사유가 평가의 정정 이력에 남는다. 이의를 낸 본인과 그 평가의 평가자는 처리할 수 없다(403). 이미 처리된 이의는 409.
 *     parameters:
 *       - $ref: '#/components/parameters/AppealId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision, note]
 *             properties:
 *               decision: { type: string, enum: [DISMISS, CORRECT] }
 *               note: { type: string, maxLength: 500, example: 참여 기록을 다시 확인해 협업 점수를 고칩니다. }
 *               scores: { type: object, additionalProperties: { type: integer, minimum: 1, maximum: 5 } }
 *               comment: { type: string, nullable: true, maxLength: 1000 }
 *     responses:
 *       200: { $ref: '#/components/responses/AppealResolvedOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/evaluation-appeals/:appealId/resolve',
  requirePermission('evaluation.appeal.resolve'),
  validate({
    params: { appealId: fields.docId },
    body: { decision: { ...enums.appealDecision, required: true }, note: fields.requiredReason, scores: fields.scores, comment: fields.comment },
  }),
  ctrl.resolveAppeal,
);

module.exports = router;
