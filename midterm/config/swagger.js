// Swagger(OpenAPI) 문서 설정 (CR-04). 각 API 문서는 routes/*.js의 @openapi 주석에 있다.
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const config = require('./index');
const seedData = require('../models/seedData');
const { ROLE_INFO, MEMBER_STATUS_INFO } = require('./constants');

const accountRows = seedData.users
  .map((u) => `| ${u.username} | ${ROLE_INFO[u.role].label} | ${MEMBER_STATUS_INFO[u.status].label} |`)
  .join('\n');

const description = `
The Family 통합 정보시스템 REST API (학번 202211207)

### 사용 방법
1. **인증 → POST /api/auth/login**에서 아래 테스트 계정으로 로그인한다.
2. 응답의 \`data.accessToken\` 값을 복사해 오른쪽 위 **Authorize** 버튼에 붙여 넣는다.
3. 이제 권한이 필요한 API를 실행할 수 있다. 각 API 설명 맨 앞의 [ ] 안은 연결된 요구사항 ID다.

### 테스트 계정 (비밀번호 모두 \`${config.seedPassword}\`)
| 아이디 | 역할 | 상태 |
| --- | --- | --- |
${accountRows}

### 공통 응답 형식
- 성공: \`{ "success": true, "data": ..., "meta": ... }\` (\`meta\`는 목록 조회에만)
- 실패: \`{ "success": false, "error": { "code", "message", "details" } }\`
- 상태 코드: 입력 오류 400, 인증 없음 401, 권한 부족 403, 대상 없음 404, 업무 규칙 위반 409(\`error.code\`에 규칙 ID), 서버 오류 500
`;

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

const definition = {
  openapi: '3.0.3',
  info: { title: 'The Family 통합 정보시스템 API', version: '1.0.0', description },
  tags: [
    { name: '인증', description: '로그인, 토큰 재발급, 세션 관리' },
    { name: '내 정보', description: '로그인한 사용자 본인의 정보' },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'POST /api/auth/login 응답의 accessToken' },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '오류 코드. 업무 규칙 위반이면 규칙 ID' },
              message: { type: 'string' },
              details: { nullable: true, description: '필드별 오류 배열 또는 추가 정보 객체' },
            },
          },
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
          role: { type: 'string', enum: Object.keys(ROLE_INFO), example: 'BOSS' },
          roleLabel: { type: 'string', example: 'Boss' },
          rank: { type: 'integer', nullable: true, example: 5, description: '운영 계층 순위 (Administrator는 null)' },
          status: { type: 'string', enum: Object.keys(MEMBER_STATUS_INFO), example: 'ACTIVE' },
          statusLabel: { type: 'string', example: '활동중' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
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
      Forbidden: errorResponse('권한 부족 또는 사용할 수 없는 계정', 'FORBIDDEN', '이 작업을 수행할 권한이 없습니다.',
        { permission: 'me.update', role: 'ASSOCIATE' }),
      NotFound: errorResponse('대상 없음', 'NOT_FOUND', '대상을 찾을 수 없습니다.'),
      Conflict: errorResponse('업무 규칙 위반', 'BR-03', '같은 시간대에 이미 배정된 업무가 있습니다.'),
    },
  },
};

module.exports = swaggerJSDoc({ definition, apis: [path.join(__dirname, '..', 'routes', '*.js')] });
