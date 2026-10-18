// 통합 검색·저장 검색 API (API 목록표 단계 6: #180~#184). /search 와 /saved-searches 두 경로를 쓰므로 /api에 바로 붙인다.
const express = require('express');
const ctrl = require('../controllers/opsController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { enums, fields } = require('./rules');

const router = express.Router();
router.use(['/search', '/saved-searches'], authenticate);

const q = { type: 'string', required: true, min: 1, max: 50 };
const perType = { page: { type: 'integer', min: 1, default: 1 }, size: { type: 'integer', min: 1, max: 50, default: 5 } };
const searchParams = { params: { searchId: fields.docId } };

/**
 * @openapi
 * /api/search:
 *   get:
 *     tags: [검색]
 *     summary: 통합 검색
 *     description: |
 *       [FR-21, NFR-04] 검색어 하나로 구성원(이름·아이디·별명), Crew(이름·설명), 업무(제목·설명·장소), 자원(이름·관리 번호·설명·위치)을 한 번에 찾는다.
 *       결과는 종류마다 요청자의 권한 범위 안에서만 나온다: 구성원은 구성원 목록 권한이 있을 때(Associate는 restricted), 업무는 Capo는 자기 Crew 업무·
 *       Underboss·Boss는 전체·그 밖에는 내가 참여 중인 업무(scope=participant), 자원은 Capo 이상은 전체·Soldier는 내 역할로 이용할 수 있는 자원(scope=usable).
 *       types로 종류를 고르고, page·size(기본 5)는 종류마다 적용한다.
 *     parameters:
 *       - { name: q, in: query, required: true, schema: { type: string, minLength: 1, maxLength: 50 }, example: 강북 }
 *       - { name: types, in: query, description: '쉼표로 구분 (users, crews, tasks, resources). 생략하면 전부', style: form, explode: false, schema: { type: array, maxItems: 4, items: { type: string, enum: [users, crews, tasks, resources] }, example: [tasks, resources] } }
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: size, in: query, description: 종류마다 보여 줄 수, schema: { type: integer, minimum: 1, maximum: 50, default: 5 } }
 *     responses:
 *       200: { $ref: '#/components/responses/SearchOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/search', requirePermission('search.use'), validate({ query: { q, types: enums.searchTypes, ...perType } }), ctrl.search);

/**
 * @openapi
 * /api/saved-searches:
 *   post:
 *     tags: [검색]
 *     summary: 검색 조건 저장
 *     description: |
 *       [FR-21, NFR-04] 자주 쓰는 검색어와 종류를 이름을 붙여 저장한다. 한 사람당 20개까지(넘으면 409), 이름은 겹칠 수 없다(409 DUPLICATE).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, q]
 *             properties:
 *               name: { type: string, maxLength: 50, example: 강북 업무·자원 }
 *               q: { type: string, minLength: 1, maxLength: 50, example: 강북 }
 *               types: { type: array, maxItems: 4, items: { type: string, enum: [users, crews, tasks, resources] }, example: [tasks, resources] }
 *     responses:
 *       201: { $ref: '#/components/responses/SavedSearchOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [검색]
 *     summary: 내 저장 검색 목록
 *     description: |
 *       [FR-21] 내가 저장한 검색 조건을 최근 실행 순으로 돌려준다 (실행 횟수, 마지막 실행 시각).
 *     responses:
 *       200: { $ref: '#/components/responses/SavedSearchList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post(
  '/saved-searches',
  requirePermission('search.use'),
  validate({ body: { name: { type: 'string', required: true, max: 50 }, q, types: enums.searchTypes } }),
  ctrl.saveSearch,
);
router.get('/saved-searches', requirePermission('search.use'), ctrl.listSavedSearches);

/**
 * @openapi
 * /api/saved-searches/{searchId}/results:
 *   get:
 *     tags: [검색]
 *     summary: 저장된 조건으로 검색 실행
 *     description: |
 *       [FR-21, NFR-04] 저장한 조건으로 통합 검색을 실행한다. 실행하는 지금의 권한 범위로 찾고, 실행 횟수·시각을 남긴다. 본인이 저장한 검색만 쓸 수 있다(403).
 *     parameters:
 *       - $ref: '#/components/parameters/SearchId'
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: size, in: query, schema: { type: integer, minimum: 1, maximum: 50, default: 5 } }
 *     responses:
 *       200: { $ref: '#/components/responses/SavedSearchResultOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/saved-searches/:searchId/results', requirePermission('search.use'), validate({ ...searchParams, query: perType }), ctrl.runSavedSearch);

/**
 * @openapi
 * /api/saved-searches/{searchId}:
 *   delete:
 *     tags: [검색]
 *     summary: 저장 검색 삭제
 *     description: |
 *       [FR-21] 저장한 검색 조건을 지운다. 본인이 저장한 검색만 지울 수 있다(403).
 *     parameters:
 *       - $ref: '#/components/parameters/SearchId'
 *     responses:
 *       200: { $ref: '#/components/responses/DeletedDoc' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/saved-searches/:searchId', requirePermission('search.use'), validate(searchParams), ctrl.removeSavedSearch);

module.exports = router;
