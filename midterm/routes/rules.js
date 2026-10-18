// 라우터의 입력 검증 규칙과 Swagger 문서가 함께 쓰는 정의. 둘이 어긋나지 않도록 한 곳에 둔다.
const {
  ALL_ROLES, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, REQUEST_STATUS_INFO, CREW_MEMBER_ROLES,
  TASK_STATUS_INFO, TASK_PRIORITY_INFO, ASSIGNEE_ROLE_INFO, ASSIGNMENT_RESPONSE_INFO, TASK_OUTCOME_INFO, ASSIGNABLE_ROLES,
  RESOURCE_STATUS_INFO, MANUAL_RESOURCE_STATUSES, RESOURCE_MIN_ROLES, MAINTENANCE_SOURCE_INFO, MAINTENANCE_RESULT_INFO, RETURN_CONDITION_INFO,
  EVALUATION_STATUS_INFO, APPEAL_STATUS_INFO, REPUTATION_EVENT_KIND_INFO, REPUTATION_POINTS, CHANGE_TYPE_INFO,
} = require('../config/constants');
const { ACTION_LABELS } = require('../config/actions');
const { pagingRules } = require('../utils/pagination');
const { idParam } = require('../middlewares/validate');

// 목록별 정렬 키와 기본 정렬 ('-'는 내림차순)
const SORTS = {
  users: { keys: ['name', 'username', 'createdAt', 'rank'], default: 'name' },
  subordinates: { keys: ['name', 'rank'], default: '-rank' },
  crews: { keys: ['name', 'region', 'createdAt', 'memberCount'], default: 'name' },
  members: { keys: ['name', 'joinedAt', 'rank'], default: '-rank' },
  candidates: { keys: ['name', 'rank'], default: 'name' },
  tasks: { keys: ['startAt', 'priority', 'createdAt', 'title'], default: 'startAt' },
  myTasks: { keys: ['startAt', 'assignedAt'], default: 'startAt' },
  resources: { keys: ['code', 'name', 'status', 'location', 'createdAt'], default: 'code' },
  allocations: { keys: ['startAt', 'allocatedAt'], default: 'startAt' },
  usages: { keys: ['startedAt', 'dueAt', 'returnedAt'], default: '-startedAt' },
  evaluations: { keys: ['createdAt', 'totalScore'], default: '-createdAt' },
  history: { keys: ['at'], default: 'at' },
  auditLogs: { keys: ['createdAt'], default: '-createdAt' },
  accounts: { keys: ['username', 'lastLoginAt', 'failedLoginCount', 'createdAt'], default: 'username' },
};

const paging = (sortName) => (sortName ? pagingRules(SORTS[sortName].keys, SORTS[sortName].default) : pagingRules());

const enums = {
  role: { type: 'string', enum: ALL_ROLES },
  crewMemberRole: { type: 'string', enum: [...CREW_MEMBER_ROLES] },
  memberStatus: { type: 'string', enum: Object.keys(MEMBER_STATUS_INFO) },
  crewStatus: { type: 'string', enum: Object.keys(CREW_STATUS_INFO) },
  membershipType: { type: 'string', enum: Object.keys(MEMBERSHIP_TYPE_INFO) },
  requestStatus: { type: 'string', enum: Object.keys(REQUEST_STATUS_INFO) },
  taskStatus: { type: 'string', enum: Object.keys(TASK_STATUS_INFO) },
  taskPriority: { type: 'string', enum: Object.keys(TASK_PRIORITY_INFO) },
  assigneeRole: { type: 'string', enum: Object.keys(ASSIGNEE_ROLE_INFO) },
  assignmentResponse: { type: 'string', enum: Object.keys(ASSIGNMENT_RESPONSE_INFO) },
  taskOutcome: { type: 'string', enum: Object.keys(TASK_OUTCOME_INFO) },
  assignableRole: { type: 'string', enum: [...ASSIGNABLE_ROLES] },
  swapBox: { type: 'string', enum: ['sent', 'received', 'review'] },
  resourceStatus: { type: 'string', enum: Object.keys(RESOURCE_STATUS_INFO) },
  manualResourceStatus: { type: 'string', enum: [...MANUAL_RESOURCE_STATUSES] },
  resourceMinRole: { type: 'string', enum: [...RESOURCE_MIN_ROLES] },
  maintenanceSource: { type: 'string', enum: Object.keys(MAINTENANCE_SOURCE_INFO) },
  maintenanceResult: { type: 'string', enum: Object.keys(MAINTENANCE_RESULT_INFO) },
  returnCondition: { type: 'string', enum: Object.keys(RETURN_CONDITION_INFO) },
  requestBox: { type: 'string', enum: ['mine', 'review'] },
  evaluationStatus: { type: 'string', enum: Object.keys(EVALUATION_STATUS_INFO) },
  appealStatus: { type: 'string', enum: Object.keys(APPEAL_STATUS_INFO) },
  appealDecision: { type: 'string', enum: ['DISMISS', 'CORRECT'] },
  reputationKind: { type: 'string', enum: Object.keys(REPUTATION_EVENT_KIND_INFO) },
  changeType: { type: 'string', enum: Object.keys(CHANGE_TYPE_INFO) },
  activityKind: { type: 'string', enum: ['TASK', 'RESOURCE', 'EVALUATION', 'REPUTATION'] },
  action: { type: 'string', enum: Object.keys(ACTION_LABELS) },
  searchTypes: { type: 'array', items: { type: 'string', enum: ['users', 'crews', 'tasks', 'resources'] }, max: 4 },
  interval: { type: 'string', enum: ['day', 'week', 'month'] },
};

const fields = {
  username: {
    type: 'string', required: true, pattern: /^[a-z0-9._-]{3,50}$/,
    patternMessage: '영문 소문자, 숫자, 마침표(.), 밑줄(_), 하이픈(-)으로 3~50자여야 합니다.',
  },
  password: {
    type: 'string', required: true, min: 8, max: 72, trim: false,
    pattern: /^(?=.*[A-Za-z])(?=.*\d)/, patternMessage: '영문자와 숫자를 각각 1자 이상 포함해야 합니다.',
  },
  name: { type: 'string', required: true, max: 50 },
  nickname: { type: 'string', nullable: true, min: 1, max: 50 },
  phone: { type: 'string', nullable: true, format: 'phone' },
  email: { type: 'string', nullable: true, format: 'email', max: 100 },
  reason: { type: 'string', max: 500 },
  requiredReason: { type: 'string', required: true, max: 500 },
  note: { type: 'string', max: 200 },
  q: { type: 'string', max: 50 },
  id: idParam,
  optionalId: { type: 'integer', min: 1 },
  title: { type: 'string', required: true, min: 1, max: 100 },
  longText: { type: 'string', nullable: true, max: 2000 },
  location: { type: 'string', nullable: true, max: 100 },
  datetime: { type: 'datetime', required: true },
  optionalDatetime: { type: 'datetime' },
  headcount: { type: 'integer', min: 1, max: 100 },
  resourceCode: {
    type: 'string', required: true, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/,
    patternMessage: '영문자·숫자로 시작하고 영문자, 숫자, 마침표(.), 밑줄(_), 하이픈(-)으로 1~30자여야 합니다.',
  },
  resourceName: { type: 'string', required: true, min: 1, max: 100 },
  resourceDescription: { type: 'string', nullable: true, max: 1000 },
  // MongoDB 문서 ID (평가, 이의 제기, 공로·징계, 감사 기록)
  docId: { type: 'string', required: true, pattern: /^[a-f0-9]{24}$/, patternMessage: '24자리 16진수 문서 ID여야 합니다.' },
  // 평가 점수: { 항목 키: 점수 } (항목과 범위는 서비스에서 평가 항목 설정으로 검사한다)
  scores: { type: 'object' },
  comment: { type: 'string', nullable: true, max: 1000 },
  reputationPoints: { type: 'integer', required: true, min: REPUTATION_POINTS.min, max: REPUTATION_POINTS.max },
};

module.exports = { SORTS, paging, enums, fields };
