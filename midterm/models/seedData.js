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

module.exports = { users };
