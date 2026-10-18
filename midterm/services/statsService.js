// 운영 현황 통계 (FR-22, FR-20, DR-05). 구성원·Crew·업무·자원은 SQL 집계(GROUP BY)로, 평가·관리 활동은 MongoDB aggregate로 낸다.
// 기간 묶음(일·주·월)은 한국 시간 기준이고, 값이 없는 묶음도 0으로 채워 돌려준다.
const Evaluation = require('../models/mongo/Evaluation');
const ActivityLog = require('../models/mongo/ActivityLog');
const statsModel = require('../models/sql/statsModel');
const resourceUsageModel = require('../models/sql/resourceUsageModel');
const crewModel = require('../models/sql/crewModel');
const access = require('./accessService');
const settings = require('./settingsService');
const { requireCrew } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, TASK_STATUS_INFO, TASK_PRIORITY_INFO, RESOURCE_STATUS_INFO, OPEN_TASK_STATUSES,
} = require('../config/constants');
const { actionLabel } = require('../config/actions');
const { badRequest } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');
const { periodFilter } = require('../utils/mongo');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;
const MAX_BUCKETS = 400;
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const rate = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : 0);
const countsBy = (rows, key, keys) => Object.fromEntries(keys.map((k) => [k, Number(rows.find((r) => r[key] === k)?.cnt ?? 0)]));

// 기간: 지정하지 않으면 지금 기준 앞뒤로 기본 일수만큼 (끝은 포함하지 않는다)
function periodOf({ from, to }, { pastDays = 30, futureDays = 0 } = {}) {
  const end = to ?? new Date(Date.now() + futureDays * DAY);
  const start = from ?? new Date(end.getTime() - (pastDays + futureDays) * DAY);
  if (end <= start) throw badRequest('to는 from보다 늦어야 합니다.', [{ field: 'query.to', message: 'from보다 늦은 시각을 지정하세요.' }]);
  return { from: start, to: end };
}

// ISO 주 (SQL DATE_FORMAT '%x-W%v', MongoDB '%G-W%V'와 같은 형식)
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const keyOf = (kst, interval) => {
  if (interval === 'month') return kst.toISOString().slice(0, 7);
  if (interval === 'week') return isoWeek(kst);
  return kst.toISOString().slice(0, 10);
};

// 기간 안의 모든 묶음 키 (한국 시간)
function bucketKeys(from, to, interval) {
  const keys = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    const key = keyOf(new Date(t + KST_OFFSET), interval);
    if (keys[keys.length - 1] !== key) keys.push(key);
    if (keys.length > MAX_BUCKETS) throw badRequest(`묶음이 ${MAX_BUCKETS}개를 넘습니다. 기간을 줄이거나 interval을 week·month로 바꾸세요.`, [{ field: 'query.interval', message: '더 큰 단위를 쓰세요.' }]);
  }
  const last = keyOf(new Date(to.getTime() - 1 + KST_OFFSET), interval);
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

const MONGO_FORMAT = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };

// ---------------------------------------------------------------------------

// #185 조직 전체 요약
async function overview() {
  const [members, crews, tasks, resources, [evals]] = await Promise.all([
    statsModel.memberStatusCounts(),
    statsModel.crewStatusCounts(),
    statsModel.taskStatusCounts(),
    statsModel.resourceStatusCounts(),
    Evaluation.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$totalScore' } } }]),
  ]);
  const memberByStatus = countsBy(members, 'status', Object.keys(MEMBER_STATUS_INFO));
  const taskByStatus = countsBy(tasks, 'status', Object.keys(TASK_STATUS_INFO));
  const resourceByStatus = countsBy(resources, 'status', Object.keys(RESOURCE_STATUS_INFO));
  const crewByStatus = countsBy(crews, 'status', Object.keys(CREW_STATUS_INFO));
  const resourceTotal = Object.values(resourceByStatus).reduce((a, b) => a + b, 0);
  return {
    generatedAt: new Date(),
    members: { total: Object.values(memberByStatus).reduce((a, b) => a + b, 0), byStatus: memberByStatus },
    crews: { active: crewByStatus.ACTIVE, disbanded: crewByStatus.DISBANDED },
    tasks: {
      total: Object.values(taskByStatus).reduce((a, b) => a + b, 0),
      open: OPEN_TASK_STATUSES.reduce((sum, s) => sum + taskByStatus[s], 0),
      inProgress: taskByStatus.IN_PROGRESS,
      byStatus: taskByStatus,
    },
    resources: {
      total: resourceTotal,
      byStatus: resourceByStatus,
      availabilityRate: rate(resourceByStatus.AVAILABLE, resourceTotal),
      assignableRate: rate(resourceByStatus.AVAILABLE + resourceByStatus.IN_USE, resourceTotal),
    },
    evaluations: { count: evals?.count ?? 0, averageScore: evals ? round2(evals.average) : null },
  };
}

// #186 역할·상태별 구성원 분포 (crewId를 주면 그 Crew의 현재 소속원만)
async function members({ crewId }) {
  if (crewId) await requireCrew(crewId);
  const rows = await statsModel.memberMatrix({ crewId });
  const statuses = Object.keys(MEMBER_STATUS_INFO);
  const byRole = Object.keys(ROLE_INFO).map((role) => {
    const counts = countsBy(rows.filter((r) => r.role === role), 'status', statuses);
    return { role, label: ROLE_INFO[role].label, total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts };
  });
  const byStatus = Object.fromEntries(statuses.map((s) => [s, byRole.reduce((sum, r) => sum + r.byStatus[s], 0)]));
  return { crewId: crewId ?? null, statuses: statuses.map((s) => ({ status: s, label: MEMBER_STATUS_INFO[s].label })), byRole, byStatus, total: byRole.reduce((a, r) => a + r.total, 0) };
}

// #187 Crew별 인원·업무 수·완료율 비교 (업무: 일정 시작이 기간 안, 평가 평균: MongoDB aggregate)
async function crews(query) {
  const { from, to } = periodOf(query, { pastDays: 30, futureDays: 30 });
  const [rows, evalRows] = await Promise.all([
    statsModel.crewComparison({ from, to, status: query.status }),
    Evaluation.aggregate([
      { $match: { status: 'ACTIVE', crewId: { $ne: null }, ...periodFilter('createdAt', from, to) } },
      { $group: { _id: '$crewId', average: { $avg: '$totalScore' }, count: { $sum: 1 } } },
    ]),
  ]);
  const evals = new Map(evalRows.map((r) => [r._id, r]));
  const refs = await loadRefs({ userIds: rows.map((r) => r.capo_id) });
  return {
    from, to,
    crews: rows.map((r) => {
      const finished = Number(r.completed) + Number(r.cancelled);
      return {
        crew: { id: r.id, name: r.name, region: r.region, status: r.status, statusLabel: CREW_STATUS_INFO[r.status].label },
        capo: P.userBrief(refs.users.get(r.capo_id)),
        regularCount: r.regular_count,
        temporaryCount: r.temporary_count,
        taskCount: r.task_count,
        openCount: Number(r.open_count ?? 0),
        completedCount: Number(r.completed ?? 0),
        cancelledCount: Number(r.cancelled ?? 0),
        completionRate: rate(Number(r.completed ?? 0), finished),
        evaluationAverage: evals.has(r.id) ? round2(evals.get(r.id).average) : null,
        evaluationCount: evals.get(r.id)?.count ?? 0,
      };
    }),
  };
}

// #188 지역별 Crew·구성원·업무 수
async function regions() {
  return (await statsModel.regions()).map((r) => ({ region: r.region, crews: r.crews, activeCrews: r.active_crews, members: r.members, tasks: r.tasks }));
}

// #189 기간별 업무 상태 추이 (일정 시작 기준으로 묶고 지금 상태로 나눈다)
async function taskTrend({ interval = 'day', crewId, ...query }) {
  const { from, to } = periodOf(query, { pastDays: 30, futureDays: 30 });
  const keys = bucketKeys(from, to, interval);
  const rows = await statsModel.taskTrend({ from, to, interval, crewId });
  const statuses = Object.keys(TASK_STATUS_INFO);
  return {
    from, to, interval, crewId: crewId ?? null,
    buckets: keys.map((period) => {
      const byStatus = countsBy(rows.filter((r) => r.period === period), 'status', statuses);
      return { period, total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus };
    }),
  };
}

// #190 중요도별 완료 업무 평균 소요 시간 (기간: 완료 시각)
async function leadTimes({ crewId, ...query }) {
  const { from, to } = periodOf(query, { pastDays: 90 });
  const rows = await statsModel.leadTimes({ from, to, crewId });
  return {
    from, to, crewId: crewId ?? null,
    priorities: Object.entries(TASK_PRIORITY_INFO).map(([priority, info]) => {
      const r = rows.find((x) => x.priority === priority);
      return {
        priority, label: info.label, completedCount: r?.cnt ?? 0,
        averageLeadHours: r ? round1(Number(r.lead_hours)) : null,
        averagePlannedHours: r ? round1(Number(r.planned_hours)) : null,
        averageDelayHours: r ? round1(Number(r.delay_hours)) : null,
      };
    }),
  };
}

// #191 자원 상태 분포와 가동률 (가동률 = 기간 안 사용 시간 / (자원 수 × 기간 시간))
async function resources(query) {
  const { from, to } = periodOf({ ...query, to: query.to ?? new Date() }, { pastDays: 30 });
  const { statusRows, usageRows } = await statsModel.resourcesByCategory({ from, to });
  const hours = (to - from) / HOUR;
  const used = new Map(usageRows.map((r) => [r.category_id, Number(r.used_seconds) / 3600]));
  const statuses = Object.keys(RESOURCE_STATUS_INFO);
  const categories = [...new Map(statusRows.map((r) => [r.category_id, r.name])).entries()].map(([id, name]) => {
    const byStatus = countsBy(statusRows.filter((r) => r.category_id === id && r.status), 'status', statuses);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const usedHours = used.get(id) ?? 0;
    return { category: { id, name }, total, byStatus, usedHours: round1(usedHours), utilizationRate: total ? rate(usedHours, total * hours) : 0 };
  });
  const total = categories.reduce((a, c) => a + c.total, 0);
  const usedHours = categories.reduce((a, c) => a + c.usedHours, 0);
  return {
    from, to,
    total,
    byStatus: Object.fromEntries(statuses.map((s) => [s, categories.reduce((a, c) => a + c.byStatus[s], 0)])),
    usedHours: round1(usedHours),
    utilizationRate: total ? rate(usedHours, total * hours) : 0,
    categories,
  };
}

// #192 자원별 사용 횟수·시간 순위
async function usageRanking({ categoryId, ...query }) {
  const { from, to } = periodOf({ ...query, to: query.to ?? new Date() }, { pastDays: 30 });
  const { rows, total } = await statsModel.usageRanking({ from, to, categoryId, limit: query.size, offset: (query.page - 1) * query.size });
  const refs = await loadRefs({ categoryIds: rows.map((r) => r.category_id) });
  return {
    data: rows.map((r, i) => ({
      rank: (query.page - 1) * query.size + i + 1,
      resource: P.resourceBrief({ id: r.id, code: r.code, name: r.name, categoryId: r.category_id, status: r.status, location: null }, refs),
      usageCount: Number(r.usage_count),
      usedHours: round1(Number(r.used_seconds) / 3600),
    })),
    meta: { ...pageMeta(query, total), from, to },
  };
}

// #193 기간·Crew별 평균 평가 추이 (MongoDB aggregate)
async function evaluations({ interval = 'month', crewId, ...query }) {
  const { from, to } = periodOf({ ...query, to: query.to ?? new Date() }, { pastDays: 180 });
  const keys = bucketKeys(from, to, interval);
  const match = { status: 'ACTIVE', ...(crewId && { crewId }), ...periodFilter('createdAt', from, to) };
  const [trend, byCrew] = await Promise.all([
    Evaluation.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: MONGO_FORMAT[interval], date: '$createdAt', timezone: 'Asia/Seoul' } }, average: { $avg: '$totalScore' }, count: { $sum: 1 } } },
    ]),
    Evaluation.aggregate([
      { $match: match },
      { $group: { _id: '$crewId', average: { $avg: '$totalScore' }, count: { $sum: 1 } } },
      { $sort: { average: -1 } },
    ]),
  ]);
  const crewsById = new Map((await crewModel.findByIds(byCrew.map((c) => c._id).filter(Boolean))).map((c) => [c.id, c]));
  return {
    from, to, interval, crewId: crewId ?? null,
    buckets: keys.map((period) => {
      const b = trend.find((t) => t._id === period);
      return { period, count: b?.count ?? 0, averageScore: b ? round2(b.average) : null };
    }),
    byCrew: byCrew.map((c) => ({ crew: c._id ? P.crewBrief(crewsById.get(c._id)) : null, label: c._id ? crewsById.get(c._id)?.name : '조직 업무', count: c.count, averageScore: round2(c.average) })),
  };
}

// 소속이 시작·끝난 경위 → 통계 구분
const JOIN_KIND = { ADDED: 'joined', JOIN_REQUEST: 'joined', CAPO_ASSIGNMENT: 'joined', TRANSFER: 'transferred', MERGE: 'transferred' };
const LEAVE_KIND = { REMOVED: 'removed', DISBANDED: 'removed', WITHDRAWN: 'withdrawn' };

// #194 기간별 가입·이동·제외·탈퇴 추이 (SQL 소속 기록: 소속 유형 변경, 이동·병합으로 끝난 소속은 이동 쪽에서 센다)
async function membershipChanges({ interval = 'day', crewId, ...query }) {
  const { from, to } = periodOf({ ...query, to: query.to ?? new Date() }, { pastDays: 30 });
  const keys = bucketKeys(from, to, interval);
  const { joins, leaves } = await statsModel.membershipChanges({ from, to, interval, crewId });
  const empty = () => ({ joined: 0, transferred: 0, removed: 0, withdrawn: 0 });
  const map = new Map(keys.map((k) => [k, empty()]));
  for (const r of joins) if (JOIN_KIND[r.kind] && map.has(r.period)) map.get(r.period)[JOIN_KIND[r.kind]] += r.cnt;
  for (const r of leaves) if (LEAVE_KIND[r.kind] && map.has(r.period)) map.get(r.period)[LEAVE_KIND[r.kind]] += r.cnt;
  const buckets = keys.map((period) => ({ period, ...map.get(period) }));
  const totals = buckets.reduce((t, b) => ({ joined: t.joined + b.joined, transferred: t.transferred + b.transferred, removed: t.removed + b.removed, withdrawn: t.withdrawn + b.withdrawn }), empty());
  return { from, to, interval, crewId: crewId ?? null, totals, buckets };
}

// 행위 코드 → 관리 활동 영역
const ACTION_AREAS = [
  ['ADMIN', /^(ACCOUNT_|PASSWORD_|PERMISSIONS_|SETTINGS_|SESSIONS_)/],
  ['MEMBER', /^(USER_|ROLE_REQUEST_)/],
  ['CREW', /^(CREW_|MEMBERSHIP_|JOIN_REQUEST_)/],
  ['TASK', /^(TASK_|ASSIGNEE_|ASSIGNMENT_|SWAP_|PARTICIPATION_)/],
  ['RESOURCE', /^(RESOURCE_|MAINTENANCE_)/],
  ['EVALUATION', /^(EVALUATION_|REPUTATION_)/],
];
const AREA_LABELS = { ADMIN: '계정·권한 관리', MEMBER: '구성원', CREW: 'Crew·소속', TASK: '업무', RESOURCE: '자원', EVALUATION: '평가·평판', OTHER: '기타' };
const areaOf = (action) => ACTION_AREAS.find(([, re]) => re.test(action))?.[0] ?? 'OTHER';

// #195 기간별 관리 활동 건수 (MongoDB aggregate): 묶음별·영역별 건수, 많은 행위, 행위자 역할별
async function adminActivity({ interval = 'day', ...query }) {
  const { from, to } = periodOf({ ...query, to: query.to ?? new Date() }, { pastDays: 30 });
  const keys = bucketKeys(from, to, interval);
  const match = periodFilter('createdAt', from, to);
  const [byBucket, byRole] = await Promise.all([
    ActivityLog.aggregate([
      { $match: match },
      { $group: { _id: { period: { $dateToString: { format: MONGO_FORMAT[interval], date: '$createdAt', timezone: 'Asia/Seoul' } }, action: '$action' }, count: { $sum: 1 } } },
    ]),
    ActivityLog.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$actor.role', 'SYSTEM'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  const areas = Object.keys(AREA_LABELS);
  const emptyAreas = () => Object.fromEntries(areas.map((a) => [a, 0]));
  const buckets = new Map(keys.map((k) => [k, { period: k, total: 0, byArea: emptyAreas() }]));
  const actions = new Map();
  for (const r of byBucket) {
    const b = buckets.get(r._id.period);
    if (!b) continue;
    b.total += r.count;
    b.byArea[areaOf(r._id.action)] += r.count;
    actions.set(r._id.action, (actions.get(r._id.action) ?? 0) + r.count);
  }
  const list = [...buckets.values()];
  return {
    from, to, interval,
    total: list.reduce((a, b) => a + b.total, 0),
    areas: areas.map((a) => ({ area: a, label: AREA_LABELS[a], count: list.reduce((sum, b) => sum + b.byArea[a], 0) })),
    topActions: [...actions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([action, count]) => ({ action, label: actionLabel(action), count })),
    byActorRole: byRole.map((r) => ({ role: r._id, label: ROLE_INFO[r._id]?.label ?? '시스템', count: r.count })),
    buckets: list,
  };
}

// #196 운영 경고: 반환 연체 자원(반환 연체 기준 적용), 일정이 지난 미완료 업무, 장기·예정일 초과 점검
async function alerts() {
  const [grace, days] = [await settings.get('returnGraceMinutes'), await settings.get('longMaintenanceDays')];
  const [{ rows: usages, total: usageTotal }, { rows: tasks, total: taskTotal }, { rows: maintenances, total: maintenanceTotal }] = await Promise.all([
    resourceUsageModel.searchOverdue({ graceMinutes: grace, page: 1, size: 50 }),
    statsModel.overdueTasks(),
    statsModel.longMaintenances(days),
  ]);
  const refs = await loadRefs({
    ...P.usageRefIds(usages),
    crewIds: tasks.map((t) => t.crew_id),
  });
  return {
    generatedAt: new Date(),
    criteria: { returnGraceMinutes: grace, longMaintenanceDays: days },
    counts: { overdueUsages: usageTotal, overdueTasks: taskTotal, longMaintenances: maintenanceTotal },
    overdueUsages: usages.map((u) => ({ ...P.presentUsage(u, refs), hoursLate: round1((Date.now() - u.dueAt.getTime()) / HOUR) })),
    overdueTasks: tasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, statusLabel: TASK_STATUS_INFO[t.status].label, crew: P.crewBrief(refs.crews.get(t.crew_id)),
      startAt: t.start_at, endAt: t.end_at, hoursLate: t.hours_late,
    })),
    longMaintenances: maintenances.map((m) => ({
      id: m.id, resource: { id: m.resource_id, code: m.code, name: m.name }, reason: m.reason, startedAt: m.started_at, expectedEndAt: m.expected_end_at,
      daysOpen: m.days_open, pastExpected: Boolean(m.expected_end_at && m.expected_end_at < new Date()),
    })),
  };
}

// #197 Crew 구성원별 배정 업무 수·시간 (그 Crew의 책임자, Underboss·Boss). 기본 기간: 지금부터 14일
async function crewWorkload(actor, crewId, query) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  const from = query.from ?? new Date();
  const { to } = periodOf({ from, to: query.to ?? new Date(from.getTime() + 14 * DAY) });
  const rows = await statsModel.crewWorkload(crewId, { from, to });
  return {
    crew: P.crewBrief(crew), from, to,
    members: rows.map((r) => ({
      user: { id: r.id, username: r.username, name: r.name, role: r.role, roleLabel: ROLE_INFO[r.role].label, status: r.status, statusLabel: MEMBER_STATUS_INFO[r.status].label },
      membershipType: r.type,
      taskCount: Number(r.task_count),
      openCount: Number(r.open_count ?? 0),
      leaderCount: Number(r.leader_count ?? 0),
      hours: round1(Number(r.hours)),
      nextStartAt: r.next_start,
    })),
  };
}

module.exports = {
  bucketKeys, overview, members, crews, regions, taskTrend, leadTimes, resources, usageRanking, evaluations, membershipChanges,
  adminActivity, alerts, crewWorkload,
};
