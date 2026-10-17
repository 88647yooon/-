// 권한 키별 기본 허용 역할 (NFR-03, BR-09). 라우터는 requirePermission(키)로 검사한다.
// 단계가 진행될 때마다 그 단계의 권한 키를 추가한다.
// 담당 Crew 같은 관리 범위(BR-05)와 역할 순위(BR-04) 검사는 역할만으로 판단할 수 없으므로 서비스 계층에서 한다.
const { ALL_ROLES } = require('./constants');

const STAFF = ['SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS', 'ADMIN']; // Associate를 뺀 모든 역할
const CAPO_UP = ['CAPO', 'UNDERBOSS', 'BOSS'];
const UNDERBOSS_UP = ['UNDERBOSS', 'BOSS'];
const CREW_MEMBERS = ['ASSOCIATE', 'SOLDIER', 'CAPO']; // Crew에 소속될 수 있는 역할

module.exports = Object.freeze({
  // 단계 1: 인증·내 정보
  'session.manage': { roles: ALL_ROLES, description: '내 로그인 세션 조회·종료' },
  'me.read': { roles: ALL_ROLES, description: '내 계정·역할·상태·소속과 사용 가능 기능 조회' },
  'me.update': { roles: ALL_ROLES, description: '내 연락처·별명 수정' },
  'me.password': { roles: ALL_ROLES, description: '내 비밀번호 변경' },

  // 단계 2: 구성원
  'reference.read': { roles: ALL_ROLES, description: '역할·상태 기준 정보 조회' },
  'user.create': { roles: ['UNDERBOSS', 'BOSS', 'ADMIN'], description: '구성원 등록' },
  'user.bulkCreate': { roles: ['ADMIN'], description: '구성원 일괄 등록' },
  'user.list': { roles: STAFF, description: '구성원 목록 조회' },
  'user.read': { roles: ALL_ROLES, description: '구성원 상세 조회 (Associate는 본인만)' },
  'user.update': { roles: ['CAPO', 'UNDERBOSS', 'BOSS', 'ADMIN'], description: '구성원 기본 정보 수정 (Capo는 자기 Crew 소속원만)' },
  'user.delete': { roles: ['ADMIN'], description: '잘못 등록된 구성원 삭제' },
  'user.role.change': { roles: ['UNDERBOSS', 'BOSS', 'ADMIN'], description: '구성원 역할 변경' },
  'user.status.change': { roles: CAPO_UP, description: '구성원 상태 변경 (Capo는 자기 Crew 소속원만)' },
  'user.records.read': { roles: ALL_ROLES, description: '소속 이력·지휘 계통 조회 (본인 또는 관리 범위 안)' },

  // 단계 2: Crew
  'crew.read': { roles: ALL_ROLES, description: 'Crew 목록·상세 조회, 소속원이면 구성원·조직도 조회' },
  'crew.create': { roles: UNDERBOSS_UP, description: 'Crew 생성' },
  'crew.update': { roles: CAPO_UP, description: 'Crew 정보 수정 (Capo는 자신이 책임자인 Crew만)' },
  'crew.delete': { roles: UNDERBOSS_UP, description: '사용 기록이 없는 Crew 삭제' },
  'crew.status.change': { roles: UNDERBOSS_UP, description: 'Crew 활성·해산 전환' },
  'crew.capo.assign': { roles: UNDERBOSS_UP, description: 'Crew 책임자 지정·해제' },
  'crew.underboss.assign': { roles: ['BOSS'], description: 'Crew 담당 Underboss 지정' },
  'crew.capoHistory.read': { roles: CAPO_UP, description: 'Crew 책임자 교체 이력 조회' },
  'crew.members.manage': { roles: CAPO_UP, description: 'Crew 편성·제외·유형 변경, 후보·편성 이력 조회 (Capo는 자신이 책임자인 Crew만)' },
  'crew.members.transfer': { roles: UNDERBOSS_UP, description: '구성원을 다른 Crew로 이동' },
  'crew.merge': { roles: UNDERBOSS_UP, description: 'Crew 병합' },

  // 단계 2: 소속 신청·역할 변경 요청
  'crew.joinRequest.apply': { roles: CREW_MEMBERS, description: 'Crew 소속 신청·취소' },
  'crew.joinRequest.review': { roles: CAPO_UP, description: '소속 신청 조회·승인·거절 (Capo는 자신이 책임자인 Crew만)' },
  'roleRequest.create': { roles: CAPO_UP, description: '역할 변경 요청(추천)' },
  'roleRequest.read': { roles: CAPO_UP, description: '역할 변경 요청 조회 (Capo는 자신이 한 요청만)' },
  'roleRequest.review': { roles: UNDERBOSS_UP, description: '역할 변경 요청 승인·거절' },
});
