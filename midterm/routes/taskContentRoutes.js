// 업무 세부 정보 API: 지시사항·체크리스트·선행 업무 (API 목록표 단계 3: #71~#82)
const express = require('express');
const ctrl = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const taskParams = { params: { taskId: fields.id } };
const noteParams = { params: { taskId: fields.id, noteId: fields.id } };
const itemParams = { params: { taskId: fields.id, itemId: fields.id } };
const noteContent = { type: 'string', required: true, min: 1, max: 2000 };
const itemContent = { type: 'string', required: true, min: 1, max: 300 };

/**
 * @openapi
 * /api/tasks/{taskId}/notes:
 *   post:
 *     tags: [업무 세부 정보]
 *     summary: 지시사항 등록
 *     description: |
 *       [FR-09] 참여자에게 전할 지시사항을 남긴다. targetUserId를 주면 그 참여자에게만 보이고, 없으면 참여자 전체에게 보인다.
 *       대상은 이 업무의 현재 참여자여야 한다(409).
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 2000, example: 출발 30분 전에 집합합니다. }
 *               targetUserId: { type: integer, description: 생략하면 참여자 전체 }
 *     responses:
 *       201: { $ref: '#/components/responses/NoteOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 세부 정보]
 *     summary: 지시사항 목록
 *     description: |
 *       [FR-09] 지시사항을 작성 순으로 돌려준다. 참여자는 참여자 전체 대상이거나 자신에게 온 지시사항만 보고, 관리자는 모두 본다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/NoteList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:taskId/notes',
  requirePermission('task.manage'),
  validate({ ...taskParams, body: { content: noteContent, targetUserId: fields.optionalId } }),
  ctrl.createNote,
);
router.get('/:taskId/notes', requirePermission('task.read'), validate(taskParams), ctrl.listNotes);

/**
 * @openapi
 * /api/tasks/{taskId}/notes/{noteId}:
 *   patch:
 *     tags: [업무 세부 정보]
 *     summary: 지시사항 수정
 *     description: |
 *       [FR-09] 지시사항 내용을 수정한다. 작성자만 할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/NoteId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { $ref: '#/components/responses/NoteOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [업무 세부 정보]
 *     summary: 지시사항 삭제
 *     description: |
 *       [FR-09] 지시사항을 삭제한다. 작성자나 Underboss·Boss만 할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/NoteId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:taskId/notes/:noteId', requirePermission('task.manage'), validate({ ...noteParams, body: { content: noteContent } }), ctrl.updateNote);
router.delete('/:taskId/notes/:noteId', requirePermission('task.manage'), validate(noteParams), ctrl.deleteNote);

/**
 * @openapi
 * /api/tasks/{taskId}/checklist:
 *   post:
 *     tags: [업무 세부 정보]
 *     summary: 체크리스트 항목 추가
 *     description: |
 *       [FR-07] 업무를 수행하며 확인할 항목을 목록 맨 뒤에 추가한다. 완료된 업무는 409 BR-06이다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 300, example: 무전기 지급 }
 *     responses:
 *       201: { $ref: '#/components/responses/ChecklistItemOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 세부 정보]
 *     summary: 체크리스트와 완료 현황
 *     description: |
 *       [FR-09, FR-10] 체크리스트 항목과 완료 표시(누가, 언제)를 순서대로 돌려준다. 전체·완료 항목 수도 함께 보여 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/ChecklistOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:taskId/checklist', requirePermission('task.manage'), validate({ ...taskParams, body: { content: itemContent } }), ctrl.addItem);
router.get('/:taskId/checklist', requirePermission('task.read'), validate(taskParams), ctrl.listItems);

/**
 * @openapi
 * /api/tasks/{taskId}/checklist/{itemId}:
 *   patch:
 *     tags: [업무 세부 정보]
 *     summary: 체크리스트 항목 수정
 *     description: |
 *       [FR-07] 항목의 내용이나 순서(position)를 바꾼다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/ItemId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               content: { type: string, maxLength: 300 }
 *               position: { type: integer, minimum: 1 }
 *     responses:
 *       200: { $ref: '#/components/responses/ChecklistItemOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [업무 세부 정보]
 *     summary: 체크리스트 항목 삭제
 *     description: |
 *       [FR-07] 항목을 삭제한다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/ItemId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/checklist/:itemId',
  requirePermission('task.manage'),
  validate({ ...itemParams, body: { content: { ...itemContent, required: false }, position: { type: 'integer', min: 1 } }, bodyMinFields: 1 }),
  ctrl.updateItem,
);
router.delete('/:taskId/checklist/:itemId', requirePermission('task.manage'), validate(itemParams), ctrl.removeItem);

/**
 * @openapi
 * /api/tasks/{taskId}/checklist/{itemId}/check:
 *   post:
 *     tags: [업무 세부 정보]
 *     summary: 체크리스트 항목 완료 표시
 *     description: |
 *       [FR-10] 참여자나 관리자가 항목을 완료로 표시한다. 누가 언제 표시했는지 남는다. done=false로 보내면 완료 표시를 지운다.
 *       완료된 업무는 409 BR-06이다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/ItemId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               done: { type: boolean, default: true }
 *     responses:
 *       200: { $ref: '#/components/responses/ChecklistItemOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:taskId/checklist/:itemId/check',
  requirePermission('task.participate'),
  validate({ ...itemParams, body: { done: { type: 'boolean', default: true } } }),
  ctrl.checkItem,
);

/**
 * @openapi
 * /api/tasks/{taskId}/dependencies:
 *   post:
 *     tags: [업무 세부 정보]
 *     summary: 선행 업무 지정
 *     description: |
 *       [FR-07] 이 업무보다 먼저 끝나야 하는 업무를 지정한다. 선행 업무가 끝나지 않으면 이 업무를 시작할 수 없다.
 *       자기 자신(400), 취소된 업무(409), 이미 지정된 업무(409), 순환 관계가 생기는 지정(409)은 거부한다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dependsOnId]
 *             properties:
 *               dependsOnId: { type: integer, example: 2 }
 *     responses:
 *       201: { $ref: '#/components/responses/DependenciesOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 세부 정보]
 *     summary: 선행·후행 업무 목록
 *     description: |
 *       [FR-07] 이 업무가 기다리는 선행 업무와 이 업무를 기다리는 후행 업무, 아직 끝나지 않은 선행 업무 수를 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/DependenciesOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:taskId/dependencies', requirePermission('task.manage'), validate({ ...taskParams, body: { dependsOnId: fields.id } }), ctrl.addDependency);
router.get('/:taskId/dependencies', requirePermission('task.read'), validate(taskParams), ctrl.listDependencies);

/**
 * @openapi
 * /api/tasks/{taskId}/dependencies/{dependsOnId}:
 *   delete:
 *     tags: [업무 세부 정보]
 *     summary: 선행 관계 삭제
 *     description: |
 *       [FR-07] 선행 업무 지정을 해제한다. 지정되지 않은 관계면 404다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/DependsOnId'
 *     responses:
 *       200: { $ref: '#/components/responses/DependenciesOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.delete(
  '/:taskId/dependencies/:dependsOnId',
  requirePermission('task.manage'),
  validate({ params: { taskId: fields.id, dependsOnId: fields.id } }),
  ctrl.removeDependency,
);

module.exports = router;
