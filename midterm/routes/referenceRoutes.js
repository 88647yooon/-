// 기준 정보 API (API 목록표 단계 2: #22~#23, 단계 3: #68, 단계 4: #123)
const express = require('express');
const userController = require('../controllers/userController');
const taskController = require('../controllers/taskController');
const resourceController = require('../controllers/resourceController');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');

const router = express.Router();

/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [기준 정보]
 *     summary: 역할 목록과 계층 순위
 *     description: |
 *       [FR-03] 역할 목록을 운영 계층 순위 오름차순으로 돌려준다. Administrator는 운영 계층 밖이라 순위가 없다(null).
 *       canJoinCrew는 그 역할이 Crew에 소속될 수 있는지다 (Associate·Soldier·Capo만 가능).
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       role: { $ref: '#/components/schemas/Role' }
 *                       label: { type: string, example: Capo }
 *                       rank: { type: integer, nullable: true, example: 3 }
 *                       description: { type: string }
 *                       canJoinCrew: { type: boolean }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/roles', authenticate, requirePermission('reference.read'), userController.roles);

/**
 * @openapi
 * /api/member-statuses:
 *   get:
 *     tags: [기준 정보]
 *     summary: 구성원 상태 목록과 허용 전이
 *     description: |
 *       [FR-04] 구성원 상태와 각 상태에서 바꿀 수 있는 다음 상태(next)를 돌려준다.
 *       정지·탈퇴 상태는 로그인할 수 없고(canSignIn), 활동중 상태만 Crew에 새로 편성될 수 있다(canJoinCrew).
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { $ref: '#/components/schemas/MemberStatus' }
 *                       label: { type: string, example: 활동중 }
 *                       next:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             status: { $ref: '#/components/schemas/MemberStatus' }
 *                             label: { type: string }
 *                       canSignIn: { type: boolean }
 *                       canJoinCrew: { type: boolean }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/member-statuses', authenticate, requirePermission('reference.read'), userController.memberStatuses);

/**
 * @openapi
 * /api/task-statuses:
 *   get:
 *     tags: [업무]
 *     summary: 업무 상태 목록과 허용 전이
 *     description: |
 *       [FR-10] 업무 상태와 각 상태에서 바꿀 수 있는 다음 상태, 그 전환에 쓰는 API(via)를 돌려준다. 완료·취소는 마지막 상태(terminal)다.
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { $ref: '#/components/schemas/TaskStatus' }
 *                       label: { type: string, example: 진행 }
 *                       terminal: { type: boolean }
 *                       next:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             status: { $ref: '#/components/schemas/TaskStatus' }
 *                             label: { type: string }
 *                             via: { type: string, example: 상태 변경 API }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/task-statuses', authenticate, requirePermission('reference.read'), taskController.statuses);

/**
 * @openapi
 * /api/resource-statuses:
 *   get:
 *     tags: [자원]
 *     summary: 자원 상태 목록과 배정 가능 여부
 *     description: |
 *       [FR-16, BR-08] 자원 상태마다 새로 배정할 수 있는지(assignable), 그 상태가 되는 경로(setBy), 상태 변경 API로 바꿀 수 있는 다음 상태(next)를 돌려준다.
 *       점검중·사용불가는 배정할 수 없다.
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { $ref: '#/components/schemas/ResourceStatus' }
 *                       label: { type: string, example: 점검중 }
 *                       assignable: { type: boolean, example: false }
 *                       setBy: { type: string, example: '상태 변경 API, 점검 등록, 고장 신고, 손상 반환' }
 *                       next:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             status: { $ref: '#/components/schemas/ResourceStatus' }
 *                             label: { type: string }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/resource-statuses', authenticate, requirePermission('reference.read'), resourceController.statuses);

module.exports = router;
