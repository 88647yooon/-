// DB 객체를 API 응답 형태로 바꾼다. 비밀번호 해시 같은 내부 값은 여기서 걸러진다.
// refs: services/refs.js의 loadRefs 결과 ({ users: Map, crews: Map })
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO,
  TASK_STATUS_INFO, TASK_PRIORITY_INFO, ASSIGNEE_ROLE_INFO, ASSIGNMENT_RESPONSE_INFO,
  ASSIGNMENT_RELEASE_REASON_INFO, TASK_OUTCOME_INFO,
  RESOURCE_STATUS_INFO, MAINTENANCE_SOURCE_INFO, MAINTENANCE_RESULT_INFO, RETURN_CONDITION_INFO, RESOURCE_RELEASE_REASON_INFO,
  EVALUATION_STATUS_INFO, APPEAL_STATUS_INFO, REPUTATION_EVENT_KIND_INFO,
} = require('../config/constants');
const { actionLabel } = require('../config/actions');

const labelOf = (info, key) => (key ? info[key].label : null);

// 본인 정보(로그인 응답, /api/me)의 기본 형태
function presentUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    nickname: user.nickname,
    phone: user.phone,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    rank: ROLE_INFO[user.role].rank,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// 다른 구성원 정보. visibility: basic(누구나) < contact(+연락처) < full(+계정 시각 정보)
function presentUserFor(user, visibility, extra = {}) {
  const view = {
    id: user.id,
    username: user.username,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    rank: ROLE_INFO[user.role].rank,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
  };
  if (visibility !== 'basic') Object.assign(view, { phone: user.phone, email: user.email });
  if (visibility === 'full') Object.assign(view, { lastLoginAt: user.lastLoginAt, createdAt: user.createdAt, updatedAt: user.updatedAt });
  return { ...view, ...extra, visibility };
}

// 다른 객체 안에 들어가는 구성원 요약
function userBrief(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roleLabel: ROLE_INFO[user.role].label,
    status: user.status,
    statusLabel: MEMBER_STATUS_INFO[user.status].label,
  };
}

function crewBrief(crew) {
  if (!crew) return null;
  return { id: crew.id, name: crew.name, region: crew.region, status: crew.status, statusLabel: CREW_STATUS_INFO[crew.status].label };
}

function presentCrew(crew, refs, counts = { memberCount: 0, regularCount: 0, temporaryCount: 0 }) {
  return {
    id: crew.id,
    name: crew.name,
    region: crew.region,
    description: crew.description,
    status: crew.status,
    statusLabel: CREW_STATUS_INFO[crew.status].label,
    capo: userBrief(refs.users.get(crew.capoId)),
    underboss: userBrief(refs.users.get(crew.underbossId)),
    ...counts,
    createdAt: crew.createdAt,
    updatedAt: crew.updatedAt,
    disbandedAt: crew.disbandedAt,
  };
}

function presentMembership(m, refs, extra = {}) {
  return {
    id: m.id,
    active: m.leftAt === null,
    crew: crewBrief(refs.crews.get(m.crewId)),
    user: userBrief(refs.users.get(m.userId)),
    type: m.type,
    typeLabel: labelOf(MEMBERSHIP_TYPE_INFO, m.type),
    joinMethod: m.joinMethod,
    joinMethodLabel: labelOf(JOIN_METHOD_INFO, m.joinMethod),
    fromCrew: crewBrief(refs.crews.get(m.fromCrewId)),
    joinedAt: m.joinedAt,
    addedBy: userBrief(refs.users.get(m.addedBy)),
    leftAt: m.leftAt,
    endReason: m.endReason,
    endReasonLabel: labelOf(MEMBERSHIP_END_REASON_INFO, m.endReason),
    toCrew: crewBrief(refs.crews.get(m.toCrewId)),
    endedBy: userBrief(refs.users.get(m.endedBy)),
    note: m.note,
    ...extra,
  };
}

const membershipRefIds = (rows) => ({
  userIds: rows.flatMap((m) => [m.userId, m.addedBy, m.endedBy]),
  crewIds: rows.flatMap((m) => [m.crewId, m.fromCrewId, m.toCrewId]),
});

function presentCapoTerm(t, refs) {
  return {
    id: t.id,
    active: t.endedAt === null,
    capo: userBrief(refs.users.get(t.userId)),
    startedAt: t.startedAt,
    assignedBy: userBrief(refs.users.get(t.assignedBy)),
    reason: t.reason,
    endedAt: t.endedAt,
    endReason: t.endReason,
    endReasonLabel: labelOf(CAPO_TERM_END_REASON_INFO, t.endReason),
    endedBy: userBrief(refs.users.get(t.endedBy)),
  };
}

function presentJoinRequest(r, refs) {
  return {
    id: r.id,
    crew: crewBrief(refs.crews.get(r.crewId)),
    applicant: userBrief(refs.users.get(r.userId)),
    type: r.type,
    typeLabel: labelOf(MEMBERSHIP_TYPE_INFO, r.type),
    message: r.message,
    status: r.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, r.status),
    decidedBy: userBrief(refs.users.get(r.decidedBy)),
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    membershipId: r.membershipId,
    createdAt: r.createdAt,
  };
}

function presentRoleRequest(r, refs) {
  return {
    id: r.id,
    user: userBrief(refs.users.get(r.userId)),
    fromRole: r.fromRole,
    fromRoleLabel: labelOf(ROLE_INFO, r.fromRole),
    toRole: r.toRole,
    toRoleLabel: labelOf(ROLE_INFO, r.toRole),
    reason: r.reason,
    status: r.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, r.status),
    requestedBy: userBrief(refs.users.get(r.requestedBy)),
    decidedBy: userBrief(refs.users.get(r.decidedBy)),
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    createdAt: r.createdAt,
  };
}

// ---------------------------------------------------------------------------
// 단계 3: 업무

function presentTaskType(type) {
  return { id: type.id, name: type.name, description: type.description, taskCount: type.taskCount, createdAt: type.createdAt };
}

const typeBrief = (type) => (type ? { id: type.id, name: type.name } : null);

// 다른 객체 안에 들어가는 업무 요약
function taskBrief(task, refs) {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    statusLabel: labelOf(TASK_STATUS_INFO, task.status),
    priority: task.priority,
    priorityLabel: labelOf(TASK_PRIORITY_INFO, task.priority),
    startAt: task.startAt,
    endAt: task.endAt,
    crew: refs ? crewBrief(refs.crews.get(task.crewId)) : undefined,
  };
}

// counts: { assigneeCount, acceptedCount, pendingCount }
function presentTask(task, refs, counts = { assigneeCount: 0, acceptedCount: 0, pendingCount: 0 }) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    type: typeBrief(refs.types.get(task.typeId)),
    crew: crewBrief(refs.crews.get(task.crewId)),
    priority: task.priority,
    priorityLabel: labelOf(TASK_PRIORITY_INFO, task.priority),
    status: task.status,
    statusLabel: labelOf(TASK_STATUS_INFO, task.status),
    location: task.location,
    startAt: task.startAt,
    endAt: task.endAt,
    requiredHeadcount: task.requiredHeadcount,
    leaderRequired: task.leaderRequired,
    ...counts,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    cancelledAt: task.cancelledAt,
    cancelReason: task.cancelReason,
    result: task.status === 'COMPLETED'
      ? { outcome: task.resultOutcome, outcomeLabel: labelOf(TASK_OUTCOME_INFO, task.resultOutcome), summary: task.resultSummary }
      : null,
    duplicatedFrom: task.duplicatedFrom,
    createdBy: userBrief(refs.users.get(task.createdBy)),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// 업무 배정. 진행 중 배정과 끝난 배정(이력) 모두 이 형태다.
function presentAssignee(a, refs) {
  return {
    id: a.id,
    active: a.releasedAt === null,
    user: userBrief(refs.users.get(a.userId)),
    role: a.role,
    roleLabel: labelOf(ASSIGNEE_ROLE_INFO, a.role),
    response: a.response,
    responseLabel: labelOf(ASSIGNMENT_RESPONSE_INFO, a.response),
    responseNote: a.responseNote,
    respondedAt: a.respondedAt,
    assignedBy: userBrief(refs.users.get(a.assignedBy)),
    assignedAt: a.assignedAt,
    releasedAt: a.releasedAt,
    releaseReason: a.releaseReason,
    releaseReasonLabel: labelOf(ASSIGNMENT_RELEASE_REASON_INFO, a.releaseReason),
    releasedBy: userBrief(refs.users.get(a.releasedBy)),
    replacedBy: userBrief(refs.users.get(a.replacedBy)),
  };
}

const assigneeRefIds = (rows) => rows.flatMap((a) => [a.userId, a.assignedBy, a.releasedBy, a.replacedBy]);

function presentNote(note, refs) {
  return {
    id: note.id,
    content: note.content,
    target: userBrief(refs.users.get(note.targetUserId)),
    targetLabel: note.targetUserId ? null : '참여자 전체',
    author: userBrief(refs.users.get(note.authorId)),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function presentChecklistItem(item, refs) {
  return {
    id: item.id,
    content: item.content,
    position: item.position,
    done: item.doneAt !== null,
    doneBy: userBrief(refs.users.get(item.doneBy)),
    doneAt: item.doneAt,
    createdAt: item.createdAt,
  };
}

function presentSwap(s, refs) {
  return {
    id: s.id,
    task: taskBrief(refs.tasks.get(s.taskId), refs),
    from: userBrief(refs.users.get(s.fromUserId)),
    to: userBrief(refs.users.get(s.toUserId)),
    reason: s.reason,
    status: s.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, s.status),
    decidedBy: userBrief(refs.users.get(s.decidedBy)),
    decidedAt: s.decidedAt,
    decisionReason: s.decisionReason,
    createdAt: s.createdAt,
  };
}

function presentParticipation(p, refs) {
  return {
    user: userBrief(refs.users.get(p.userId)),
    participated: p.participated,
    contribution: p.contribution,
    recordedBy: userBrief(refs.users.get(p.recordedBy)),
    recordedAt: p.recordedAt,
  };
}

function presentProgress(doc) {
  return {
    id: String(doc._id),
    reporter: { id: doc.reporter.userId, username: doc.reporter.username, name: doc.reporter.name },
    percent: doc.percent,
    note: doc.note ?? null,
    createdAt: doc.createdAt,
  };
}

// ---------------------------------------------------------------------------
// 단계 4: 공용 자원
// refs에는 resources·categories 맵이 있어야 한다 (loadRefs의 resourceIds·categoryIds).

function presentCategory(c) {
  return {
    id: c.id, name: c.name, description: c.description, resourceCount: c.resourceCount, availableCount: c.availableCount, createdAt: c.createdAt,
  };
}

const categoryBrief = (c) => (c ? { id: c.id, name: c.name } : null);

function resourceBrief(r, refs) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: categoryBrief(refs.categories.get(r.categoryId)),
    status: r.status,
    statusLabel: labelOf(RESOURCE_STATUS_INFO, r.status),
    location: r.location,
  };
}

const isOverdue = (due, now = new Date()) => Boolean(due) && due < now;

// usage: 반환되지 않은 사용 기록, maintenance: 진행 중인 점검 (없으면 null)
function presentResource(r, refs, { usage = null, maintenance = null } = {}) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: categoryBrief(refs.categories.get(r.categoryId)),
    location: r.location,
    description: r.description,
    status: r.status,
    statusLabel: labelOf(RESOURCE_STATUS_INFO, r.status),
    assignable: RESOURCE_STATUS_INFO[r.status].assignable,
    minRole: r.minRole,
    minRoleLabel: labelOf(ROLE_INFO, r.minRole),
    statusChangedAt: r.statusChangedAt,
    currentUsage: usage
      ? {
        usageId: usage.id,
        user: userBrief(refs.users.get(usage.userId)),
        task: taskBrief(refs.tasks.get(usage.taskId), refs),
        startedAt: usage.startedAt,
        dueAt: usage.dueAt,
        overdue: isOverdue(usage.dueAt),
        damageReported: usage.damageReportedAt !== null,
      }
      : null,
    openMaintenance: maintenance
      ? { id: maintenance.id, reason: maintenance.reason, expectedEndAt: maintenance.expectedEndAt, overdue: isOverdue(maintenance.expectedEndAt) }
      : null,
    createdBy: userBrief(refs.users.get(r.createdBy)),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const releaseFields = (a, refs) => ({
  releasedAt: a.releasedAt,
  releaseReason: a.releaseReason,
  releaseReasonLabel: labelOf(RESOURCE_RELEASE_REASON_INFO, a.releaseReason),
  releasedBy: userBrief(refs.users.get(a.releasedBy)),
});

// 업무 자원 할당. usage: 이 할당으로 시작한 반환되지 않은 사용 기록
function presentTaskResource(a, refs, usage = null) {
  return {
    id: a.id,
    active: a.releasedAt === null,
    task: taskBrief(refs.tasks.get(a.taskId), refs),
    resource: resourceBrief(refs.resources.get(a.resourceId), refs),
    startAt: a.startAt,
    endAt: a.endAt,
    note: a.note,
    inUse: Boolean(usage),
    usedBy: usage ? userBrief(refs.users.get(usage.userId)) : null,
    allocatedBy: userBrief(refs.users.get(a.allocatedBy)),
    allocatedAt: a.allocatedAt,
    ...releaseFields(a, refs),
  };
}

// 구성원 자원 배정. usage: 이 배정으로 시작한 반환되지 않은 사용 기록
function presentAllocation(a, refs, usage = null) {
  return {
    id: a.id,
    active: a.releasedAt === null,
    resource: resourceBrief(refs.resources.get(a.resourceId), refs),
    user: userBrief(refs.users.get(a.userId)),
    startAt: a.startAt,
    endAt: a.endAt,
    purpose: a.purpose,
    requestId: a.requestId,
    handedOverFrom: a.handedOverFrom,
    inUse: Boolean(usage),
    allocatedBy: userBrief(refs.users.get(a.allocatedBy)),
    allocatedAt: a.allocatedAt,
    ...releaseFields(a, refs),
  };
}

function presentResourceRequest(q, refs, allocationId = null) {
  return {
    id: q.id,
    resource: resourceBrief(refs.resources.get(q.resourceId), refs),
    requester: userBrief(refs.users.get(q.userId)),
    startAt: q.startAt,
    endAt: q.endAt,
    reason: q.reason,
    status: q.status,
    statusLabel: labelOf(REQUEST_STATUS_INFO, q.status),
    decidedBy: userBrief(refs.users.get(q.decidedBy)),
    decidedAt: q.decidedAt,
    decisionReason: q.decisionReason,
    allocationId,
    createdAt: q.createdAt,
  };
}

function presentUsage(u, refs) {
  return {
    id: u.id,
    open: u.returnedAt === null,
    resource: resourceBrief(refs.resources.get(u.resourceId), refs),
    user: userBrief(refs.users.get(u.userId)),
    basis: u.taskResourceId ? 'TASK' : 'MEMBER',
    task: taskBrief(refs.tasks.get(u.taskId), refs),
    taskResourceId: u.taskResourceId,
    allocationId: u.allocationId,
    startedAt: u.startedAt,
    dueAt: u.dueAt,
    overdue: u.returnedAt === null && isOverdue(u.dueAt),
    returnedAt: u.returnedAt,
    returnCondition: u.returnCondition,
    returnConditionLabel: labelOf(RETURN_CONDITION_INFO, u.returnCondition),
    returnNote: u.returnNote,
    returnedBy: userBrief(refs.users.get(u.returnedBy)),
    handedOverTo: userBrief(refs.users.get(u.handedOverTo)),
    handoverFromId: u.handoverFromId,
    damageReportedAt: u.damageReportedAt,
    damageNote: u.damageNote,
  };
}

const usageRefIds = (rows) => ({
  userIds: rows.flatMap((u) => [u.userId, u.returnedBy, u.handedOverTo]),
  taskIds: rows.map((u) => u.taskId),
  resourceIds: rows.map((u) => u.resourceId),
});

function presentMaintenance(m, refs) {
  return {
    id: m.id,
    open: m.completedAt === null,
    resource: resourceBrief(refs.resources.get(m.resourceId), refs),
    source: m.source,
    sourceLabel: labelOf(MAINTENANCE_SOURCE_INFO, m.source),
    reason: m.reason,
    expectedEndAt: m.expectedEndAt,
    overdue: m.completedAt === null && isOverdue(m.expectedEndAt),
    usageId: m.usageId,
    startedAt: m.startedAt,
    startedBy: userBrief(refs.users.get(m.startedBy)),
    completedAt: m.completedAt,
    completedBy: userBrief(refs.users.get(m.completedBy)),
    result: m.result,
    resultLabel: labelOf(MAINTENANCE_RESULT_INFO, m.result),
    resultNote: m.resultNote,
  };
}

const SCHEDULE_KIND_LABEL = { TASK: '업무 할당', MEMBER: '구성원 배정', USAGE: '사용' };

// 자원 시간표 항목 (예약·사용). 시간 충돌(BR-07) 목록도 이 형태다.
// 반환 예정 시각이 지난 미반환 사용은 overdue=true이고, 반환될 때까지 그 뒤 시간대와도 겹치는 것으로 본다.
function presentScheduleEntry(e, refs) {
  return {
    kind: e.kind,
    kindLabel: SCHEDULE_KIND_LABEL[e.kind],
    id: e.id,
    startAt: e.startAt,
    endAt: e.endAt,
    overdue: e.overdue,
    task: taskBrief(refs.tasks.get(e.taskId), refs),
    user: userBrief(refs.users.get(e.userId)),
  };
}

// ---------------------------------------------------------------------------
// 단계 5: 평가·평판·기록 (MongoDB 문서)

// 문서에 저장한 구성원 정보 ({ userId, username, name, role })
function personBrief(p) {
  if (!p?.userId) return null;
  return { id: p.userId, username: p.username, name: p.name, role: p.role ?? null, roleLabel: p.role ? labelOf(ROLE_INFO, p.role) : null };
}

const presentCriterion = (c) => ({ key: c.key, label: c.label, description: c.description ?? null, weight: c.weight, position: c.position });

const presentScores = (scores) => scores.map((s) => ({ key: s.key, label: s.label, weight: s.weight, score: s.score }));

// viewer: 보는 사람 (수정 가능 여부 계산), detail: 수정·정정 이력까지 보여 줄지
function presentEvaluation(e, { viewer, detail = false } = {}) {
  const view = {
    id: String(e._id),
    task: { id: e.taskId, title: e.taskTitle, completedAt: e.taskCompletedAt ?? null },
    crewId: e.crewId ?? null,
    evaluatee: personBrief(e.evaluatee),
    evaluator: personBrief(e.evaluator),
    scores: presentScores(e.scores),
    totalScore: e.totalScore,
    comment: e.comment ?? null,
    status: e.status,
    statusLabel: labelOf(EVALUATION_STATUS_INFO, e.status),
    editableUntil: e.editableUntil ?? null,
    editable: Boolean(viewer) && e.status === 'ACTIVE' && e.evaluator.userId === viewer.id && e.editableUntil > new Date(),
    revisionCount: e.revisions?.length ?? 0,
    withdrawnAt: e.withdrawnAt ?? null,
    withdrawnBy: personBrief(e.withdrawnBy),
    withdrawReason: e.withdrawReason ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
  if (detail) {
    view.revisions = (e.revisions ?? []).map((r) => ({
      kind: r.kind,
      kindLabel: r.kind === 'CORRECTION' ? '이의 제기 정정' : '평가자 수정',
      at: r.at,
      by: personBrief(r.by),
      before: { scores: presentScores(r.before.scores), totalScore: r.before.totalScore, comment: r.before.comment ?? null },
      after: { scores: presentScores(r.after.scores), totalScore: r.after.totalScore, comment: r.after.comment ?? null },
      reason: r.reason ?? null,
      appealId: r.appealId ?? null,
    }));
  }
  return view;
}

function presentAppeal(a) {
  return {
    id: String(a._id),
    evaluationId: String(a.evaluationId),
    task: { id: a.taskId, title: a.taskTitle },
    appellant: personBrief(a.appellant),
    reason: a.reason,
    status: a.status,
    statusLabel: labelOf(APPEAL_STATUS_INFO, a.status),
    resolvedBy: personBrief(a.resolvedBy),
    resolvedAt: a.resolvedAt ?? null,
    resolutionNote: a.resolutionNote ?? null,
    createdAt: a.createdAt,
  };
}

function presentReputationEvent(e) {
  return {
    id: String(e._id),
    user: personBrief(e.user),
    kind: e.kind,
    kindLabel: labelOf(REPUTATION_EVENT_KIND_INFO, e.kind),
    points: e.points,
    title: e.title,
    description: e.description ?? null,
    recordedBy: personBrief(e.recordedBy),
    active: e.status === 'ACTIVE',
    cancelledBy: personBrief(e.cancelledBy),
    cancelledAt: e.cancelledAt ?? null,
    cancelReason: e.cancelReason ?? null,
    createdAt: e.createdAt,
  };
}

// 활동 기록(감사 기록) 한 건. withChanges면 변경 전후 값까지 보여 준다.
function presentActivityLog(d, { withChanges = true } = {}) {
  const view = {
    id: String(d._id),
    at: d.createdAt,
    action: d.action,
    actionLabel: actionLabel(d.action),
    actor: d.actor?.userId ? { id: d.actor.userId, username: d.actor.username, role: d.actor.role } : null,
    target: d.target,
    related: d.related ?? [],
    reason: d.reason ?? null,
  };
  if (withChanges) Object.assign(view, { before: d.before ?? null, after: d.after ?? null, ip: d.ip ?? null });
  return view;
}

function presentSecurityEvent(d) {
  return {
    id: String(d._id),
    at: d.createdAt,
    event: d.event,
    user: d.user?.userId ? { id: d.user.userId, username: d.user.username, role: d.user.role } : null,
    method: d.method,
    path: d.path,
    reason: d.reason ?? null,
    details: d.details ?? null,
    ip: d.ip ?? null,
  };
}

function presentSession(session, currentSessionId) {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
  };
}

module.exports = {
  labelOf,
  presentUser,
  presentUserFor,
  userBrief,
  crewBrief,
  presentCrew,
  presentMembership,
  membershipRefIds,
  presentCapoTerm,
  presentJoinRequest,
  presentRoleRequest,
  presentTaskType,
  typeBrief,
  taskBrief,
  presentTask,
  presentAssignee,
  assigneeRefIds,
  presentNote,
  presentChecklistItem,
  presentSwap,
  presentParticipation,
  presentProgress,
  presentCategory,
  categoryBrief,
  resourceBrief,
  presentResource,
  presentTaskResource,
  presentAllocation,
  presentResourceRequest,
  presentUsage,
  usageRefIds,
  presentMaintenance,
  presentScheduleEntry,
  personBrief,
  presentCriterion,
  presentEvaluation,
  presentAppeal,
  presentReputationEvent,
  presentActivityLog,
  presentSecurityEvent,
  presentSession,
};
