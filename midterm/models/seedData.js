// 시드 데이터. 채점자가 기능 확인 방법을 그대로 따라 할 수 있도록 역할·상태별 계정을 둔다.
// 모든 계정의 비밀번호는 config.seedPassword다.

const users = [
  { username: 'admin', name: 'System Admin', role: 'ADMIN', status: 'ACTIVE', email: 'admin@family.local' },
  { username: 'boss', name: 'Vittorio Romano', nickname: 'Don', role: 'BOSS', status: 'ACTIVE' },
  { username: 'underboss1', name: 'Salvatore Greco', role: 'UNDERBOSS', status: 'ACTIVE' },
  { username: 'underboss2', name: 'Antonio Lombardi', role: 'UNDERBOSS', status: 'ACTIVE' },
  { username: 'capo1', name: 'Lorenzo Bianchi', role: 'CAPO', status: 'ACTIVE', phone: '010-1000-0001' },
  { username: 'capo2', name: 'Matteo Ferrari', role: 'CAPO', status: 'ACTIVE', phone: '010-1000-0002' },
  { username: 'capo3', name: 'Franco Rinaldi', role: 'CAPO', status: 'ACTIVE' },
  { username: 'soldier1', name: 'Luca Esposito', role: 'SOLDIER', status: 'ACTIVE' },
  { username: 'soldier2', name: 'Marco Ricci', role: 'SOLDIER', status: 'ACTIVE' },
  { username: 'soldier3', name: 'Giovanni Conti', role: 'SOLDIER', status: 'ACTIVE' },
  { username: 'soldier4', name: 'Stefano Galli', role: 'SOLDIER', status: 'ACTIVE' },
  { username: 'associate1', name: 'Paolo Moretti', role: 'ASSOCIATE', status: 'ACTIVE' },
  { username: 'associate2', name: 'Enzo Marino', role: 'ASSOCIATE', status: 'ACTIVE' },
  // 상태별 확인용 계정 (FR-04, BR-02)
  { username: 'pending1', name: 'Nico Costa', role: 'ASSOCIATE', status: 'PENDING' },
  { username: 'suspended1', name: 'Dario Gallo', role: 'SOLDIER', status: 'SUSPENDED' },
  { username: 'withdrawn1', name: 'Rocco Bruno', role: 'SOLDIER', status: 'WITHDRAWN' },
];

// Crew와 소속. members: [아이디, 소속 유형]. soldier1은 Northside 정식 + Southside 임시 소속이다 (BR-01 확인용).
// associate2는 어느 Crew에도 소속되지 않은 활동중 구성원이다 (편성·소속 신청 확인용).
const crews = [
  {
    name: 'Northside',
    region: '서울 강북',
    description: '강북 지역을 맡는 Crew',
    capo: 'capo1',
    underboss: 'underboss1',
    members: [['capo1', 'REGULAR'], ['soldier1', 'REGULAR'], ['soldier2', 'REGULAR'], ['associate1', 'REGULAR'], ['suspended1', 'REGULAR']],
  },
  {
    name: 'Southside',
    region: '서울 강남',
    description: '강남 지역을 맡는 Crew',
    capo: 'capo2',
    underboss: 'underboss1',
    members: [['capo2', 'REGULAR'], ['soldier3', 'REGULAR'], ['soldier1', 'TEMPORARY']],
  },
  {
    name: 'Harbor',
    region: '부산',
    description: '부산 항만 지역을 맡는 Crew',
    capo: 'capo3',
    underboss: 'underboss2',
    members: [['capo3', 'REGULAR'], ['soldier4', 'REGULAR']],
  },
];

// 처리 대기 중인 소속 신청과 역할 변경 요청 (승인·거절 확인용)
const joinRequests = [
  { username: 'associate2', crew: 'Southside', type: 'REGULAR', message: 'Southside에서 활동하고 싶습니다.' },
];
const roleRequests = [
  { username: 'associate1', requestedBy: 'capo1', toRole: 'SOLDIER', reason: '최근 맡은 일을 성실히 수행했습니다.' },
];

// ---------------------------------------------------------------------------
// 단계 3: 업무. 일정은 시드를 넣는 날 기준 한국 시간이다.
//   { day, hour }: day일 뒤 hour시 (KST),  { hoursFromNow }: 지금부터 몇 시간 뒤
// 같은 구성원의 끝나지 않은 업무끼리 시간이 겹치지 않게 짠다 (BR-03).
const taskTypes = [
  { name: '순찰', description: '정해진 구역을 돌며 상황을 살핀다.' },
  { name: '운송', description: '물품을 안전하게 옮긴다.' },
  { name: '정보 수집', description: '정보를 모아 보고서로 정리한다.' },
  { name: '회의', description: '간부 회의와 보고' },
  { name: '점검', description: '시설과 물품 상태를 확인한다.' },
];

// assignees: [아이디, 업무 내 역할, 배정 응답]
const tasks = [
  {
    key: 'patrol',
    title: '강북 정기 순찰',
    type: '순찰',
    crew: 'Northside',
    createdBy: 'capo1',
    priority: 'MEDIUM',
    location: '강북 일대',
    start: { day: 1, hour: 10 },
    end: { day: 1, hour: 12 },
    status: 'PLANNED',
    requiredHeadcount: 2,
    leaderRequired: true,
    assignees: [['soldier1', 'LEADER', 'ACCEPTED'], ['soldier2', 'MEMBER', 'PENDING']],
    notes: [
      { author: 'capo1', content: '출발 30분 전에 강북 사무실에 집합합니다.' },
      { author: 'capo1', target: 'soldier1', content: '리더는 순찰 경로를 미리 확인해 주세요.' },
    ],
    checklist: [{ content: '차량 점검' }, { content: '무전기 지급' }],
  },
  {
    key: 'transport',
    title: '물품 운송',
    type: '운송',
    crew: 'Northside',
    createdBy: 'capo1',
    priority: 'HIGH',
    location: '강북 창고 → 남부 창고',
    start: { hoursFromNow: -1 },
    end: { hoursFromNow: 3 },
    status: 'IN_PROGRESS',
    requiredHeadcount: 2,
    assignees: [['soldier2', 'LEADER', 'ACCEPTED'], ['associate1', 'MEMBER', 'ACCEPTED']],
    checklist: [{ content: '물품 수량 확인', doneBy: 'soldier2' }, { content: '도착 보고' }],
    progress: [{ by: 'soldier2', percent: 40, note: '물품의 절반을 옮겼습니다.' }],
  },
  {
    key: 'intel',
    title: '강남 정보 수집',
    type: '정보 수집',
    crew: 'Southside',
    createdBy: 'capo2',
    priority: 'MEDIUM',
    location: '강남 일대',
    start: { day: -1, hour: 14 },
    end: { day: -1, hour: 17 },
    status: 'COMPLETED',
    assignees: [['soldier3', 'LEADER', 'ACCEPTED'], ['soldier1', 'MEMBER', 'ACCEPTED']],
    result: { outcome: 'SUCCESS', summary: '목표 지역의 동향 보고서를 제출했다.', by: 'capo2' },
    participations: [['soldier3', true, '현장 조사와 보고서 작성'], ['soldier1', true, '수집 자료 정리']],
  },
  {
    key: 'harbor',
    title: '항만 물품 확인',
    type: '점검',
    crew: 'Harbor',
    createdBy: 'capo3',
    priority: 'LOW',
    location: '부산항 3부두',
    start: { day: 2, hour: 9 },
    end: { day: 2, hour: 11 },
    status: 'PLANNED',
    requiredHeadcount: 2,
    assignees: [['capo3', 'LEADER', 'ACCEPTED'], ['soldier4', 'MEMBER', 'ACCEPTED']],
    dependsOn: ['transport'],
  },
  {
    key: 'meeting',
    title: '간부 정기 회의',
    type: '회의',
    crew: null,
    createdBy: 'boss',
    priority: 'HIGH',
    location: '본부 회의실',
    start: { day: 3, hour: 14 },
    end: { day: 3, hour: 15 },
    status: 'PLANNED',
    assignees: [
      ['underboss1', 'LEADER', 'ACCEPTED'], ['underboss2', 'MEMBER', 'PENDING'],
      ['capo1', 'MEMBER', 'ACCEPTED'], ['capo2', 'MEMBER', 'PENDING'], ['capo3', 'MEMBER', 'PENDING'],
    ],
  },
];

// 처리 대기 중인 교대 요청 (승인·거절 확인용): soldier2가 순찰 배정을 associate1에게 넘기려 한다.
const swapRequests = [
  { task: 'patrol', from: 'soldier2', to: 'associate1', reason: '같은 날 다른 일정이 생겼습니다.' },
];

// ---------------------------------------------------------------------------
// 단계 4: 공용 자원. 시각 표기는 업무와 같다 ({ day, hour }: KST 기준 날짜·시, { hoursFromNow }).
// 업무 할당과 구성원 배정은 같은 자원끼리 시간이 겹치지 않게 짠다 (BR-07).
const resourceCategories = [
  { name: '차량', description: '업무와 이동에 쓰는 차량' },
  { name: '통신 장비', description: '무전기 등 통신 장비' },
  { name: '보호 장비', description: '방탄 조끼 등 개인 보호 장비' },
];

// minRole: 이용 최소 역할. 상태는 아래 사용 기록·점검·상태 변경으로 정해진다 (나머지는 사용가능).
const resources = [
  { code: 'VH-001', name: '승합차 1호', category: '차량', location: '강북 차고', minRole: 'SOLDIER' },
  { code: 'VH-002', name: '승합차 2호', category: '차량', location: '강북 차고', minRole: 'SOLDIER' },
  { code: 'VH-003', name: '세단 1호', category: '차량', location: '본부 주차장', minRole: 'CAPO' },
  { code: 'VH-004', name: '화물 트럭', category: '차량', location: '부산항 창고', minRole: 'SOLDIER' },
  { code: 'RD-001', name: '무전기 1호', category: '통신 장비', location: '강북 사무실', minRole: 'SOLDIER' },
  { code: 'RD-002', name: '무전기 2호', category: '통신 장비', location: '강북 사무실', minRole: 'SOLDIER' },
  { code: 'RD-003', name: '무전기 3호', category: '통신 장비', location: '남부 창고', minRole: 'SOLDIER' },
  { code: 'PR-001', name: '방탄 조끼 세트', category: '보호 장비', location: '본부 장비실', minRole: 'CAPO' },
];

// 업무의 필요 자원 분류: [업무 키, 분류, 수량]. 항만 물품 확인은 차량이 필요하지만 화물 트럭이 점검 중이라 아직 할당하지 못했다.
const taskResourceRequirements = [['patrol', '차량', 1], ['patrol', '통신 장비', 1], ['harbor', '차량', 1]];

// 업무 자원 할당 (시간대: 업무 일정 전체): [업무 키, 관리 번호]
const taskResources = [['transport', 'VH-001'], ['patrol', 'VH-002'], ['patrol', 'RD-001'], ['intel', 'RD-002']];

// 구성원 자원 배정
const resourceAllocations = [
  { key: 'radio', code: 'RD-002', user: 'soldier1', by: 'capo1', start: { hoursFromNow: -1 }, end: { day: 2, hour: 9 }, purpose: '강북 사무실 연락 담당' },
  { key: 'sedan', code: 'VH-003', user: 'capo1', by: 'underboss1', start: { day: 1, hour: 14 }, end: { day: 1, hour: 18 }, purpose: '본부 회의 이동' },
  { key: 'vest', code: 'PR-001', user: 'capo2', by: 'underboss1', start: { day: -2, hour: 10 }, end: { day: -1, hour: 10 }, purpose: '경호 지원' },
];

// 사용 기록. task는 업무 자원 할당으로, allocation은 구성원 배정으로 쓴 것이다. returned가 없으면 아직 사용 중이다.
// 방탄 조끼는 반환 예정 시각이 지났는데 반환되지 않았다 (미반환 목록 확인용).
const resourceUsages = [
  { code: 'VH-001', user: 'soldier2', task: 'transport', start: { hoursFromNow: -1 } },
  { code: 'RD-002', user: 'soldier1', task: 'intel', start: { day: -1, hour: 14 }, returned: { day: -1, hour: 17 }, condition: 'GOOD', note: '이상 없음' },
  { code: 'PR-001', user: 'capo2', allocation: 'vest', start: { day: -2, hour: 10 } },
];

// 진행 중인 점검 (FR-16)과 사용불가로 바뀐 자원 (BR-08 확인용)
const maintenances = [{ code: 'VH-004', by: 'capo3', reason: '정기 점검 (브레이크·타이어)', expectedEnd: { day: 1, hour: 18 } }];
const resourceStatusChanges = [{ code: 'RD-003', by: 'capo2', status: 'UNAVAILABLE', reason: '분실 신고' }];

// 대기 중인 자원 사용 신청 (승인·거절 확인용)
const resourceRequests = [
  { code: 'RD-002', user: 'soldier3', start: { day: 2, hour: 13 }, end: { day: 2, hour: 17 }, reason: '거래처 방문 중 연락용' },
];

module.exports = {
  users, crews, joinRequests, roleRequests, taskTypes, tasks, swapRequests,
  resourceCategories, resources, taskResourceRequirements, taskResources, resourceAllocations, resourceUsages,
  maintenances, resourceStatusChanges, resourceRequests,
};
