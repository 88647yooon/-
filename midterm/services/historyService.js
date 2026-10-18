// 이력 조회 (FR-19, FR-20, BR-10) — 구성원 변경 이력, 구성원 활동 타임라인, Crew 활동 타임라인.
// 변경 이력은 단계 1부터 모든 서비스가 남긴 MongoDB 활동 기록에서, 활동 타임라인은 SQL(업무·자원)과 MongoDB(평가·평판)에서 모은다.
const ActivityLog = require('../models/mongo/ActivityLog');
const Evaluation = require('../models/mongo/Evaluation');
const ReputationEvent = require('../models/mongo/ReputationEvent');
const activityModel = require('../models/sql/activityModel');
const taskModel = require('../models/sql/taskModel');
const access = require('./accessService');
const { requireUser, requireCrew } = require('./lookup');
const P = require('./presenters');
const {
  ROLE_INFO, MEMBER_STATUS_INFO, MEMBERSHIP_TYPE_INFO, MEMBERSHIP_END_REASON_INFO, CHANGE_TYPE_INFO, ASSIGNEE_ROLE_INFO,
  ASSIGNMENT_RELEASE_REASON_INFO, RETURN_CONDITION_INFO, REPUTATION_EVENT_KIND_INFO,
} = require('../config/constants');
const { actionLabel } = require('../config/actions');
const { pageMeta } = require('../utils/pagination');
const { periodFilter, findPage } = require('../utils/mongo');

const label = (info, key) => (key && info[key] ? info[key].label : key ?? '-');
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const TYPE_OF_ACTION = new Map(Object.entries(CHANGE_TYPE_INFO).flatMap(([type, info]) => info.actions.map((a) => [a, type])));
const relatedLabel = (d, entity, id) => (d.related ?? []).find((r) => r.entity === entity && (id === undefined || r.id === String(id)))?.label;

// 변경 내용을 한 줄로 설명한다.
function changeSummary(d) {
  const b = d.before ?? {};
  const a = d.after ?? {};
  const crew = (id) => relatedLabel(d, 'crew', id) ?? (id ? `Crew #${id}` : '');
  const task = relatedLabel(d, 'task') ?? '업무';
  switch (d.action) {
    case 'USER_CREATED': return `계정 등록 (${label(ROLE_INFO, a.role)}, ${label(MEMBER_STATUS_INFO, a.status)})`;
    case 'USER_ROLE_CHANGED': return `${label(ROLE_INFO, b.role)} → ${label(ROLE_INFO, a.role)}`;
    case 'USER_STATUS_CHANGED': return `${label(MEMBER_STATUS_INFO, b.status)} → ${label(MEMBER_STATUS_INFO, a.status)}`;
    case 'MEMBERSHIP_ADDED': return `${crew(a.crewId)} ${label(MEMBERSHIP_TYPE_INFO, a.type)} 소속 시작`;
    case 'MEMBERSHIP_ENDED': return `${crew(b.crewId)} ${label(MEMBERSHIP_TYPE_INFO, b.type)} 소속 종료 (${label(MEMBERSHIP_END_REASON_INFO, a.endReason)})`;
    case 'MEMBERSHIP_TRANSFERRED': return `${crew(b.crewId)} → ${crew(a.crewId)} 이동`;
    case 'MEMBERSHIP_TYPE_CHANGED': return `${crew(a.crewId)} 소속 유형 ${label(MEMBERSHIP_TYPE_INFO, b.type)} → ${label(MEMBERSHIP_TYPE_INFO, a.type)}`;
    case 'EVALUATION_CREATED': return `'${task}' 평가 받음 (${a.totalScore}점)`;
    case 'EVALUATION_UPDATED': return `'${task}' 평가 수정 (${b.totalScore}점 → ${a.totalScore}점)`;
    case 'EVALUATION_CORRECTED': return `'${task}' 평가 정정 (${b.totalScore}점 → ${a.totalScore}점)`;
    case 'EVALUATION_WITHDRAWN': return `'${task}' 평가 철회 (${b.totalScore}점)`;
    case 'REPUTATION_EVENT_RECORDED': return `${label(REPUTATION_EVENT_KIND_INFO, a.kind)} ${signed(a.points)}점: ${a.title}`;
    case 'REPUTATION_EVENT_CANCELLED': return `${label(REPUTATION_EVENT_KIND_INFO, b.kind)} ${signed(b.points)}점 기록 취소`;
    default: return actionLabel(d.action);
  }
}

// #155 역할·소속·상태·평가 변경 이력 (본인, 소속 Crew의 책임자, Underboss·Boss). 기본은 오래된 것부터 시간순.
// 역할·상태·소속은 그 구성원이 대상(target)인 기록, 평가·공로·징계는 그 구성원이 관련 대상(related)인 기록이다.
async function changeHistory(actor, userId, { type, from, to, sort = 'at', ...query }) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const types = type ? [type] : Object.keys(CHANGE_TYPE_INFO);
  const own = types.filter((t) => t !== 'EVALUATION').flatMap((t) => CHANGE_TYPE_INFO[t].actions);
  const aboutUser = types.includes('EVALUATION') ? CHANGE_TYPE_INFO.EVALUATION.actions : [];
  const id = String(userId);
  const branches = [
    own.length && { 'target.entity': 'user', 'target.id': id, action: { $in: own } },
    aboutUser.length && { related: { $elemMatch: { entity: 'user', id } }, action: { $in: aboutUser } },
  ].filter(Boolean);
  const filter = { $or: branches, ...periodFilter('createdAt', from, to) };
  const dir = sort === '-at' ? -1 : 1;
  const { docs, total } = await findPage(ActivityLog, filter, { ...query, sort: { createdAt: dir, _id: dir } });
  return {
    data: docs.map((d) => {
      const changeType = TYPE_OF_ACTION.get(d.action);
      return {
        id: String(d._id),
        at: d.createdAt,
        type: changeType,
        typeLabel: CHANGE_TYPE_INFO[changeType].label,
        action: d.action,
        actionLabel: actionLabel(d.action),
        summary: changeSummary(d),
        before: d.before ?? null,
        after: d.after ?? null,
        actor: d.actor?.userId ? { id: d.actor.userId, username: d.actor.username, role: d.actor.role } : null,
        reason: d.reason ?? null,
      };
    }),
    meta: pageMeta(query, total),
  };
}

// ---------------------------------------------------------------------------
// 구성원 활동 타임라인

const TIMELINE_TYPES = {
  TASK_ASSIGNED: '업무 배정',
  TASK_RELEASED: '업무 배정 끝',
  TASK_PARTICIPATION: '업무 참여 기록',
  RESOURCE_CHECKED_OUT: '자원 사용 시작',
  RESOURCE_RETURNED: '자원 반환',
  EVALUATION_RECEIVED: '평가 받음',
  REPUTATION_EVENT: '공로·징계',
};
const KIND_OF = {
  TASK_ASSIGNED: 'TASK', TASK_RELEASED: 'TASK', TASK_PARTICIPATION: 'TASK', RESOURCE_CHECKED_OUT: 'RESOURCE', RESOURCE_RETURNED: 'RESOURCE',
};

function sqlItem(r) {
  const task = r.taskId ? { id: r.taskId, title: r.taskTitle } : null;
  const resource = r.resourceId ? { id: r.resourceId, name: r.resourceName } : null;
  const summary = {
    TASK_ASSIGNED: () => `'${r.taskTitle}' 업무에 ${label(ASSIGNEE_ROLE_INFO, r.detail)}(으)로 배정`,
    TASK_RELEASED: () => `'${r.taskTitle}' 배정 끝 (${label(ASSIGNMENT_RELEASE_REASON_INFO, r.detail)})`,
    TASK_PARTICIPATION: () => `'${r.taskTitle}' 완료 · ${r.detail === 'Y' ? '참여' : '불참'}${r.note ? ` (${r.note})` : ''}`,
    RESOURCE_CHECKED_OUT: () => `'${r.resourceName}' 사용 시작${r.taskTitle ? ` (업무 '${r.taskTitle}')` : ''}`,
    RESOURCE_RETURNED: () => `'${r.resourceName}' ${r.note === 'HANDOVER' ? '인계' : `반환 (${label(RETURN_CONDITION_INFO, r.detail)})`}`,
  }[r.type]();
  return { at: r.at, kind: KIND_OF[r.type], type: r.type, typeLabel: TIMELINE_TYPES[r.type], summary, task, resource };
}

const evaluationItem = (e) => ({
  at: e.createdAt,
  kind: 'EVALUATION',
  type: 'EVALUATION_RECEIVED',
  typeLabel: TIMELINE_TYPES.EVALUATION_RECEIVED,
  summary: `'${e.taskTitle}' 평가 ${e.totalScore}점 (평가자 ${e.evaluator.name})${e.status === 'WITHDRAWN' ? ' · 철회됨' : ''}`,
  task: { id: e.taskId, title: e.taskTitle },
  evaluationId: String(e._id),
});

const reputationItem = (e) => ({
  at: e.createdAt,
  kind: 'REPUTATION',
  type: 'REPUTATION_EVENT',
  typeLabel: TIMELINE_TYPES.REPUTATION_EVENT,
  summary: `${label(REPUTATION_EVENT_KIND_INFO, e.kind)} ${signed(e.points)}점: ${e.title}${e.status === 'CANCELLED' ? ' · 취소됨' : ''}`,
  eventId: String(e._id),
});

// #156 구성원 활동 타임라인 (본인, 소속 Crew의 책임자, Underboss·Boss): 업무 참여, 자원 사용, 받은 평가, 공로·징계를 최근 순으로.
// 출처마다 이 페이지까지 필요한 만큼만 읽어 합친다.
async function userActivity(actor, userId, { kind, from, to, ...query }) {
  const user = await requireUser(userId);
  await access.assertCanViewMemberRecords(actor, user);
  const kinds = kind ? [kind] : ['TASK', 'RESOURCE', 'EVALUATION', 'REPUTATION'];
  const limit = query.page * query.size;
  const period = periodFilter('createdAt', from, to);
  const [sql, evals, events] = await Promise.all([
    activityModel.userTimeline(userId, { kinds: kinds.filter((k) => k === 'TASK' || k === 'RESOURCE').map((k) => k.toLowerCase()), from, to, limit }),
    kinds.includes('EVALUATION')
      ? findPage(Evaluation, { 'evaluatee.userId': userId, ...period }, { page: 1, size: limit, sort: { createdAt: -1 } })
      : { docs: [], total: 0 },
    kinds.includes('REPUTATION')
      ? findPage(ReputationEvent, { 'user.userId': userId, ...period }, { page: 1, size: limit, sort: { createdAt: -1 } })
      : { docs: [], total: 0 },
  ]);
  const items = [...sql.rows.map(sqlItem), ...evals.docs.map(evaluationItem), ...events.docs.map(reputationItem)]
    .sort((x, y) => y.at - x.at);
  return {
    data: items.slice((query.page - 1) * query.size, limit),
    meta: pageMeta(query, sql.total + evals.total + events.total),
  };
}

// #157 Crew 활동 타임라인 (그 Crew의 책임자, Underboss·Boss): Crew·소속 변경, 그 Crew 업무의 활동, 그 업무의 평가 기록을 최근 순으로
async function crewActivity(actor, crewId, { action, from, to, ...query }) {
  const crew = await requireCrew(crewId);
  access.assertCanManageCrew(actor, crew);
  const taskIds = (await taskModel.listIdsByCrew(crewId)).map(String);
  const id = String(crewId);
  const filter = {
    $or: [
      { 'target.entity': 'crew', 'target.id': id },
      { related: { $elemMatch: { entity: 'crew', id } } },
      ...(taskIds.length ? [
        { 'target.entity': 'task', 'target.id': { $in: taskIds } },
        { related: { $elemMatch: { entity: 'task', id: { $in: taskIds } } } },
      ] : []),
    ],
    ...(action && { action }),
    ...periodFilter('createdAt', from, to),
  };
  const { docs, total } = await findPage(ActivityLog, filter, { ...query, sort: { createdAt: -1, _id: -1 } });
  return { data: docs.map((d) => P.presentActivityLog(d, { withChanges: false })), meta: pageMeta(query, total) };
}

module.exports = { changeSummary, changeHistory, userActivity, crewActivity };
