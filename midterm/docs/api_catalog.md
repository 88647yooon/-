# The Family 통합 정보시스템 API 목록표

- 학번: 202211207
- 기준 문서: requirements_spec.md, 작업지시서.md
- 모든 URL은 `/api`로 시작한다. EJS 화면은 REST API 개수에 포함하지 않는다 (마지막 절 참고).

## 1. 설계 전제

| 항목 | 결정 내용 |
| :--- | :--- |
| 인증 | JWT 액세스 토큰(`Authorization: Bearer`) + 리프레시 토큰. 세션은 SQL `sessions` 테이블에 저장해 로그아웃·강제 종료를 지원한다. Swagger UI에는 `bearerAuth`를 설정한다. |
| 역할 순위 | Associate(1) < Soldier(2) < Capo(3) < Underboss(4) < Boss(5). BR-04는 이 순위로 비교한다. |
| Administrator | 운영 계층 밖의 기술 관리자. 계정·권한·감사·설정 기능을 담당하고 업무·평가·Crew 편성·구성원 상태 변경은 하지 않는다. 역할 변경은 가능하지만 Boss 지정·해제는 Boss만 할 수 있다. |
| 역할 변경 (BR-04) | 대상의 현재 역할이 요청자와 같거나 높으면 바꿀 수 없고, 요청자보다 높은 역할로 올릴 수도 없다. 구성원 정보 수정·상태 변경에도 같은 순위 규칙을 적용한다. |
| 구성원 상태 | 대기, 활동중, 정지, 탈퇴. 정지·탈퇴는 새 업무 배정 불가 (BR-02). |
| 소속 유형 | 정식, 임시. 정식 소속은 한 Crew만 가능 (BR-01). Crew에는 Associate·Soldier·Capo만 소속된다. |
| 업무 상태 | 계획, 진행, 보류, 완료, 취소. 진행·보류는 상태 변경 API, 완료는 완료 처리 API, 취소는 취소 API로만 바꾼다. 시작하려면 참여자가 한 명 이상 있고 선행 업무가 끝나 있어야 한다. |
| 업무 관리 범위 | Crew 업무는 그 Crew의 책임자(Capo)와 Underboss·Boss가 관리하고, Crew가 없는 조직 업무는 Underboss·Boss만 관리한다. 업무의 현재 참여자는 그 업무를 볼 수 있다. Capo는 자기 Crew 소속원만 배정한다 (BR-05). Administrator는 업무를 맡지 않는다. |
| 배정 규칙 (BR-02, BR-03) | 정지·탈퇴 구성원은 409 BR-02, 대기 구성원은 409 CONFLICT. 같은 구성원의 끝나지 않은 업무(계획·진행·보류)끼리 시간이 겹치면 409 BR-03 (겹침: 새 시작 < 기존 종료 AND 기존 시작 < 새 종료, 맞닿은 시간은 허용). 같은 구성원의 배정 변경은 구성원 행 잠금으로 한 줄로 세운다. 날짜·시간은 초 단위로 저장·비교한다. |
| 완료 업무 잠금 (BR-06) | 완료하면 업무 내용·배정·체크리스트·결과(성과·요약)·참여 기록이 잠긴다. 일반 구성원(Associate·Soldier·Capo)이 바꾸려 하면 409 BR-06. 결과·참여 기록 정정은 Underboss·Boss만 사유를 남기고 할 수 있고, 변경 전후가 정정 이력에 남는다. |
| 자원 상태 | 사용가능, 사용중, 점검중, 사용불가. 점검중·사용불가는 새로 배정 불가 (409 BR-08). 사용중은 사용 시작·반환으로만 바뀌고, 상태 변경 API는 사용가능·점검중·사용불가 사이만 바꾼다. 진행 중인 점검은 점검 완료(정상 복구 → 사용가능, 수리 불가 → 사용불가)로 끝낸다. |
| 자원 이용 권한 | 자원마다 이용 최소 역할(기본 Soldier)이 있다. 이용 가능 자원 조회·사용 신청·구성원 배정은 이 역할 이상만 된다. 업무에 할당된 자원은 그 업무의 참여자가 역할과 관계없이 쓴다. 자원 상태·점검·이력 관리는 Capo 이상, 자원 등록·정보·이용 권한 변경은 Underboss·Boss가 한다. Capo는 자기 Crew의 업무와 소속원에게만 자원을 할당·배정하고 그 신청을 처리한다 (BR-05). |
| 자원 배정 규칙 (BR-07) | 같은 자원의 진행 중 예약(끝나지 않은 업무의 할당, 구성원 배정, 반환되지 않은 사용)과 시간이 겹치면 409 BR-07 (겹침 조건은 BR-03과 같고 맞닿은 시간은 허용). 반환 예정 시각이 지난 미반환 자원은 반환될 때까지 사용 중으로 본다. 같은 자원의 예약 변경은 자원 행 잠금으로 한 줄로 세운다. 업무 일정이 바뀌면 할당 시간대를 함께 옮기고 다시 검사한다. |
| 자원 사용·반환 | 사용은 지금이 시간대 안에 있는 구성원 배정 또는 내가 참여 중인 업무의 할당이 있을 때만 시작한다. 반환 상태가 손상이면 점검을 자동으로 열어 점검중, 분실이면 사용불가가 된다. 구성원 배정으로 쓴 자원은 반환하면 배정도 끝난다. 사용 중 고장 신고는 점검을 열고, 인계는 반환과 사용 시작을 한 트랜잭션으로 처리한다. |
| 평가 (FR-18) | 완료된 업무에 실제로 참여한 구성원만, 담당 Crew 책임자와 Underboss·Boss가 업무 완료 후 30일 안에 평가한다. 완료되지 않은 업무는 409, 본인 평가는 403, 평가자당 대상 1회(409 DUPLICATE). 항목별 1~5점을 가중 평균하고, 작성 당시 항목·가중치를 평가에 함께 저장한다. 평가자는 작성 후 7일 안에 고칠 수 있다. |
| 평가 정정·철회 (BR-10) | 대상자는 이의를 제기하고, Underboss·Boss(이의를 낸 사람과 그 평가의 평가자 제외)가 기각하거나 정정한다. 철회는 Underboss·Boss가 사유를 남기고 하며 문서는 지우지 않는다. 수정·정정은 변경 전후와 사유를 평가의 수정 이력에, 모든 변경은 활동 기록에 남긴다. |
| 평판 | 평판 점수 = 평균 평가 점수 × 20 + 공로·징계 점수 합계 (0~100, 평가가 없으면 평가 부분 50). 공로·징계는 Underboss·Boss가 자신보다 낮은 역할에만 1~10점으로 기록·취소한다(BR-04). 집계는 MongoDB aggregate로 한다. |
| 이력·감사 기록 조회 | 구성원 변경 이력·활동·받은 평가·평판은 본인, 그 구성원이 속한 Crew의 책임자, Underboss·Boss가 본다. Crew 활동은 그 Crew의 책임자와 Underboss·Boss가 본다. 감사 기록은 Boss·Administrator가 보고, CSV 내보내기와 권한 거부 기록은 Administrator만 본다. |
| 통합 검색 (FR-21) | 종류마다 요청자의 권한 범위로 제한한다. 구성원은 구성원 목록 권한이 있을 때만(Associate 제외), 업무는 Capo는 자기 Crew·Underboss 이상은 전체·그 밖에는 내가 참여 중인 업무만, 자원은 Capo 이상은 전체·Soldier는 이용 최소 역할을 충족하는 자원만. 저장 검색은 MongoDB에 두고 실행할 때의 권한으로 찾는다. |
| 운영 현황 통계 (FR-22) | Underboss·Boss가 본다(관리 활동 통계는 Boss·Administrator). 구성원·Crew·업무·자원·소속 변화는 SQL GROUP BY, 평가·관리 활동은 MongoDB aggregate로 낸다. 기간 묶음은 한국 시간 일·주·월이고 빈 묶음도 0으로 채운다. |
| 관리자 (FR-23) | /api/admin은 Administrator만 쓴다. 역할별 권한은 기본값(config/permissions.js)과 다른 것만 SQL에 저장하고 모든 권한 검사에 바로 반영한다(Administrator의 admin.permissions는 뺄 수 없다). 운영 설정(평가 작성·수정 기한, 로그인 실패 잠금 기준, 반환 연체 기준, 장기 점검 기준)은 바꾸면 바로 적용된다. 연속 로그인 실패가 잠금 기준(기본 5회)에 이르면 계정이 자동으로 잠긴다. |
| Crew 관리 범위 | Crew마다 Capo 1명, 담당 Underboss 1명. Underboss는 여러 Crew를 담당한다. 책임자(Capo)는 그 Crew의 정식 소속원이다. Underboss·Boss는 모든 Crew를 관리하고, Capo는 자신이 책임자인 Crew만 관리한다 (BR-05). |

### 권한 표기

| 표기 | 의미 |
| :--- | :--- |
| 전체 | 로그인하지 않은 사용자 포함 |
| 로그인 | 로그인한 모든 사용자 |
| S+ / C+ / U+ | Soldier / Capo / Underboss 이상 |
| B | Boss |
| ADM | Administrator |
| 담당 C | 대상 Crew(또는 대상 업무·구성원이 속한 Crew)의 Capo |
| 본인 | 대상이 요청자 자신 |
| 참여자 | 해당 업무에 배정된 구성원 |

## 2. 공통 규칙 (AR-02, AR-04, AR-05, NFR-01, NFR-05)

- **데이터 위치:** 대상 식별자는 Path, 필터·정렬·페이지는 Query(`page`, `size`, `sort`), 토큰은 Header, 생성·수정 데이터는 Body.
- **성공 응답:** `{ "success": true, "data": ..., "meta": { "page", "size", "total" } }` (`meta`는 목록에만)
- **오류 응답:** `{ "success": false, "error": { "code", "message", "details" } }`

| 상황 | HTTP | error.code |
| :--- | :--- | :--- |
| 입력값 오류 | 400 | `VALIDATION_ERROR` |
| 인증 없음·만료 | 401 | `UNAUTHENTICATED` |
| 권한 부족 | 403 | `FORBIDDEN` |
| 관리 범위·역할 순위 위반 | 403 | `FORBIDDEN` (`details.rule`에 `BR-05`·`BR-04`) |
| 대상 없음 | 404 | `NOT_FOUND` |
| 업무 규칙 위반 | 409 | 위반한 규칙 ID (예: `BR-01`) |
| 현재 상태와 충돌 (해산된 Crew, 허용되지 않는 상태 전이 등) | 409 | `CONFLICT` |
| 중복 값 (아이디, Crew 이름) | 409 | `DUPLICATE` |
| 일괄 처리 중 일부 실패로 전체 취소 | 409 | `BULK_REJECTED` (`details`에 행별 오류) |
| 서버 오류 | 500 | `INTERNAL_ERROR` (프로세스는 종료하지 않음) |

## 3. 단계별 API 수

| 단계 | 영역 | API 수 |
| :--- | :--- | ---: |
| 1 | 인증·세션, 내 정보 | 9 |
| 2 | 구성원, Crew, Crew 편성, 소속 신청, 역할 변경 요청 | 46 |
| 3 | 업무 유형, 업무, 업무 세부 정보, 업무 배정, 내 업무, 업무 교대 요청, 업무 진행·완료·결과 | 54 |
| 4 | 자원 분류, 자원, 자원 점검, 업무 자원 할당, 구성원 자원 배정, 자원 사용 신청, 자원 사용·반환 | 45 |
| 5 | 이력 조회, 평가, 평판, 감사 기록 | 25 |
| 6 | 검색, 운영 현황 통계, 관리자 | 31 |
| **합계** | | **210** |

---

## 4. 단계 1 — 공통 기반 (인증·내 정보)

### 4.1 인증·세션

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | POST | `/api/auth/login` | 로그인. 토큰 발급. 정지·탈퇴·잠금 계정은 거부 | FR-02, NFR-03 | 전체 | 1 |
| 2 | POST | `/api/auth/refresh` | 리프레시 토큰으로 액세스 토큰 재발급 | NFR-03 | 전체 | 1 |
| 3 | POST | `/api/auth/logout` | 현재 세션만 종료 | NFR-03 | 로그인 | 1 |
| 4 | GET | `/api/auth/sessions` | 내 로그인 세션 목록 (기기, 마지막 사용 시각) | NFR-03 | 로그인 | 1 |
| 5 | DELETE | `/api/auth/sessions` | 다른 기기를 포함한 내 모든 세션 종료 | NFR-03 | 로그인 | 1 |

### 4.2 내 정보

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 6 | GET | `/api/me` | 내 계정, 역할, 상태, 현재 Crew와 책임자 요약 | FR-02 | 로그인 | 1 |
| 7 | PATCH | `/api/me` | 내 연락처·별명 수정 | FR-01 | 로그인 | 1 |
| 8 | PUT | `/api/me/password` | 비밀번호 변경 (현재 비밀번호 확인) | FR-01 | 로그인 | 1 |
| 9 | GET | `/api/me/permissions` | 내 역할로 사용할 수 있는 기능 목록 | FR-02, NFR-03 | 로그인 | 1 |

---

## 5. 단계 2 — 구성원·Crew (SQL)

### 5.1 구성원

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 10 | POST | `/api/users` | 구성원 등록 (초기 역할 Associate, 상태 대기) | FR-01 | U+, ADM | 2 |
| 11 | POST | `/api/users/bulk` | 구성원 일괄 등록. 한 건이라도 실패하면 전체 취소하고 행별 오류 반환 | FR-01 | ADM | 2 |
| 12 | GET | `/api/users` | 구성원 목록. 역할·상태·Crew 필터, 이름 검색, 정렬, 페이지. 요청자 권한별로 공개 필드 차등 | FR-01, FR-21, AR-03 | S+, ADM | 2 |
| 13 | GET | `/api/users/check-username` | 아이디 사용 가능 여부 확인 | FR-01 | U+, ADM | 2 |
| 14 | GET | `/api/users/:userId` | 구성원 상세. 요청자 권한별로 공개 필드 차등 | FR-01, FR-19 | S+, ADM, 본인 | 2 |
| 15 | PATCH | `/api/users/:userId` | 기본 정보(이름, 연락처 등) 수정 | FR-01 | 담당 C, U+, ADM | 2 |
| 16 | DELETE | `/api/users/:userId` | 잘못 등록된 구성원 삭제. 활동 기록이 있으면 409를 반환하고 탈퇴 처리를 안내 | FR-01 | ADM | 2 |
| 17 | PATCH | `/api/users/:userId/role` | 역할 변경. 자신보다 높은 역할의 사용자는 변경 불가 | FR-03, BR-04 | U+, ADM | 2 |
| 18 | PATCH | `/api/users/:userId/status` | 상태 변경. 허용된 상태 전이만 가능 | FR-03, FR-04 | 담당 C, U+ | 2 |
| 19 | GET | `/api/users/:userId/memberships` | 소속 이력 (종료된 소속 포함) | FR-02, FR-19, BR-10 | 본인, 담당 C, U+ | 2 |
| 20 | GET | `/api/users/:userId/subordinates` | 지휘 하위 구성원 목록 (Capo는 담당 Crew, Underboss는 담당 Crew 전체) | FR-05 | 본인, U+ | 2 |
| 21 | GET | `/api/users/:userId/chain-of-command` | 상위 지휘 계통 (Capo → Underboss → Boss) | FR-02, FR-05 | 본인, C+ | 2 |
| 22 | GET | `/api/roles` | 역할 목록과 계층 순위 | FR-03 | 로그인 | 2 |
| 23 | GET | `/api/member-statuses` | 구성원 상태 목록과 허용 전이 | FR-04 | 로그인 | 2 |

### 5.2 Crew

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 24 | POST | `/api/crews` | Crew 생성 | FR-05 | U+ | 2 |
| 25 | GET | `/api/crews` | Crew 목록. 지역·상태 필터, 정렬, 페이지 | FR-05, FR-21 | 로그인 | 2 |
| 26 | GET | `/api/crews/:crewId` | Crew 상세 (Capo, Underboss, 인원 수) | FR-05 | 로그인 | 2 |
| 27 | PATCH | `/api/crews/:crewId` | 이름·지역·설명 수정 | FR-05 | 담당 C, U+ | 2 |
| 28 | DELETE | `/api/crews/:crewId` | 구성원과 이력이 없는 Crew 삭제 | FR-05 | U+ | 2 |
| 29 | PATCH | `/api/crews/:crewId/status` | 활성·해산 전환. 해산 시 모든 소속을 종료 (트랜잭션) | FR-05, FR-06 | U+ | 2 |
| 30 | PUT | `/api/crews/:crewId/capo` | 책임자 지정·교체. 대상은 활동중인 Capo 역할이어야 하고, 정식 소속이 없으면 이 Crew에 정식으로 함께 편성 (다른 Crew 정식 소속이면 BR-01) | FR-05, BR-01 | U+ | 2 |
| 31 | DELETE | `/api/crews/:crewId/capo` | 책임자 해제 | FR-05 | U+ | 2 |
| 32 | PUT | `/api/crews/:crewId/underboss` | 담당 Underboss 지정 | FR-05 | B | 2 |
| 33 | GET | `/api/crews/:crewId/capo-history` | 책임자 교체 이력 | FR-05, BR-10 | C+ | 2 |
| 34 | GET | `/api/crews/:crewId/hierarchy` | Crew 조직도 (Underboss–Capo–Soldier–Associate 트리) | FR-05 | Crew 소속원, U+ | 2 |

### 5.3 Crew 편성

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 35 | GET | `/api/crews/:crewId/members` | 현재 구성원 목록. 정식·임시 구분, 역할 필터 | FR-05 | Crew 소속원, U+ | 2 |
| 36 | GET | `/api/crews/:crewId/members/:userId` | 특정 구성원의 소속 상세 (가입일, 유형, 편성자) | FR-05 | Crew 소속원, U+ | 2 |
| 37 | POST | `/api/crews/:crewId/members` | 구성원 편성. 다른 Crew에 정식 소속이면 거부 | FR-06, BR-01, BR-05 | 담당 C, U+ | 2 |
| 38 | POST | `/api/crews/:crewId/members/bulk` | 여러 명 일괄 편성 (전체 성공 또는 전체 취소) | FR-06, BR-01, BR-05 | 담당 C, U+ | 2 |
| 39 | PATCH | `/api/crews/:crewId/members/:userId` | 소속 유형 변경 (임시 → 정식) | FR-06, BR-01, BR-05 | 담당 C, U+ | 2 |
| 40 | DELETE | `/api/crews/:crewId/members/:userId` | 구성원 제외 (소속 종료일 기록) | FR-06, BR-05 | 담당 C, U+ | 2 |
| 41 | POST | `/api/crews/:crewId/members/:userId/transfer` | 다른 Crew로 이동 (기존 소속 종료 + 새 소속 생성, 트랜잭션) | FR-06, BR-01, BR-05 | U+ | 2 |
| 42 | GET | `/api/crews/:crewId/candidates` | 편성 가능한 구성원 (정식 소속 없음, 활동중) | FR-06, BR-01 | 담당 C, U+ | 2 |
| 43 | GET | `/api/crews/:crewId/membership-history` | Crew 편성 변경 이력 (가입·제외·이동) | FR-06, BR-10 | 담당 C, U+ | 2 |
| 44 | POST | `/api/crews/merge` | 두 Crew 병합 (구성원 이동 후 원 Crew 해산, 트랜잭션) | FR-06, BR-01 | U+ | 2 |

### 5.4 소속 신청

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 45 | POST | `/api/crews/:crewId/join-requests` | Crew 소속 신청 (정식 신청은 정식 소속이 없을 때만, BR-01) | FR-06, BR-01 | A, S, C (본인) | 2 |
| 46 | GET | `/api/crews/:crewId/join-requests` | 신청 목록 (상태 필터) | FR-06 | 담당 C, U+ | 2 |
| 47 | POST | `/api/crews/:crewId/join-requests/:requestId/approve` | 승인 후 편성 (BR-01 재검증) | FR-06, BR-01, BR-05 | 담당 C, U+ | 2 |
| 48 | POST | `/api/crews/:crewId/join-requests/:requestId/reject` | 거절 (사유 기록) | FR-06, BR-05 | 담당 C, U+ | 2 |
| 49 | DELETE | `/api/crews/:crewId/join-requests/:requestId` | 신청 취소 | FR-06 | 본인 | 2 |
| 50 | GET | `/api/me/join-requests` | 내 Crew 소속 신청 현황 | FR-02, FR-06 | 로그인 | 2 |

### 5.5 역할 변경 요청

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 51 | POST | `/api/role-change-requests` | 소속원 역할 변경 추천 (예: Capo가 Associate → Soldier 추천) | FR-03, BR-04 | C+ | 2 |
| 52 | GET | `/api/role-change-requests` | 요청 목록 (상태 필터) | FR-03 | C+ | 2 |
| 53 | GET | `/api/role-change-requests/:requestId` | 요청 상세 | FR-03 | 요청자, U+ | 2 |
| 54 | POST | `/api/role-change-requests/:requestId/approve` | 승인 후 역할 반영 (BR-04 재검증) | FR-03, BR-04 | U+ | 2 |
| 55 | POST | `/api/role-change-requests/:requestId/reject` | 거절 (사유 기록) | FR-03 | U+ | 2 |

---

## 6. 단계 3 — 업무·배정 (SQL, 트랜잭션)

### 6.1 업무 유형

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 56 | POST | `/api/task-types` | 업무 유형 등록 | FR-07 | U+ | 3 |
| 57 | GET | `/api/task-types` | 업무 유형 목록 | FR-07 | 로그인 | 3 |
| 58 | PATCH | `/api/task-types/:typeId` | 업무 유형 수정 | FR-07 | U+ | 3 |
| 59 | DELETE | `/api/task-types/:typeId` | 사용되지 않은 유형 삭제 | FR-07 | U+ | 3 |

### 6.2 업무

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 60 | POST | `/api/tasks` | 업무 등록 (제목, 유형, Crew, 일정, 중요도). 초기 상태 계획 | FR-07 | C+ (Capo는 담당 Crew만) | 3 |
| 61 | GET | `/api/tasks` | 업무 목록. 기간·Crew·상태·중요도·담당자 필터, 정렬, 페이지. 요청자 관리 범위 안에서만 | FR-07, FR-12, AR-03 | C+ | 3 |
| 62 | GET | `/api/tasks/:taskId` | 업무 상세 | FR-07 | 참여자, 담당 C, U+ | 3 |
| 63 | PATCH | `/api/tasks/:taskId` | 기본 정보 수정 (완료 업무는 불가) | FR-07, BR-06 | 담당 C, U+ | 3 |
| 64 | DELETE | `/api/tasks/:taskId` | 계획 상태 업무 삭제 | FR-07 | 담당 C, U+ | 3 |
| 65 | PATCH | `/api/tasks/:taskId/schedule` | 일정 변경. 배정 인원(단계 3)과 할당 자원(단계 4)의 시간 충돌을 재검증 | FR-07, BR-03, BR-07 | 담당 C, U+ | 3 |
| 66 | PATCH | `/api/tasks/:taskId/status` | 진행 상태 변경 (허용된 전이만, 완료·취소 제외) | FR-10 | 담당 C, U+ | 3 |
| 67 | POST | `/api/tasks/:taskId/duplicate` | 기존 업무를 복제해 새 업무 생성 (새 일정 지정) | FR-07 | 담당 C, U+ | 3 |
| 68 | GET | `/api/task-statuses` | 업무 상태 목록과 허용 전이 | FR-10 | 로그인 | 3 |

### 6.3 업무 세부 정보

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 69 | PUT | `/api/tasks/:taskId/requirements` | 필요 인원 수, 필요 자원 분류 설정 | FR-07, FR-17 | 담당 C, U+ | 3 |
| 70 | GET | `/api/tasks/:taskId/requirements` | 필요 조건 조회 | FR-07, FR-17 | 참여자, 담당 C, U+ | 3 |
| 71 | POST | `/api/tasks/:taskId/notes` | 지시사항 등록 (전체 또는 특정 참여자 대상) | FR-09 | 담당 C, U+ | 3 |
| 72 | GET | `/api/tasks/:taskId/notes` | 지시사항 목록 (참여자는 자신에게 해당하는 것만) | FR-09 | 참여자, 담당 C, U+ | 3 |
| 73 | PATCH | `/api/tasks/:taskId/notes/:noteId` | 지시사항 수정 | FR-09 | 작성자 | 3 |
| 74 | DELETE | `/api/tasks/:taskId/notes/:noteId` | 지시사항 삭제 | FR-09 | 작성자, U+ | 3 |
| 75 | POST | `/api/tasks/:taskId/checklist` | 체크리스트 항목 추가 | FR-07, BR-06 | 담당 C, U+ | 3 |
| 76 | GET | `/api/tasks/:taskId/checklist` | 체크리스트와 완료 현황 | FR-09, FR-10 | 참여자, 담당 C, U+ | 3 |
| 77 | PATCH | `/api/tasks/:taskId/checklist/:itemId` | 항목 내용 수정 | FR-07 | 담당 C, U+ | 3 |
| 78 | POST | `/api/tasks/:taskId/checklist/:itemId/check` | 항목 완료 표시 (수행자·시각 기록) | FR-10, BR-06 | 참여자, 담당 C, U+ | 3 |
| 79 | DELETE | `/api/tasks/:taskId/checklist/:itemId` | 항목 삭제 | FR-07 | 담당 C, U+ | 3 |
| 80 | POST | `/api/tasks/:taskId/dependencies` | 선행 업무 지정 (순환 참조 방지) | FR-07 | 담당 C, U+ | 3 |
| 81 | GET | `/api/tasks/:taskId/dependencies` | 선행·후행 업무 목록 | FR-07 | 참여자, 담당 C, U+ | 3 |
| 82 | DELETE | `/api/tasks/:taskId/dependencies/:dependsOnId` | 선행 관계 삭제 | FR-07 | 담당 C, U+ | 3 |

### 6.4 업무 배정

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 83 | POST | `/api/tasks/:taskId/assignees` | 구성원 배정 (여러 명 동시 가능). 정지·탈퇴 또는 시간 중복이면 거부 | FR-08, BR-02, BR-03 | 담당 C, U+ | 3 |
| 84 | GET | `/api/tasks/:taskId/assignees` | 참여자 목록 (업무 내 역할, 수락 여부) | FR-08 | 참여자, 담당 C, U+ | 3 |
| 85 | PATCH | `/api/tasks/:taskId/assignees/:userId` | 업무 내 역할 변경 (리더·일반) | FR-08 | 담당 C, U+ | 3 |
| 86 | DELETE | `/api/tasks/:taskId/assignees/:userId` | 배정 해제 | FR-08 | 담당 C, U+ | 3 |
| 87 | POST | `/api/tasks/:taskId/assignees/:userId/replacement` | 참여자 교체 (해제와 새 배정을 한 트랜잭션으로) | FR-08, BR-02, BR-03 | 담당 C, U+ | 3 |
| 88 | PATCH | `/api/tasks/:taskId/assignees/:userId/response` | 배정 수락·거절 응답 | FR-09 | 본인 | 3 |
| 89 | GET | `/api/tasks/:taskId/assignee-candidates` | 이 업무에 배정 가능한 구성원 (활동중, 시간 겹침 없음) | BR-02, BR-03 | 담당 C, U+ | 3 |
| 90 | GET | `/api/tasks/:taskId/assignment-history` | 배정·해제·교체 이력 | FR-08, FR-10 | 담당 C, U+ | 3 |
| 91 | GET | `/api/users/:userId/availability` | 한 구성원의 지정 시간대 가용 여부와 겹치는 업무 | BR-03 | 본인, 담당 C, U+ | 3 |
| 92 | GET | `/api/tasks/:taskId/readiness` | 시작 준비 상태 (필요 인원·자원 충족 여부, 미수락 인원) | FR-07, FR-17 | 담당 C, U+ | 3 |
| 93 | POST | `/api/tasks/:taskId/cancel` | 업무 취소. 배정 인원과 할당 자원을 일괄 해제 (트랜잭션) | FR-10, BR-06 | 담당 C, U+ | 3 |

### 6.5 내 업무

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 94 | GET | `/api/me/tasks` | 내게 배정된 업무 목록 (상태 필터, 페이지) | FR-09 | 로그인 | 3 |
| 95 | GET | `/api/me/tasks/:taskId` | 참여자 관점의 업무 상세 (내 역할, 나에게 온 지시사항, 동료, 할당 자원) | FR-09 | 참여자 | 3 |
| 96 | GET | `/api/me/schedule` | 기간 내 내 업무·자원 사용 일정 타임라인 | FR-09 | 로그인 | 3 |

### 6.6 업무 교대 요청

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 97 | POST | `/api/tasks/:taskId/swap-requests` | 내 배정을 다른 구성원에게 넘기는 교대 요청 | FR-08, BR-02, BR-03 | 참여자 | 3 |
| 98 | GET | `/api/swap-requests` | 교대 요청 목록 (보낸 요청, 받은 요청, 승인 대기) | FR-08 | 로그인 | 3 |
| 99 | POST | `/api/swap-requests/:requestId/approve` | 승인 후 배정 교체 (BR-02, BR-03 재검증) | FR-08, BR-02, BR-03 | 담당 C, U+ | 3 |
| 100 | POST | `/api/swap-requests/:requestId/reject` | 거절 | FR-08 | 대상자, 담당 C, U+ | 3 |
| 101 | DELETE | `/api/swap-requests/:requestId` | 요청 취소 | FR-08 | 요청자 | 3 |

### 6.7 업무 진행·완료·결과

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 102 | POST | `/api/tasks/:taskId/complete` | 완료 처리. 결과를 기록하고 핵심 결과를 잠금 | FR-10, FR-11, BR-06 | 담당 C, U+ | 3 |
| 103 | GET | `/api/tasks/:taskId/result` | 완료 결과 조회 | FR-11 | 참여자, 담당 C, U+ | 3 |
| 104 | PATCH | `/api/tasks/:taskId/result` | 결과 정정 (사유 필수, 정정 이력 저장). 참여자·담당 C 등 일반 구성원이 시도하면 409 BR-06 | FR-11, BR-06 | U+ | 3 |
| 105 | PUT | `/api/tasks/:taskId/participations/:userId` | 참여자별 참여 기록 (실제 참여 여부, 기여 내용) | FR-11, BR-06 | 담당 C, U+ | 3 |
| 106 | GET | `/api/tasks/:taskId/participations` | 참여 기록 목록 | FR-11 | 참여자, 담당 C, U+ | 3 |
| 107 | POST | `/api/tasks/:taskId/progress` | 진행 보고 (진척률, 메모) | FR-10, BR-06 | 참여자 | 3 |
| 108 | GET | `/api/tasks/:taskId/progress` | 진행 보고 목록 | FR-10 | 참여자, 담당 C, U+ | 3 |
| 109 | GET | `/api/tasks/:taskId/status-history` | 업무 상태 변경 이력 | FR-10 | 참여자, 담당 C, U+ | 3 |

---

## 7. 단계 4 — 공용 자원 (SQL, 트랜잭션)

### 7.1 자원 분류

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 110 | POST | `/api/resource-categories` | 자원 분류 등록 | FR-13 | U+ | 4 |
| 111 | GET | `/api/resource-categories` | 분류 목록 (분류별 자원 수 포함) | FR-13 | 로그인 | 4 |
| 112 | PATCH | `/api/resource-categories/:categoryId` | 분류 수정 | FR-13 | U+ | 4 |
| 113 | DELETE | `/api/resource-categories/:categoryId` | 자원이 없는 분류 삭제 | FR-13 | U+ | 4 |

### 7.2 자원

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 114 | POST | `/api/resources` | 자원 등록 (분류, 위치, 이용 최소 역할) | FR-13 | U+ | 4 |
| 115 | POST | `/api/resources/bulk` | 자원 일괄 등록 (전체 성공 또는 전체 취소) | FR-13 | U+ | 4 |
| 116 | GET | `/api/resources` | 관리용 전체 자원 목록. 상태·분류·위치 필터, 정렬, 페이지 | FR-13, FR-16, FR-21, AR-03 | C+ | 4 |
| 117 | GET | `/api/resources/available` | 내 역할과 현재 상태 기준으로 이용 가능한 자원만 조회 | FR-14, BR-07, BR-08 | S+ | 4 |
| 118 | GET | `/api/resources/:resourceId` | 자원 상세 (현재 상태, 현재 사용자) | FR-13 | S+ | 4 |
| 119 | PATCH | `/api/resources/:resourceId` | 기본 정보 수정 | FR-13 | U+ | 4 |
| 120 | DELETE | `/api/resources/:resourceId` | 사용 이력이 없는 자원 삭제 | FR-13 | U+ | 4 |
| 121 | PATCH | `/api/resources/:resourceId/status` | 상태 변경 (사용가능·점검중·사용불가) | FR-13, FR-16, BR-08 | C+ | 4 |
| 122 | PATCH | `/api/resources/:resourceId/access-level` | 이용 가능한 최소 역할 변경 | FR-14 | U+ | 4 |
| 123 | GET | `/api/resource-statuses` | 자원 상태 목록과 상태별 배정 가능 여부 | FR-16, BR-08 | 로그인 | 4 |
| 124 | GET | `/api/resources/:resourceId/status-history` | 자원 상태 변경 이력 | FR-15 | C+ | 4 |

### 7.3 자원 점검

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 125 | POST | `/api/resources/:resourceId/maintenances` | 점검 등록 (사유, 예정 완료일). 자원 상태를 점검중으로 전환 | FR-16, BR-08 | C+ | 4 |
| 126 | GET | `/api/resources/:resourceId/maintenances` | 자원별 점검 이력 | FR-15, FR-16 | C+ | 4 |
| 127 | PATCH | `/api/resources/:resourceId/maintenances/:maintenanceId` | 점검 내용·예정일 수정 | FR-16 | C+ | 4 |
| 128 | POST | `/api/resources/:resourceId/maintenances/:maintenanceId/complete` | 점검 완료. 결과에 따라 사용가능 또는 사용불가로 전환 | FR-16 | C+ | 4 |
| 129 | GET | `/api/maintenances` | 진행 중인 점검 전체 목록 (예정일 초과 표시) | FR-16 | C+ | 4 |

### 7.4 업무 자원 할당

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 130 | POST | `/api/tasks/:taskId/resources` | 업무에 자원 할당 (업무 시간대). 시간 중복·사용불가 자원은 거부 | FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 131 | GET | `/api/tasks/:taskId/resources` | 업무에 할당된 자원 목록 | FR-17 | 참여자, 담당 C, U+ | 4 |
| 132 | PATCH | `/api/tasks/:taskId/resources/:resourceId` | 할당 시간대 조정 | FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 133 | DELETE | `/api/tasks/:taskId/resources/:resourceId` | 할당 해제 | FR-17 | 담당 C, U+ | 4 |
| 134 | GET | `/api/tasks/:taskId/resource-candidates` | 이 업무에 할당 가능한 자원 (정상 상태, 시간대 비어 있음, 필요 분류 일치) | FR-14, FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 135 | GET | `/api/resources/:resourceId/availability` | 한 자원의 지정 시간대 가용 여부와 겹치는 배정 | BR-07, BR-08 | S+ | 4 |
| 136 | GET | `/api/resources/:resourceId/schedule` | 자원 예약 일정 (업무·구성원 배정 타임라인) | FR-15 | S+ | 4 |

### 7.5 구성원 자원 배정

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 137 | POST | `/api/resources/:resourceId/allocations` | 구성원에게 자원 배정 (시간대 지정) | FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 138 | GET | `/api/users/:userId/allocations` | 구성원에게 배정된 자원 목록 | FR-14, FR-17 | 본인, 담당 C, U+ | 4 |
| 139 | PATCH | `/api/resource-allocations/:allocationId` | 배정 기간 변경 (BR-07 재검증) | FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 140 | DELETE | `/api/resource-allocations/:allocationId` | 배정 취소 | FR-17 | 담당 C, U+ | 4 |

### 7.6 자원 사용 신청

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 141 | POST | `/api/resource-requests` | 자원 사용 신청 (자원, 시간대, 사유) | FR-14, FR-17, BR-07, BR-08 | S+ | 4 |
| 142 | GET | `/api/resource-requests` | 신청 목록 (내 신청, 승인 대기) | FR-17 | S+ | 4 |
| 143 | GET | `/api/resource-requests/:requestId` | 신청 상세 | FR-17 | 신청자, 담당 C, U+ | 4 |
| 144 | POST | `/api/resource-requests/:requestId/approve` | 승인 후 구성원 배정 생성 (BR-07, BR-08 재검증) | FR-17, BR-07, BR-08 | 담당 C, U+ | 4 |
| 145 | POST | `/api/resource-requests/:requestId/reject` | 거절 (사유 기록) | FR-17 | 담당 C, U+ | 4 |
| 146 | DELETE | `/api/resource-requests/:requestId` | 신청 취소 | FR-17 | 신청자 | 4 |

### 7.7 자원 사용·반환

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 147 | POST | `/api/resources/:resourceId/checkout` | 사용 시작. 유효한 배정이 있어야 하며 상태를 사용중으로 전환 | FR-15 | 배정받은 구성원 | 4 |
| 148 | POST | `/api/resources/:resourceId/return` | 반환. 반환 상태를 기록하고 손상 시 점검중으로 전환 | FR-15, FR-16 | 사용자, 담당 C, U+ | 4 |
| 149 | POST | `/api/tasks/:taskId/resources/return` | 업무에 할당된 자원 일괄 반환 | FR-15 | 담당 C, U+ | 4 |
| 150 | GET | `/api/resources/:resourceId/usages` | 자원별 사용·반환 이력 | FR-15, DR-03 | C+ | 4 |
| 151 | PATCH | `/api/resource-usages/:usageId` | 반환 예정 시각 연장 (BR-07 재검증) | FR-15, BR-07 | 담당 C, U+ | 4 |
| 152 | POST | `/api/resource-usages/:usageId/handover` | 사용 중인 자원을 다른 구성원에게 인계 (반환 + 사용 시작, 트랜잭션) | FR-15, BR-07 | 사용자 | 4 |
| 153 | POST | `/api/resource-usages/:usageId/damage-reports` | 사용 중 고장 신고. 점검을 자동 등록 | FR-16, BR-08 | 사용자 | 4 |
| 154 | GET | `/api/resource-usages/overdue` | 반환 예정 시각이 지난 미반환 목록 | FR-15 | C+ | 4 |

---

## 8. 단계 5 — 평가·기록 (MongoDB)

### 8.1 이력 조회

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 155 | GET | `/api/users/:userId/change-history` | 역할·소속·상태·평가 변경 이력 (유형 필터) | FR-19, BR-10 | 본인, 담당 C, U+ | 5 |
| 156 | GET | `/api/users/:userId/activity` | 구성원 활동 타임라인 (업무 참여, 자원 사용, 받은 평가) | FR-19 | 본인, 담당 C, U+ | 5 |
| 157 | GET | `/api/crews/:crewId/activity` | Crew 활동 타임라인 | FR-19, FR-22 | 담당 C, U+ | 5 |

### 8.2 평가

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 158 | POST | `/api/tasks/:taskId/evaluations` | 완료 업무 참여자 평가 (완료 업무만, 평가자당 대상 1회) | FR-18 | 담당 C, U+ | 5 |
| 159 | GET | `/api/tasks/:taskId/evaluations` | 업무별 평가 목록 | FR-11, FR-19 | 담당 C, U+ | 5 |
| 160 | GET | `/api/evaluations` | 평가 검색 (기간, Crew, 평가자, 대상자) | FR-19, FR-21, AR-03 | U+ | 5 |
| 161 | GET | `/api/evaluations/pending` | 내가 작성해야 할 평가 목록 | FR-18 | C+ | 5 |
| 162 | GET | `/api/evaluations/:evaluationId` | 평가 상세 | FR-19, BR-10 | 대상자, 평가자, U+ | 5 |
| 163 | PATCH | `/api/evaluations/:evaluationId` | 평가 수정 (수정 기한 내, 수정 이력 저장) | FR-18, BR-10 | 평가자 | 5 |
| 164 | DELETE | `/api/evaluations/:evaluationId` | 평가 철회 (사유 필수, 기록은 보존) | FR-18, BR-10 | U+ | 5 |
| 165 | GET | `/api/users/:userId/evaluations` | 구성원이 받은 평가 이력 | FR-19 | 본인, 담당 C, U+ | 5 |
| 166 | GET | `/api/evaluation-criteria` | 평가 항목 목록 | FR-18 | 로그인 | 5 |
| 167 | PUT | `/api/evaluation-criteria` | 평가 항목·가중치 설정 | FR-18 | B, ADM | 5 |
| 168 | POST | `/api/evaluations/:evaluationId/appeals` | 받은 평가에 이의 제기 | FR-18, BR-10 | 대상자 | 5 |
| 169 | GET | `/api/evaluation-appeals` | 이의 제기 목록 (상태 필터) | FR-19 | 본인, U+ | 5 |
| 170 | POST | `/api/evaluation-appeals/:appealId/resolve` | 이의 처리 (기각 또는 평가 정정) | FR-18, BR-10 | U+ | 5 |

### 8.3 평판

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 171 | GET | `/api/users/:userId/reputation` | 평판 요약 (평균 점수, 항목별 점수, 추세) | FR-18, FR-19 | 본인, 담당 C, U+ | 5 |
| 172 | POST | `/api/users/:userId/reputation-events` | 업무 외 공로·징계 기록 | FR-18, BR-10 | U+ | 5 |
| 173 | GET | `/api/users/:userId/reputation-events` | 공로·징계 기록 목록 | FR-19 | 본인, 담당 C, U+ | 5 |
| 174 | DELETE | `/api/reputation-events/:eventId` | 잘못된 기록 취소 (사유 필수) | FR-18, BR-10 | U+ | 5 |
| 175 | GET | `/api/reputation/rankings` | 평판 순위 (Crew·기간 필터) | FR-22 | U+ | 5 |

### 8.4 감사 기록

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 176 | GET | `/api/audit-logs` | 관리 활동·중요 상태 변경 기록 검색 (행위자, 행위, 대상, 기간) | FR-20, FR-23 | B, ADM | 5 |
| 177 | GET | `/api/audit-logs/:logId` | 기록 상세 (변경 전후 값) | FR-20 | B, ADM | 5 |
| 178 | GET | `/api/audit-logs/export` | 검색 결과를 CSV로 내보내기 | FR-20 | ADM | 5 |
| 179 | GET | `/api/security-events` | 권한 거부(403) 접근 시도 기록 | BR-09, NFR-03 | ADM | 5 |

---

## 9. 단계 6 — 검색·통계·관리자

### 9.1 검색

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 180 | GET | `/api/search` | 통합 검색. 구성원·Crew·업무·자원을 권한 범위 안에서 한 번에 검색 | FR-21, NFR-04 | 로그인 | 6 |
| 181 | POST | `/api/saved-searches` | 검색 조건 저장 | FR-21, NFR-04 | 로그인 | 6 |
| 182 | GET | `/api/saved-searches` | 내 저장 검색 목록 | FR-21 | 로그인 | 6 |
| 183 | GET | `/api/saved-searches/:searchId/results` | 저장된 조건으로 검색 실행 | FR-21, NFR-04 | 본인 | 6 |
| 184 | DELETE | `/api/saved-searches/:searchId` | 저장 검색 삭제 | FR-21 | 본인 | 6 |

### 9.2 운영 현황 통계

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 185 | GET | `/api/stats/overview` | 조직 전체 요약 (상태별 구성원 수, Crew 수, 진행 업무 수, 자원 가용률) | FR-22 | U+ | 6 |
| 186 | GET | `/api/stats/members` | 역할·상태별 구성원 분포 | FR-22 | U+ | 6 |
| 187 | GET | `/api/stats/crews` | Crew별 인원·업무 수·완료율 비교 | FR-22 | U+ | 6 |
| 188 | GET | `/api/stats/regions` | 지역별 Crew·구성원 수 | FR-22 | U+ | 6 |
| 189 | GET | `/api/stats/tasks` | 기간별 업무 상태 추이 (일·주·월 단위) | FR-22 | U+ | 6 |
| 190 | GET | `/api/stats/tasks/lead-time` | 중요도별 업무 평균 소요 시간 | FR-22 | U+ | 6 |
| 191 | GET | `/api/stats/resources` | 자원 상태 분포와 가동률 | FR-22, FR-16 | U+ | 6 |
| 192 | GET | `/api/stats/resources/usage-ranking` | 자원별 사용 횟수·시간 순위 | FR-22, FR-15 | U+ | 6 |
| 193 | GET | `/api/stats/evaluations` | 기간·Crew별 평균 평가 추이 | FR-22, FR-18 | U+ | 6 |
| 194 | GET | `/api/stats/membership-changes` | 기간별 가입·이동·탈퇴 추이 | FR-22, BR-10 | U+ | 6 |
| 195 | GET | `/api/stats/admin-activity` | 기간별 관리 활동 건수 | FR-20, FR-22 | B, ADM | 6 |
| 196 | GET | `/api/stats/alerts` | 운영 경고 (반환 연체 자원, 일정이 지난 미완료 업무, 장기 점검 자원) | FR-22, FR-15, FR-16 | U+ | 6 |
| 197 | GET | `/api/crews/:crewId/workload` | Crew 구성원별 배정 업무 수·시간 | FR-12, FR-22 | 담당 C, U+ | 6 |
| 198 | GET | `/api/me/dashboard` | 내 요약 (진행 업무, 사용 중 자원, 최근 평가) | FR-02, FR-09 | 로그인 | 6 |

### 9.3 관리자

| # | Method | URL | 기능 | 요구사항 | 권한 | 단계 |
| ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 199 | GET | `/api/admin/accounts` | 계정 보안 현황 (마지막 로그인, 로그인 실패 횟수, 잠금 여부) | FR-23 | ADM | 6 |
| 200 | PUT | `/api/admin/accounts/:userId/lock` | 계정 잠금 (로그인 차단, 세션 종료) | FR-23, NFR-03 | ADM | 6 |
| 201 | DELETE | `/api/admin/accounts/:userId/lock` | 계정 잠금 해제 | FR-23 | ADM | 6 |
| 202 | POST | `/api/admin/accounts/:userId/password-reset` | 임시 비밀번호 발급 | FR-23 | ADM | 6 |
| 203 | DELETE | `/api/admin/accounts/:userId/sessions` | 대상 계정 강제 로그아웃 | FR-23, NFR-03 | ADM | 6 |
| 204 | GET | `/api/admin/login-history` | 로그인 성공·실패 이력 | FR-23 | ADM | 6 |
| 205 | GET | `/api/admin/permissions` | 역할별 권한 매트릭스 | FR-23, NFR-03 | ADM | 6 |
| 206 | PUT | `/api/admin/permissions/:role` | 역할별 권한 수정 (RBAC 미들웨어에 즉시 반영) | FR-23, NFR-03 | ADM | 6 |
| 207 | GET | `/api/admin/settings` | 운영 설정 조회 (평가 수정 기한, 반환 연체 기준 등) | FR-23 | ADM | 6 |
| 208 | PUT | `/api/admin/settings` | 운영 설정 변경 | FR-23 | ADM | 6 |
| 209 | GET | `/api/admin/integrity-check` | 데이터 무결성 점검 (다중 정식 소속, 시간 중복 배정, 자원 중복 배정) | DR-01, BR-01, BR-03, BR-07 | ADM | 6 |
| 210 | GET | `/api/admin/health` | SQL·MongoDB 연결 상태 | FR-23, NFR-02 | ADM | 6 |

---

## 10. EJS 화면 (CR-02, API 개수에 포함하지 않음)

화면은 REST API와 같은 서비스 계층을 호출하고, 각 폼 경로에는 같은 기능의 API와 똑같은 권한 키를 건다. 로그인 상태는 HttpOnly·SameSite=Lax 쿠키에 담은 JWT로 유지한다.

| URL | 화면 | 요구사항 | 단계 |
| :--- | :--- | :--- | :---: |
| `/` | 홈: 단계별 기능 요구사항 확인 목록, 업무 규칙 확인 시나리오, 테스트 계정 바로 로그인 | — | 2 |
| `/login` | 로그인 (테스트 계정 바로 로그인) | FR-02, NFR-03 | 2 |
| `/me` | 내 정보: 내 요약(진행 업무·사용 중 자원·평판·처리할 일, 단계 6), 계정·역할·상태·현재 소속, 연락처·비밀번호 변경, 로그인 세션, 사용 가능 기능, 내 소속 신청 | FR-01, FR-02, NFR-03 | 2, 6 |
| `/users` | 구성원 목록(필터·검색·정렬·페이지), 구성원 등록 | FR-01, FR-04, FR-21 | 2 |
| `/users/:userId` | 구성원 상세: 현재 소속, 지휘 계통, 하위 구성원, 소속 이력, 기본 정보·역할·상태 변경, 역할 변경 추천, 삭제. 단계 5부터 평판, 공로·징계 기록·취소, 받은 평가, 변경 이력(시간순), 활동 타임라인 | FR-01~FR-05, FR-18, FR-19, BR-04, BR-10 | 2, 5 |
| `/crews` | Crew 목록(필터·정렬·페이지), Crew 생성 | FR-05, FR-21 | 2 |
| `/crews/:crewId` | Crew 상세: 조직도, 소속원, 편성·제외·유형 변경·이동, 소속 신청과 승인·거절, 책임자·Underboss 지정, 해산·병합·삭제, 편성·책임자 이력, Crew 활동 타임라인(단계 5), 소속원별 업무량(단계 6) | FR-05, FR-06, FR-12, FR-19, BR-01, BR-05, BR-10 | 2, 5, 6 |
| `/role-requests` | 역할 변경 요청 목록과 승인·거절 | FR-03, BR-04 | 2 |
| `/tasks` | 업무 목록(상태·중요도·Crew 필터, 정렬, 페이지), 업무 등록 | FR-07, FR-12 | 3 |
| `/tasks/:taskId` | 업무 상세: 시작·보류, 참여자 배정·역할·해제·교체·응답, 교대 요청, 할당 자원(할당·시간 조정·해제·사용 시작·일괄 반환, 단계 4), 지시사항, 체크리스트, 선행 업무, 진행 보고, 완료 처리·결과 정정, 참여 기록, 참여자 평가(완료 업무, 단계 5), 정보·일정·필요 인원·필요 자원 변경, 복제·취소·삭제, 상태·배정 이력 | FR-07~FR-11, FR-17, FR-18, BR-02, BR-03, BR-06, BR-07, BR-08 | 3, 4, 5 |
| `/my-tasks` | 내 업무 목록, 앞으로 2주 일정(배정된 자원 포함), 교대 요청(보낸·받은·승인할) 처리 | FR-08, FR-09 | 3 |
| `/resources` | 이용 가능한 자원(시간대·분류), 관리용 전체 자원(상태·정상 여부·분류 필터, 정렬, 페이지), 진행 중인 점검, 미반환 자원, 자원 분류, 자원 등록 | FR-13, FR-14, FR-16, FR-21 | 4 |
| `/resources/:resourceId` | 자원 상세: 현재 상태·사용자·점검, 사용 시작·반환·인계·고장 신고·반환 연장, 시간대 가용 여부, 구성원 배정·취소, 예약 일정, 사용·반환 이력, 점검 등록·완료, 상태 이력, 상태·이용 권한·정보 변경, 삭제 | FR-13~FR-17, BR-07, BR-08 | 4 |
| `/my-resources` | 지금 사용 중인 자원과 반환, 나에게 배정된 자원과 사용 시작, 자원 사용 신청·취소, 처리할 사용 신청 승인·거절 | FR-14, FR-15, FR-17 | 4 |
| `/evaluations` | 작성할 평가, 처리할 이의 제기(기각·정정), 내가 낸 이의 제기, 평가 검색(필터·정렬·페이지), 평가 항목 조회·설정, 평판 순위 | FR-18, FR-19, FR-22, BR-10 | 5 |
| `/evaluations/:evaluationId` | 평가 상세: 항목별 점수, 수정·정정 이력, 이의 제기, 평가 수정·이의 제기·철회 | FR-18, FR-19, BR-10 | 5 |
| `/audit-logs` | 감사 기록 검색(행위·대상·기간·검색어, 정렬, 페이지), CSV 내려받기, 권한 거부 기록 | FR-20, BR-09 | 5 |
| `/audit-logs/:logId` | 감사 기록 상세: 행위자, 대상, 관련 대상, 변경 전후 값, 사유, IP | FR-20 | 5 |
| `/dashboard` | 운영 현황 대시보드: 기간·묶음 필터, 요약 지표, 업무 상태 추이·자원 상태와 가동률·자원 사용 순위·평가 추이 차트(표 보기 포함), Crew 비교, 구성원 분포, 지역별, 중요도별 소요 시간, 소속 변화, 운영 경고, 관리 활동 (#185~#196) | FR-22, FR-20 | 6 |
| `/search` | 통합 검색(종류 선택, 권한 범위 표시), 검색 조건 저장·실행·삭제 | FR-21, NFR-04 | 6 |
| `/admin` | 관리자: DB 연결 상태, 무결성 점검, 계정 보안 현황과 잠금·해제·임시 비밀번호·강제 로그아웃, 로그인 이력, 역할별 권한 편집, 운영 설정 | FR-23, NFR-02, NFR-03, BR-09 | 6 |

## 11. 중복 위험 검토 (AR-07)

비슷해 보이지만 동작이 다른 API와 그 구분 근거다. 기술 보고서에도 이 근거를 적는다.

| API | 구분 근거 |
| :--- | :--- |
| #61 `GET /tasks` / #94 `GET /me/tasks` | 관리 범위 안의 전체 업무 탐색(C+) / 내 배정 업무만(모든 구성원) |
| #62 `GET /tasks/:id` / #95 `GET /me/tasks/:id` | 업무 원본 정보 / 참여자 관점 묶음(내 역할, 나에게 온 지시사항, 동료, 자원) |
| #63 `PATCH /tasks/:id` / #65 `/schedule` / #66 `/status` | 일반 정보 수정 / 배정 인원·자원 시간 충돌 재검증 / 상태 전이 규칙 검증 |
| #15 `PATCH /users/:id` / #17 `/role` / #18 `/status` | 기본 정보 / BR-04 순위 검증 / 상태 전이 검증. 각각 다른 권한과 이력 기록 |
| #27 `PATCH /crews/:id` / #29 `/status` | 정보 수정 / 해산 시 전 구성원 소속 종료 |
| #119 `PATCH /resources/:id` / #121 `/status` | 정보 수정 / 상태 전이와 배정 가능 여부 변경 |
| #89 `assignee-candidates` / #91 `users/:id/availability` | 한 업무 기준 전체 후보 탐색 / 한 구성원 기준 임의 시간대 확인 |
| #134 `resource-candidates` / #135 `availability` / #136 `schedule` | 한 업무 기준 후보 탐색 / 한 자원의 특정 시간대 확인 / 한 자원의 전체 예약 일정 |
| #159 / #160 / #165 평가 목록 | 한 업무의 평가 / 조건 검색(U+) / 한 구성원이 받은 평가 |
| #155 `change-history` / #156 `activity` | 역할·소속·상태 등 속성 변경 기록 / 업무 참여·자원 사용 등 활동 기록 |
| #3 `logout` / #5 `DELETE sessions` | 현재 세션만 종료 / 모든 기기 세션 종료 |
| #200 / #201 계정 잠금 | 잠금 / 해제 (반대 동작) |
| 승인·거절 (#47·48, #54·55, #99·100, #144·145) | 대상 엔티티와 승인 후 처리(편성, 역할 반영, 배정 교체, 자원 배정)가 모두 다름 |

**근거가 약한 항목:** #122 `access-level`은 #119 정보 수정에 합쳐질 수 있고, #183 `saved-searches/:id/results`는 #180 통합 검색 실행과 겹쳐 보일 수 있다. 이 둘이 불인정되어도 208개로 200개 이상을 유지한다.

## 12. 요구사항 연결 점검

각 API의 요구사항 열에서 자동으로 계산한 표다. 모든 기능 요구사항과 업무 규칙이 하나 이상의 API와 연결되어 있다.

| 요구사항 | API # |
| :--- | :--- |
| FR-01 | 7~8, 10~16 |
| FR-02 | 1, 6, 9, 19, 21, 50, 198 |
| FR-03 | 17~18, 22, 51~55 |
| FR-04 | 18, 23 |
| FR-05 | 20~21, 24~36 |
| FR-06 | 29, 37~50 |
| FR-07 | 56~65, 67, 69~70, 75, 77, 79~82, 92 |
| FR-08 | 83~87, 90, 97~101 |
| FR-09 | 71~74, 76, 88, 94~96, 198 |
| FR-10 | 66, 68, 76, 78, 90, 93, 102, 107~109 |
| FR-11 | 102~106, 159 |
| FR-12 | 61, 197 |
| FR-13 | 110~116, 118~121 |
| FR-14 | 117, 122, 134, 138, 141 |
| FR-15 | 124, 126, 136, 147~152, 154, 192, 196 |
| FR-16 | 116, 121, 123, 125~129, 148, 153, 191, 196 |
| FR-17 | 69~70, 92, 130~134, 137~146 |
| FR-18 | 158, 161, 163~164, 166~168, 170~172, 174, 193 |
| FR-19 | 14, 19, 155~157, 159~160, 162, 165, 169, 171, 173 |
| FR-20 | 176~178, 195 |
| FR-21 | 12, 25, 116, 160, 180~184 |
| FR-22 | 157, 175, 185~197 |
| FR-23 | 176, 199~208, 210 |
| BR-01 | 30, 37~39, 41~42, 44~45, 47, 209 |
| BR-02 | 83, 87, 89, 97, 99 |
| BR-03 | 65, 83, 87, 89, 91, 97, 99, 209 |
| BR-04 | 17, 51, 54 |
| BR-05 | 37~41, 47~48 |
| BR-06 | 63, 75, 78, 93, 102, 104~105, 107 |
| BR-07 | 65, 117, 130, 132, 134~135, 137, 139, 141, 144, 151~152, 209 |
| BR-08 | 117, 121, 123, 125, 130, 132, 134~135, 137, 139, 141, 144, 153 |
| BR-09 | 179 (모든 API에 RBAC 미들웨어 적용) |
| BR-10 | 19, 33, 43, 155, 162~164, 168, 170, 172, 174, 194 |

## 13. 구현 메모

- 고정 경로는 파라미터 경로보다 먼저 등록한다. 예: `/users/check-username` → `/users/:userId`, `/resources/available` → `/resources/:resourceId`, `/evaluations/pending` → `/evaluations/:evaluationId`, `/resource-usages/overdue` → `/resource-usages/:usageId`.
- #65 업무 일정 변경은 단계 3에서 구성원 시간 충돌 검증을, 단계 4에서 자원 시간 충돌 검증을 추가했다.
- 모든 상태 변경 API는 단계 1에서 만든 이력 기록 서비스를 처음부터 호출한다. #155·109·124·156·157 이력 조회 API의 데이터 원천이다.
- 단계 3의 업무 API 가운데 자원과 연결된 부분은 단계 4에서 같은 API에 추가했다.
  - #69·#70 필요 자원 분류, #92 필요 자원 충족 확인·할당 자원 상태, #93 취소 시 할당 자원 해제, #64 자원 사용 기록이 있는 업무 삭제 거부
  - #95 할당 자원, #96 나에게 배정된 자원 일정, #65 할당 시간대 이동과 시간 충돌(BR-07) 검사
- 단계 2의 구성원 탈퇴(#18)는 단계 4부터 끝나지 않은 구성원 자원 배정을 끝내고 대기 중인 자원 사용 신청을 취소한다.
- 단계 5의 평가·이의 제기·공로·징계·평가 항목은 MongoDB 컬렉션(evaluations, evaluation_appeals, reputation_events, evaluation_criteria)에 둔다. 경로의 문서 ID는 24자리 16진수 ObjectId다(형식이 틀리면 400, 없으면 404).
- #178 감사 기록 내보내기는 공통 JSON 응답 형식의 예외로 CSV 파일(UTF-8, BOM)을 그대로 돌려준다.
- 시드 계정·초기 편성은 시드를 넣을 때 활동 기록(계정 등록, 소속 시작)도 함께 남겨, 변경 이력이 계정 등록부터 시간순으로 이어진다.
- 단계 6부터 평가 작성·수정 기한(#158, #163), 미반환 목록의 연체 기준(#154)은 운영 설정(#207·#208)을 따른다. 로그인(#1)은 연속 실패가 잠금 기준에 이르면 계정을 잠근다.
- 웹 화면의 업무 홈(`/`)에 내 요약(#198)과 운영 경고(#196)를, Crew 상세(`/crews/:crewId`)에 소속원별 업무량(#197)을 붙였다.
