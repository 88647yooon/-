// 홈 화면의 "기능 요구사항 확인" 표와 "업무 규칙 확인 시나리오" 내용 (단계 1~6).
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
  {
    step: 3, id: 'FR-07', title: '업무 등록과 일정·중요도·상태 관리', link: '/tasks',
    how: 'capo1로 [업무]에서 업무를 등록하고, 업무 화면에서 정보·일정·필요 인원을 바꾸고 시작·보류한다.',
    api: 'POST /api/tasks, PATCH /api/tasks/{taskId}, /schedule, /status',
  },
  {
    step: 3, id: 'FR-08', title: '한 업무에 여러 구성원 참여', link: '/tasks',
    how: '업무 화면에서 아이디를 쉼표로 여러 개 넣어 한 번에 배정하고, 역할 변경·해제·교체·교대 요청을 한다.',
    api: 'POST /api/tasks/{taskId}/assignees, /replacement, /swap-requests',
  },
  {
    step: 3, id: 'FR-09', title: '내 업무와 확인할 정보', link: '/my-tasks',
    how: 'soldier1로 [내 업무]에서 배정된 업무를 열면 나에게 온 지시사항·체크리스트·함께하는 참여자가 보이고, 배정을 수락·거절할 수 있다.',
    api: 'GET /api/me/tasks, /api/me/tasks/{taskId}, /api/me/schedule',
  },
  {
    step: 3, id: 'FR-10', title: '진행 상태 변경과 변경 이력', link: '/tasks',
    how: '업무 화면에서 시작·보류·완료하고, 진행 보고를 남기면 상태 변경 이력에 처리자·사유가 쌓인다.',
    api: 'PATCH /api/tasks/{taskId}/status, POST /complete, /progress, GET /status-history',
  },
  {
    step: 3, id: 'FR-11', title: '완료 결과와 참여 기록', link: '/tasks',
    how: '완료된 업무(강남 정보 수집)에서 성과·결과 요약과 참여자별 참여 기록을 확인한다.',
    api: 'GET /api/tasks/{taskId}/result, /participations',
  },
  {
    step: 3, id: 'FR-12', title: '기간·Crew·상태·담당자로 업무 탐색', link: '/tasks',
    how: 'boss로 [업무]에서 상태·중요도·Crew로 거르고 정렬한다. API는 기간(from·to)과 담당자(assigneeId)도 지원한다.',
    api: 'GET /api/tasks?status=&crewId=&from=&to=&assigneeId=',
  },
  {
    step: 4, id: 'FR-13', title: '공용 자원 등록과 상태 관리', link: '/resources',
    how: 'underboss1로 [자원]에서 자원을 등록하고, 자원 화면에서 상태(사용가능·점검중·사용불가)와 정보를 바꾼다.',
    api: 'POST /api/resources, /bulk, PATCH /api/resources/{resourceId}, /status',
  },
  {
    step: 4, id: 'FR-14', title: '권한·상태에 따른 이용 가능 자원 확인', link: '/resources',
    how: 'soldier1과 capo1로 [자원]의 이용 가능한 자원을 비교한다. 이용 최소 역할이 Capo인 세단·방탄 조끼와 점검중·사용불가 자원은 soldier1에게 보이지 않는다.',
    api: 'GET /api/resources/available, PATCH /api/resources/{resourceId}/access-level',
  },
  {
    step: 4, id: 'FR-15', title: '자원 사용·반환·상태 변경 이력', link: '/my-resources',
    how: 'soldier1로 [내 자원]에서 무전기 2호 사용을 시작하고 반환한다. capo1로 자원 화면의 사용·반환 이력과 상태 변경 이력에서 그 기록을 확인한다.',
    api: 'POST /api/resources/{resourceId}/checkout, /return, GET /usages, /status-history',
  },
  {
    step: 4, id: 'FR-16', title: '점검·사용불가 자원 구분 관리', link: '/resources?assignable=false',
    how: 'capo1로 [자원]의 전체 자원에서 점검중·사용불가 자원만 거르고, 진행 중인 점검(화물 트럭)을 확인·완료한다. 사용 중 고장 신고와 손상 반환도 점검을 연다.',
    api: 'POST /api/resources/{resourceId}/maintenances, GET /api/maintenances, POST /api/resource-usages/{usageId}/damage-reports',
  },
  {
    step: 4, id: 'FR-17', title: '업무·구성원에게 자원 배정', link: '/tasks',
    how: 'capo1로 업무 화면의 자원 칸에서 자원을 할당하고, 자원 화면에서 구성원에게 배정한다. soldier3의 무전기 사용 신청은 capo2가 [내 자원]에서 승인한다.',
    api: 'POST /api/tasks/{taskId}/resources, /api/resources/{resourceId}/allocations, /api/resource-requests/{requestId}/approve',
  },
  {
    step: 5, id: 'FR-18', title: '평가·평판 기록', link: '/evaluations',
    how: 'capo2로 [평가]의 작성할 평가에서 강남 정보 수집을 열어 soldier1을 평가한다. underboss1로 구성원 상세에서 공로·징계를 기록하면 평판 점수가 바뀐다.',
    api: 'POST /api/tasks/{taskId}/evaluations, PATCH /api/evaluations/{evaluationId}, POST /api/users/{userId}/reputation-events',
  },
  {
    step: 5, id: 'FR-19', title: '권한 범위 안의 활동·평가 이력 조회', link: '/me',
    how: 'soldier1로 [내 정보] → 내 구성원 화면에서 평판, 받은 평가, 변경 이력, 활동을 본다. 다른 Soldier의 화면에서는 이 영역이 막힌다.',
    api: 'GET /api/users/{userId}/change-history, /activity, /evaluations, /reputation',
  },
  {
    step: 5, id: 'FR-20', title: '중요 상태 변경·관리 활동 기록', link: '/audit-logs',
    how: 'boss 또는 admin으로 [감사 기록]에서 행위·대상·기간으로 찾고 상세에서 변경 전후를 본다. admin은 CSV로 내려받고 권한 거부 기록도 본다.',
    api: 'GET /api/audit-logs, /api/audit-logs/{logId}, /export, /api/security-events',
  },
  {
    step: 6, id: 'FR-21', title: '권한 범위 안의 통합 검색과 조건 저장', link: '/search?q=%EA%B0%95%EB%B6%81',
    how: '[검색]에서 "강북"을 boss와 soldier1로 각각 찾아 본다. soldier1은 내가 참여 중인 업무와 이용할 수 있는 자원만, associate1은 구성원·자원이 막힌다. 조건을 저장해 다시 실행한다.',
    api: 'GET /api/search, POST·GET /api/saved-searches, GET /api/saved-searches/{searchId}/results',
  },
  {
    step: 6, id: 'FR-22', title: '기간·Crew·구성원 상태·업무 상태별 운영 현황', link: '/dashboard',
    how: 'boss로 [운영 현황]에서 기간을 바꾸며 업무 상태 추이, 자원 상태·가동률, Crew 비교, 구성원 분포, 운영 경고를 본다. Crew 화면에는 소속원별 업무량이 있다.',
    api: 'GET /api/stats/overview, /members, /crews, /tasks, /resources, /alerts, /api/crews/{crewId}/workload',
  },
  {
    step: 6, id: 'FR-23', title: '계정·권한 관리', link: '/admin',
    how: 'admin으로 [관리자]에서 계정을 잠그고 풀고, 임시 비밀번호를 발급하고, 역할별 권한과 운영 설정을 바꾼다. 무결성 점검과 DB 연결 상태도 여기서 본다.',
    api: 'PUT·DELETE /api/admin/accounts/{userId}/lock, PUT /api/admin/permissions/{role}, PUT /api/admin/settings',
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
    rule: 'BR-02', title: '정지·탈퇴 구성원은 새 업무에 배정 불가',
    steps: [
      'capo1로 로그인 → 업무 → 강북 정기 순찰',
      '배정: 아이디 suspended1 → BR-02로 거부 (정지 상태)',
    ],
  },
  {
    rule: 'BR-03', title: '같은 시간대 업무 중복 배정 불가',
    steps: [
      'capo1로 로그인 → 업무 → 지금부터 1시간짜리 업무 등록',
      '배정: 아이디 soldier2 → BR-03으로 거부 (지금 진행 중인 물품 운송과 겹침)',
      '시간이 맞닿기만 하면(끝나는 시각 = 시작 시각) 배정된다',
    ],
  },
  {
    rule: 'BR-06', title: '완료된 업무의 핵심 결과는 일반 구성원이 변경 불가',
    steps: [
      'capo2로 로그인 → 업무 → 강남 정보 수집(완료)',
      '결과 정정 → BR-06으로 거부',
      'boss로 같은 화면에서 사유를 넣어 정정하면 성공하고 정정 이력이 남는다',
    ],
  },
  {
    rule: 'FR-08', title: '업무 교대 요청과 승인',
    steps: [
      'capo1로 로그인 → 내 업무 → soldier2가 associate1에게 넘기려는 강북 정기 순찰 교대 요청',
      '승인하면 배정 규칙을 다시 검사한 뒤 associate1이 배정된다',
    ],
  },
  {
    rule: 'BR-07', title: '사용 중인 자원은 같은 시간대에 중복 배정 불가',
    steps: [
      'capo1로 로그인 → 자원 → 승합차 2호 (VH-002)',
      '구성원에게 배정: 아이디 soldier1, 내일 10:30~11:30 → BR-07로 거부 (강북 정기 순찰에 할당됨)',
      '같은 자원을 내일 12:00~13:00로 배정하면 성공한다 (맞닿은 시간은 허용)',
    ],
  },
  {
    rule: 'BR-08', title: '사용불가·점검중 자원은 새로 배정 불가',
    steps: [
      'capo1로 로그인 → 업무 → 강북 정기 순찰 → 자원 할당: 관리 번호 RD-003 → BR-08로 거부 (사용불가)',
      '관리 번호 VH-004(화물 트럭, 점검중)도 BR-08로 거부된다',
      'capo3로 화물 트럭의 점검을 정상 복구로 완료하면 사용가능이 되어 할당할 수 있다',
    ],
  },
  {
    rule: 'FR-15', title: '자원 사용과 반환 이력',
    steps: [
      'soldier1로 로그인 → 내 자원 → 무전기 2호 사용 시작 (지금 배정 시간대)',
      '반환 상태 정상으로 반환 → 자원이 사용가능으로 돌아온다',
      'capo1로 로그인 → 자원 → 무전기 2호 → 사용·반환 이력과 상태 변경 이력에서 확인',
    ],
  },
  {
    rule: 'FR-18', title: '완료되지 않은 업무는 평가 불가',
    steps: [
      'capo1로 로그인 → Swagger에서 POST /api/tasks/{강북 정기 순찰 ID}/evaluations',
      '계획 상태 업무라 409로 거부된다 (완료된 업무만 평가)',
      'capo2로 로그인 → 평가 → 작성할 평가의 강남 정보 수집 → 참여자 평가에서 soldier1을 평가하면 성공한다',
    ],
  },
  {
    rule: 'BR-10', title: '평가 이의 제기와 정정 이력',
    steps: [
      'soldier1이 underboss1에게 받은 강남 정보 수집 평가에 낸 이의(대기)를 boss로 [평가] → 처리할 이의 제기에서 정정한다',
      '평가 상세의 수정·정정 이력에 변경 전후 점수와 사유가 남는다',
      'soldier1의 구성원 화면 변경 이력에 평가 정정이 시간순으로 추가된다',
    ],
  },
  {
    rule: 'BR-10', title: '역할·소속·상태·평가 변경 이력',
    steps: [
      'boss로 구성원 → associate1 상세의 변경 이력에서 계정 등록·소속·징계 기록을 시간순으로 확인',
      '역할을 바꾸면 변경 이력에 이전 역할 → 새 역할과 사유가 바로 추가된다',
      'Crew 상세의 편성 이력·책임자 이력·Crew 활동에서 처리한 사람과 시각을 확인',
    ],
  },
  {
    rule: 'BR-09', title: '권한 없는 직접 접근 차단',
    steps: [
      'associate1로 로그인 → 주소창에 /users 입력 → 403 화면 (보안 이벤트로 기록)',
      'boss로 로그인 → 주소창에 /admin 입력 → 403 화면. Swagger에서 boss 토큰으로 GET /api/admin/accounts를 호출해도 403',
      'admin으로 감사 기록 → 권한 거부 기록에서 위 시도를 확인. 토큰 없이 API를 호출하면 401',
    ],
  },
  {
    rule: 'FR-23', title: '계정 잠금과 역할별 권한 즉시 반영',
    steps: [
      'admin으로 관리자 → soldier2 잠금 → soldier2로 로그인하면 "잠긴 계정" 메시지 (다시 잠금 해제)',
      '관리자 → 역할별 권한 → Soldier에서 resource.read를 빼고 저장 → soldier1의 [자원] 메뉴가 사라지고 /resources는 403',
      '기본값이 허용인 것만 체크해 다시 저장하면 원래대로 돌아온다',
    ],
  },
];

module.exports = { CHECKS, SCENARIOS };
