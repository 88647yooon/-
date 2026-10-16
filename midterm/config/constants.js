// 역할·상태 체계의 단일 정의. 테이블 ENUM, 입력 검증, 상태 전이 검사가 모두 이 파일을 사용한다.
// 이후 단계의 상태 체계(소속 유형, 업무, 자원)도 이 파일에 추가한다.

// 운영 계층 순위. Administrator는 운영 계층 밖의 기술 관리자라서 순위가 없다 (작업지시서 3장).
const ROLE_INFO = Object.freeze({
  ASSOCIATE: { label: 'Associate', rank: 1, description: '일반 사용자. 본인 정보와 허용된 조직 정보 조회, 필요한 활동 참여' },
  SOLDIER: { label: 'Soldier', rank: 2, description: '정식 구성원. 배정된 업무 수행, 자원 이용' },
  CAPO: { label: 'Capo', rank: 3, description: 'Crew 책임자. 담당 Crew의 구성원과 업무 관리' },
  UNDERBOSS: { label: 'Underboss', rank: 4, description: '여러 Crew와 운영 현황 관리' },
  BOSS: { label: 'Boss', rank: 5, description: '조직 전반의 주요 상태와 운영 정보 확인' },
  ADMIN: { label: 'Administrator', rank: null, description: '계정, 권한, 감사 기록 등 기술 관리' },
});
const ROLES = Object.freeze(Object.fromEntries(Object.keys(ROLE_INFO).map((r) => [r, r])));
const ALL_ROLES = Object.freeze(Object.keys(ROLE_INFO));

// FR-04 구성원 상태와 허용 전이. 정지·탈퇴는 새 업무 배정 불가 (BR-02), 로그인 불가.
const MEMBER_STATUS_INFO = Object.freeze({
  PENDING: { label: '대기', next: ['ACTIVE', 'WITHDRAWN'] },
  ACTIVE: { label: '활동중', next: ['SUSPENDED', 'WITHDRAWN'] },
  SUSPENDED: { label: '정지', next: ['ACTIVE', 'WITHDRAWN'] },
  WITHDRAWN: { label: '탈퇴', next: [] },
});
const MEMBER_STATUS = Object.freeze(Object.fromEntries(Object.keys(MEMBER_STATUS_INFO).map((s) => [s, s])));
const SIGN_IN_BLOCKED_STATUSES = Object.freeze([MEMBER_STATUS.SUSPENDED, MEMBER_STATUS.WITHDRAWN]);

module.exports = {
  ROLE_INFO,
  ROLES,
  ALL_ROLES,
  MEMBER_STATUS_INFO,
  MEMBER_STATUS,
  SIGN_IN_BLOCKED_STATUSES,
};
