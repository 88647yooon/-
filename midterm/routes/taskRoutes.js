// 업무 API (API 목록표 단계 3: #60~#67, #69~#70, #92~#93, #102~#109). 자원과 관련된 부분은 단계 4에서 같은 API에 더했다.
const express = require('express');
const ctrl = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');
const { idParam } = require('../middlewares/validate');

const router = express.Router();
router.use(authenticate);

const taskParams = { params: { taskId: fields.id } };

/**
 * @openapi
 * /api/tasks:
 *   post:
 *     tags: [업무]
 *     summary: 업무 등록
 *     description: |
 *       [FR-07] 새 업무를 계획 상태로 등록한다. 제목·일정(시작·종료)은 필수이고 종료는 시작보다 늦어야 한다.
 *       Capo는 자신이 책임자인 Crew의 업무만 만들 수 있으며(다른 Crew면 403 BR-05) crewId를 생략하면 그 Crew로 정해진다.
 *       Underboss·Boss는 crewId 없이 조직 업무를 만들 수도 있다. 해산된 Crew에는 만들 수 없다(409).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startAt, endAt]
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 100, example: 강북 야간 순찰 }
 *               description: { type: string, nullable: true, maxLength: 2000 }
 *               typeId: { type: integer, minimum: 1, example: 1 }
 *               crewId: { type: integer, minimum: 1, example: 1, description: '담당 Crew (Capo는 생략 가능)' }
 *               priority: { allOf: [{ $ref: '#/components/schemas/TaskPriority' }], default: MEDIUM }
 *               location: { type: string, nullable: true, maxLength: 100, example: 강북 일대 }
 *               startAt: { type: string, format: date-time, example: '2026-10-25T20:00:00+09:00' }
 *               endAt: { type: string, format: date-time, example: '2026-10-25T23:00:00+09:00' }
 *               requiredHeadcount: { type: integer, minimum: 1, maximum: 100, example: 2 }
 *               leaderRequired: { type: boolean, default: false }
 *     responses:
 *       201: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무]
 *     summary: 업무 목록 (탐색)
 *     description: |
 *       [FR-07, FR-12, AR-03] 기간·Crew·상태·중요도·유형·담당 구성원으로 업무를 탐색한다. 기간(from·to)은 그 기간과 일정이 겹치는 업무를 찾는다.
 *       Capo는 자신이 책임자인 Crew의 업무만 보고(다른 crewId를 주면 403 BR-05), Underboss·Boss는 전체를 본다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskStatusFilter'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: typeId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/PriorityFilter'
 *       - { name: assigneeId, in: query, description: 이 구성원이 현재 참여 중인 업무만, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: q, in: query, description: 제목·설명·장소 검색어, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/TaskSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/',
  requirePermission('task.create'),
  validate({
    body: {
      title: fields.title, description: fields.longText, typeId: fields.optionalId, crewId: fields.optionalId,
      priority: { ...enums.taskPriority, default: 'MEDIUM' }, location: fields.location,
      startAt: fields.datetime, endAt: fields.datetime,
      requiredHeadcount: fields.headcount, leaderRequired: { type: 'boolean', default: false },
    },
  }),
  ctrl.create,
);
router.get(
  '/',
  requirePermission('task.list'),
  validate({
    query: {
      status: enums.taskStatus, crewId: fields.optionalId, typeId: fields.optionalId, priority: enums.taskPriority,
      assigneeId: fields.optionalId, from: fields.optionalDatetime, to: fields.optionalDatetime, q: fields.q, ...paging('tasks'),
    },
  }),
  ctrl.list,
);

/**
 * @openapi
 * /api/tasks/{taskId}:
 *   get:
 *     tags: [업무]
 *     summary: 업무 상세
 *     description: |
 *       [FR-07] 업무 정보와 현재 참여자 수, 완료 결과를 보여 준다. 이 업무의 참여자, 담당 Crew 책임자, Underboss·Boss만 볼 수 있다.
 *       viewerRelation은 보는 사람이 관리자(manager)인지 참여자(participant)인지다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [업무]
 *     summary: 업무 기본 정보 수정
 *     description: |
 *       [FR-07, BR-06] 제목·설명·유형·중요도·장소를 수정한다. 일정은 일정 변경 API로 바꾼다.
 *       완료된 업무는 수정할 수 없고(409 BR-06), 취소된 업무도 수정할 수 없다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 100 }
 *               description: { type: string, nullable: true, maxLength: 2000 }
 *               typeId: { type: integer, minimum: 1, example: 1 }
 *               priority: { $ref: '#/components/schemas/TaskPriority' }
 *               location: { type: string, nullable: true, maxLength: 100 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [업무]
 *     summary: 계획 상태 업무 삭제
 *     description: |
 *       [FR-07] 아직 시작하지 않은(계획 상태) 업무만 삭제한다. 배정·지시사항·체크리스트·선행 관계·자원 할당도 함께 지워진다.
 *       시작된 업무나 자원 사용 기록이 있는 업무는 409 CONFLICT이며 취소해야 한다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:taskId', requirePermission('task.read'), validate(taskParams), ctrl.get);
router.patch(
  '/:taskId',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    body: {
      title: { ...fields.title, required: false }, description: fields.longText, typeId: fields.optionalId,
      priority: enums.taskPriority, location: fields.location,
    },
    bodyMinFields: 1,
  }),
  ctrl.update,
);
router.delete('/:taskId', requirePermission('task.manage'), validate(taskParams), ctrl.remove);

/**
 * @openapi
 * /api/tasks/{taskId}/schedule:
 *   patch:
 *     tags: [업무]
 *     summary: 업무 일정 변경
 *     description: |
 *       [FR-07, BR-03, BR-07] 일정을 바꾼다. 현재 참여자 모두에 대해 새 시간대에 다른 업무와 겹치는지 다시 검사하고,
 *       한 명이라도 겹치면 409 BR-03과 겹치는 참여자·업무 목록(details.conflicts)을 돌려준다.
 *       할당 자원은 새 일정에 맞춰 옮긴다(업무 일정 전체를 쓰던 할당은 새 일정 전체로, 일부만 쓰던 할당은 시작 시각이 옮겨진 만큼 옮기고 새 일정 밖은 잘라 낸다).
 *       옮긴 시간대에 다른 예약이 있는 자원이 있으면 409 BR-07과 자원별 겹치는 예약(details.conflicts)을 돌려주고 아무것도 바꾸지 않는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startAt, endAt]
 *             properties:
 *               startAt: { type: string, format: date-time }
 *               endAt: { type: string, format: date-time }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/schedule',
  requirePermission('task.manage'),
  validate({ ...taskParams, body: { startAt: fields.datetime, endAt: fields.datetime, reason: fields.reason } }),
  ctrl.changeSchedule,
);

/**
 * @openapi
 * /api/tasks/{taskId}/status:
 *   patch:
 *     tags: [업무]
 *     summary: 업무 진행 상태 변경
 *     description: |
 *       [FR-10] 계획 → 진행, 진행 → 보류, 보류 → 진행으로 바꾼다. 완료는 완료 처리 API, 취소는 취소 API로 한다.
 *       시작(진행)하려면 배정된 구성원이 한 명 이상 있고 선행 업무가 모두 끝나 있어야 한다(409).
 *       변경 내용은 상태 변경 이력에 남는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [IN_PROGRESS, ON_HOLD] }
 *               reason: { type: string, maxLength: 500, example: 인원 집합 완료 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/status',
  requirePermission('task.manage'),
  validate({ ...taskParams, body: { status: { type: 'string', required: true, enum: ['IN_PROGRESS', 'ON_HOLD'] }, reason: fields.reason } }),
  ctrl.changeStatus,
);

/**
 * @openapi
 * /api/tasks/{taskId}/duplicate:
 *   post:
 *     tags: [업무]
 *     summary: 업무 복제
 *     description: |
 *       [FR-07] 기존 업무를 새 일정으로 복제해 계획 상태의 새 업무를 만든다. 정보·필요 인원·체크리스트 항목을 복사하고, 배정은 복사하지 않는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startAt, endAt]
 *             properties:
 *               startAt: { type: string, format: date-time }
 *               endAt: { type: string, format: date-time }
 *               title: { type: string, minLength: 1, maxLength: 100, description: 생략하면 원본 제목 }
 *     responses:
 *       201: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:taskId/duplicate',
  requirePermission('task.manage'),
  validate({ ...taskParams, body: { startAt: fields.datetime, endAt: fields.datetime, title: { ...fields.title, required: false } } }),
  ctrl.duplicate,
);

/**
 * @openapi
 * /api/tasks/{taskId}/requirements:
 *   put:
 *     tags: [업무]
 *     summary: 필요 인원·자원 설정
 *     description: |
 *       [FR-07, FR-17] 업무에 필요한 인원 수, 리더 필요 여부, 필요 자원 분류별 수량을 한 번에 설정한다(전체 교체, resources를 생략하면 필요 자원 없음).
 *       시작 준비 상태 확인과 자원 할당 후보의 분류 제한에 쓰인다. 없는 분류는 404, 같은 분류가 두 번 있으면 400.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [requiredHeadcount]
 *             properties:
 *               requiredHeadcount: { type: integer, minimum: 1, maximum: 100, example: 3 }
 *               leaderRequired: { type: boolean, default: false }
 *               resources:
 *                 type: array
 *                 maxItems: 20
 *                 default: []
 *                 items:
 *                   type: object
 *                   required: [categoryId, quantity]
 *                   properties:
 *                     categoryId: { type: integer, minimum: 1, example: 1 }
 *                     quantity: { type: integer, minimum: 1, maximum: 20, example: 1 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskRequirementsOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무]
 *     summary: 필요 조건 조회
 *     description: |
 *       [FR-07, FR-17] 업무의 필요 인원 수, 리더 필요 여부, 필요 자원 분류별 수량과 지금 할당된 수(충족 여부)를 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskRequirementsOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:taskId/requirements',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    body: {
      requiredHeadcount: { ...fields.headcount, required: true },
      leaderRequired: { type: 'boolean', default: false },
      resources: {
        type: 'array', max: 20, default: [],
        items: { type: 'object', fields: { categoryId: idParam, quantity: { type: 'integer', required: true, min: 1, max: 20 } } },
      },
    },
  }),
  ctrl.setRequirements,
);
router.get('/:taskId/requirements', requirePermission('task.read'), validate(taskParams), ctrl.getRequirements);

/**
 * @openapi
 * /api/tasks/{taskId}/readiness:
 *   get:
 *     tags: [업무]
 *     summary: 시작 준비 상태
 *     description: |
 *       [FR-07, FR-17] 업무를 지금 시작할 수 있는지 확인한다: 필요 인원 충족, 배정 응답 대기 인원, 리더 지정, 선행 업무 완료 여부.
 *       필요 자원 분류별 할당 수, 할당된 자원 가운데 점검중·사용불가인 것도 확인한다(resources).
 *       문제가 있으면 issues에 이유를 담고 ready=false다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/ReadinessOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:taskId/readiness', requirePermission('task.manage'), validate(taskParams), ctrl.readiness);

/**
 * @openapi
 * /api/tasks/{taskId}/cancel:
 *   post:
 *     tags: [업무]
 *     summary: 업무 취소
 *     description: |
 *       [FR-10, BR-06] 업무를 취소한다. 한 트랜잭션 안에서 현재 참여자의 배정과 할당 자원을 모두 해제하고(이유: 업무 취소) 대기 중인 교대 요청을 취소한다.
 *       이미 사용 중인 자원은 반환할 때까지 사용 기록이 남는다(업무 자원 일괄 반환 API로 돌려받는다).
 *       사유는 필수다. 완료된 업무는 취소할 수 없다(409 BR-06).
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500, example: 일정 변경으로 취소 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:taskId/cancel', requirePermission('task.manage'), validate({ ...taskParams, body: { reason: fields.requiredReason } }), ctrl.cancel);

/**
 * @openapi
 * /api/tasks/{taskId}/complete:
 *   post:
 *     tags: [업무 진행·결과]
 *     summary: 업무 완료 처리
 *     description: |
 *       [FR-10, FR-11, BR-06] 진행 중인 업무를 완료한다. 성과·결과 요약과 참여자별 참여 기록을 한 트랜잭션으로 남기고 핵심 결과를 잠근다.
 *       participations에 없는 현재 참여자는 배정을 수락했으면 참여, 아니면 불참으로 기록된다.
 *       이미 완료된 업무는 409 BR-06, 진행 중이 아닌 업무는 409 CONFLICT다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [outcome, summary]
 *             properties:
 *               outcome: { $ref: '#/components/schemas/TaskOutcome' }
 *               summary: { type: string, maxLength: 2000, example: 예정 경로 순찰 완료. 특이사항 없음. }
 *               participations:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [userId, participated]
 *                   properties:
 *                     userId: { type: integer, minimum: 1, example: 8 }
 *                     participated: { type: boolean }
 *                     contribution: { type: string, maxLength: 1000 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResultOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:taskId/complete',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    body: {
      outcome: { ...enums.taskOutcome, required: true },
      summary: { type: 'string', required: true, max: 2000 },
      participations: {
        type: 'array', max: 100,
        items: { type: 'object', fields: { userId: fields.id, participated: { type: 'boolean', required: true }, contribution: { type: 'string', max: 1000 } } },
      },
    },
  }),
  ctrl.complete,
);

/**
 * @openapi
 * /api/tasks/{taskId}/result:
 *   get:
 *     tags: [업무 진행·결과]
 *     summary: 완료 결과 조회
 *     description: |
 *       [FR-11] 완료된 업무의 성과·결과 요약, 참여자별 참여 기록, Underboss·Boss의 정정 이력을 돌려준다. 완료되지 않은 업무는 409다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResultOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   patch:
 *     tags: [업무 진행·결과]
 *     summary: 완료 결과 정정
 *     description: |
 *       [FR-11, BR-06] 완료된 업무의 성과·결과 요약을 정정한다. Underboss·Boss만 할 수 있고 사유가 필수다.
 *       참여자나 담당 Crew 책임자 같은 일반 구성원이 정정하려 하면 409 BR-06이다. 변경 전후와 사유는 정정 이력에 남는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               outcome: { $ref: '#/components/schemas/TaskOutcome' }
 *               summary: { type: string, maxLength: 2000 }
 *               reason: { type: string, maxLength: 500, example: 보고 누락분 반영 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResultOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get('/:taskId/result', requirePermission('task.read'), validate(taskParams), ctrl.getResult);
router.patch(
  '/:taskId/result',
  requirePermission('task.read'),
  validate({ ...taskParams, body: { outcome: enums.taskOutcome, summary: { type: 'string', max: 2000 }, reason: fields.requiredReason } }),
  ctrl.correctResult,
);

/**
 * @openapi
 * /api/tasks/{taskId}/participations/{userId}:
 *   put:
 *     tags: [업무 진행·결과]
 *     summary: 참여자별 참여 기록
 *     description: |
 *       [FR-11, BR-06] 이 업무에 배정되었던 구성원의 실제 참여 여부와 기여 내용을 기록한다. 진행·보류 중에는 담당 Crew 책임자와 Underboss·Boss가 남긴다.
 *       완료된 뒤에는 핵심 결과로 잠겨 Underboss·Boss만 사유(reason)를 남기고 정정할 수 있다(그 밖에는 409 BR-06).
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participated]
 *             properties:
 *               participated: { type: boolean }
 *               contribution: { type: string, maxLength: 1000, example: 경로 안내를 맡음 }
 *               reason: { type: string, maxLength: 500, description: 완료된 업무를 정정할 때 필수 }
 *     responses:
 *       200: { $ref: '#/components/responses/ParticipationOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put(
  '/:taskId/participations/:userId',
  requirePermission('task.manage'),
  validate({
    params: { taskId: fields.id, userId: fields.id },
    body: { participated: { type: 'boolean', required: true }, contribution: { type: 'string', max: 1000 }, reason: fields.reason },
  }),
  ctrl.recordParticipation,
);

/**
 * @openapi
 * /api/tasks/{taskId}/participations:
 *   get:
 *     tags: [업무 진행·결과]
 *     summary: 참여 기록 목록
 *     description: |
 *       [FR-11] 참여자별 실제 참여 여부와 기여 내용, 기록한 사람을 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/ParticipationList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:taskId/participations', requirePermission('task.read'), validate(taskParams), ctrl.listParticipations);

/**
 * @openapi
 * /api/tasks/{taskId}/progress:
 *   post:
 *     tags: [업무 진행·결과]
 *     summary: 진행 보고
 *     description: |
 *       [FR-10, BR-06] 참여자가 진척률(0~100)과 메모를 보고한다. 진행 중인 업무에만 남길 수 있고(완료된 업무는 409 BR-06), 기록은 MongoDB에 쌓인다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [percent]
 *             properties:
 *               percent: { type: integer, minimum: 0, maximum: 100, example: 50 }
 *               note: { type: string, maxLength: 1000, example: 절반 구간 순찰 완료 }
 *     responses:
 *       201: { $ref: '#/components/responses/ProgressOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 진행·결과]
 *     summary: 진행 보고 목록
 *     description: |
 *       [FR-10] 진행 보고를 최근 순으로 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ProgressPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:taskId/progress',
  requirePermission('task.participate'),
  validate({ ...taskParams, body: { percent: { type: 'integer', required: true, min: 0, max: 100 }, note: { type: 'string', max: 1000 } } }),
  ctrl.reportProgress,
);
router.get('/:taskId/progress', requirePermission('task.read'), validate({ ...taskParams, query: paging() }), ctrl.listProgress);

/**
 * @openapi
 * /api/tasks/{taskId}/status-history:
 *   get:
 *     tags: [업무 진행·결과]
 *     summary: 업무 상태 변경 이력
 *     description: |
 *       [FR-10] 업무가 등록된 뒤 상태가 어떻게 바뀌었는지(이전·이후 상태, 바꾼 사람, 사유, 시각)를 시간순으로 돌려준다. MongoDB 활동 기록에서 읽는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/StatusHistoryPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:taskId/status-history', requirePermission('task.read'), validate({ ...taskParams, query: paging() }), ctrl.statusHistory);

module.exports = router;
