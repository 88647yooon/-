// 운영 현황 통계 API (API 목록표 단계 6: #185~#198). /stats, /crews/:crewId/workload, /me/dashboard를 쓰므로 /api에 바로 붙인다.
// 기간(from·to)을 생략하면 API마다 정한 기본 기간을 쓰고, 묶음 단위(interval)는 한국 시간 기준 일·주·월이다.
const express = require('express');
const ctrl = require('../controllers/opsController');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { paging, enums, fields } = require('./rules');

const router = express.Router();
router.use(['/stats', '/crews', '/me'], authenticate);

const period = { from: fields.optionalDatetime, to: fields.optionalDatetime };
const read = requirePermission('stats.read');

/**
 * @openapi
 * /api/stats/overview:
 *   get:
 *     tags: [운영 현황]
 *     summary: 조직 전체 요약
 *     description: |
 *       [FR-22] 상태별 구성원 수(Administrator 제외), 활성·해산 Crew 수, 상태별 업무 수와 진행 중 업무 수, 상태별 자원 수와 자원 가용률(사용가능 / 전체),
 *       배정 가능률(사용가능·사용중 / 전체), 유효한 평가 수와 평균을 한 번에 돌려준다. SQL 집계와 MongoDB aggregate로 낸다. Underboss·Boss만 볼 수 있다.
 *     responses:
 *       200: { $ref: '#/components/responses/StatsOverviewOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/overview', read, ctrl.overview);

/**
 * @openapi
 * /api/stats/members:
 *   get:
 *     tags: [운영 현황]
 *     summary: 역할·상태별 구성원 분포
 *     description: |
 *       [FR-22] 역할 × 상태별 구성원 수와 합계를 돌려준다. crewId를 주면 그 Crew의 현재 소속원(정식·임시)만 센다.
 *     parameters:
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { $ref: '#/components/responses/StatsMembersOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/stats/members', read, validate({ query: { crewId: fields.optionalId } }), ctrl.members);

/**
 * @openapi
 * /api/stats/crews:
 *   get:
 *     tags: [운영 현황]
 *     summary: Crew별 비교
 *     description: |
 *       [FR-22] Crew마다 정식·임시 소속원 수, 기간 안에 일정이 시작하는 업무 수(진행·완료·취소), 완료율(완료 / (완료 + 취소)), 기간 안 평가 평균(MongoDB)을 비교한다.
 *       기본 기간은 지금 기준 앞뒤 30일이다. status로 활성·해산 Crew만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/CrewStatusFilter'
 *     responses:
 *       200: { $ref: '#/components/responses/StatsCrewsOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/crews', read, validate({ query: { ...period, status: enums.crewStatus } }), ctrl.crews);

/**
 * @openapi
 * /api/stats/regions:
 *   get:
 *     tags: [운영 현황]
 *     summary: 지역별 Crew·구성원 수
 *     description: |
 *       [FR-22] 지역마다 Crew 수(전체·활성), 현재 소속원 수(여러 Crew에 소속돼도 한 번), 업무 수를 돌려준다.
 *     responses:
 *       200: { $ref: '#/components/responses/StatsRegionsList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/regions', read, ctrl.regions);

/**
 * @openapi
 * /api/stats/tasks:
 *   get:
 *     tags: [운영 현황]
 *     summary: 기간별 업무 상태 추이
 *     description: |
 *       [FR-22] 일정 시작 시각을 일·주·월 단위로 묶어 묶음마다 업무 수를 지금 상태별로 센다. 업무가 없는 묶음도 0으로 채운다.
 *       기본 기간은 지금 기준 앞뒤 30일, 기본 단위는 일이다. 묶음이 400개를 넘으면 400.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Interval'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { $ref: '#/components/responses/StatsTaskTrendOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/tasks', read, validate({ query: { ...period, interval: enums.interval, crewId: fields.optionalId } }), ctrl.taskTrend);

/**
 * @openapi
 * /api/stats/tasks/lead-time:
 *   get:
 *     tags: [운영 현황]
 *     summary: 중요도별 업무 평균 소요 시간
 *     description: |
 *       [FR-22] 기간 안에 완료된 업무를 중요도별로 묶어 완료 수, 평균 소요 시간(실제 시작 → 완료), 평균 계획 시간(일정), 평균 지연 시간(일정 종료 뒤 완료까지)을 낸다.
 *       기본 기간은 최근 90일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { $ref: '#/components/responses/StatsLeadTimeOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/tasks/lead-time', read, validate({ query: { ...period, crewId: fields.optionalId } }), ctrl.leadTimes);

/**
 * @openapi
 * /api/stats/resources:
 *   get:
 *     tags: [운영 현황]
 *     summary: 자원 상태 분포와 가동률
 *     description: |
 *       [FR-22, FR-16] 분류별·전체 자원 상태 분포와 기간 안 사용 시간, 가동률(사용 시간 / (자원 수 × 기간 시간))을 돌려준다. 기본 기간은 최근 30일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *     responses:
 *       200: { $ref: '#/components/responses/StatsResourcesOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/resources', read, validate({ query: period }), ctrl.resources);

/**
 * @openapi
 * /api/stats/resources/usage-ranking:
 *   get:
 *     tags: [운영 현황]
 *     summary: 자원별 사용 순위
 *     description: |
 *       [FR-22, FR-15] 기간과 겹치는 사용이 있는 자원을 사용 시간이 많은 순으로 돌려준다 (기간 안 사용 시작 횟수, 사용 시간). 기본 기간은 최근 30일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - { name: categoryId, in: query, schema: { type: integer, minimum: 1 } }
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Size'
 *     responses:
 *       200: { $ref: '#/components/responses/UsageRankingPage' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/resources/usage-ranking', read, validate({ query: { ...period, categoryId: fields.optionalId, ...paging() } }), ctrl.usageRanking);

/**
 * @openapi
 * /api/stats/evaluations:
 *   get:
 *     tags: [운영 현황]
 *     summary: 기간·Crew별 평균 평가 추이
 *     description: |
 *       [FR-22, FR-18] 유효한 평가를 작성 시각으로 일·주·월(기본 월) 단위로 묶은 평균 점수와 건수, Crew별 평균을 MongoDB aggregate로 낸다.
 *       crewId로 한 Crew의 업무 평가만 볼 수 있다. 기본 기간은 최근 180일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Interval'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { $ref: '#/components/responses/StatsEvaluationsOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/evaluations', read, validate({ query: { ...period, interval: enums.interval, crewId: fields.optionalId } }), ctrl.evaluations);

/**
 * @openapi
 * /api/stats/membership-changes:
 *   get:
 *     tags: [운영 현황]
 *     summary: 기간별 가입·이동·탈퇴 추이
 *     description: |
 *       [FR-22, BR-10] Crew 소속 기록을 일·주·월 단위로 묶어 새 소속(편성·신청 승인·책임자 지정), 이동(다른 Crew로 이동·병합), 제외(제외·해산), 탈퇴로 끝난 소속 수를 센다.
 *       소속 유형 변경은 세지 않는다. crewId로 한 Crew만 볼 수 있다. 기본 기간은 최근 30일이다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Interval'
 *       - { name: crewId, in: query, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { $ref: '#/components/responses/StatsMembershipChangesOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/membership-changes', read, validate({ query: { ...period, interval: enums.interval, crewId: fields.optionalId } }), ctrl.membershipChanges);

/**
 * @openapi
 * /api/stats/admin-activity:
 *   get:
 *     tags: [운영 현황]
 *     summary: 기간별 관리 활동 건수
 *     description: |
 *       [FR-20, FR-22] 활동 기록을 일·주·월 단위로 묶어 묶음별·영역별(구성원, Crew·소속, 업무, 자원, 평가·평판, 계정·권한 관리) 건수, 많이 한 행위 10개,
 *       행위자 역할별 건수를 MongoDB aggregate로 낸다. 기본 기간은 최근 30일이다. Boss와 Administrator만 볼 수 있다.
 *     parameters:
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *       - $ref: '#/components/parameters/Interval'
 *     responses:
 *       200: { $ref: '#/components/responses/StatsAdminActivityOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/admin-activity', requirePermission('stats.adminActivity'), validate({ query: { ...period, interval: enums.interval } }), ctrl.adminActivity);

/**
 * @openapi
 * /api/stats/alerts:
 *   get:
 *     tags: [운영 현황]
 *     summary: 운영 경고
 *     description: |
 *       [FR-22, FR-15, FR-16] 지금 손봐야 할 것을 모아 보여 준다: 반환 연체 자원(운영 설정의 반환 연체 기준 적용), 일정이 지났는데 끝나지 않은 업무,
 *       장기 점검(운영 설정의 장기 점검 기준보다 오래됐거나 예정일이 지난 점검).
 *     responses:
 *       200: { $ref: '#/components/responses/StatsAlertsOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats/alerts', read, ctrl.alerts);

/**
 * @openapi
 * /api/crews/{crewId}/workload:
 *   get:
 *     tags: [운영 현황]
 *     summary: Crew 구성원별 업무량
 *     description: |
 *       [FR-12, FR-22] Crew의 현재 소속원마다 기간과 겹치는 배정 업무 수(취소 제외), 끝나지 않은 업무 수, 리더를 맡은 수, 기간 안 업무 시간, 다음 업무 시작 시각을
 *       업무 시간이 많은 순으로 돌려준다. 기본 기간은 지금부터 14일이다. 그 Crew의 책임자와 Underboss·Boss만 볼 수 있다(그 밖의 Capo는 403 BR-05).
 *     parameters:
 *       - $ref: '#/components/parameters/CrewId'
 *       - $ref: '#/components/parameters/From'
 *       - $ref: '#/components/parameters/To'
 *     responses:
 *       200: { $ref: '#/components/responses/CrewWorkloadOne' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/crews/:crewId/workload', requirePermission('crew.workload.read'), validate({ params: { crewId: fields.id }, query: period }), ctrl.crewWorkload);

/**
 * @openapi
 * /api/me/dashboard:
 *   get:
 *     tags: [내 정보]
 *     summary: 내 요약
 *     description: |
 *       [FR-02, FR-09] 로그인한 사용자의 요약: 끝나지 않은 내 업무 수와 앞으로 14일 안의 업무, 지금 사용 중인 자원과 예정된 자원 배정, 최근 받은 평가와 평판 점수,
 *       내가 처리할 일(응답하지 않은 배정, 나에게 온 교대 요청, 대기 중인 내 자원 신청, Capo 이상은 작성할 평가, Underboss·Boss는 처리할 이의 제기).
 *     responses:
 *       200: { $ref: '#/components/responses/MyDashboardOne' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me/dashboard', requirePermission('me.read'), ctrl.myDashboard);

module.exports = router;
