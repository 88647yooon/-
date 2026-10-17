// 홈 화면의 "기능 요구사항 확인" 표와 "업무 규칙 확인 시나리오" 내용 (단계 1·2).
// 기술 보고서의 기능 확인 방법과 같은 순서로 확인할 수 있게 정리한다.

const CHECKS = [
  {
    step: 1, id: 'FR-02', title: '로그인과 본인 정보 확인', link: '/me',
    how: '로그인한 뒤 [내 정보]에서 역할·상태·사용 가능한 기능을 확인한다.',
    api: 'POST /api/auth/login, GET /api/me, GET /api/me/permissions',
  },
  {
    step: 1, id: 'NFR-03', title: '서버 측 인증과 세션 관리', link: '/me',
    how: '[내 정보]의 로그인 세션 목록과 모든 세션 종료. 정지 계정(suspended1)·탈퇴 계정(withdrawn1)은 로그인이 거부된다.',
    api: 'GET·DELETE /api/auth/sessions, POST /api/auth/logout',
  },
  {
    step: 1, id: 'FR-01', title: '내 연락처·비밀번호 변경', link: '/me',
    how: '[내 정보]의 연락처·별명 수정과 비밀번호 변경. 변경 내용은 활동 기록에 남는다.',
    api: 'PATCH /api/me, PUT /api/me/password',
  },
  {
    step: 2, id: 'FR-01', title: '구성원 등록·관리', link: '/users',
    how: 'admin 또는 underboss1로 [구성원]에서 새 구성원을 등록하고, 상세 화면에서 기본 정보를 수정한다.',
    api: 'POST /api/users, PATCH·DELETE /api/users/{userId}',
  },
  {
    step: 2, id: 'FR-02', title: '현재 소속·역할·상태와 활동 확인', link: '/me',
    how: '[내 정보]의 정식 소속 Crew와 책임자, 구성원 상세의 소속 이력과 지휘 계통을 확인한다.',
    api: 'GET /api/me, GET /api/users/{userId}/memberships, /chain-of-command',
  },
  {
    step: 2, id: 'FR-03', title: '역할·상태·소속 변경', link: '/users',
    how: '구성원 상세에서 역할·상태를 바꾼다. Capo는 역할 변경을 추천하고 Underboss·Boss가 [역할 변경 요청]에서 승인한다.',
    api: 'PATCH /api/users/{userId}/role, /status, /api/role-change-requests',
  },
  {
    step: 2, id: 'FR-04', title: '구성원 상태 구분 관리', link: '/users',
    how: '[구성원]에서 상태로 거르고, 상세에서 상태를 바꾼다. 허용되지 않는 전이(예: 활동중 → 대기)는 거부된다.',
    api: 'GET /api/member-statuses, PATCH /api/users/{userId}/status',
  },
  {
    step: 2, id: 'FR-05', title: 'Crew와 책임자·구성원 확인', link: '/crews',
    how: '[Crew]에서 Crew를 만들고, 상세 화면에서 조직도·소속원·책임자 이력을 확인한다.',
    api: 'GET·POST /api/crews, GET /api/crews/{crewId}/hierarchy, /members',
  },
  {
    step: 2, id: 'FR-06', title: '관리 범위 안의 편성 변경', link: '/crews',
    how: 'Crew 상세에서 편성·제외·소속 유형 변경·이동·병합을 하고, 소속 신청을 승인한다.',
    api: 'POST /api/crews/{crewId}/members, /transfer, /join-requests, /api/crews/merge',
  },
];

const SCENARIOS = [
  {
    rule: 'BR-01', title: '정식 소속은 한 Crew만',
    steps: [
      'boss로 로그인 → Crew → Northside',
      '편성: 아이디 soldier3, 유형 정식 → BR-01로 거부 (soldier3는 Southside 정식 소속)',
      '같은 구성원을 유형 임시로 편성하면 성공',
    ],
  },
  {
    rule: 'BR-05', title: 'Capo는 자신이 책임자인 Crew만 편성',
    steps: [
      'capo1로 로그인 → Crew → Southside',
      '편성: 아이디 associate2 → BR-05로 거부',
      'Northside에서는 편성·제외가 된다',
    ],
  },
  {
    rule: 'BR-04', title: '같거나 높은 역할의 구성원은 역할 변경 불가',
    steps: [
      'underboss1로 로그인 → 구성원 → boss 상세',
      '역할 변경 → BR-04로 거부',
      '같은 화면에서 Soldier·Associate의 역할은 바꿀 수 있다',
    ],
  },
  {
    rule: 'FR-06', title: '소속 신청과 승인',
    steps: [
      'associate2로 로그인 → 내 정보에서 Southside 신청(대기) 확인',
      'capo2로 로그인 → Crew → Southside → 소속 신청 승인',
      'associate2로 다시 로그인하면 내 정보에 Southside 정식 소속이 보인다',
    ],
  },
  {
    rule: 'FR-03', title: '역할 변경 추천과 승인',
    steps: [
      'underboss1로 로그인 → 역할 변경 요청',
      'capo1이 associate1을 Soldier로 추천한 요청을 승인',
      'associate1 상세에서 역할이 Soldier로 바뀐 것을 확인',
    ],
  },
  {
    rule: 'BR-10', title: '역할·소속·상태 변경 이력',
    steps: [
      '구성원 상세의 소속 이력에서 언제, 왜 소속이 끝났는지 확인',
      'Crew 상세의 편성 이력과 책임자 이력에서 처리한 사람과 시각을 확인',
    ],
  },
  {
    rule: 'BR-09', title: '권한 없는 직접 접근 차단',
    steps: [
      'associate1로 로그인 → 주소창에 /users 입력 → 403 화면 (보안 이벤트로 기록)',
      'Swagger에서 토큰 없이 API를 호출하면 401',
    ],
  },
];

module.exports = { CHECKS, SCENARIOS };
