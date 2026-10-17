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

module.exports = { users, crews, joinRequests, roleRequests };
