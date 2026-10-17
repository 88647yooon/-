// 권한 키별 기본 허용 역할 (NFR-03, BR-09). 라우터는 requirePermission(키)로 검사한다.
// 단계가 진행될 때마다 그 단계의 권한 키를 추가한다.
// 담당 Crew 같은 관리 범위(BR-05)와 역할 순위(BR-04) 검사는 역할만으로 판단할 수 없으므로 서비스 계층에서 한다.
const { ALL_ROLES } = require('./constants');

const STAFF = ['SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS', 'ADMIN']; // Associate를 뺀 모든 역할
const CAPO_UP = ['CAPO', 'UNDERBOSS', 'BOSS'];
const UNDERBOSS_UP = ['UNDERBOSS', 'BOSS'];
const CREW_MEMBERS = ['ASSOCIATE', 'SOLDIER', 'CAPO']; // Crew에 소속될 수 있는 역할
const OPERATORS = ['ASSOCIATE', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS']; // 업무를 맡는 운영 계층 (Administrator 제외)
const SOLDIER_UP = ['SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS']; // 공용 자원을 이용하는 역할

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

  // 단계 3: 업무
  'taskType.read': { roles: OPERATORS, description: '업무 유형 목록 조회' },
  'taskType.manage': { roles: UNDERBOSS_UP, description: '업무 유형 등록·수정·삭제' },
  'task.create': { roles: CAPO_UP, description: '업무 등록 (Capo는 자신이 책임자인 Crew의 업무만)' },
  'task.list': { roles: CAPO_UP, description: '업무 목록 탐색 (Capo는 자신이 책임자인 Crew의 업무만)' },
  'task.read': { roles: OPERATORS, description: '업무 상세·세부 정보·결과 조회 (참여자, 담당 Crew 책임자, Underboss·Boss)' },
  'task.manage': {
    roles: CAPO_UP,
    description: '업무 수정·일정·상태·배정·지시사항·체크리스트·선행 업무·완료·참여 기록 관리 (Capo는 자신이 책임자인 Crew의 업무만)',
  },
  'task.participate': { roles: OPERATORS, description: '배정 수락·거절, 체크리스트 완료 표시, 진행 보고 (참여자)' },
  'task.swap': { roles: OPERATORS, description: '업무 교대 요청·조회·취소·거절' },
  'task.swap.review': { roles: CAPO_UP, description: '업무 교대 요청 승인 (Capo는 자신이 책임자인 Crew의 업무만)' },

  // 단계 4: 공용 자원 (업무 자원 할당·후보·일괄 반환은 task.manage, 할당 자원 조회는 task.read를 쓴다)
  'resourceCategory.read': { roles: ALL_ROLES, description: '자원 분류 목록 조회' },
  'resourceCategory.manage': { roles: UNDERBOSS_UP, description: '자원 분류 등록·수정·삭제' },
  'resource.manage': { roles: UNDERBOSS_UP, description: '자원 등록·일괄 등록·정보 수정·삭제, 이용 최소 역할 변경' },
  'resource.monitor': { roles: CAPO_UP, description: '관리용 자원 목록, 상태 이력, 점검 이력·목록, 사용 이력, 미반환 목록 조회' },
  'resource.operate': { roles: CAPO_UP, description: '자원 상태 변경, 점검 등록·수정·완료' },
  'resource.read': { roles: SOLDIER_UP, description: '이용 가능 자원, 자원 상세·가용 여부·예약 일정 조회 (이용 최소 역할 이상인 자원)' },
  'resource.allocate': { roles: CAPO_UP, description: '구성원 자원 배정·기간 변경·취소, 반환 예정 연장 (Capo는 자기 Crew 소속원만)' },
  'resource.allocation.read': { roles: OPERATORS, description: '구성원별 자원 배정 조회 (본인, 소속 Crew의 책임자, Underboss·Boss)' },
  'resource.request': { roles: SOLDIER_UP, description: '자원 사용 신청·조회·취소' },
  'resource.request.review': { roles: CAPO_UP, description: '자원 사용 신청 승인·거절 (Capo는 자기 Crew 소속원의 신청만)' },
  'resource.use': { roles: OPERATORS, description: '배정받은 자원 사용 시작·반환·인계·고장 신고' },
});
