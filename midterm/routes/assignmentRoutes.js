// 업무 배정 API (API 목록표 단계 3: #83~#90, #97. #91 가용 여부는 userRoutes.js)
const express = require('express');
const ctrl = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const taskParams = { params: { taskId: fields.id } };
const assigneeParams = { params: { taskId: fields.id, userId: fields.id } };

/**
 * @openapi
 * /api/tasks/{taskId}/assignees:
 *   post:
 *     tags: [업무 배정]
 *     summary: 구성원 배정
 *     description: |
 *       [FR-08, BR-02, BR-03] 업무에 구성원을 배정한다(한 번에 최대 20명, 리더는 한 명). 새 리더를 정하면 기존 리더는 일반 참여자가 된다.
 *       정지·탈퇴 구성원은 409 BR-02, 같은 시간대에 끝나지 않은 다른 업무에 배정된 구성원은 409 BR-03이다.
 *       Capo는 자신이 책임자인 Crew의 소속원만 배정할 수 있다(403 BR-05).
 *       모든 사람을 먼저 검사해 한 명이라도 안 되면 아무도 배정하지 않는다. 한 명만 보냈으면 그 오류를 그대로, 여러 명이면 409 BULK_REJECTED와 행별 오류를 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignees]
 *             properties:
 *               assignees:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [userId]
 *                   properties:
 *                     userId: { type: integer }
 *                     role: { allOf: [{ $ref: '#/components/schemas/AssigneeRole' }], default: MEMBER }
 *             example:
 *               assignees:
 *                 - { userId: 8, role: LEADER }
 *                 - { userId: 9 }
 *     responses:
 *       201: { $ref: '#/components/responses/AssigneeList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 배정]
 *     summary: 현재 참여자 목록
 *     description: |
 *       [FR-08] 업무의 현재 참여자와 업무 내 역할(리더·일반), 배정 응답(수락·응답 대기)을 돌려준다. 리더가 먼저 온다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneeList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:taskId/assignees',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    body: {
      assignees: {
        type: 'array', required: true, min: 1, max: 20,
        items: { type: 'object', fields: { userId: fields.id, role: { ...enums.assigneeRole, default: 'MEMBER' } } },
      },
    },
  }),
  ctrl.assign,
);
router.get('/:taskId/assignees', requirePermission('task.read'), validate(taskParams), ctrl.listAssignees);

/**
 * @openapi
 * /api/tasks/{taskId}/assignees/{userId}:
 *   patch:
 *     tags: [업무 배정]
 *     summary: 업무 내 역할 변경
 *     description: |
 *       [FR-08] 참여자의 업무 내 역할(리더·일반)을 바꾼다. 리더는 한 명이라 새 리더를 정하면 기존 리더는 일반 참여자가 된다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { $ref: '#/components/schemas/AssigneeRole' }
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneeList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [업무 배정]
 *     summary: 배정 해제
 *     description: |
 *       [FR-08] 참여자의 배정을 해제한다. 배정 기록은 지우지 않고 해제 시각과 이유가 배정 이력에 남는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneeList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/assignees/:userId',
  requirePermission('task.manage'),
  validate({ ...assigneeParams, body: { role: { ...enums.assigneeRole, required: true } } }),
  ctrl.changeAssigneeRole,
);
router.delete('/:taskId/assignees/:userId', requirePermission('task.manage'), validate(assigneeParams), ctrl.unassign);

/**
 * @openapi
 * /api/tasks/{taskId}/assignees/{userId}/replacement:
 *   post:
 *     tags: [업무 배정]
 *     summary: 참여자 교체
 *     description: |
 *       [FR-08, BR-02, BR-03] 참여자를 다른 구성원으로 바꾼다. 기존 배정 해제(이유: 교체)와 새 배정을 한 트랜잭션으로 처리하고,
 *       새 구성원에게 배정 규칙을 그대로 적용한다(정지·탈퇴면 409 BR-02, 시간이 겹치면 409 BR-03). 업무 내 역할은 이어받는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newUserId]
 *             properties:
 *               newUserId: { type: integer, example: 12 }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneeList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:taskId/assignees/:userId/replacement',
  requirePermission('task.manage'),
  validate({ ...assigneeParams, body: { newUserId: fields.id, reason: fields.reason } }),
  ctrl.replace,
);

/**
 * @openapi
 * /api/tasks/{taskId}/assignees/{userId}/response:
 *   patch:
 *     tags: [업무 배정]
 *     summary: 배정 수락·거절
 *     description: |
 *       [FR-09] 배정된 본인이 배정을 수락하거나 거절한다(다른 사람의 배정이면 403). 거절하면 배정이 해제되어(이유: 배정 거절) 그 시간대가 비워진다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [response]
 *             properties:
 *               response: { type: string, enum: [ACCEPTED, DECLINED] }
 *               note: { type: string, maxLength: 500, example: 참여하겠습니다. }
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneeOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/assignees/:userId/response',
  requirePermission('task.participate'),
  validate({ ...assigneeParams, body: { response: { type: 'string', required: true, enum: ['ACCEPTED', 'DECLINED'] }, note: fields.reason } }),
  ctrl.respond,
);

/**
 * @openapi
 * /api/tasks/{taskId}/assignee-candidates:
 *   get:
 *     tags: [업무 배정]
 *     summary: 배정 후보
 *     description: |
 *       [BR-02, BR-03] 이 업무에 지금 배정할 수 있는 구성원: 활동중이고, 업무를 맡을 수 있는 역할이며, 아직 배정되지 않았고, 업무 시간대에 다른 업무가 없는 사람.
 *       Crew 업무는 기본으로 그 Crew의 소속원만 보여 준다. Underboss·Boss는 scope=all로 전체를 볼 수 있고, Capo는 항상 자기 Crew만 본다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - { name: scope, in: query, schema: { type: string, enum: [crew, all], default: crew } }
 *       - { name: role, in: query, schema: { $ref: '#/components/schemas/AssignableRole' } }
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
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get(
  '/:taskId/assignee-candidates',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    query: { scope: { type: 'string', enum: ['crew', 'all'], default: 'crew' }, role: enums.assignableRole, q: fields.q, ...paging('candidates') },
  }),
  ctrl.candidates,
);

/**
 * @openapi
 * /api/tasks/{taskId}/assignment-history:
 *   get:
 *     tags: [업무 배정]
 *     summary: 배정 이력
 *     description: |
 *       [FR-08, FR-10] 이 업무의 모든 배정 기록(현재·끝난 배정)을 최근 순으로 돌려준다. 배정한 사람, 해제 이유(해제·교체·교대·거절·업무 취소·탈퇴),
 *       교체·교대로 넘겨받은 사람을 함께 보여 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/AssigneePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:taskId/assignment-history', requirePermission('task.manage'), validate({ ...taskParams, query: paging() }), ctrl.history);

/**
 * @openapi
 * /api/tasks/{taskId}/swap-requests:
 *   post:
 *     tags: [업무 교대 요청]
 *     summary: 업무 교대 요청
 *     description: |
 *       [FR-08, BR-02, BR-03] 이 업무의 참여자가 자기 배정을 다른 구성원에게 넘기도록 요청한다. 받을 사람이 지금 배정될 수 있는지 미리 검사한다
 *       (정지·탈퇴면 409 BR-02, 시간이 겹치면 409 BR-03). 담당 Crew 책임자나 Underboss·Boss가 승인하면 배정이 바뀐다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [toUserId]
 *             properties:
 *               toUserId: { type: integer, example: 12 }
 *               reason: { type: string, maxLength: 500, example: 개인 사정으로 참여가 어렵습니다. }
 *     responses:
 *       201: { $ref: '#/components/responses/SwapOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:taskId/swap-requests',
  requirePermission('task.swap'),
  validate({ ...taskParams, body: { toUserId: fields.id, reason: fields.reason } }),
  ctrl.createSwap,
);

module.exports = router;
