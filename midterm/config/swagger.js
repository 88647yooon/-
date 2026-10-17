// Swagger(OpenAPI) 문서 설정 (CR-04). 각 API 문서는 routes/*.js의 @openapi 주석에 있다.
// 코드 목록(enum)·정렬 키는 constants.js와 routes/rules.js에서 가져와 검증 규칙과 문서가 어긋나지 않게 한다.
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const config = require('./index');
const seedData = require('../models/seedData');
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO, CREW_MEMBER_ROLES,
  TASK_STATUS_INFO, TASK_PRIORITY_INFO, ASSIGNEE_ROLE_INFO, ASSIGNMENT_RESPONSE_INFO, ASSIGNMENT_RELEASE_REASON_INFO,
  TASK_OUTCOME_INFO, ASSIGNABLE_ROLES,
  RESOURCE_STATUS_INFO, RESOURCE_MIN_ROLES, MAINTENANCE_SOURCE_INFO, MAINTENANCE_RESULT_INFO, RETURN_CONDITION_INFO,
  RESOURCE_RELEASE_REASON_INFO,
} = require('./constants');
const { SORTS } = require('../routes/rules');

const accountRows = seedData.users
  .map((u) => `| ${u.username} | ${ROLE_INFO[u.role].label} | ${MEMBER_STATUS_INFO[u.status].label} |`)
  .join('\n');
const crewRows = seedData.crews
  .map((c) => `| ${c.name} | ${c.region} | ${c.capo} | ${c.underboss} | ${c.members.map(([u, t]) => (t === 'TEMPORARY' ? `${u}(임시)` : u)).join(', ')} |`)
  .join('\n');

const description = `
The Family 통합 정보시스템 REST API (학번 202211207)

[웹 화면(홈)](/)에서도 단계별 기능 요구사항 확인 목록과 업무 규칙 확인 시나리오를 따라 기능을 확인할 수 있다.

### 사용 방법
1. **인증 → POST /api/auth/login**에서 아래 테스트 계정으로 로그인한다.
2. 응답의 \`data.accessToken\` 값을 복사해 오른쪽 위 **Authorize** 버튼에 붙여 넣는다.
3. 이제 권한이 필요한 API를 실행할 수 있다. 각 API 설명 맨 앞의 [ ] 안은 연결된 요구사항 ID다.

### 테스트 계정 (비밀번호 모두 \`${config.seedPassword}\`)
| 아이디 | 역할 | 상태 |
| --- | --- | --- |
${accountRows}

### 시드 Crew
| Crew | 지역 | 책임자(Capo) | 담당 Underboss | 소속원 |
| --- | --- | --- | --- | --- |
${crewRows}

### 권한과 관리 범위
- Underboss·Boss는 모든 Crew를 관리하고, Capo는 자신이 책임자인 Crew만 관리한다 (BR-05).
- 자신과 같거나 높은 역할의 구성원은 관리할 수 없다 (BR-04).
- Crew에는 Associate·Soldier·Capo만 소속되며, 정식 소속은 한 Crew만 가능하다 (BR-01).
- Crew 업무는 그 Crew의 책임자와 Underboss·Boss가, Crew가 없는 조직 업무는 Underboss·Boss가 관리한다. 업무의 참여자는 그 업무를 볼 수 있다.
- 정지·탈퇴 구성원은 새 업무에 배정할 수 없고(BR-02), 같은 시간대에 끝나지 않은 다른 업무가 있으면 배정할 수 없다(BR-03).
- 완료된 업무의 내용·배정·결과는 바꿀 수 없고(BR-06), 결과 정정은 Underboss·Boss만 사유를 남기고 할 수 있다.
- 공용 자원은 업무에 할당하거나 구성원에게 배정한다. 같은 자원의 겹치는 시간대에 다른 업무 할당·구성원 배정·사용 중인 기록이 있으면 배정할 수 없고(BR-07,
  반환 예정 시각이 지난 미반환 자원은 반환될 때까지 사용 중으로 본다),
  점검중·사용불가 자원은 새로 배정할 수 없다(BR-08). 자원은 이용 최소 역할(기본 Soldier) 이상만 이용·신청할 수 있다.
- 자원 사용은 배정(할당) 시간대 안에서 시작하고, 반환할 때 반환 상태(정상·손상·분실)에 따라 자원 상태가 바뀐다. 모든 사용·반환·상태 변경은 이력에 남는다.

### 공통 응답 형식
- 성공: \`{ "success": true, "data": ..., "meta": ... }\` (\`meta\`는 목록 조회에만: page, size, total, totalPages)
- 실패: \`{ "success": false, "error": { "code", "message", "details" } }\`
- 상태 코드: 입력 오류 400, 인증 없음 401, 권한 부족 403(관리 범위·순위 위반이면 \`details.rule\`에 BR-05·BR-04), 대상 없음 404,
  업무 규칙 위반 409(\`error.code\`에 규칙 ID), 상태 충돌 409 CONFLICT, 중복 409 DUPLICATE, 일괄 처리 실패 409 BULK_REJECTED, 서버 오류 500
`;

const enumSchema = (info, description) => ({ type: 'string', enum: Object.keys(info), description: `${description}: ${Object.entries(info).map(([k, v]) => `${k}(${v.label})`).join(', ')}` });

const sortParameter = ({ keys, default: def }) => ({
  name: 'sort', in: 'query', description: '정렬 기준. 앞에 -를 붙이면 내림차순',
  schema: { type: 'string', enum: keys.flatMap((k) => [k, `-${k}`]), default: def },
});

const idPath = (name, description) => ({ name, in: 'path', required: true, description, schema: { type: 'integer', minimum: 1 } });
const enumQuery = (name, schemaRef, description) => ({ name, in: 'query', description, schema: { $ref: `#/components/schemas/${schemaRef}` } });

function errorResponse(description, code, message, details = null) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { success: false, error: { code, message, details } },
      },
    },
  };
}

const ok = (schema, description = '성공') => ({
  description,
  content: {
    'application/json': {
      schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { $ref: `#/components/schemas/${schema}` } } },
    },
  },
});

const okPage = (schema) => ({
  description: '조회 성공',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: `#/components/schemas/${schema}` } },
          meta: { $ref: '#/components/schemas/PageMeta' },
        },
      },
    },
  },
});

const okList = (schema, description = '조회 성공') => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: { $ref: `#/components/schemas/${schema}` } } },
      },
    },
  },
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const nullableRef = (name) => ({ allOf: [ref(name)], nullable: true });

const userCore = {
  id: { type: 'integer', example: 8 },
  username: { type: 'string', example: 'soldier1' },
  name: { type: 'string', example: 'Luca Esposito' },
  nickname: { type: 'string', nullable: true },
  role: ref('Role'),
  roleLabel: { type: 'string', example: 'Soldier' },
  rank: { type: 'integer', nullable: true, example: 2, description: '운영 계층 순위 (Administrator는 null)' },
  status: ref('MemberStatus'),
  statusLabel: { type: 'string', example: '활동중' },
};

const definition = {
  openapi: '3.0.3',
  info: { title: 'The Family 통합 정보시스템 API', version: '1.0.0', description },
  tags: [
    { name: '인증', description: '로그인, 토큰 재발급, 세션 관리' },
    { name: '내 정보', description: '로그인한 사용자 본인의 정보' },
    { name: '기준 정보', description: '역할·상태 같은 코드 목록' },
    { name: '구성원', description: '구성원 등록·조회·수정, 역할·상태 변경, 소속 이력과 지휘 계통' },
    { name: 'Crew', description: 'Crew 생성·조회·수정·해산, 책임자와 담당 Underboss, 조직도' },
    { name: 'Crew 편성', description: '구성원 편성·제외·이동, 편성 후보와 이력, Crew 병합' },
    { name: '소속 신청', description: 'Crew 소속 신청과 승인·거절' },
    { name: '역할 변경 요청', description: 'Capo의 역할 변경 추천과 Underboss·Boss의 승인·거절' },
    { name: '업무 유형', description: '업무 분류' },
    { name: '업무', description: '업무 등록·조회·수정·삭제, 일정·상태 변경, 복제, 필요 인원, 시작 준비 상태, 취소' },
    { name: '업무 세부 정보', description: '지시사항, 체크리스트, 선행 업무' },
    { name: '업무 배정', description: '구성원 배정·해제·교체·응답, 배정 후보와 이력, 구성원 가용 여부' },
    { name: '내 업무', description: '내게 배정된 업무와 일정' },
    { name: '업무 교대 요청', description: '참여자의 배정 교대 요청과 승인·거절' },
    { name: '업무 진행·결과', description: '진행 보고, 완료 처리와 결과, 참여 기록, 상태 변경 이력' },
    { name: '자원 분류', description: '공용 자원 분류' },
    { name: '자원', description: '자원 등록·조회·수정·삭제, 상태·이용 최소 역할 변경, 상태 이력, 이용 가능 자원' },
    { name: '자원 점검', description: '점검 등록·수정·완료, 점검 이력, 진행 중인 점검' },
    { name: '업무 자원 할당', description: '업무에 자원 할당·조정·해제, 할당 후보, 자원의 시간대 가용 여부와 예약 일정' },
    { name: '구성원 자원 배정', description: '구성원에게 자원 배정, 배정 목록, 기간 변경, 취소' },
    { name: '자원 사용 신청', description: '구성원의 자원 사용 신청과 승인·거절·취소' },
    { name: '자원 사용·반환', description: '사용 시작, 반환, 일괄 반환, 사용 이력, 반환 예정 연장, 인계, 고장 신고, 미반환 목록' },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'POST /api/auth/login 응답의 accessToken' },
    },
    parameters: {
      UserId: idPath('userId', '구성원 ID'),
      CrewId: idPath('crewId', 'Crew ID'),
      RequestId: idPath('requestId', '신청·요청 ID'),
      Page: { name: 'page', in: 'query', description: '페이지 번호', schema: { type: 'integer', minimum: 1, default: 1 } },
      Size: { name: 'size', in: 'query', description: '페이지 크기', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      Q: { name: 'q', in: 'query', description: '검색어 (이름·아이디·별명, Crew는 이름·설명)', schema: { type: 'string', maxLength: 50 } },
      RoleFilter: enumQuery('role', 'Role', '역할'),
      CrewMemberRoleFilter: enumQuery('role', 'CrewMemberRole', '역할'),
      MemberStatusFilter: enumQuery('status', 'MemberStatus', '구성원 상태'),
      CrewStatusFilter: enumQuery('status', 'CrewStatus', 'Crew 상태'),
      MembershipTypeFilter: enumQuery('type', 'MembershipType', '소속 유형'),
      RequestStatusFilter: enumQuery('status', 'RequestStatus', '처리 상태'),
      UserSort: sortParameter(SORTS.users),
      SubordinateSort: sortParameter(SORTS.subordinates),
      CrewSort: sortParameter(SORTS.crews),
      MemberSort: sortParameter(SORTS.members),
      CandidateSort: sortParameter(SORTS.candidates),
      TaskId: idPath('taskId', '업무 ID'),
      TypeId: idPath('typeId', '업무 유형 ID'),
      NoteId: idPath('noteId', '지시사항 ID'),
      ItemId: idPath('itemId', '체크리스트 항목 ID'),
      DependsOnId: idPath('dependsOnId', '선행 업무 ID'),
      TaskSort: sortParameter(SORTS.tasks),
      MyTaskSort: sortParameter(SORTS.myTasks),
      TaskStatusFilter: enumQuery('status', 'TaskStatus', '업무 상태'),
      PriorityFilter: enumQuery('priority', 'TaskPriority', '중요도'),
      From: { name: 'from', in: 'query', description: '기간 시작 (ISO 8601, 예: 2026-10-20T00:00:00+09:00)', schema: { type: 'string', format: 'date-time' } },
      To: { name: 'to', in: 'query', description: '기간 끝 (ISO 8601)', schema: { type: 'string', format: 'date-time' } },
      ResourceId: idPath('resourceId', '자원 ID'),
      CategoryId: idPath('categoryId', '자원 분류 ID'),
      MaintenanceId: idPath('maintenanceId', '점검 ID'),
      AllocationId: idPath('allocationId', '구성원 자원 배정 ID'),
      UsageId: idPath('usageId', '사용 기록 ID'),
      ResourceSort: sortParameter(SORTS.resources),
      AllocationSort: sortParameter(SORTS.allocations),
      UsageSort: sortParameter(SORTS.usages),
      ResourceStatusFilter: enumQuery('status', 'ResourceStatus', '자원 상태'),
    },
    schemas: {
      Role: enumSchema(ROLE_INFO, '역할'),
      CrewMemberRole: { type: 'string', enum: [...CREW_MEMBER_ROLES], description: 'Crew에 소속될 수 있는 역할' },
      MemberStatus: enumSchema(MEMBER_STATUS_INFO, '구성원 상태'),
      CrewStatus: enumSchema(CREW_STATUS_INFO, 'Crew 상태'),
      MembershipType: enumSchema(MEMBERSHIP_TYPE_INFO, '소속 유형'),
      JoinMethod: enumSchema(JOIN_METHOD_INFO, '소속 시작 경위'),
      MembershipEndReason: enumSchema(MEMBERSHIP_END_REASON_INFO, '소속 종료 이유'),
      CapoTermEndReason: enumSchema(CAPO_TERM_END_REASON_INFO, '책임자 임기 종료 이유'),
      RequestStatus: enumSchema(REQUEST_STATUS_INFO, '처리 상태'),
      TaskStatus: enumSchema(TASK_STATUS_INFO, '업무 상태'),
      TaskPriority: enumSchema(TASK_PRIORITY_INFO, '중요도'),
      AssigneeRole: enumSchema(ASSIGNEE_ROLE_INFO, '업무 내 역할'),
      AssignmentResponse: enumSchema(ASSIGNMENT_RESPONSE_INFO, '배정 응답'),
      AssignmentReleaseReason: enumSchema(ASSIGNMENT_RELEASE_REASON_INFO, '배정이 끝난 이유'),
      TaskOutcome: enumSchema(TASK_OUTCOME_INFO, '업무 성과'),
      AssignableRole: { type: 'string', enum: [...ASSIGNABLE_ROLES], description: '업무를 맡을 수 있는 역할' },
      ResourceStatus: {
        type: 'string',
        enum: Object.keys(RESOURCE_STATUS_INFO),
        description: `자원 상태: ${Object.entries(RESOURCE_STATUS_INFO).map(([k, v]) => `${k}(${v.label}${v.assignable ? '' : ', 배정 불가'})`).join(', ')}`,
      },
      ResourceMinRole: { type: 'string', enum: [...RESOURCE_MIN_ROLES], default: 'SOLDIER', description: '자원을 이용할 수 있는 최소 역할' },
      MaintenanceSource: enumSchema(MAINTENANCE_SOURCE_INFO, '점검 경위'),
      MaintenanceResult: enumSchema(MAINTENANCE_RESULT_INFO, '점검 결과 (정상 복구 → 사용가능, 수리 불가 → 사용불가)'),
      ReturnCondition: enumSchema(RETURN_CONDITION_INFO, '반환 상태 (손상 → 점검중, 분실 → 사용불가)'),
      ResourceReleaseReason: enumSchema(RESOURCE_RELEASE_REASON_INFO, '할당·배정이 끝난 이유'),
      ResourceCategory: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: '차량' },
          description: { type: 'string', nullable: true },
          resourceCount: { type: 'integer', example: 3 },
          availableCount: { type: 'integer', example: 2, description: '지금 사용가능 상태인 자원 수' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ResourceBrief: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          code: { type: 'string', example: 'VH-001' },
          name: { type: 'string', example: '승합차 1호' },
          category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: '차량' } } },
          status: ref('ResourceStatus'),
          statusLabel: { type: 'string', example: '사용가능' },
          location: { type: 'string', nullable: true },
        },
      },
      ResourceInput: {
        type: 'object',
        required: ['code', 'name', 'categoryId'],
        properties: {
          code: { type: 'string', maxLength: 30, example: 'VH-010', description: '관리 번호 (겹칠 수 없다)' },
          name: { type: 'string', maxLength: 100, example: '승합차 10호' },
          categoryId: { type: 'integer', example: 1 },
          location: { type: 'string', nullable: true, maxLength: 100, example: '강북 차고' },
          description: { type: 'string', nullable: true, maxLength: 1000 },
          minRole: ref('ResourceMinRole'),
        },
      },
      Resource: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          code: { type: 'string', example: 'VH-001' },
          name: { type: 'string', example: '승합차 1호' },
          category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: '차량' } } },
          location: { type: 'string', nullable: true, example: '강북 차고' },
          description: { type: 'string', nullable: true },
          status: ref('ResourceStatus'),
          statusLabel: { type: 'string', example: '사용가능' },
          assignable: { type: 'boolean', description: '새로 배정할 수 있는 상태인지 (점검중·사용불가는 false, BR-08)' },
          minRole: ref('ResourceMinRole'),
          minRoleLabel: { type: 'string', example: 'Soldier' },
          statusChangedAt: { type: 'string', format: 'date-time', nullable: true },
          currentUsage: {
            nullable: true,
            type: 'object',
            description: '사용 중이면 현재 사용자와 반환 예정 시각',
            properties: {
              usageId: { type: 'integer' }, user: ref('UserBrief'), task: nullableRef('TaskBrief'),
              startedAt: { type: 'string', format: 'date-time' }, dueAt: { type: 'string', format: 'date-time' },
              overdue: { type: 'boolean' }, damageReported: { type: 'boolean' },
            },
          },
          openMaintenance: {
            nullable: true,
            type: 'object',
            description: '진행 중인 점검',
            properties: { id: { type: 'integer' }, reason: { type: 'string' }, expectedEndAt: { type: 'string', format: 'date-time', nullable: true }, overdue: { type: 'boolean' } },
          },
          createdBy: nullableRef('UserBrief'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ScheduleEntry: {
        type: 'object',
        description: '자원 예약·사용 시간표 항목. 시간 충돌(BR-07)의 details.conflicts도 이 형태다',
        properties: {
          kind: { type: 'string', enum: ['TASK', 'MEMBER', 'USAGE'] },
          kindLabel: { type: 'string', example: '업무 할당' },
          id: { type: 'integer', description: '업무 할당·구성원 배정·사용 기록 ID' },
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          overdue: { type: 'boolean', description: 'USAGE: 반환 예정 시각이 지났는데 반환되지 않음 (반환될 때까지 그 뒤 시간대와도 겹치는 것으로 본다)' },
          task: nullableRef('TaskBrief'),
          user: nullableRef('UserBrief'),
        },
      },
      ResourceWithReservations: {
        allOf: [ref('Resource'), {
          type: 'object',
          properties: { affectedReservations: { type: 'array', items: ref('ScheduleEntry'), description: '배정할 수 없는 상태가 되어 영향을 받는 지금 이후의 예약' } },
        }],
      },
      ResourceStatusHistoryEntry: {
        type: 'object',
        properties: {
          at: { type: 'string', format: 'date-time' },
          from: { allOf: [ref('ResourceStatus')], nullable: true },
          fromLabel: { type: 'string', nullable: true },
          to: ref('ResourceStatus'),
          toLabel: { type: 'string' },
          cause: { type: 'string', enum: ['CREATED', 'MANUAL', 'CHECKOUT', 'RETURN', 'MAINTENANCE_START', 'MAINTENANCE_COMPLETE', 'DAMAGE_REPORT'] },
          causeLabel: { type: 'string', example: '반환' },
          actor: { type: 'object', properties: { userId: { type: 'integer' }, username: { type: 'string' }, role: { type: 'string' } } },
          reason: { type: 'string', nullable: true },
        },
      },
      Maintenance: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          open: { type: 'boolean', description: '진행 중이면 true' },
          resource: ref('ResourceBrief'),
          source: ref('MaintenanceSource'),
          sourceLabel: { type: 'string', example: '점검 등록' },
          reason: { type: 'string' },
          expectedEndAt: { type: 'string', format: 'date-time', nullable: true },
          overdue: { type: 'boolean', description: '진행 중인데 예정 완료 시각이 지났으면 true' },
          usageId: { type: 'integer', nullable: true, description: '고장 신고·손상 반환으로 열린 점검이면 그 사용 기록' },
          startedAt: { type: 'string', format: 'date-time' },
          startedBy: nullableRef('UserBrief'),
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          completedBy: nullableRef('UserBrief'),
          result: { allOf: [ref('MaintenanceResult')], nullable: true },
          resultLabel: { type: 'string', nullable: true },
          resultNote: { type: 'string', nullable: true },
        },
      },
      MaintenanceCompletion: {
        allOf: [ref('Maintenance'), { type: 'object', properties: { resourceStatus: ref('ResourceStatus'), resourceStatusLabel: { type: 'string' } } }],
      },
      TaskResource: {
        type: 'object',
        description: '업무 자원 할당',
        properties: {
          id: { type: 'integer' },
          active: { type: 'boolean' },
          task: ref('TaskBrief'),
          resource: ref('ResourceBrief'),
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          note: { type: 'string', nullable: true },
          inUse: { type: 'boolean', description: '이 할당으로 지금 사용 중이면 true' },
          usedBy: nullableRef('UserBrief'),
          allocatedBy: nullableRef('UserBrief'),
          allocatedAt: { type: 'string', format: 'date-time' },
          releasedAt: { type: 'string', format: 'date-time', nullable: true },
          releaseReason: { allOf: [ref('ResourceReleaseReason')], nullable: true },
          releaseReasonLabel: { type: 'string', nullable: true },
          releasedBy: nullableRef('UserBrief'),
        },
      },
      ResourceAllocation: {
        type: 'object',
        description: '구성원 자원 배정',
        properties: {
          id: { type: 'integer' },
          active: { type: 'boolean', description: '해제·반환·인계되지 않았으면 true' },
          resource: ref('ResourceBrief'),
          user: ref('UserBrief'),
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          purpose: { type: 'string', nullable: true },
          requestId: { type: 'integer', nullable: true, description: '사용 신청 승인으로 만들어졌으면 그 신청 ID' },
          handedOverFrom: { type: 'integer', nullable: true, description: '인계로 만들어졌으면 원래 배정 ID' },
          inUse: { type: 'boolean' },
          allocatedBy: nullableRef('UserBrief'),
          allocatedAt: { type: 'string', format: 'date-time' },
          releasedAt: { type: 'string', format: 'date-time', nullable: true },
          releaseReason: { allOf: [ref('ResourceReleaseReason')], nullable: true },
          releaseReasonLabel: { type: 'string', nullable: true },
          releasedBy: nullableRef('UserBrief'),
        },
      },
      ResourceRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          resource: ref('ResourceBrief'),
          requester: ref('UserBrief'),
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
          status: ref('RequestStatus'),
          statusLabel: { type: 'string', example: '대기' },
          decidedBy: nullableRef('UserBrief'),
          decidedAt: { type: 'string', format: 'date-time', nullable: true },
          decisionReason: { type: 'string', nullable: true },
          allocationId: { type: 'integer', nullable: true, description: '승인으로 만들어진 구성원 자원 배정 ID' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ResourceUsage: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          open: { type: 'boolean', description: '반환되지 않았으면 true' },
          resource: ref('ResourceBrief'),
          user: ref('UserBrief'),
          basis: { type: 'string', enum: ['TASK', 'MEMBER'], description: '사용 근거: 업무 자원 할당 또는 구성원 자원 배정' },
          task: nullableRef('TaskBrief'),
          taskResourceId: { type: 'integer', nullable: true },
          allocationId: { type: 'integer', nullable: true },
          startedAt: { type: 'string', format: 'date-time' },
          dueAt: { type: 'string', format: 'date-time', description: '반환 예정 시각' },
          overdue: { type: 'boolean', description: '반환되지 않았는데 반환 예정 시각이 지났으면 true' },
          returnedAt: { type: 'string', format: 'date-time', nullable: true },
          returnCondition: { allOf: [ref('ReturnCondition')], nullable: true },
          returnConditionLabel: { type: 'string', nullable: true },
          returnNote: { type: 'string', nullable: true },
          returnedBy: nullableRef('UserBrief'),
          handedOverTo: { ...nullableRef('UserBrief'), description: '인계로 끝났으면 넘겨받은 구성원' },
          handoverFromId: { type: 'integer', nullable: true, description: '인계받아 시작했으면 이전 사용 기록 ID' },
          damageReportedAt: { type: 'string', format: 'date-time', nullable: true },
          damageNote: { type: 'string', nullable: true },
        },
      },
      UsageReturn: {
        allOf: [ref('ResourceUsage'), { type: 'object', properties: { resourceStatus: ref('ResourceStatus'), resourceStatusLabel: { type: 'string' } } }],
      },
      TaskResourceReturn: {
        type: 'object',
        properties: { taskId: { type: 'integer' }, returnedCount: { type: 'integer' }, returned: { type: 'array', items: ref('ResourceUsage') } },
      },
      DamageReport: { type: 'object', properties: { usage: ref('ResourceUsage'), maintenance: ref('Maintenance') } },
      ResourceAvailability: {
        type: 'object',
        properties: {
          resource: ref('ResourceBrief'),
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          available: { type: 'boolean', description: '자원 상태와 시간대 기준으로 배정할 수 있으면 true' },
          usableByMe: { type: 'boolean', description: '내 역할(이용 최소 역할)까지 따져 내가 쓸 수 있으면 true' },
          unassignableReason: { type: 'string', nullable: true },
          conflicts: { type: 'array', items: ref('ScheduleEntry') },
        },
      },
      ResourceSchedule: {
        type: 'object',
        properties: {
          resource: ref('ResourceBrief'),
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: ref('ScheduleEntry') },
        },
      },
      ResourceRequirement: {
        type: 'object',
        properties: {
          category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: '차량' } } },
          quantity: { type: 'integer', example: 1 },
          allocatedCount: { type: 'integer', description: '이 분류에서 업무에 할당된 자원 수' },
          satisfied: { type: 'boolean' },
        },
      },
      TaskRequirements: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
          requiredHeadcount: { type: 'integer', nullable: true },
          leaderRequired: { type: 'boolean' },
          resources: { type: 'array', items: ref('ResourceRequirement'), description: '필요 자원 분류별 수량과 충족 여부' },
        },
      },
      TaskType: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: '순찰' },
          description: { type: 'string', nullable: true },
          taskCount: { type: 'integer', example: 2, description: '이 유형을 쓰는 업무 수' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TaskBrief: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: '강북 정기 순찰' },
          status: ref('TaskStatus'),
          statusLabel: { type: 'string', example: '계획' },
          priority: ref('TaskPriority'),
          priorityLabel: { type: 'string', example: '보통' },
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          crew: nullableRef('CrewBrief'),
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: '강북 정기 순찰' },
          description: { type: 'string', nullable: true },
          type: { nullable: true, type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: '순찰' } } },
          crew: { ...nullableRef('CrewBrief'), description: '담당 Crew. 없으면 Underboss·Boss가 관리하는 조직 업무' },
          priority: ref('TaskPriority'),
          priorityLabel: { type: 'string', example: '보통' },
          status: ref('TaskStatus'),
          statusLabel: { type: 'string', example: '계획' },
          location: { type: 'string', nullable: true },
          startAt: { type: 'string', format: 'date-time' },
          endAt: { type: 'string', format: 'date-time' },
          requiredHeadcount: { type: 'integer', nullable: true, description: '필요 인원 (없으면 1명으로 본다)' },
          leaderRequired: { type: 'boolean' },
          assigneeCount: { type: 'integer', description: '현재 참여자 수' },
          acceptedCount: { type: 'integer', description: '배정을 수락한 참여자 수' },
          pendingCount: { type: 'integer', description: '응답하지 않은 참여자 수' },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          cancelledAt: { type: 'string', format: 'date-time', nullable: true },
          cancelReason: { type: 'string', nullable: true },
          result: {
            nullable: true,
            type: 'object',
            description: '완료된 업무의 결과',
            properties: { outcome: ref('TaskOutcome'), outcomeLabel: { type: 'string' }, summary: { type: 'string' } },
          },
          duplicatedFrom: { type: 'integer', nullable: true, description: '복제한 원본 업무 ID' },
          createdBy: nullableRef('UserBrief'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          viewerRelation: { type: 'string', enum: ['manager', 'participant'], description: '상세 조회에서만: 보는 사람과 업무의 관계' },
        },
      },
      Assignee: {
        type: 'object',
        description: '업무 배정. 현재 참여자와 끝난 배정(이력)이 같은 형태다',
        properties: {
          id: { type: 'integer' },
          active: { type: 'boolean', description: '현재 참여 중이면 true' },
          user: ref('UserBrief'),
          role: ref('AssigneeRole'),
          roleLabel: { type: 'string', example: '리더' },
          response: ref('AssignmentResponse'),
          responseLabel: { type: 'string', example: '응답 대기' },
          responseNote: { type: 'string', nullable: true },
          respondedAt: { type: 'string', format: 'date-time', nullable: true },
          assignedBy: nullableRef('UserBrief'),
          assignedAt: { type: 'string', format: 'date-time' },
          releasedAt: { type: 'string', format: 'date-time', nullable: true },
          releaseReason: { allOf: [ref('AssignmentReleaseReason')], nullable: true },
          releaseReasonLabel: { type: 'string', nullable: true },
          releasedBy: nullableRef('UserBrief'),
          replacedBy: { ...nullableRef('UserBrief'), description: '교체·교대로 이 자리를 넘겨받은 구성원' },
        },
      },
      TaskNote: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string', example: '출발 30분 전에 집합합니다.' },
          target: { ...nullableRef('UserBrief'), description: '받는 참여자 (null이면 참여자 전체)' },
          targetLabel: { type: 'string', nullable: true, example: '참여자 전체' },
          author: nullableRef('UserBrief'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ChecklistItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string', example: '차량 점검' },
          position: { type: 'integer' },
          done: { type: 'boolean' },
          doneBy: nullableRef('UserBrief'),
          doneAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Checklist: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
          total: { type: 'integer', example: 3 },
          doneCount: { type: 'integer', example: 1 },
          items: { type: 'array', items: ref('ChecklistItem') },
        },
      },
      Dependencies: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
          predecessors: { type: 'array', items: ref('TaskBrief'), description: '이 업무가 기다리는 선행 업무' },
          successors: { type: 'array', items: ref('TaskBrief'), description: '이 업무를 기다리는 후행 업무' },
          waitingFor: { type: 'integer', description: '아직 끝나지 않은 선행 업무 수' },
        },
      },
      SwapRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          task: ref('TaskBrief'),
          from: { ...ref('UserBrief'), description: '배정을 넘기려는 참여자' },
          to: { ...ref('UserBrief'), description: '배정을 넘겨받을 구성원' },
          reason: { type: 'string', nullable: true },
          status: ref('RequestStatus'),
          statusLabel: { type: 'string', example: '대기' },
          decidedBy: nullableRef('UserBrief'),
          decidedAt: { type: 'string', format: 'date-time', nullable: true },
          decisionReason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Participation: {
        type: 'object',
        properties: {
          user: ref('UserBrief'),
          participated: { type: 'boolean', description: '실제 참여 여부' },
          contribution: { type: 'string', nullable: true, description: '기여 내용' },
          recordedBy: nullableRef('UserBrief'),
          recordedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProgressReport: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reporter: { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, name: { type: 'string' } } },
          percent: { type: 'integer', minimum: 0, maximum: 100, example: 40 },
          note: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      TaskResult: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
          outcome: ref('TaskOutcome'),
          outcomeLabel: { type: 'string', example: '성공' },
          summary: { type: 'string' },
          completedAt: { type: 'string', format: 'date-time' },
          recordedBy: nullableRef('UserBrief'),
          participations: { type: 'array', items: ref('Participation') },
          corrections: {
            type: 'array',
            description: 'Underboss·Boss의 결과·참여 기록 정정 이력 (변경 전후, 사유)',
            items: { type: 'object', properties: { at: { type: 'string', format: 'date-time' }, action: { type: 'string' }, actor: { type: 'object' }, before: { type: 'object' }, after: { type: 'object' }, reason: { type: 'string' } } },
          },
        },
      },
      StatusHistoryEntry: {
        type: 'object',
        properties: {
          at: { type: 'string', format: 'date-time' },
          action: { type: 'string', enum: ['TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED', 'TASK_CANCELLED'] },
          actionLabel: { type: 'string', example: '상태 변경' },
          from: { allOf: [ref('TaskStatus')], nullable: true },
          fromLabel: { type: 'string', nullable: true },
          to: ref('TaskStatus'),
          toLabel: { type: 'string' },
          actor: { type: 'object', properties: { userId: { type: 'integer' }, username: { type: 'string' }, role: { type: 'string' } } },
          reason: { type: 'string', nullable: true },
        },
      },
      Readiness: {
        type: 'object',
        properties: {
          taskId: { type: 'integer' },
          status: ref('TaskStatus'),
          statusLabel: { type: 'string' },
          ready: { type: 'boolean', description: '지금 시작할 수 있으면 true' },
          personnel: {
            type: 'object',
            properties: {
              requiredHeadcount: { type: 'integer' }, assignedCount: { type: 'integer' }, acceptedCount: { type: 'integer' },
              pendingCount: { type: 'integer' }, leaderRequired: { type: 'boolean' }, hasLeader: { type: 'boolean' },
            },
          },
          unfinishedPredecessors: { type: 'array', items: { type: 'object', properties: { taskId: { type: 'integer' }, title: { type: 'string' }, status: ref('TaskStatus') } } },
          resources: {
            type: 'object',
            properties: {
              requirements: { type: 'array', items: ref('ResourceRequirement') },
              allocatedCount: { type: 'integer', description: '할당된 자원 수' },
              unusable: { type: 'array', items: ref('ResourceBrief'), description: '할당됐지만 점검중·사용불가인 자원' },
            },
          },
          issues: { type: 'array', items: { type: 'string' }, example: ['1명이 아직 배정에 응답하지 않았습니다.', "필요 자원 '차량' 1개 중 0개만 할당되어 있습니다."] },
        },
      },
      Availability: {
        type: 'object',
        properties: {
          user: ref('UserBrief'),
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          available: { type: 'boolean', description: '그 시간대에 새 업무를 배정할 수 있으면 true' },
          unassignableReason: { type: 'string', nullable: true, description: '시간과 관계없이 배정할 수 없는 이유 (정지·탈퇴 등)' },
          conflicts: {
            type: 'array',
            description: '시간이 겹치는 업무',
            items: { type: 'object', properties: { taskId: { type: 'integer' }, title: { type: 'string' }, status: ref('TaskStatus'), startAt: { type: 'string', format: 'date-time' }, endAt: { type: 'string', format: 'date-time' }, crew: nullableRef('CrewBrief') } },
          },
        },
      },
      MyAssignment: {
        type: 'object',
        properties: {
          role: ref('AssigneeRole'), roleLabel: { type: 'string' },
          response: ref('AssignmentResponse'), responseLabel: { type: 'string' },
          assignedAt: { type: 'string', format: 'date-time' },
        },
      },
      MyTaskItem: { type: 'object', properties: { assignment: ref('MyAssignment'), task: ref('Task') } },
      MyTaskDetail: {
        type: 'object',
        properties: {
          task: ref('Task'),
          myAssignment: ref('MyAssignment'),
          notes: { type: 'array', items: ref('TaskNote'), description: '참여자 전체 대상이거나 나에게 온 지시사항' },
          teammates: {
            type: 'array',
            items: { type: 'object', properties: { user: ref('UserBrief'), role: ref('AssigneeRole'), roleLabel: { type: 'string' }, response: ref('AssignmentResponse'), responseLabel: { type: 'string' } } },
          },
          checklist: { type: 'array', items: ref('ChecklistItem') },
          resources: { type: 'array', items: ref('TaskResource'), description: '업무에 할당된 자원 (지금 누가 쓰는지 포함)' },
        },
      },
      Schedule: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          items: {
            type: 'array',
            description: '시작 시각 순. kind=TASK는 내 업무(할당된 자원 포함), kind=RESOURCE는 나에게 배정된 자원',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['TASK', 'RESOURCE'] },
                startAt: { type: 'string', format: 'date-time' },
                endAt: { type: 'string', format: 'date-time' },
                taskId: { type: 'integer', description: 'TASK' },
                title: { type: 'string', description: 'TASK' },
                status: { allOf: [ref('TaskStatus')], description: 'TASK' },
                location: { type: 'string', nullable: true, description: 'TASK' },
                myRole: { allOf: [ref('AssigneeRole')], description: 'TASK' },
                myRoleLabel: { type: 'string', description: 'TASK' },
                resources: { type: 'array', description: 'TASK: 업무에 할당된 자원', items: { allOf: [ref('ResourceBrief'), { type: 'object', properties: { startAt: { type: 'string', format: 'date-time' }, endAt: { type: 'string', format: 'date-time' }, inUse: { type: 'boolean' } } }] } },
                allocationId: { type: 'integer', description: 'RESOURCE' },
                resource: { allOf: [ref('ResourceBrief')], description: 'RESOURCE' },
                purpose: { type: 'string', nullable: true, description: 'RESOURCE' },
                inUse: { type: 'boolean', description: 'RESOURCE: 지금 사용 중인지' },
              },
            },
          },
        },
      },
      Deleted: { type: 'object', properties: { id: { type: 'integer' }, deleted: { type: 'boolean', example: true } } },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '오류 코드. 업무 규칙 위반이면 규칙 ID' },
              message: { type: 'string' },
              details: { nullable: true, description: '필드별 오류 배열, 일괄 처리의 행별 오류 배열, 또는 추가 정보 객체' },
            },
          },
        },
      },
      PageMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          size: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 3 },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 2 },
          username: { type: 'string', example: 'boss' },
          name: { type: 'string', example: 'Vittorio Romano' },
          nickname: { type: 'string', nullable: true, example: 'Don' },
          phone: { type: 'string', nullable: true, example: '010-1234-5678' },
          email: { type: 'string', nullable: true, example: 'boss@family.local' },
          role: ref('Role'),
          roleLabel: { type: 'string', example: 'Boss' },
          rank: { type: 'integer', nullable: true, example: 5, description: '운영 계층 순위 (Administrator는 null)' },
          status: ref('MemberStatus'),
          statusLabel: { type: 'string', example: '활동중' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Me: {
        allOf: [
          ref('User'),
          {
            type: 'object',
            properties: {
              crew: {
                nullable: true,
                description: '현재 정식 소속 Crew와 그 책임자',
                allOf: [ref('CrewBrief'), {
                  type: 'object',
                  properties: { membershipId: { type: 'integer' }, joinedAt: { type: 'string', format: 'date-time' }, capo: nullableRef('UserBrief') },
                }],
              },
              temporaryCrews: {
                type: 'array',
                items: { allOf: [ref('CrewBrief'), { type: 'object', properties: { membershipId: { type: 'integer' }, joinedAt: { type: 'string', format: 'date-time' } } }] },
              },
              leadership: ref('Leadership'),
            },
          },
        ],
      },
      UserBrief: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 5 },
          username: { type: 'string', example: 'capo1' },
          name: { type: 'string', example: 'Lorenzo Bianchi' },
          role: ref('Role'),
          roleLabel: { type: 'string', example: 'Capo' },
          status: ref('MemberStatus'),
          statusLabel: { type: 'string', example: '활동중' },
        },
      },
      UserView: {
        type: 'object',
        description: '다른 구성원 정보. 보는 사람에 따라 공개 범위(visibility)가 다르다: basic(기본) < contact(+연락처, 자기 Crew를 보는 Capo) < full(+계정 시각, 본인·Underboss·Boss·Administrator)',
        properties: {
          ...userCore,
          phone: { type: 'string', nullable: true, description: 'contact 이상에서만' },
          email: { type: 'string', nullable: true, description: 'contact 이상에서만' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true, description: 'full에서만' },
          createdAt: { type: 'string', format: 'date-time', description: 'full에서만' },
          updatedAt: { type: 'string', format: 'date-time', description: 'full에서만' },
          crew: { ...nullableRef('CrewBrief'), description: '현재 정식 소속 Crew' },
          visibility: { type: 'string', enum: ['basic', 'contact', 'full'] },
        },
      },
      UserDetail: {
        allOf: [
          ref('UserView'),
          {
            type: 'object',
            properties: {
              currentMemberships: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    membershipId: { type: 'integer' },
                    crew: ref('CrewBrief'),
                    type: ref('MembershipType'),
                    typeLabel: { type: 'string', example: '정식' },
                    joinedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              leadership: ref('Leadership'),
            },
          },
        ],
      },
      Leadership: {
        type: 'object',
        description: '맡고 있는 Crew',
        properties: {
          capoOf: { ...nullableRef('CrewBrief'), description: '책임자(Capo)로 있는 Crew' },
          underbossOf: { type: 'array', items: ref('CrewBrief'), description: '담당 Underboss로 있는 Crew' },
        },
      },
      CrewBrief: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Northside' },
          region: { type: 'string', example: '서울 강북' },
          status: ref('CrewStatus'),
          statusLabel: { type: 'string', example: '활성' },
        },
      },
      Crew: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Northside' },
          region: { type: 'string', example: '서울 강북' },
          description: { type: 'string', nullable: true },
          status: ref('CrewStatus'),
          statusLabel: { type: 'string', example: '활성' },
          capo: { ...nullableRef('UserBrief'), description: '책임자(Capo)' },
          underboss: { ...nullableRef('UserBrief'), description: '담당 Underboss' },
          memberCount: { type: 'integer', example: 5 },
          regularCount: { type: 'integer', example: 5 },
          temporaryCount: { type: 'integer', example: 0 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          disbandedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Membership: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 12 },
          active: { type: 'boolean', description: '현재 소속이면 true' },
          crew: ref('CrewBrief'),
          user: { description: '소속원. 소속원 목록·상세에서는 공개 범위가 적용된 UserView, 이력에서는 UserBrief', allOf: [ref('UserBrief')] },
          isCapo: { type: 'boolean', description: '이 Crew의 책임자인지 (소속원 목록·상세에서만)' },
          type: ref('MembershipType'),
          typeLabel: { type: 'string', example: '정식' },
          joinMethod: ref('JoinMethod'),
          joinMethodLabel: { type: 'string', example: '편성' },
          fromCrew: { ...nullableRef('CrewBrief'), description: '이동·병합으로 왔으면 원래 Crew' },
          joinedAt: { type: 'string', format: 'date-time' },
          addedBy: nullableRef('UserBrief'),
          leftAt: { type: 'string', format: 'date-time', nullable: true },
          endReason: { allOf: [ref('MembershipEndReason')], nullable: true },
          endReasonLabel: { type: 'string', nullable: true },
          toCrew: { ...nullableRef('CrewBrief'), description: '이동·병합으로 갔으면 옮겨 간 Crew' },
          endedBy: nullableRef('UserBrief'),
          note: { type: 'string', nullable: true },
        },
      },
      CapoTerm: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          active: { type: 'boolean', description: '현재 책임자면 true' },
          capo: ref('UserBrief'),
          startedAt: { type: 'string', format: 'date-time' },
          assignedBy: nullableRef('UserBrief'),
          reason: { type: 'string', nullable: true },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          endReason: { allOf: [ref('CapoTermEndReason')], nullable: true },
          endReasonLabel: { type: 'string', nullable: true },
          endedBy: nullableRef('UserBrief'),
        },
      },
      JoinRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          crew: ref('CrewBrief'),
          applicant: ref('UserBrief'),
          type: ref('MembershipType'),
          typeLabel: { type: 'string', example: '정식' },
          message: { type: 'string', nullable: true },
          status: ref('RequestStatus'),
          statusLabel: { type: 'string', example: '대기' },
          decidedBy: nullableRef('UserBrief'),
          decidedAt: { type: 'string', format: 'date-time', nullable: true },
          decisionReason: { type: 'string', nullable: true },
          membershipId: { type: 'integer', nullable: true, description: '승인으로 만들어진 소속 ID' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RoleChangeRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          user: ref('UserBrief'),
          fromRole: ref('Role'),
          fromRoleLabel: { type: 'string', example: 'Associate' },
          toRole: ref('Role'),
          toRoleLabel: { type: 'string', example: 'Soldier' },
          reason: { type: 'string' },
          status: ref('RequestStatus'),
          statusLabel: { type: 'string', example: '대기' },
          requestedBy: ref('UserBrief'),
          decidedBy: nullableRef('UserBrief'),
          decidedAt: { type: 'string', format: 'date-time', nullable: true },
          decisionReason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          tokenType: { type: 'string', example: 'Bearer' },
          accessToken: { type: 'string', description: 'Authorize 버튼에 넣을 JWT' },
          expiresIn: { type: 'integer', example: 3600, description: '액세스 토큰 유효 시간(초)' },
          refreshToken: { type: 'string', description: '액세스 토큰 재발급용. 재발급할 때마다 새 값으로 바뀐다' },
          refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
          sessionId: { type: 'string', format: 'uuid' },
        },
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          current: { type: 'boolean', description: '지금 요청한 세션인지 여부' },
          userAgent: { type: 'string', nullable: true },
          ip: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      BadRequest: errorResponse('입력값 오류', 'VALIDATION_ERROR', '입력값이 올바르지 않습니다.',
        [{ field: 'body.username', message: '필수 항목입니다.' }]),
      Unauthorized: errorResponse('인증 필요 또는 토큰 오류', 'UNAUTHENTICATED',
        '로그인이 필요합니다. Authorization 헤더에 "Bearer <accessToken>"을 넣어 주세요.'),
      Forbidden: errorResponse('권한 부족, 관리 범위 밖(BR-05), 역할 순위 위반(BR-04), 또는 사용할 수 없는 계정', 'FORBIDDEN',
        "'Southside' Crew를 관리할 권한이 없습니다. Capo는 자신이 책임자인 Crew만 관리할 수 있습니다.", { rule: 'BR-05', crewId: 2 }),
      NotFound: errorResponse('대상 없음', 'NOT_FOUND', 'Crew(ID 99)를 찾을 수 없습니다.'),
      Conflict: errorResponse('업무 규칙 위반(code에 규칙 ID) 또는 현재 상태와 충돌(CONFLICT·DUPLICATE)', 'BR-01',
        "Marco Ricci님은 이미 'Northside' Crew에 정식 소속되어 있습니다. 한 구성원은 동시에 둘 이상의 Crew에 정식 소속될 수 없습니다.",
        { userId: 9, currentCrewId: 1, currentCrewName: 'Northside' }),
      BulkRejected: errorResponse('일괄 처리에서 한 건 이상 실패해 전체 취소 (details에 행별 오류)', 'BULK_REJECTED',
        '3건 중 1건이 처리될 수 없어 전체를 취소했습니다.',
        [{ index: 1, userId: 9, code: 'BR-01', message: "Marco Ricci님은 이미 'Northside' Crew에 정식 소속되어 있습니다. ..." }]),
      UserOne: ok('UserDetail'),
      UserPage: okPage('UserView'),
      CrewOne: ok('Crew'),
      CrewPage: okPage('Crew'),
      MembershipOne: ok('Membership'),
      MembershipPage: okPage('Membership'),
      CapoTermPage: okPage('CapoTerm'),
      JoinRequestOne: ok('JoinRequest'),
      JoinRequestPage: okPage('JoinRequest'),
      RoleRequestOne: ok('RoleChangeRequest'),
      RoleRequestPage: okPage('RoleChangeRequest'),
      MeOne: ok('Me'),
      Deleted: ok('Deleted', '삭제 성공'),
      TaskTypeOne: ok('TaskType'),
      TaskTypeList: okList('TaskType'),
      TaskOne: ok('Task'),
      TaskPage: okPage('Task'),
      AssigneeList: okList('Assignee', '현재 참여자 목록'),
      AssigneeOne: ok('Assignee'),
      AssigneePage: okPage('Assignee'),
      NoteOne: ok('TaskNote'),
      NoteList: okList('TaskNote'),
      ChecklistItemOne: ok('ChecklistItem'),
      ChecklistOne: ok('Checklist'),
      DependenciesOne: ok('Dependencies'),
      SwapOne: ok('SwapRequest'),
      SwapPage: okPage('SwapRequest'),
      ParticipationOne: ok('Participation'),
      ParticipationList: okList('Participation'),
      ProgressOne: ok('ProgressReport'),
      ProgressPage: okPage('ProgressReport'),
      TaskResultOne: ok('TaskResult'),
      StatusHistoryPage: okPage('StatusHistoryEntry'),
      ReadinessOne: ok('Readiness'),
      AvailabilityOne: ok('Availability'),
      MyTaskPage: okPage('MyTaskItem'),
      MyTaskOne: ok('MyTaskDetail'),
      ScheduleOne: ok('Schedule'),
      TaskRequirementsOne: ok('TaskRequirements'),
      ResourceCategoryOne: ok('ResourceCategory'),
      ResourceCategoryList: okList('ResourceCategory'),
      ResourceOne: ok('Resource'),
      ResourcePage: okPage('Resource'),
      ResourceList: okList('Resource', '등록 성공'),
      ResourceStatusChanged: ok('ResourceWithReservations'),
      ResourceStatusHistoryPage: okPage('ResourceStatusHistoryEntry'),
      MaintenanceOne: ok('Maintenance'),
      MaintenancePage: okPage('Maintenance'),
      MaintenanceCompleted: ok('MaintenanceCompletion'),
      TaskResourceOne: ok('TaskResource'),
      TaskResourceList: okList('TaskResource', '업무에 할당된 자원 목록'),
      TaskResourceReturnOne: ok('TaskResourceReturn'),
      ResourceAvailabilityOne: ok('ResourceAvailability'),
      ResourceScheduleOne: ok('ResourceSchedule'),
      AllocationOne: ok('ResourceAllocation'),
      AllocationPage: okPage('ResourceAllocation'),
      ResourceRequestOne: ok('ResourceRequest'),
      ResourceRequestPage: okPage('ResourceRequest'),
      UsageOne: ok('ResourceUsage'),
      UsagePage: okPage('ResourceUsage'),
      UsageReturned: ok('UsageReturn'),
      DamageReportOne: ok('DamageReport'),
    },
  },
};

module.exports = swaggerJSDoc({ definition, apis: [path.join(__dirname, '..', 'routes', '*.js')] });
