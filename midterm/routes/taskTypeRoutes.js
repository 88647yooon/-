// 업무 유형 API (API 목록표 단계 3: #56~#59)
const express = require('express');
const ctrl = require('../controllers/taskController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const typeParams = { params: { typeId: fields.id } };
const typeFields = { name: { type: 'string', required: true, max: 50 }, description: { type: 'string', nullable: true, max: 300 } };

/**
 * @openapi
 * /api/task-types:
 *   post:
 *     tags: [업무 유형]
 *     summary: 업무 유형 등록
 *     description: |
 *       [FR-07] 업무를 분류하는 유형을 등록한다. 이름은 겹칠 수 없다(409 DUPLICATE). Underboss·Boss만 할 수 있다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50, example: 경호 }
 *               description: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       201: { $ref: '#/components/responses/TaskTypeOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 유형]
 *     summary: 업무 유형 목록
 *     description: |
 *       [FR-07] 업무 유형을 이름순으로 돌려준다. 유형마다 그 유형을 쓰는 업무 수(taskCount)를 함께 보여 준다.
 *     responses:
 *       200: { $ref: '#/components/responses/TaskTypeList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', requirePermission('taskType.manage'), validate({ body: typeFields }), ctrl.createType);
router.get('/', requirePermission('taskType.read'), ctrl.listTypes);

/**
 * @openapi
 * /api/task-types/{typeId}:
 *   patch:
 *     tags: [업무 유형]
 *     summary: 업무 유형 수정
 *     description: |
 *       [FR-07] 업무 유형의 이름·설명을 수정한다. Underboss·Boss만 할 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TypeId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string, maxLength: 50 }
 *               description: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskTypeOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [업무 유형]
 *     summary: 사용되지 않은 업무 유형 삭제
 *     description: |
 *       [FR-07] 이 유형을 쓰는 업무가 없을 때만 삭제한다. 쓰는 업무가 있으면 409 CONFLICT다.
 *     parameters:
 *       - $ref: '#/components/parameters/TypeId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:typeId',
  requirePermission('taskType.manage'),
  validate({ ...typeParams, body: { ...typeFields, name: { ...typeFields.name, required: false } }, bodyMinFields: 1 }),
  ctrl.updateType,
);
router.delete('/:typeId', requirePermission('taskType.manage'), validate(typeParams), ctrl.removeType);

module.exports = router;
