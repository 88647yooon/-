// Swagger(OpenAPI) 문서 설정 (CR-04). 각 API 문서는 routes/*.js의 @openapi 주석에 있다.
// 코드 목록(enum)·정렬 키는 constants.js와 routes/rules.js에서 가져와 검증 규칙과 문서가 어긋나지 않게 한다.
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const config = require('./index');
const seedData = require('../models/seedData');
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO, CREW_MEMBER_ROLES,
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
    },
  },
};

module.exports = swaggerJSDoc({ definition, apis: [path.join(__dirname, '..', 'routes', '*.js')] });
