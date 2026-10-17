// 자원 분류 API (API 목록표 단계 4: #110~#113)
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const categoryParams = { params: { categoryId: fields.id } };
const categoryFields = { name: { type: 'string', required: true, max: 50 }, description: { type: 'string', nullable: true, max: 300 } };

/**
 * @openapi
 * /api/resource-categories:
 *   post:
 *     tags: [자원 분류]
 *     summary: 자원 분류 등록
 *     description: |
 *       [FR-13] 공용 자원을 나누는 분류(차량, 통신 장비 등)를 등록한다. 이름은 겹칠 수 없다(409 DUPLICATE). Underboss·Boss만 할 수 있다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50, example: 보호 장비 }
 *               description: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       201: { $ref: '#/components/responses/ResourceCategoryOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [자원 분류]
 *     summary: 자원 분류 목록
 *     description: |
 *       [FR-13] 자원 분류를 이름순으로 돌려준다. 분류마다 자원 수(resourceCount)와 지금 사용가능한 자원 수(availableCount)를 함께 보여 준다.
 *     responses:
 *       200: { $ref: '#/components/responses/ResourceCategoryList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', requirePermission('resourceCategory.manage'), validate({ body: categoryFields }), ctrl.createCategory);
router.get('/', requirePermission('resourceCategory.read'), ctrl.listCategories);

/**
 * @openapi
 * /api/resource-categories/{categoryId}:
 *   patch:
 *     tags: [자원 분류]
 *     summary: 자원 분류 수정
 *     description: |
 *       [FR-13] 분류의 이름·설명을 수정한다. 이름은 다른 분류와 겹칠 수 없다(409 DUPLICATE).
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryId'
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
 *       200: { $ref: '#/components/responses/ResourceCategoryOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [자원 분류]
 *     summary: 자원 분류 삭제
 *     description: |
 *       [FR-13] 자원이 하나도 없고 업무의 필요 자원으로도 지정되지 않은 분류만 삭제할 수 있다(그 밖에는 409).
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryId'
 *     responses:
 *       200: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:categoryId',
  requirePermission('resourceCategory.manage'),
  validate({ ...categoryParams, body: { name: { ...categoryFields.name, required: false }, description: categoryFields.description }, bodyMinFields: 1 }),
  ctrl.updateCategory,
);
router.delete('/:categoryId', requirePermission('resourceCategory.manage'), validate(categoryParams), ctrl.removeCategory);

module.exports = router;
