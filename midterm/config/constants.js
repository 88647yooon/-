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

// Crew에 소속될 수 있는 역할. Underboss·Boss는 Crew 위의 계층이고 Administrator는 운영 계층 밖이다.
const CREW_MEMBER_ROLES = Object.freeze(['ASSOCIATE', 'SOLDIER', 'CAPO']);

const CREW_STATUS_INFO = Object.freeze({
  ACTIVE: { label: '활성' },
  DISBANDED: { label: '해산' },
});

// 소속 유형. 정식 소속은 한 Crew만 가능하다 (BR-01).
const MEMBERSHIP_TYPE_INFO = Object.freeze({
  REGULAR: { label: '정식' },
  TEMPORARY: { label: '임시' },
});

// 소속이 시작된 경위
const JOIN_METHOD_INFO = Object.freeze({
  ADDED: { label: '편성' },
  JOIN_REQUEST: { label: '소속 신청 승인' },
  TRANSFER: { label: '다른 Crew에서 이동' },
  MERGE: { label: 'Crew 병합' },
  CAPO_ASSIGNMENT: { label: '책임자 지정' },
  TYPE_CHANGE: { label: '소속 유형 변경' },
});

// 소속이 끝난 이유
const MEMBERSHIP_END_REASON_INFO = Object.freeze({
  REMOVED: { label: '제외' },
  TRANSFERRED: { label: '다른 Crew로 이동' },
  DISBANDED: { label: 'Crew 해산' },
  MERGED: { label: 'Crew 병합' },
  WITHDRAWN: { label: '구성원 탈퇴' },
  TYPE_CHANGED: { label: '소속 유형 변경' },
});

// Crew 책임자(Capo) 임기가 끝난 이유
const CAPO_TERM_END_REASON_INFO = Object.freeze({
  REPLACED: { label: '교체' },
  REMOVED: { label: '해제' },
  DISBANDED: { label: 'Crew 해산' },
  MERGED: { label: 'Crew 병합' },
});

// 소속 신청·역할 변경 요청의 처리 상태
const REQUEST_STATUS_INFO = Object.freeze({
  PENDING: { label: '대기' },
  APPROVED: { label: '승인' },
  REJECTED: { label: '거절' },
  CANCELLED: { label: '취소' },
});

// ---------------------------------------------------------------------------
// 단계 3: 업무

// FR-10 업무 상태와 허용 전이. 진행·보류 전환은 상태 변경 API, 완료는 완료 처리 API, 취소는 취소 API로만 한다.
const TASK_STATUS_INFO = Object.freeze({
  PLANNED: { label: '계획', next: ['IN_PROGRESS', 'CANCELLED'] },
  IN_PROGRESS: { label: '진행', next: ['ON_HOLD', 'COMPLETED', 'CANCELLED'] },
  ON_HOLD: { label: '보류', next: ['IN_PROGRESS', 'CANCELLED'] },
  COMPLETED: { label: '완료', next: [] },
  CANCELLED: { label: '취소', next: [] },
});
// 아직 끝나지 않은 업무. 시간 겹침 검사(BR-03)는 이 상태의 업무끼리만 한다.
const OPEN_TASK_STATUSES = Object.freeze(['PLANNED', 'IN_PROGRESS', 'ON_HOLD']);

const TASK_PRIORITY_INFO = Object.freeze({
  LOW: { label: '낮음' },
  MEDIUM: { label: '보통' },
  HIGH: { label: '높음' },
  CRITICAL: { label: '긴급' },
});

// 업무에 배정될 수 있는 역할. Administrator는 운영 계층 밖이라 업무를 맡지 않는다.
const ASSIGNABLE_ROLES = Object.freeze(['ASSOCIATE', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS']);

const ASSIGNEE_ROLE_INFO = Object.freeze({
  LEADER: { label: '리더' },
  MEMBER: { label: '일반' },
});

const ASSIGNMENT_RESPONSE_INFO = Object.freeze({
  PENDING: { label: '응답 대기' },
  ACCEPTED: { label: '수락' },
  DECLINED: { label: '거절' },
});

// 배정이 끝난 이유
const ASSIGNMENT_RELEASE_REASON_INFO = Object.freeze({
  REMOVED: { label: '배정 해제' },
  REPLACED: { label: '교체' },
  SWAPPED: { label: '교대' },
  DECLINED: { label: '배정 거절' },
  TASK_CANCELLED: { label: '업무 취소' },
  WITHDRAWN: { label: '구성원 탈퇴' },
});

const TASK_OUTCOME_INFO = Object.freeze({
  SUCCESS: { label: '성공' },
  PARTIAL: { label: '부분 성공' },
  FAILED: { label: '실패' },
});

// ---------------------------------------------------------------------------
// 단계 4: 공용 자원

// FR-13, FR-16 자원 상태. assignable이 false인 점검중·사용불가 자원은 새로 배정할 수 없다 (BR-08).
// next는 상태 변경 API로 바꿀 수 있는 상태다. 사용중은 사용 시작·반환으로만 바뀐다.
const RESOURCE_STATUS_INFO = Object.freeze({
  AVAILABLE: { label: '사용가능', assignable: true, next: ['MAINTENANCE', 'UNAVAILABLE'] },
  IN_USE: { label: '사용중', assignable: true, next: [] },
  MAINTENANCE: { label: '점검중', assignable: false, next: ['AVAILABLE', 'UNAVAILABLE'] },
  UNAVAILABLE: { label: '사용불가', assignable: false, next: ['AVAILABLE', 'MAINTENANCE'] },
});
// 상태 변경 API로 지정할 수 있는 상태
const MANUAL_RESOURCE_STATUSES = Object.freeze(['AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE']);

// FR-14 자원을 이용할 수 있는 최소 역할. 공용 자원 이용은 Soldier부터다 (Associate는 업무에 할당된 자원만 쓴다).
const RESOURCE_MIN_ROLES = Object.freeze(['SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS']);

// 점검이 시작된 경위
const MAINTENANCE_SOURCE_INFO = Object.freeze({
  MANUAL: { label: '점검 등록' },
  DAMAGE_REPORT: { label: '사용 중 고장 신고' },
  RETURN_DAMAGE: { label: '반환 시 손상' },
});

// 점검 결과와 점검 후 자원 상태
const MAINTENANCE_RESULT_INFO = Object.freeze({
  RESTORED: { label: '정상 복구', status: 'AVAILABLE' },
  UNREPAIRABLE: { label: '수리 불가', status: 'UNAVAILABLE' },
});

// 반환할 때의 자원 상태. 손상이면 점검중, 분실이면 사용불가로 바뀐다.
const RETURN_CONDITION_INFO = Object.freeze({
  GOOD: { label: '정상' },
  DAMAGED: { label: '손상' },
  LOST: { label: '분실' },
});

// 업무 자원 할당·구성원 자원 배정이 끝난 이유
const RESOURCE_RELEASE_REASON_INFO = Object.freeze({
  CANCELLED: { label: '배정 취소' },
  TASK_CANCELLED: { label: '업무 취소' },
  RETURNED: { label: '반환' },
  HANDED_OVER: { label: '인계' },
  WITHDRAWN: { label: '구성원 탈퇴' },
});

module.exports = {
  RESOURCE_STATUS_INFO,
  MANUAL_RESOURCE_STATUSES,
  RESOURCE_MIN_ROLES,
  MAINTENANCE_SOURCE_INFO,
  MAINTENANCE_RESULT_INFO,
  RETURN_CONDITION_INFO,
  RESOURCE_RELEASE_REASON_INFO,
  ROLE_INFO,
  ROLES,
  ALL_ROLES,
  TASK_STATUS_INFO,
  OPEN_TASK_STATUSES,
  TASK_PRIORITY_INFO,
  ASSIGNABLE_ROLES,
  ASSIGNEE_ROLE_INFO,
  ASSIGNMENT_RESPONSE_INFO,
  ASSIGNMENT_RELEASE_REASON_INFO,
  TASK_OUTCOME_INFO,
  MEMBER_STATUS_INFO,
  MEMBER_STATUS,
  SIGN_IN_BLOCKED_STATUSES,
  CREW_MEMBER_ROLES,
  CREW_STATUS_INFO,
  MEMBERSHIP_TYPE_INFO,
  JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO,
  CAPO_TERM_END_REASON_INFO,
  REQUEST_STATUS_INFO,
};
