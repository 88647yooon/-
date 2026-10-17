// 업무 자원 할당 API (API 목록표 단계 4: #130~#134, #149. #135·#136은 resourceRoutes.js)
const express = require('express');
const ctrl = require('../controllers/resourceController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, fields } = require('./rules');

const router = express.Router();
router.use(authenticate);

const taskParams = { params: { taskId: fields.id } };
const allocationParams = { params: { taskId: fields.id, resourceId: fields.id } };

/**
 * @openapi
 * /api/tasks/{taskId}/resources:
 *   post:
 *     tags: [업무 자원 할당]
 *     summary: 업무에 자원 할당
 *     description: |
 *       [FR-17, BR-07, BR-08] 업무에 자원을 할당한다. 시간대를 생략하면 업무 일정 전체이고, 지정하면 업무 일정 안이어야 한다(400).
 *       점검중·사용불가 자원은 409 BR-08, 같은 시간대에 다른 업무 할당·구성원 배정·사용 중인 기록이 있으면 409 BR-07(details.conflicts)이다.
 *       Capo는 자신이 책임자인 Crew의 업무에만 할당한다(403 BR-05). 완료된 업무는 409 BR-06.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceId]
 *             properties:
 *               resourceId: { type: integer, example: 1 }
 *               startAt: { type: string, format: date-time, description: '생략하면 업무 시작 시각' }
 *               endAt: { type: string, format: date-time, description: '생략하면 업무 종료 시각' }
 *               note: { type: string, maxLength: 200 }
 *     responses:
 *       201: { $ref: '#/components/responses/TaskResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [업무 자원 할당]
 *     summary: 업무에 할당된 자원 목록
 *     description: |
 *       [FR-17] 업무에 할당된 자원과 할당 시간대, 지금 사용 중인지(누가 쓰는지)를 보여 준다. 참여자, 담당 Crew 책임자, Underboss·Boss가 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResourceList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:taskId/resources',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    body: { resourceId: { ...fields.optionalId, required: true }, startAt: fields.optionalDatetime, endAt: fields.optionalDatetime, note: fields.note },
  }),
  ctrl.allocateToTask,
);
router.get('/:taskId/resources', requirePermission('task.read'), validate(taskParams), ctrl.listTaskResources);

/**
 * @openapi
 * /api/tasks/{taskId}/resources/return:
 *   post:
 *     tags: [자원 사용·반환]
 *     summary: 업무 자원 일괄 반환
 *     description: |
 *       [FR-15] 이 업무의 할당으로 사용 중인 자원을 한 트랜잭션으로 모두 정상 반환하고 사용가능으로 돌린다. 업무가 끝났거나 취소된 뒤에도 쓸 수 있다.
 *       사용 중인 자원이 없으면 409. 담당 Crew 책임자나 Underboss·Boss가 처리한다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, maxLength: 500, example: 업무 종료 후 회수 }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResourceReturnOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/:taskId/resources/return', requirePermission('task.manage'), validate({ ...taskParams, body: { note: fields.reason } }), ctrl.returnTaskResources);

/**
 * @openapi
 * /api/tasks/{taskId}/resources/{resourceId}:
 *   patch:
 *     tags: [업무 자원 할당]
 *     summary: 할당 시간대 조정
 *     description: |
 *       [FR-17, BR-07, BR-08] 업무 일정 안에서 할당 시간대를 바꾼다(생략한 쪽은 그대로). 새 시간대로 다른 예약과의 겹침(409 BR-07)과
 *       자원 상태(409 BR-08)를 다시 검사한다. 사용 중인 할당은 바꿀 수 없다(409, 반환 예정 연장을 쓴다).
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/ResourceId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               startAt: { type: string, format: date-time }
 *               endAt: { type: string, format: date-time }
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResourceOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [업무 자원 할당]
 *     summary: 할당 해제
 *     description: |
 *       [FR-17] 업무의 자원 할당을 해제한다. 기록은 지우지 않고 해제 시각과 이유를 남긴다. 사용 중이면 먼저 반환해야 한다(409).
 *       남은 할당 목록을 돌려준다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - $ref: '#/components/parameters/ResourceId'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskResourceList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.patch(
  '/:taskId/resources/:resourceId',
  requirePermission('task.manage'),
  validate({ ...allocationParams, body: { startAt: fields.optionalDatetime, endAt: fields.optionalDatetime }, bodyMinFields: 1 }),
  ctrl.adjustTaskResource,
);
router.delete('/:taskId/resources/:resourceId', requirePermission('task.manage'), validate(allocationParams), ctrl.releaseTaskResource);

/**
 * @openapi
 * /api/tasks/{taskId}/resource-candidates:
 *   get:
 *     tags: [업무 자원 할당]
 *     summary: 업무 자원 할당 후보
 *     description: |
 *       [FR-14, FR-17, BR-07, BR-08] 이 업무에 할당할 수 있는 자원: 정상 상태(점검중·사용불가 제외), 업무 시간대에 다른 예약이 없음, 아직 할당되지 않음.
 *       categoryId를 주면 그 분류만, 생략하면 업무의 필요 자원 분류(있으면)로 좁힌다. matchRequirements=false면 분류를 제한하지 않는다.
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *       - { name: categoryId, in: query, schema: { type: integer, minimum: 1 } }
 *       - { name: matchRequirements, in: query, schema: { type: boolean, default: true } }
 *       - { name: location, in: query, schema: { type: string, maxLength: 100 } }
 *       - { name: q, in: query, schema: { type: string, maxLength: 50 } }
 *       - $ref: '#/components/parameters/ResourceSort'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/ResourcePage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.get(
  '/:taskId/resource-candidates',
  requirePermission('task.manage'),
  validate({
    ...taskParams,
    query: {
      categoryId: fields.optionalId, matchRequirements: { type: 'boolean', default: true }, location: { type: 'string', max: 100 }, q: fields.q,
      ...paging('resources'),
    },
  }),
  ctrl.taskCandidates,
);

module.exports = router;
