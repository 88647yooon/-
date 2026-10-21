# 요구사항 추적표

The Family 통합 정보시스템(학번 202211207)의 요구사항(Requirement ID)을 그 요구사항을 구현한 API와 JS 파일에 연결한 표입니다.

- 기준 요구사항: `requirements_spec.md`의 58개 (기능 FR 23, 업무 규칙 BR 10, 데이터 DR 6, REST API AR 8, 비기능 NFR 5, 기술 제약 CR 6)
- API와 요구사항의 연결은 [API 목록표](api_catalog.md)의 요구사항 열, Swagger 설명 맨 앞의 [ ]와 같습니다. `(#번호)`는 API 목록표의 번호입니다.

## 구현 위치

그 API(요구사항)를 구현하는 데 사용하는 JS 파일입니다. 경로는 `midterm` 폴더 기준입니다.

- API 행: 라우트 파일(`routes/`), 컨트롤러 파일(`controllers/`), 서비스 파일(`services/`)
- 업무 규칙(BR) 행: 위 파일과 함께, 규칙을 검사하는 파일(예: `services/assignmentRules.js`)이나 규칙을 지키는 조회·이력 저장 파일(`models/`)
- 모든 API가 공통으로 쓰는 `middlewares/authenticate.js`(인증), `middlewares/authorize.js`(권한), `middlewares/validate.js`(입력 검증), `middlewares/errorHandler.js`(오류 응답)는 각 API 행에서 생략하고 BR-09, AR, NFR 행에 적었습니다.

## 확인방법

- **계정**: 시드 계정의 아이디로 로그인합니다. 비밀번호는 모두 `Family2026!`이고, 계정 목록은 [기능 확인 방법](requirements_check.md) 1장에 있습니다.
- **표기**: `계정 → 메뉴 › 화면 → [버튼]`. 메뉴는 왼쪽 메뉴이고, "사용자 메뉴"는 오른쪽 위 이름을 누르면 나오는 메뉴입니다.
- **거부 확인**: 처리가 거부되면 화면 위쪽에 이유와 `규정 BR-xx`가 표시됩니다.
- **Swagger(계정)**: http://localhost:3000/api-docs 에서 `POST /api/auth/login`을 그 계정으로 실행 → 응답의 `accessToken`을 [Authorize]에 넣기 → 해당 API [Try it out] → 값 입력 → [Execute].
- **#번호**: "#24로 만든 Crew"처럼 적힌 `#번호`는 이 표에서 그 API 행의 확인방법을 먼저 실행한 결과입니다.
- **데이터**: 각 확인은 시드 데이터만 있는 상태에서 시작합니다. 앞의 확인으로 데이터가 바뀌었으면 서버를 `node app.js --reset`으로 다시 시작합니다.
- **날짜·시간**: 시드를 넣은 날 기준입니다. 강북 정기 순찰은 다음 날 10:00~12:00, 물품 운송은 지금 진행 중, 강남 정보 수집은 전날 완료된 업무입니다.

Swagger에 넣는 ID (`node app.js --reset` 직후 기준)

| 구분 | ID |
| --- | --- |
| Crew | 1 Northside, 2 Southside, 3 Harbor |
| 업무 | 1 강북 정기 순찰, 2 물품 운송, 3 강남 정보 수집(완료), 4 항만 물품 확인, 5 간부 정기 회의 |
| 구성원 | 1 admin, 2 boss, 3 underboss1, 4 underboss2, 5 capo1, 6 capo2, 7 capo3, 8 soldier1, 9 soldier2, 10 soldier3, 11 soldier4, 12 associate1, 13 associate2, 14 pending1, 15 suspended1, 16 withdrawn1 |
| 자원 | 1 VH-001 승합차 1호, 2 VH-002 승합차 2호, 3 VH-003 세단 1호, 4 VH-004 화물 트럭(점검중), 5 RD-001 무전기 1호, 6 RD-002 무전기 2호, 7 RD-003 무전기 3호(사용불가), 8 PR-001 방탄 조끼 세트 |
| 그 밖 | 소속 신청 1 (associate2 → Southside), 역할 변경 요청 1 (associate1 → Soldier), 교대 요청 1 (soldier2 → associate1), 자원 사용 신청 1 (soldier3, 무전기 2호), 구성원 자원 배정 1 (무전기 2호 → soldier1), 점검 1 (화물 트럭), 지시사항 1·2, 체크리스트 1·2 (강북 정기 순찰)·3·4 (물품 운송) |

## 요약

| 구분 | 요구사항 수 | API 목록표에서 연결된 API 수 | 표의 행 수 |
| --- | --- | --- | --- |
| 기능 요구사항 (FR) | 23 | 201 | 238 |
| 업무 규칙 (BR) | 10 | 58 | 91 |
| 데이터 요구사항 (DR) | 6 | 2 | 8 |
| REST API 요구사항 (AR) | 8 | 4 | 12 |
| 비기능 요구사항 (NFR) | 5 | 15 | 21 |
| 기술 제약조건 (CR) | 6 | - | 6 |
| 합계 | 58 | 210 (전체 210개 중) | 376 |

AR·NFR·CR처럼 모든 API에 공통으로 적용되는 요구사항은 "모든 API" 행으로 적고, 이 행은 API 수에 넣지 않았습니다.

## 1. 기능 요구사항 (FR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **FR-01**<br>구성원 기본 정보 등록·관리 | PATCH | `/api/me` (#7) | routes/meRoutes.js controllers/meController.js services/meService.js | soldier1 → 사용자 메뉴 › 내 정보 → 연락처·별명 수정 → [수정] |
|  | PUT | `/api/me/password` (#8) | routes/meRoutes.js controllers/meController.js services/meService.js | soldier1 → 사용자 메뉴 › 내 정보 → 비밀번호 변경 → [변경] (확인 후 Family2026!로 되돌림) |
|  | POST | `/api/users` (#10) | routes/userRoutes.js controllers/userController.js services/userService.js | underboss1 → 조직 › 구성원 → [＋ 구성원 등록] → 아이디·비밀번호·이름 입력 → [등록] → 새 구성원 화면(Associate·대기) |
|  | POST | `/api/users/bulk` (#11) | routes/userRoutes.js controllers/userController.js services/userService.js | Swagger(admin): POST /api/users/bulk 예시 본문 그대로 실행 → 201 (한 명이라도 중복이면 전체 취소, 409 BULK_REJECTED) |
|  | GET | `/api/users` (#12) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → 구성원 목록 |
|  | GET | `/api/users/check-username` (#13) | routes/userRoutes.js controllers/userController.js services/userService.js | Swagger(boss): GET /api/users/check-username — username new.member는 사용 가능, boss는 사용 중 |
|  | GET | `/api/users/:userId` (#14) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → 아이디 클릭 → 구성원 화면 |
|  | PATCH | `/api/users/:userId` (#15) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → soldier4 → [구성원 관리] → 기본 정보 수정 → [수정] |
|  | DELETE | `/api/users/:userId` (#16) | routes/userRoutes.js controllers/userController.js services/userService.js | admin → 조직 › 구성원 → [＋ 구성원 등록]으로 새 구성원 등록 → 그 화면 → [구성원 관리] → [구성원 삭제] (soldier1처럼 기록이 있으면 거부) |
| **FR-02**<br>본인의 소속·역할·상태·활동 확인 | POST | `/api/auth/login` (#1) | routes/authRoutes.js controllers/authController.js services/authService.js | soldier1 → [로그인] → 업무 홈에 이름·역할(Soldier)·소속(Northside) 표시 |
|  | GET | `/api/me` (#6) | routes/meRoutes.js controllers/meController.js services/meService.js | soldier1 → 사용자 메뉴 › 내 정보 → 계정·현재 소속 |
|  | GET | `/api/me/permissions` (#9) | routes/meRoutes.js controllers/meController.js services/meService.js | soldier1 → 사용자 메뉴 › 내 정보 → 내 권한 목록 |
|  | GET | `/api/users/:userId/memberships` (#19) | routes/userRoutes.js controllers/userController.js services/userService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 소속 이력 |
|  | GET | `/api/users/:userId/chain-of-command` (#21) | routes/userRoutes.js controllers/userController.js services/userService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 상위 지휘 계통 |
|  | GET | `/api/me/join-requests` (#50) | routes/meRoutes.js controllers/joinRequestController.js services/joinRequestService.js | associate2 → 사용자 메뉴 › 내 정보 → 내 Crew 소속 신청 (Southside 대기) |
|  | GET | `/api/me/dashboard` (#198) | routes/statsRoutes.js controllers/opsController.js services/dashboardService.js | soldier1 → 업무 홈 → 진행할 업무·사용 중인 자원·평판 점수·처리할 일 |
| **FR-03**<br>구성원 역할·상태·소속 변경 | PATCH | `/api/users/:userId/role` (#17) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → associate2 → [구성원 관리] → 역할 변경(Soldier) → [역할 변경] |
|  | PATCH | `/api/users/:userId/status` (#18) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → pending1 → [구성원 관리] → 상태 변경(활동중) → [상태 변경] |
|  | GET | `/api/roles` (#22) | routes/referenceRoutes.js controllers/userController.js services/userService.js | Swagger(soldier1): GET /api/roles 실행 → 역할과 순위 목록 |
|  | POST | `/api/role-change-requests` (#51) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js | capo1 → 조직 › 구성원 → soldier2 → [구성원 관리] → 역할 변경 추천(Capo, 사유) → [추천] |
|  | GET | `/api/role-change-requests` (#52) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js | underboss1 → 조직 › 역할 변경 요청 → 상태 선택 → [조회] |
|  | GET | `/api/role-change-requests/:requestId` (#53) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js | Swagger(underboss1): GET /api/role-change-requests/{requestId} — requestId 1 → 요청 상세 |
|  | POST | `/api/role-change-requests/:requestId/approve` (#54) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js | underboss1 → 조직 › 역할 변경 요청 → associate1 추천 [승인] → associate1 역할이 Soldier로 바뀜 |
|  | POST | `/api/role-change-requests/:requestId/reject` (#55) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js | underboss1 → 조직 › 역할 변경 요청 → 거절 사유 입력 → [거절] |
| **FR-04**<br>구성원 상태 구분 관리 | PATCH | `/api/users/:userId/status` (#18) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → 상태 필터로 구분 → soldier4 → [구성원 관리] → 상태 변경(대기) → [상태 변경] → 허용되지 않는 변경이라 거부 |
|  | GET | `/api/member-statuses` (#23) | routes/referenceRoutes.js controllers/userController.js services/userService.js | Swagger(soldier1): GET /api/member-statuses 실행 → 상태와 바꿀 수 있는 상태 목록 |
| **FR-05**<br>Crew와 책임자·구성원 관리 | GET | `/api/users/:userId/subordinates` (#20) | routes/userRoutes.js controllers/userController.js services/userService.js | capo1 → 사용자 메뉴 › 내 기록·평판 → 지휘 하위 구성원 (Northside 소속원) |
|  | GET | `/api/users/:userId/chain-of-command` (#21) | routes/userRoutes.js controllers/userController.js services/userService.js | capo1 → 사용자 메뉴 › 내 기록·평판 → 상위 지휘 계통 (underboss1 → boss) |
|  | POST | `/api/crews` (#24) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → 조직 › Crew → [＋ Crew 생성] → 이름·지역 입력 → [생성] |
|  | GET | `/api/crews` (#25) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | soldier1 → 조직 › Crew → Crew 목록 (책임자·인원) |
|  | GET | `/api/crews/:crewId` (#26) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | soldier1 → 조직 › Crew → Northside 클릭 → Crew 정보 |
|  | PATCH | `/api/crews/:crewId` (#27) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | capo1 → 조직 › Crew → Northside → [Crew 관리] → 정보 수정 → [수정] |
|  | DELETE | `/api/crews/:crewId` (#28) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → #24로 만든 Crew → [Crew 관리] → [Crew 삭제] (Northside처럼 기록이 있으면 거부) |
|  | PATCH | `/api/crews/:crewId/status` (#29) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → #24로 만든 Crew → [Crew 관리] → 사유 입력 → [해산] |
|  | PUT | `/api/crews/:crewId/capo` (#30) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → 조직 › Crew → Northside → [Crew 관리] → [현재 책임자 해제] → 책임자 지정 아이디 capo1 → [지정] |
|  | DELETE | `/api/crews/:crewId/capo` (#31) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → 조직 › Crew → Northside → [Crew 관리] → [현재 책임자 해제] |
|  | PUT | `/api/crews/:crewId/underboss` (#32) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → 조직 › Crew → Harbor → [Crew 관리] → 담당 Underboss 지정 아이디 underboss1 → [지정] |
|  | GET | `/api/crews/:crewId/capo-history` (#33) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | capo1 → 조직 › Crew → Northside → 책임자 이력 |
|  | GET | `/api/crews/:crewId/hierarchy` (#34) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | soldier1 → 조직 › Crew → Northside → 조직도 |
|  | GET | `/api/crews/:crewId/members` (#35) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | soldier1 → 조직 › Crew → Northside → 현재 소속원 (정식·임시) |
|  | GET | `/api/crews/:crewId/members/:userId` (#36) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | Swagger(capo1): GET /api/crews/{crewId}/members/{userId} — crewId 1, userId 8 → soldier1의 소속 상세 |
| **FR-06**<br>관리 범위 안의 Crew 편성 변경 | PATCH | `/api/crews/:crewId/status` (#29) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | boss → #24로 만든 Crew에 구성원 편성 → [Crew 관리] → [해산] → 편성 이력에서 소속 종료 확인 |
|  | POST | `/api/crews/:crewId/members` (#37) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | capo1 → 조직 › Crew → Northside → 구성원 편성 아이디 associate2, 유형 임시 → [편성] |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | Swagger(capo1): POST /api/crews/{crewId}/members/bulk — crewId 1, 본문 {"members":[{"userId":13,"type":"TEMPORARY"}]} → 201 |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | capo1 → 조직 › Crew → Northside → soldier2 행 [임시로] → 다시 [정식으로] |
|  | DELETE | `/api/crews/:crewId/members/:userId` (#40) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | capo1 → 조직 › Crew → Northside → #37로 편성한 associate2 행 [제외] |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | boss → 조직 › Crew → Harbor → soldier4 행 이동할 Crew(Northside) 선택 → [이동] |
|  | GET | `/api/crews/:crewId/candidates` (#42) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | Swagger(capo1): GET /api/crews/{crewId}/candidates — crewId 1 → 편성할 수 있는 구성원 목록 |
|  | GET | `/api/crews/:crewId/membership-history` (#43) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | capo1 → 조직 › Crew → Northside → 편성 이력 |
|  | POST | `/api/crews/merge` (#44) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js | boss → #24로 만든 Crew → [Crew 관리] → 다른 Crew에 병합(대상 Harbor) → [병합] → 원 Crew 해산 |
|  | POST | `/api/crews/:crewId/join-requests` (#45) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js | associate2 → 조직 › Crew → Harbor → 유형 임시 → [이 Crew에 소속 신청] |
|  | GET | `/api/crews/:crewId/join-requests` (#46) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js | capo2 → 조직 › Crew → Southside → 소속 신청 › 들어온 신청 |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js | capo2 → 조직 › Crew → Southside → 들어온 신청(associate2) [승인] → 현재 소속원에 추가 |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/reject` (#48) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js | capo2 → 조직 › Crew → Southside → 들어온 신청 → 거절 사유 입력 → [거절] |
|  | DELETE | `/api/crews/:crewId/join-requests/:requestId` (#49) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js | associate2 → 사용자 메뉴 › 내 정보 → 내 Crew 소속 신청 → [신청 취소] |
|  | GET | `/api/me/join-requests` (#50) | routes/meRoutes.js controllers/joinRequestController.js services/joinRequestService.js | associate2 → 사용자 메뉴 › 내 정보 → 내 Crew 소속 신청 (Southside 대기) |
| **FR-07**<br>업무 등록과 일정·중요도·상태 관리 | POST | `/api/task-types` (#56) | routes/taskTypeRoutes.js controllers/taskController.js services/taskTypeService.js | Swagger(boss): POST /api/task-types 예시 본문 그대로 실행 → 201 |
|  | GET | `/api/task-types` (#57) | routes/taskTypeRoutes.js controllers/taskController.js services/taskTypeService.js | Swagger(capo1): GET /api/task-types 실행 (업무 등록 양식의 '유형' 목록과 같음) |
|  | PATCH | `/api/task-types/:typeId` (#58) | routes/taskTypeRoutes.js controllers/taskController.js services/taskTypeService.js | Swagger(boss): PATCH /api/task-types/{typeId} — typeId 1, 예시 본문 → 200 |
|  | DELETE | `/api/task-types/:typeId` (#59) | routes/taskTypeRoutes.js controllers/taskController.js services/taskTypeService.js | Swagger(boss): #56으로 만든 유형을 DELETE /api/task-types/{typeId} → 200 (업무가 쓰는 유형 1은 409) |
|  | POST | `/api/tasks` (#60) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 업무 › 업무 관리 → [＋ 업무 등록] → 제목·시작·종료 입력 → [등록] → 업무 화면(계획) |
|  | GET | `/api/tasks` (#61) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 업무 › 업무 관리 → 업무 목록 (Northside 업무만) |
|  | GET | `/api/tasks/:taskId` (#62) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 업무 › 업무 관리 → 강북 정기 순찰 클릭 → 업무 정보 |
|  | PATCH | `/api/tasks/:taskId` (#63) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 업무 관리 → 강북 정기 순찰 → 업무 관리 › 정보 수정 → [수정] |
|  | DELETE | `/api/tasks/:taskId` (#64) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → #60으로 등록한 업무 → 업무 관리 › 삭제 → [업무 삭제] |
|  | PATCH | `/api/tasks/:taskId/schedule` (#65) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 업무 관리 › 일정 변경(다음 날 13:00~15:00) → [일정 변경] |
|  | POST | `/api/tasks/:taskId/duplicate` (#67) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 업무 관리 › 업무 복제(새 시작·종료) → [복제] |
|  | PUT | `/api/tasks/:taskId/requirements` (#69) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 업무 관리 › 필요 인원·자원 → [설정] |
|  | GET | `/api/tasks/:taskId/requirements` (#70) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 자원의 '필요 자원' (차량 1, 통신 장비 1) |
|  | POST | `/api/tasks/:taskId/checklist` (#75) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → 강북 정기 순찰 → 체크리스트 새 항목 입력 → [추가] |
|  | PATCH | `/api/tasks/:taskId/checklist/:itemId` (#77) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | Swagger(capo1): PATCH /api/tasks/{taskId}/checklist/{itemId} — taskId 1, itemId 1, 예시 본문 → 200 |
|  | DELETE | `/api/tasks/:taskId/checklist/:itemId` (#79) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → 강북 정기 순찰 → 체크리스트 항목 → [삭제] |
|  | POST | `/api/tasks/:taskId/dependencies` (#80) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → 강북 정기 순찰 → 선행 업무 번호 2 입력 → [지정] |
|  | GET | `/api/tasks/:taskId/dependencies` (#81) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo3 → 업무 › 업무 관리 → 항만 물품 확인 → 선행 업무 (물품 운송) |
|  | DELETE | `/api/tasks/:taskId/dependencies/:dependsOnId` (#82) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → #80 실행 후 강북 정기 순찰 → 선행 업무 → [해제] |
|  | GET | `/api/tasks/:taskId/readiness` (#92) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 시작 준비 상태 |
| **FR-08**<br>한 업무에 여러 구성원 참여 | POST | `/api/tasks/:taskId/assignees` (#83) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → 참여자 아이디 'associate1, capo1' → [배정] → 두 명이 한 번에 배정됨 |
|  | GET | `/api/tasks/:taskId/assignees` (#84) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 참여자 (업무 내 역할·응답) |
|  | PATCH | `/api/tasks/:taskId/assignees/:userId` (#85) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → 참여자 soldier2 행 [리더로] |
|  | DELETE | `/api/tasks/:taskId/assignees/:userId` (#86) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → 참여자 soldier2 행 [해제] |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → soldier2 행 교체할 아이디 associate1 → [교체] |
|  | GET | `/api/tasks/:taskId/assignment-history` (#90) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → 이력 › 배정 이력 |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | routes/assignmentRoutes.js controllers/taskController.js services/swapService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 교대 요청 받을 사람 soldier4 → [교대 요청] |
|  | GET | `/api/swap-requests` (#98) | routes/swapRoutes.js controllers/taskController.js services/swapService.js | capo1 → 업무 › 내 업무 → 업무 교대 요청 목록 |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | routes/swapRoutes.js controllers/taskController.js services/swapService.js | capo1 → 업무 › 내 업무 → 업무 교대 요청(soldier2 → associate1) [승인] → associate1이 배정됨 |
|  | POST | `/api/swap-requests/:requestId/reject` (#100) | routes/swapRoutes.js controllers/taskController.js services/swapService.js | associate1 → 업무 › 내 업무 → 업무 교대 요청 → [거절] |
|  | DELETE | `/api/swap-requests/:requestId` (#101) | routes/swapRoutes.js controllers/taskController.js services/swapService.js | soldier2 → 업무 › 내 업무 → 업무 교대 요청 → [요청 취소] |
| **FR-09**<br>내게 배정된 업무와 확인할 정보 조회 | POST | `/api/tasks/:taskId/notes` (#71) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → 강북 정기 순찰 → 지시사항 내용·받는 사람(soldier2) → [남기기] |
|  | GET | `/api/tasks/:taskId/notes` (#72) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | soldier2 → 업무 › 내 업무 → 강북 정기 순찰 → 지시사항 (전체 대상과 자신에게 온 것만 보임) |
|  | PATCH | `/api/tasks/:taskId/notes/:noteId` (#73) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | Swagger(capo1): PATCH /api/tasks/{taskId}/notes/{noteId} — taskId 1, noteId 1, 예시 본문 → 200 |
|  | DELETE | `/api/tasks/:taskId/notes/:noteId` (#74) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | capo1 → 강북 정기 순찰 → 지시사항 → [삭제] |
|  | GET | `/api/tasks/:taskId/checklist` (#76) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 체크리스트 |
|  | PATCH | `/api/tasks/:taskId/assignees/:userId/response` (#88) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | soldier2 → 업무 › 내 업무 → 강북 정기 순찰 → 참여자의 본인 행 [수락] 또는 [거절] |
|  | GET | `/api/me/tasks` (#94) | routes/meRoutes.js controllers/taskController.js services/assignmentService.js | soldier1 → 업무 › 내 업무 → 내게 배정된 업무 |
|  | GET | `/api/me/tasks/:taskId` (#95) | routes/meRoutes.js controllers/taskController.js services/assignmentService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 클릭 → 나에게 온 지시사항·참여자·자원 |
|  | GET | `/api/me/schedule` (#96) | routes/meRoutes.js controllers/taskController.js services/assignmentService.js | soldier1 → 업무 › 내 업무 → 앞으로 2주 일정 (업무·자원 배정) |
|  | GET | `/api/me/dashboard` (#198) | routes/statsRoutes.js controllers/opsController.js services/dashboardService.js | soldier1 → 업무 홈 → 다가오는 일정·처리할 일 |
| **FR-10**<br>업무 진행 상태 변경과 변경 이력 | PATCH | `/api/tasks/:taskId/status` (#66) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → [업무 시작] → 진행 중이면 [보류]·[다시 진행] |
|  | GET | `/api/task-statuses` (#68) | routes/referenceRoutes.js controllers/taskController.js services/taskService.js | Swagger(soldier1): GET /api/task-statuses 실행 → 상태와 바꿀 수 있는 상태 목록 |
|  | GET | `/api/tasks/:taskId/checklist` (#76) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | soldier2 → 업무 › 내 업무 → 물품 운송 → 체크리스트 완료 현황 (완료 1 / 2) |
|  | POST | `/api/tasks/:taskId/checklist/:itemId/check` (#78) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js | soldier2 → 업무 › 내 업무 → 물품 운송 → 체크리스트 '도착 보고' [완료] |
|  | GET | `/api/tasks/:taskId/assignment-history` (#90) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js | capo1 → 강북 정기 순찰 → 이력 › 배정 이력 (배정·해제·교체 기록) |
|  | POST | `/api/tasks/:taskId/cancel` (#93) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → #60으로 등록한 업무 → 업무 관리 › 업무 취소 사유 → [취소] |
|  | POST | `/api/tasks/:taskId/complete` (#102) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo1 → 업무 관리 → 물품 운송 → [완료 처리] → 성과·결과 요약 입력 → [완료 처리] → 상태 완료 |
|  | POST | `/api/tasks/:taskId/progress` (#107) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | soldier2 → 업무 › 내 업무 → 물품 운송 → 진행 보고 진척률·메모 → [보고] |
|  | GET | `/api/tasks/:taskId/progress` (#108) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | soldier2 → 업무 › 내 업무 → 물품 운송 → 진행 보고 목록 |
|  | GET | `/api/tasks/:taskId/status-history` (#109) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → #66 실행 후 강북 정기 순찰 → 이력 › 상태 변경 이력 (처리자·시각) |
| **FR-11**<br>완료 업무의 결과·참여 기록 활용 | POST | `/api/tasks/:taskId/complete` (#102) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo1 → 업무 관리 → 물품 운송 → [완료 처리] → 완료와 결과에 성과·요약·참여 기록이 남음 |
|  | GET | `/api/tasks/:taskId/result` (#103) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo2 → 업무 › 업무 관리 → 강남 정보 수집 → 완료와 결과 (성과·결과 요약) |
|  | PATCH | `/api/tasks/:taskId/result` (#104) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | boss → 업무 관리 → 강남 정보 수집 → 결과 정정 사유 입력 → [결과 정정] → 정정 이력에 변경 전후 |
|  | PUT | `/api/tasks/:taskId/participations/:userId` (#105) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo1 → 업무 관리 → 물품 운송 → 완료와 결과 › 참여 기록 남기기 → [기록] |
|  | GET | `/api/tasks/:taskId/participations` (#106) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo2 → 업무 관리 → 강남 정보 수집 → 참여 기록 (soldier3·soldier1) |
|  | GET | `/api/tasks/:taskId/evaluations` (#159) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | capo2 → 업무 관리 → 강남 정보 수집 → 참여자 평가 (작성된 평가) |
| **FR-12**<br>기간·Crew·상태·담당자로 업무 탐색 | GET | `/api/tasks` (#61) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | boss → 업무 › 업무 관리 → 상태·중요도·Crew 선택 → [조회]. 기간·담당자는 Swagger(boss): GET /api/tasks?from=…&to=…&assigneeId=8 |
|  | GET | `/api/crews/:crewId/workload` (#197) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | capo1 → 조직 › Crew → Northside → 소속원별 업무량 (구성원별 배정 업무 수·시간) |
| **FR-13**<br>공용 자원 등록과 상태 관리 | POST | `/api/resource-categories` (#110) | routes/resourceCategoryRoutes.js controllers/resourceController.js services/resourceCategoryService.js | underboss1 → 자원 › 공용 자원 → 자원 분류 이름 입력 → [분류 등록] |
|  | GET | `/api/resource-categories` (#111) | routes/resourceCategoryRoutes.js controllers/resourceController.js services/resourceCategoryService.js | soldier1 → 자원 › 공용 자원 → 자원 분류 (분류별 자원 수) |
|  | PATCH | `/api/resource-categories/:categoryId` (#112) | routes/resourceCategoryRoutes.js controllers/resourceController.js services/resourceCategoryService.js | Swagger(underboss1): PATCH /api/resource-categories/{categoryId} — categoryId 1, 예시 본문 → 200 |
|  | DELETE | `/api/resource-categories/:categoryId` (#113) | routes/resourceCategoryRoutes.js controllers/resourceController.js services/resourceCategoryService.js | underboss1 → 자원 › 공용 자원 → 자원 분류 → #110으로 만든 분류 [삭제] |
|  | POST | `/api/resources` (#114) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | underboss1 → 자원 › 공용 자원 → [＋ 자원 등록] → 관리 번호·이름·분류 입력 → [등록] |
|  | POST | `/api/resources/bulk` (#115) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | Swagger(underboss1): POST /api/resources/bulk 예시 본문 그대로 실행 → 201 |
|  | GET | `/api/resources` (#116) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 전체 자원 (상태·현재 사용자) |
|  | GET | `/api/resources/:resourceId` (#118) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | soldier1 → 자원 › 공용 자원 → 승합차 1호 클릭 → 현재 상태·현재 사용자 |
|  | PATCH | `/api/resources/:resourceId` (#119) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | underboss1 → 자원 › 공용 자원 → 승합차 1호 → [자원 관리] → 정보 수정 → [수정] |
|  | DELETE | `/api/resources/:resourceId` (#120) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | underboss1 → #114로 등록한 자원 → [자원 관리] → [자원 삭제] (사용 이력이 있으면 거부) |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 무전기 1호 → [자원 관리] → 상태 변경(점검중)·사유 → [변경] |
| **FR-14**<br>권한·상태에 따른 이용 가능 자원 확인 | GET | `/api/resources/available` (#117) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | soldier1과 capo1 → 자원 › 공용 자원 → 이용 가능한 자원 비교 (soldier1에게는 세단 1호·방탄 조끼 세트가 없음) |
|  | PATCH | `/api/resources/:resourceId/access-level` (#122) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | underboss1 → 자원 › 공용 자원 → 승합차 1호 → [자원 관리] → 이용 최소 역할(Capo) → [변경] → soldier1의 이용 가능한 자원에서 빠짐 |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 강북 정기 순찰 → 자원 › 할당할 수 있는 자원 (필요 자원 분류 중 지금 쓸 수 있는 것만) |
|  | GET | `/api/users/:userId/allocations` (#138) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js | soldier1 → 자원 › 내 자원 → 나에게 배정된 자원 (무전기 2호) |
|  | POST | `/api/resource-requests` (#141) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | soldier1 → 자원 › 내 자원 → 자원 사용 신청 VH-003(세단 1호) → [신청] → Capo 이상만 이용 가능해 거부 |
| **FR-15**<br>자원 사용·반환·상태 변경 이력 | GET | `/api/resources/:resourceId/status-history` (#124) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 무전기 3호 → 상태 변경 이력 (사용가능 → 사용불가) |
|  | GET | `/api/resources/:resourceId/maintenances` (#126) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo3 → 자원 › 공용 자원 → 화물 트럭 → 점검 이력 (등록·완료 기록) |
|  | GET | `/api/resources/:resourceId/schedule` (#136) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | soldier1 → 자원 › 공용 자원 → 승합차 2호 → 예약 일정 (앞으로 2주) |
|  | POST | `/api/resources/:resourceId/checkout` (#147) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | soldier1 → 자원 › 내 자원 → 나에게 배정된 자원(무전기 2호) → [사용 시작] |
|  | POST | `/api/resources/:resourceId/return` (#148) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | soldier1 → #147 실행 후 내 자원 → 지금 사용 중인 자원 반환 상태(정상) → [반환] → 사용가능 |
|  | POST | `/api/tasks/:taskId/resources/return` (#149) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 업무 관리 → 물품 운송 → 자원 → [사용 중인 업무 자원 모두 반환] |
|  | GET | `/api/resources/:resourceId/usages` (#150) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | capo1 → 자원 › 공용 자원 → 무전기 2호 → 사용·반환 이력 |
|  | PATCH | `/api/resource-usages/:usageId` (#151) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | capo1 → 자원 › 공용 자원 → 승합차 1호(사용 중) → 반환 예정 연장 → [연장] |
|  | POST | `/api/resource-usages/:usageId/handover` (#152) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | soldier2 → 자원 › 공용 자원 → 승합차 1호 → 인계 받는 사람 associate1 → [인계] |
|  | GET | `/api/resource-usages/overdue` (#154) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | capo1 → 자원 › 공용 자원 → 미반환 자원 (방탄 조끼 세트) |
|  | GET | `/api/stats/resources/usage-ranking` (#192) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 자원 사용 순위 (사용 횟수·시간) |
|  | GET | `/api/stats/alerts` (#196) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 업무 홈의 운영 경고 → 반환 지연 (방탄 조끼 세트) |
| **FR-16**<br>점검·사용불가 자원 구분 관리 | GET | `/api/resources` (#116) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 전체 자원 구분(점검중·사용불가) → [조회] → 화물 트럭·무전기 3호 (흐리게 표시) |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 무전기 1호 상태를 점검중으로 [변경] → 전체 자원에서 흐리게 표시, 영향받는 예약 안내 |
|  | GET | `/api/resource-statuses` (#123) | routes/referenceRoutes.js controllers/resourceController.js services/resourceService.js | Swagger(soldier1): GET /api/resource-statuses 실행 → 점검중·사용불가는 assignable false |
|  | POST | `/api/resources/:resourceId/maintenances` (#125) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo1 → 자원 › 공용 자원 → 세단 1호 → 점검 사유·예정 완료 입력 → [점검 등록] → 점검중 |
|  | GET | `/api/resources/:resourceId/maintenances` (#126) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo3 → 자원 › 공용 자원 → 화물 트럭 → 점검 이력 |
|  | PATCH | `/api/resources/:resourceId/maintenances/:maintenanceId` (#127) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | Swagger(capo3): PATCH /api/resources/{resourceId}/maintenances/{maintenanceId} — resourceId 4, maintenanceId 1, 예시 본문 → 200 |
|  | POST | `/api/resources/:resourceId/maintenances/:maintenanceId/complete` (#128) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo3 → 자원 › 공용 자원 → 화물 트럭 → 점검 결과(정상 복구) → [점검 완료] → 사용가능 |
|  | GET | `/api/maintenances` (#129) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo1 → 자원 › 공용 자원 → 진행 중인 점검 (화물 트럭) |
|  | POST | `/api/resources/:resourceId/return` (#148) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | soldier1 → 내 자원 → 무전기 2호 [사용 시작] → 반환 상태(손상) → [반환] → 점검이 등록되어 점검중 |
|  | POST | `/api/resource-usages/:usageId/damage-reports` (#153) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | soldier2 → 자원 › 공용 자원 → 승합차 1호 → 고장 신고 내용 입력 → [신고] → 점검중 |
|  | GET | `/api/stats/resources` (#191) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 자원 상태와 가동률 (점검중·사용불가 수) |
|  | GET | `/api/stats/alerts` (#196) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 운영 경고 › 장기 점검 |
| **FR-17**<br>업무·구성원에게 자원 배정 | PUT | `/api/tasks/:taskId/requirements` (#69) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 업무 관리 › 필요 인원·자원 → 분류별 수량 → [설정] → 자원의 '필요 자원'에 반영 |
|  | GET | `/api/tasks/:taskId/requirements` (#70) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 자원의 '필요 자원' 충족 표시 (차량 1/1, 통신 장비 1/1) |
|  | GET | `/api/tasks/:taskId/readiness` (#92) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | capo1 → 강북 정기 순찰 → 시작 준비 상태 (필요 인원·할당 자원 수) |
|  | POST | `/api/tasks/:taskId/resources` (#130) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 업무 관리 → 강북 정기 순찰 → 자원 할당 관리 번호 VH-003 → [자원 할당] |
|  | GET | `/api/tasks/:taskId/resources` (#131) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 자원 (승합차 2호·무전기 1호) |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 강북 정기 순찰 → 자원 승합차 2호 행 시간(다음 날 10:00~11:00) → [시간 조정] |
|  | DELETE | `/api/tasks/:taskId/resources/:resourceId` (#133) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 강북 정기 순찰 → 자원 행 [해제] |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js | capo1 → 강북 정기 순찰 → 자원 › 할당할 수 있는 자원 목록 |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js | capo1 → 자원 › 공용 자원 → 승합차 2호 → 구성원에게 배정 soldier1, 다음 날 12:00~13:00 → [배정] |
|  | GET | `/api/users/:userId/allocations` (#138) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js | capo1이 #137 실행 후 soldier1 → 자원 › 내 자원 → 나에게 배정된 자원에 승합차 2호 추가 |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js | Swagger(capo1): PATCH /api/resource-allocations/{allocationId} — allocationId 1, 본문 {"endAt": 2일 뒤 08:00} → 200 |
|  | DELETE | `/api/resource-allocations/:allocationId` (#140) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js | capo1 → #137 실행 후 승합차 2호 → 예약 일정의 구성원 배정 행 [배정 취소] |
|  | POST | `/api/resource-requests` (#141) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | soldier1 → 자원 › 내 자원 → 자원 사용 신청 RD-001, 2일 뒤 13:00~14:00, 사유 → [신청] |
|  | GET | `/api/resource-requests` (#142) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | soldier3 → 자원 › 내 자원 → 내 신청 (capo2는 처리할 사용 신청에서 확인) |
|  | GET | `/api/resource-requests/:requestId` (#143) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | Swagger(soldier3): GET /api/resource-requests/{requestId} — requestId 1 → 신청 상세 |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | capo2 → 자원 › 내 자원 → 처리할 사용 신청(soldier3, 무전기 2호) [승인] → soldier3에게 배정됨 |
|  | POST | `/api/resource-requests/:requestId/reject` (#145) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | capo2 → 자원 › 내 자원 → 처리할 사용 신청 → 거절 사유 입력 → [거절] |
|  | DELETE | `/api/resource-requests/:requestId` (#146) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js | soldier3 → 자원 › 내 자원 → 내 신청 → [취소] |
| **FR-18**<br>평가·평판 기록 | POST | `/api/tasks/:taskId/evaluations` (#158) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | capo2 → 평가·기록 › 평가 → 작성해야 할 평가 → 강남 정보 수집 [평가하기] → 참여자 평가 soldier1 점수 입력 → [평가] |
|  | GET | `/api/evaluations/pending` (#161) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | capo2 → 평가·기록 › 평가 → 작성해야 할 평가 (강남 정보 수집 soldier1) |
|  | PATCH | `/api/evaluations/:evaluationId` (#163) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | capo2 → 업무 관리 → 강남 정보 수집 → 참여자 평가의 soldier3 평가 클릭 → 평가 수정 → [수정] |
|  | DELETE | `/api/evaluations/:evaluationId` (#164) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 평가 검색 → 평가 클릭 → 철회 사유 입력 → [철회] (기록은 남고 '철회' 표시) |
|  | GET | `/api/evaluation-criteria` (#166) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | soldier1 → 평가·기록 › 평가 → 평가 항목 |
|  | PUT | `/api/evaluation-criteria` (#167) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 평가 항목 › 항목 설정 → [항목 저장] |
|  | POST | `/api/evaluations/:evaluationId/appeals` (#168) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | soldier3 → 사용자 메뉴 › 내 기록·평판 → 받은 평가 클릭 → 이의 제기 사유 입력 → [이의 제기] |
|  | POST | `/api/evaluation-appeals/:appealId/resolve` (#170) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 처리할 이의 제기(soldier1) → 평가 정정·점수 입력 → [처리] |
|  | GET | `/api/users/:userId/reputation` (#171) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 평판 (점수·항목별 평균) |
|  | POST | `/api/users/:userId/reputation-events` (#172) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | underboss1 → 조직 › 구성원 → soldier2 → 공로·징계 종류·점수·제목 입력 → [기록] → 평판 점수 바뀜 |
|  | DELETE | `/api/reputation-events/:eventId` (#174) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | underboss1 → 조직 › 구성원 → soldier3 → 공로·징계 → 취소 사유 입력 → [취소] |
|  | GET | `/api/stats/evaluations` (#193) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 평가 평균 추이 |
| **FR-19**<br>권한 범위 안의 활동·평가 이력 조회 | GET | `/api/users/:userId` (#14) | routes/userRoutes.js controllers/userController.js services/userService.js | soldier1 → 조직 › 구성원 → soldier3 클릭 → 연락처·평판·이력 영역이 막혀 있음 (boss로 보면 모두 보임) |
|  | GET | `/api/users/:userId/memberships` (#19) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → soldier1 → 소속 이력 |
|  | GET | `/api/users/:userId/change-history` (#155) | routes/historyRoutes.js controllers/recordController.js services/historyService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 변경 이력 |
|  | GET | `/api/users/:userId/activity` (#156) | routes/historyRoutes.js controllers/recordController.js services/historyService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 활동 (업무 참여·자원 사용·받은 평가) |
|  | GET | `/api/crews/:crewId/activity` (#157) | routes/historyRoutes.js controllers/recordController.js services/historyService.js | capo1 → 조직 › Crew → Northside → Crew 활동 |
|  | GET | `/api/tasks/:taskId/evaluations` (#159) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | capo2 → 업무 관리 → 강남 정보 수집 → 참여자 평가 (작성된 평가) |
|  | GET | `/api/evaluations` (#160) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 평가 검색 → [검색] |
|  | GET | `/api/evaluations/:evaluationId` (#162) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 받은 평가 클릭 → 평가 상세 |
|  | GET | `/api/users/:userId/evaluations` (#165) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | soldier1 → 사용자 메뉴 › 내 기록·평판 → 받은 평가 |
|  | GET | `/api/evaluation-appeals` (#169) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | soldier1 → 평가·기록 › 평가 → 내가 낸 이의 제기 (대기) |
|  | GET | `/api/users/:userId/reputation` (#171) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | boss → 조직 › 구성원 → soldier1 → 평판 (soldier3 화면은 soldier1에게 막혀 있음) |
|  | GET | `/api/users/:userId/reputation-events` (#173) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | boss → 조직 › 구성원 → soldier3 → 공로·징계 목록 |
| **FR-20**<br>중요 상태 변경·관리 활동 기록 | GET | `/api/audit-logs` (#176) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js | boss → 평가·기록 › 감사 기록 → 행위·기간 선택 → [검색] |
|  | GET | `/api/audit-logs/:logId` (#177) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js | boss → 평가·기록 › 감사 기록 → 시각 클릭 → 변경 전·변경 후 |
|  | GET | `/api/audit-logs/export` (#178) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js | admin → 평가·기록 › 감사 기록 → [검색 결과 CSV 내려받기] |
|  | GET | `/api/stats/admin-activity` (#195) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 관리 활동 (기간별 관리 활동 건수) |
|  | - | 모든 상태 변경 API | services/auditService.js models/mongo/ActivityLog.js models/mongo/LoginHistory.js models/mongo/SecurityEvent.js | boss → 구성원 역할 변경 후 평가·기록 › 감사 기록 → 행위(역할 변경) → [검색] → 변경 전·후 |
| **FR-21**<br>권한 범위 안의 검색·조건 조회 | GET | `/api/users` (#12) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → 검색 'Luca' → [조회] (soldier1로 보면 다른 구성원 연락처는 비공개) |
|  | GET | `/api/crews` (#25) | routes/crewRoutes.js controllers/crewController.js services/crewService.js | soldier1 → 조직 › Crew → 지역 '서울 강북' 입력 → [조회] |
|  | GET | `/api/resources` (#116) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 전체 자원 검색 '강북' → [조회] |
|  | GET | `/api/evaluations` (#160) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 평가 검색 대상자 ID 8 → [검색] |
|  | GET | `/api/search` (#180) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | boss와 soldier1 → 위쪽 검색창에 '강북' 입력 → 권한에 따라 다른 결과 (associate1은 구성원·자원이 막힘) |
|  | POST | `/api/saved-searches` (#181) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 위쪽 검색창 '강북' 검색 → 이름 입력 → [검색 조건 저장] |
|  | GET | `/api/saved-searches` (#182) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 분석 › 통합 검색 → 저장한 검색 |
|  | GET | `/api/saved-searches/:searchId/results` (#183) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 분석 › 통합 검색 → 저장한 검색 이름 클릭 → 그 조건으로 다시 검색 |
|  | DELETE | `/api/saved-searches/:searchId` (#184) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 분석 › 통합 검색 → 저장한 검색 → [삭제] |
| **FR-22**<br>운영 현황 확인 | GET | `/api/crews/:crewId/activity` (#157) | routes/historyRoutes.js controllers/recordController.js services/historyService.js | boss → 조직 › Crew → Northside → Crew 활동 (Crew·업무 활동 최근 30건) |
|  | GET | `/api/reputation/rankings` (#175) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js | boss → 평가·기록 › 평가 → 평판 순위 |
|  | GET | `/api/stats/overview` (#185) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 위쪽 요약 지표 |
|  | GET | `/api/stats/members` (#186) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 구성원 분포 |
|  | GET | `/api/stats/crews` (#187) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → Crew 비교 |
|  | GET | `/api/stats/regions` (#188) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 지역별 |
|  | GET | `/api/stats/tasks` (#189) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 기간(최근 30일) → [적용] → 업무 상태 추이 |
|  | GET | `/api/stats/tasks/lead-time` (#190) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 중요도별 소요 시간 |
|  | GET | `/api/stats/resources` (#191) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 자원 상태와 가동률 |
|  | GET | `/api/stats/resources/usage-ranking` (#192) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 자원 사용 순위 |
|  | GET | `/api/stats/evaluations` (#193) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 평가 평균 추이 |
|  | GET | `/api/stats/membership-changes` (#194) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 소속 변화 (가입·이동·탈퇴) |
|  | GET | `/api/stats/admin-activity` (#195) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 관리 활동 |
|  | GET | `/api/stats/alerts` (#196) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | boss → 분석 › 운영 현황 → 운영 경고 (반환 연체·지연 업무·장기 점검), 업무 홈에도 표시 |
|  | GET | `/api/crews/:crewId/workload` (#197) | routes/statsRoutes.js controllers/opsController.js services/statsService.js | capo1 → 조직 › Crew → Northside → 소속원별 업무량 (앞으로 2주) |
| **FR-23**<br>계정·권한 관리 | GET | `/api/audit-logs` (#176) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js | admin → 평가·기록 › 감사 기록 → 행위(계정 잠금 등) 선택 → [검색] |
|  | GET | `/api/admin/accounts` (#199) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 › 시스템 관리 → 계정 보안 현황 |
|  | PUT | `/api/admin/accounts/:userId/lock` (#200) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 계정 보안 현황 soldier2 잠금 사유 입력 → [잠금] → soldier2 로그인 거부 ('잠긴 계정') |
|  | DELETE | `/api/admin/accounts/:userId/lock` (#201) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 계정 보안 현황 soldier2 → [잠금 해제] |
|  | POST | `/api/admin/accounts/:userId/password-reset` (#202) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 계정 보안 현황 soldier4 → [임시 비밀번호] → 화면 위에 임시 비밀번호 표시 |
|  | DELETE | `/api/admin/accounts/:userId/sessions` (#203) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | soldier1 로그인 상태에서 admin → 계정 보안 현황 soldier1 → [강제 로그아웃] → soldier1 화면 새로고침 시 로그인 화면 |
|  | GET | `/api/admin/login-history` (#204) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 최근 로그인 이력 → '실패만 보기' |
|  | GET | `/api/admin/permissions` (#205) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 역할별 권한 → 역할 버튼(Soldier 등) 선택 |
|  | PUT | `/api/admin/permissions/:role` (#206) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 역할별 권한 → [Soldier] → resource.read 체크 해제 → [Soldier 권한 저장] → soldier1 메뉴에서 공용 자원이 사라짐 (다시 체크해 되돌림) |
|  | GET | `/api/admin/settings` (#207) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 운영 설정 |
|  | PUT | `/api/admin/settings` (#208) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 운영 설정 값 변경 → [설정 저장] |
|  | GET | `/api/admin/health` (#210) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 › 시스템 관리 → DB 연결 상태 (업무 홈의 시스템 상태에도 표시) |

## 2. 업무 규칙 (BR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **BR-01**<br>정식 소속은 한 Crew만 | PUT | `/api/crews/:crewId/capo` (#30) | routes/crewRoutes.js controllers/crewController.js services/crewService.js services/enrollment.js | boss → 조직 › Crew → Southside → [Crew 관리] → 책임자 지정 아이디 capo1 → [지정] → 규정 BR-01 (Northside 정식 소속) |
|  | POST | `/api/crews/:crewId/members` (#37) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/enrollment.js | boss → 조직 › Crew → Northside → 구성원 편성 아이디 soldier3, 유형 정식 → [편성] → 규정 BR-01 |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/enrollment.js | Swagger(boss): crewId 1, 본문 {"members":[{"userId":10,"type":"REGULAR"}]} → 409 BULK_REJECTED (행 오류 BR-01) |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/enrollment.js | boss → 조직 › Crew → Southside → soldier1(임시) 행 [정식으로] → 규정 BR-01 (Northside 정식 소속) |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/enrollment.js | Swagger(boss): POST /api/crews/2/members/8/transfer 본문 {"targetCrewId":3,"type":"REGULAR"} → 409 BR-01 |
|  | GET | `/api/crews/:crewId/candidates` (#42) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js models/sql/userModel.js | Swagger(capo1): GET /api/crews/1/candidates?type=REGULAR → 다른 Crew 정식 소속자(soldier3 등)는 목록에 없음 |
|  | POST | `/api/crews/merge` (#44) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/enrollment.js | boss → #44 병합 실행 → admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 '둘 이상의 Crew에 정식 소속된 구성원' 0건 |
|  | POST | `/api/crews/:crewId/join-requests` (#45) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js services/enrollment.js | soldier3 → 조직 › Crew → Northside → 유형 정식 → [이 Crew에 소속 신청] → 규정 BR-01 |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js services/enrollment.js | boss → Crew › Northside → associate2 정식 [편성] → capo2 → Crew › Southside → 들어온 신청 [승인] → 규정 BR-01 |
|  | GET | `/api/admin/integrity-check` (#209) | routes/adminRoutes.js controllers/opsController.js services/adminService.js models/sql/integrityModel.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 → '둘 이상의 Crew에 정식 소속된 구성원' 0건 |
|  | - | 공통 (편성 모듈·DB 제약) | services/enrollment.js models/sql/membershipModel.js models/sql/schema.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 '둘 이상의 Crew에 정식 소속된 구성원' 0건 |
| **BR-02**<br>정지·탈퇴 구성원은 새 업무 배정 불가 | POST | `/api/tasks/:taskId/assignees` (#83) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js services/assignmentRules.js | capo1 → 강북 정기 순찰 → 참여자 아이디 suspended1 → [배정] → 규정 BR-02 |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js services/assignmentRules.js | capo1 → 강북 정기 순찰 → soldier2 행 교체할 아이디 suspended1 → [교체] → 규정 BR-02 |
|  | GET | `/api/tasks/:taskId/assignee-candidates` (#89) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js models/sql/userModel.js | Swagger(capo1): GET /api/tasks/{taskId}/assignee-candidates — taskId 1 → 정지 상태인 suspended1은 목록에 없음 |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | routes/assignmentRoutes.js controllers/taskController.js services/swapService.js services/assignmentRules.js | soldier1 → 업무 › 내 업무 → 강북 정기 순찰 → 교대 요청 받을 사람 suspended1 → [교대 요청] → 규정 BR-02 |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | routes/swapRoutes.js controllers/taskController.js services/swapService.js services/assignmentRules.js | boss → 조직 › 구성원 → associate1 상태 변경(정지) → capo1 → 업무 › 내 업무 → 업무 교대 요청 [승인] → 규정 BR-02 |
|  | - | 공통 (배정 규칙) | services/assignmentRules.js | suspended1을 배정(#83)·교체(#87)·교대 요청(#97)에 넣으면 모두 규정 BR-02로 거부 |
| **BR-03**<br>같은 시간대 업무 중복 배정 불가 | PATCH | `/api/tasks/:taskId/schedule` (#65) | routes/taskRoutes.js controllers/taskController.js services/taskService.js models/sql/taskAssigneeModel.js | capo1 → 강북 정기 순찰 → 일정 변경(지금부터 2시간) → [일정 변경] → 규정 BR-03 (soldier2의 물품 운송과 겹침) |
|  | POST | `/api/tasks/:taskId/assignees` (#83) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js services/assignmentRules.js | capo1 → [＋ 업무 등록] 지금부터 1시간 → 그 업무에 soldier2 [배정] → 규정 BR-03 (물품 운송과 겹침) |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js services/assignmentRules.js | capo1 → 지금부터 1시간짜리 업무 등록 후 soldier1 [배정] → soldier1 행 교체할 아이디 soldier2 → [교체] → 규정 BR-03 |
|  | GET | `/api/tasks/:taskId/assignee-candidates` (#89) | routes/assignmentRoutes.js controllers/taskController.js services/assignmentService.js models/sql/userModel.js | Swagger(capo1): 지금부터 1시간짜리 업무(#60) ID로 GET /api/tasks/{taskId}/assignee-candidates → 물품 운송 중인 soldier2·associate1은 목록에 없음 |
|  | GET | `/api/users/:userId/availability` (#91) | routes/userRoutes.js controllers/taskController.js services/assignmentService.js models/sql/taskAssigneeModel.js | Swagger(capo1): GET /api/users/{userId}/availability — userId 9, from 지금, to 1시간 뒤 → available false (물품 운송과 겹침) |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | routes/assignmentRoutes.js controllers/taskController.js services/swapService.js services/assignmentRules.js | capo1 → 다음 날 10:00~12:00 업무 등록 후 associate1 [배정] → soldier1 → 강북 정기 순찰 교대 요청 받을 사람 associate1 → 규정 BR-03 |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | routes/swapRoutes.js controllers/taskController.js services/swapService.js services/assignmentRules.js | capo1 → 다음 날 10:00~12:00 업무 등록 후 associate1 [배정] → 업무 › 내 업무 → 업무 교대 요청 [승인] → 규정 BR-03 |
|  | GET | `/api/admin/integrity-check` (#209) | routes/adminRoutes.js controllers/opsController.js services/adminService.js models/sql/integrityModel.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 → '같은 시간대 끝나지 않은 업무에 중복 배정된 구성원' 0건 |
|  | - | 공통 (배정 규칙) | services/assignmentRules.js models/sql/taskAssigneeModel.js | admin → 시스템 관리 → 데이터 무결성 점검 '같은 시간대 끝나지 않은 업무에 중복 배정된 구성원' 0건 |
| **BR-04**<br>자신보다 높은 역할의 역할 변경 불가 | PATCH | `/api/users/:userId/role` (#17) | routes/userRoutes.js controllers/userController.js services/userService.js services/accessService.js | underboss1 → 조직 › 구성원 → boss → [구성원 관리] → 역할 변경 → [역할 변경] → 규정 BR-04로 거부 |
|  | POST | `/api/role-change-requests` (#51) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js services/accessService.js | capo1 → 조직 › 구성원 → soldier2 → [구성원 관리] → 역할 변경 추천(Underboss) → [추천] → 규정 BR-04 |
|  | POST | `/api/role-change-requests/:requestId/approve` (#54) | routes/roleRequestRoutes.js controllers/roleRequestController.js services/roleRequestService.js services/accessService.js | boss → 조직 › 구성원 → underboss2 → 역할 변경 추천(Capo) → [추천] → underboss1 → 조직 › 역할 변경 요청 → [승인] → 규정 BR-04 |
|  | - | 공통 (역할 순위 검사) | services/accessService.js | underboss1 → 조직 › 구성원 → underboss2 → [구성원 관리]의 역할·상태·기본 정보 변경이 모두 규정 BR-04로 거부 |
| **BR-05**<br>관리하지 않는 Crew의 편성 변경 불가 | POST | `/api/crews/:crewId/members` (#37) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/accessService.js | capo1 → 조직 › Crew → Southside → 구성원 편성 아이디 associate2 → [편성] → 규정 BR-05 |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/accessService.js | Swagger(capo1): crewId 2, 본문 {"members":[{"userId":13}]} → 403 BR-05 |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/accessService.js | capo2 → 조직 › Crew → Northside → soldier2 행 [임시로] → 규정 BR-05 |
|  | DELETE | `/api/crews/:crewId/members/:userId` (#40) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js services/accessService.js | capo2 → 조직 › Crew → Northside → soldier2 행 [제외] → 규정 BR-05 |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js config/permissions.js | capo1 → 조직 › Crew → Northside: [이동] 버튼이 없음. Swagger(capo1)로 같은 API 실행 → 403 (Underboss·Boss만 이동) |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js services/accessService.js | capo1 → 조직 › Crew → Southside: 들어온 신청이 막혀 있음. Swagger(capo1): POST /api/crews/2/join-requests/1/approve → 403 BR-05 |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/reject` (#48) | routes/joinRequestRoutes.js controllers/joinRequestController.js services/joinRequestService.js services/accessService.js | Swagger(capo1): POST /api/crews/2/join-requests/1/reject 본문 {"reason":"확인"} → 403 BR-05 |
|  | - | 공통 (관리 범위 검사) | services/accessService.js | capo1 → 조직 › Crew → Southside에서 편성·[제외]·[임시로]가 모두 규정 BR-05로 거부 |
| **BR-06**<br>완료 업무의 핵심 결과 변경 불가 | PATCH | `/api/tasks/:taskId` (#63) | routes/taskRoutes.js controllers/taskController.js services/taskService.js services/taskAccess.js | capo2 → 업무 관리 → 강남 정보 수집(완료): 업무 관리 양식이 없음. Swagger(capo2): PATCH /api/tasks/3 본문 {"title":"수정"} → 409 BR-06 |
|  | POST | `/api/tasks/:taskId/checklist` (#75) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js services/taskAccess.js | Swagger(capo2): POST /api/tasks/3/checklist 본문 {"content":"추가"} → 409 BR-06 (강남 정보 수집은 완료) |
|  | POST | `/api/tasks/:taskId/checklist/:itemId/check` (#78) | routes/taskContentRoutes.js controllers/taskController.js services/taskContentService.js services/taskAccess.js | capo1 → 물품 운송 [완료 처리] 후 Swagger(soldier2): POST /api/tasks/2/checklist/4/check 본문 {"done":true} → 409 BR-06 |
|  | POST | `/api/tasks/:taskId/cancel` (#93) | routes/taskRoutes.js controllers/taskController.js services/taskService.js services/taskAccess.js | Swagger(capo2): POST /api/tasks/3/cancel 본문 {"reason":"취소"} → 409 BR-06 |
|  | POST | `/api/tasks/:taskId/complete` (#102) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | Swagger(capo2): POST /api/tasks/3/complete 예시 본문 → 409 BR-06 (이미 완료된 업무) |
|  | PATCH | `/api/tasks/:taskId/result` (#104) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | capo2 → 업무 관리 → 강남 정보 수집: 결과 정정 양식이 없음. Swagger(capo2): PATCH /api/tasks/3/result 본문 {"summary":"정정","reason":"확인"} → 409 BR-06 |
|  | PUT | `/api/tasks/:taskId/participations/:userId` (#105) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | Swagger(capo2): PUT /api/tasks/3/participations/8 본문 {"participated":false,"reason":"확인"} → 409 BR-06 (boss는 같은 화면에서 정정 가능) |
|  | POST | `/api/tasks/:taskId/progress` (#107) | routes/taskRoutes.js controllers/taskController.js services/taskResultService.js | Swagger(soldier1): POST /api/tasks/3/progress 본문 {"percent":50} → 409 BR-06 |
|  | - | 공통 (완료 업무 잠금) | services/taskAccess.js services/taskResultService.js | capo2 → 업무 관리 → 강남 정보 수집(완료): 정보 수정·배정·체크리스트·자원 할당 버튼이 없음, Swagger로 시도하면 409 BR-06 |
| **BR-07**<br>사용 중인 자원의 같은 시간대 중복 배정 불가 | PATCH | `/api/tasks/:taskId/schedule` (#65) | routes/taskRoutes.js controllers/taskController.js services/taskService.js services/taskResourceService.js | capo1 → 자원 › 공용 자원 → 승합차 2호 → soldier1에게 다음 날 13:00~14:00 [배정] → 강북 정기 순찰 일정 변경(다음 날 13:00~15:00) → 규정 BR-07 |
|  | GET | `/api/resources/available` (#117) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js models/sql/resourceModel.js | soldier1 → 자원 › 공용 자원 → 이용 가능한 자원 시간(다음 날 10:00~12:00) → [확인] → 강북 정기 순찰에 할당된 승합차 2호·무전기 1호가 없음 |
|  | POST | `/api/tasks/:taskId/resources` (#130) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js services/resourceRules.js | capo1 → 강북 정기 순찰 → 자원 할당 관리 번호 RD-002 → [자원 할당] → 규정 BR-07 (soldier1 배정과 겹침) |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js services/resourceRules.js | capo1 → #132 실행 후 승합차 2호 → soldier1에게 다음 날 11:00~12:00 [배정] → 강북 정기 순찰 승합차 2호를 10:00~12:00으로 [시간 조정] → 규정 BR-07 |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js models/sql/resourceModel.js | capo1 → 강북 정기 순찰 → 할당할 수 있는 자원에 시간대가 겹치는 무전기 2호(RD-002)가 없음 |
|  | GET | `/api/resources/:resourceId/availability` (#135) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js models/sql/resourceScheduleModel.js | capo1 → 자원 › 공용 자원 → 승합차 2호 → 시간대 가용 여부(다음 날 10:00~12:00) → [확인] → 배정 불가 (강북 정기 순찰) |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js services/resourceRules.js | capo1 → 자원 › 공용 자원 → 승합차 2호 → 구성원에게 배정 soldier1, 다음 날 10:30~11:30 → [배정] → 규정 BR-07 |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js services/resourceRules.js | capo2 → 자원 › 내 자원 → soldier3 신청 [승인] → Swagger(capo1): allocationId 1 본문 {"endAt": 2일 뒤 15:00} → 409 BR-07 |
|  | POST | `/api/resource-requests` (#141) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js services/resourceRules.js | soldier1 → 자원 › 내 자원 → 자원 사용 신청 RD-001, 다음 날 10:00~12:00 → [신청] → 규정 BR-07 |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js services/resourceRules.js | capo1 → 무전기 2호 → soldier1에게 2일 뒤 14:00~15:00 [배정] → capo2 → 처리할 사용 신청 [승인] → 규정 BR-07 |
|  | PATCH | `/api/resource-usages/:usageId` (#151) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js services/resourceRules.js | capo1 → 승합차 1호 → soldier1에게 4~5시간 뒤 [배정] → 반환 예정을 5시간 뒤로 [연장] → 규정 BR-07 |
|  | POST | `/api/resource-usages/:usageId/handover` (#152) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js services/resourceRules.js | capo1 → 승합차 1호 → soldier1에게 4~5시간 뒤 [배정] → soldier2 → 인계(associate1, 새 반환 예정 5시간 뒤) → [인계] → 규정 BR-07 |
|  | GET | `/api/admin/integrity-check` (#209) | routes/adminRoutes.js controllers/opsController.js services/adminService.js models/sql/integrityModel.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 → '같은 시간대에 중복 예약된 자원' 0건 |
|  | - | 공통 (자원 예약 규칙) | services/resourceRules.js models/sql/resourceScheduleModel.js | admin → 시스템 관리 → 데이터 무결성 점검 '같은 시간대에 중복 예약된 자원' 0건 |
| **BR-08**<br>사용 불가 자원의 새 배정 불가 | GET | `/api/resources/available` (#117) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js models/sql/resourceModel.js | soldier1 → 자원 › 공용 자원 → 이용 가능한 자원에 화물 트럭(점검중)·무전기 3호(사용불가)가 없음 |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js models/sql/resourceModel.js | capo1 → 무전기 1호 → [자원 관리] → 상태 변경(사용불가)·사유 → [변경] → 같은 화면 구성원에게 배정(soldier1) → [배정] → 규정 BR-08 |
|  | GET | `/api/resource-statuses` (#123) | routes/referenceRoutes.js controllers/resourceController.js services/resourceService.js config/constants.js | Swagger(soldier1): GET /api/resource-statuses 실행 → 점검중·사용불가는 assignable false |
|  | POST | `/api/resources/:resourceId/maintenances` (#125) | routes/maintenanceRoutes.js controllers/resourceController.js services/maintenanceService.js | capo1 → 세단 1호 [점검 등록] 후 같은 화면 구성원에게 배정(capo1) → [배정] → 규정 BR-08 |
|  | POST | `/api/tasks/:taskId/resources` (#130) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js services/resourceRules.js | capo1 → 강북 정기 순찰 → 자원 할당 관리 번호 RD-003 → [자원 할당] → 규정 BR-08 (사용불가) |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js services/resourceRules.js | capo1 → 무전기 1호 상태 변경(점검중) → 강북 정기 순찰 무전기 1호 행 [시간 조정] → 규정 BR-08 |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | routes/taskResourceRoutes.js controllers/resourceController.js services/taskResourceService.js models/sql/resourceModel.js | capo1 → 강북 정기 순찰 → 할당할 수 있는 자원에 화물 트럭(점검중)·무전기 3호(사용불가)가 없음 |
|  | GET | `/api/resources/:resourceId/availability` (#135) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 화물 트럭 → 시간대 가용 여부 → [확인] → 배정 불가 (점검중) |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js services/resourceRules.js | capo1 → 자원 › 공용 자원 → 무전기 3호 → 구성원에게 배정 soldier1 → [배정] → 규정 BR-08 |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | routes/resourceAllocationRoutes.js controllers/resourceController.js services/resourceAllocationService.js services/resourceRules.js | capo1 → 무전기 2호 상태 변경(점검중) → Swagger(capo1): allocationId 1 본문 {"endAt": 2일 뒤 08:00} → 409 BR-08 |
|  | POST | `/api/resource-requests` (#141) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js services/resourceRules.js | soldier1 → 자원 › 내 자원 → 자원 사용 신청 RD-003 → [신청] → 규정 BR-08 |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | routes/resourceRequestRoutes.js controllers/resourceController.js services/resourceRequestService.js services/resourceRules.js | capo2 → 무전기 2호 → [자원 관리] → 상태 변경(점검중) → 처리할 사용 신청 [승인] → 규정 BR-08 |
|  | POST | `/api/resource-usages/:usageId/damage-reports` (#153) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js services/maintenanceService.js | soldier2 → 승합차 1호 [신고] 후 capo1 → 승합차 1호 → 구성원에게 배정 → [배정] → 규정 BR-08 |
|  | - | 공통 (자원 상태 규칙) | services/resourceRules.js config/constants.js | capo1 → 자원 › 공용 자원 → 전체 자원에서 점검중·사용불가 자원은 흐리게 표시, 배정하면 규정 BR-08 |
| **BR-09**<br>권한 없는 직접 URL 접근 차단 | GET | `/api/security-events` (#179) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js middlewares/errorHandler.js services/auditService.js models/mongo/SecurityEvent.js | associate1 → 주소창에 /users 입력(403 화면) → admin → 평가·기록 › 감사 기록 → 권한 거부 기록에 그 시도가 있음 |
|  | - | 모든 API (`/api/*`) | middlewares/authenticate.js middlewares/authorize.js config/permissions.js services/permissionService.js middlewares/errorHandler.js services/auditService.js | Swagger: Authorize 없이 GET /api/users 실행 → 401, boss로 Authorize 후 GET /api/admin/accounts → 403 |
|  | - | 웹 화면 | routes/webRoutes.js middlewares/web.js | associate1 → 주소창에 /users 입력 → 403 화면, boss → 주소창에 /admin 입력 → 403 화면 |
| **BR-10**<br>역할·소속·상태·평가 변경 이력 보존 | GET | `/api/users/:userId/memberships` (#19) | routes/userRoutes.js controllers/userController.js services/userService.js models/sql/membershipModel.js | boss → 조직 › 구성원 → soldier1 → 소속 이력 (종료된 소속·처리자 포함) |
|  | GET | `/api/crews/:crewId/capo-history` (#33) | routes/crewRoutes.js controllers/crewController.js services/crewService.js models/sql/capoTermModel.js | boss → #30 실행(해제 후 다시 지정) → 조직 › Crew → Northside → 책임자 이력에 종료·시작 기록 |
|  | GET | `/api/crews/:crewId/membership-history` (#43) | routes/membershipRoutes.js controllers/membershipController.js services/membershipService.js models/sql/membershipModel.js | capo1 → #39·#40 실행 후 조직 › Crew → Northside → 편성 이력에 변경 내용·처리자 |
|  | GET | `/api/users/:userId/change-history` (#155) | routes/historyRoutes.js controllers/recordController.js services/historyService.js models/mongo/ActivityLog.js | boss → 조직 › 구성원 → associate1 → 변경 이력 (계정 등록·소속·징계가 시간순) |
|  | GET | `/api/evaluations/:evaluationId` (#162) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js models/mongo/Evaluation.js | soldier1 → #170 실행 후 내 기록·평판 → 받은 평가 클릭 → 수정·정정 이력에 변경 전후 |
|  | PATCH | `/api/evaluations/:evaluationId` (#163) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js services/auditService.js models/mongo/ActivityLog.js models/mongo/Evaluation.js | capo2 → #163 실행 후 같은 평가 화면 → 수정·정정 이력에 변경 전후·사유 |
|  | DELETE | `/api/evaluations/:evaluationId` (#164) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js services/auditService.js models/mongo/ActivityLog.js | boss → #164 실행 후 평가 화면 → 상태 '철회'와 사유, 문서는 그대로 남음 |
|  | POST | `/api/evaluations/:evaluationId/appeals` (#168) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js services/auditService.js models/mongo/ActivityLog.js | soldier3 → #168 실행 후 평가·기록 › 평가 → 내가 낸 이의 제기 (대기) |
|  | POST | `/api/evaluation-appeals/:appealId/resolve` (#170) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js services/auditService.js models/mongo/ActivityLog.js models/mongo/Evaluation.js | boss → #170 실행 후 평가 상세 → 수정·정정 이력에 '이의 제기 정정' |
|  | POST | `/api/users/:userId/reputation-events` (#172) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js services/auditService.js models/mongo/ActivityLog.js | underboss1 → #172 실행 후 boss → 조직 › 구성원 → soldier2 → 변경 이력에 공로 기록 |
|  | DELETE | `/api/reputation-events/:eventId` (#174) | routes/reputationRoutes.js controllers/recordController.js services/reputationService.js services/auditService.js models/mongo/ActivityLog.js | underboss1 → #174 실행 후 soldier3 → 공로·징계에 '취소됨'과 사유 |
|  | GET | `/api/stats/membership-changes` (#194) | routes/statsRoutes.js controllers/opsController.js services/statsService.js models/sql/statsModel.js | boss → 분석 › 운영 현황 → 소속 변화 (기간별 가입·이동·탈퇴 건수) |
|  | - | 공통 (변경 이력 기록) | services/auditService.js models/mongo/ActivityLog.js models/mongo/Evaluation.js models/sql/membershipModel.js models/sql/capoTermModel.js | boss → 조직 › 구성원 → associate1 → 변경 이력 (계정 등록·소속·징계가 시간순) |

## 3. 데이터 요구사항 (DR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **DR-01**<br>계정·권한·구성원·Crew 소속·상태 관계의 일관성 | GET | `/api/admin/integrity-check` (#209) | routes/adminRoutes.js controllers/opsController.js services/adminService.js models/sql/integrityModel.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 → 모든 항목 0건 |
|  | - | 공통 (스키마·트랜잭션) | models/sql/schema.js config/database.js services/enrollment.js | admin → 시스템 › 시스템 관리 → 데이터 무결성 점검 → 모든 항목 0건 |
| **DR-02**<br>업무와 참여 구성원의 관계 | - | 업무 참여자 조회 API (#84, #94, #106) | models/sql/schema.js models/sql/taskModel.js models/sql/taskAssigneeModel.js models/sql/taskResultModel.js models/sql/swapRequestModel.js | capo1 → 강북 정기 순찰 → 참여자, soldier1 → 업무 › 내 업무, capo2 → 강남 정보 수집 → 참여 기록 |
| **DR-03**<br>자원의 현재 상태와 사용 이력 | GET | `/api/resources/:resourceId/usages` (#150) | routes/resourceUsageRoutes.js controllers/resourceController.js services/resourceUsageService.js | capo1 → 자원 › 공용 자원 → 무전기 2호 → 현재 상태와 사용·반환 이력 |
|  | - | 공통 (자원 상태·이력 저장) | models/sql/schema.js models/sql/resourceModel.js models/sql/resourceUsageModel.js models/sql/resourceAllocationModel.js models/sql/taskResourceModel.js models/sql/maintenanceModel.js services/auditService.js | capo1 → 자원 › 공용 자원 → 무전기 2호 → 현재 상태·사용·반환 이력·상태 변경 이력 |
| **DR-04**<br>활동·상태 변경·기록·평가 정보 저장 | - | 이력·평가 조회 API (#155~#157, #160, #176) | models/mongo/ActivityLog.js models/mongo/Evaluation.js models/mongo/EvaluationAppeal.js models/mongo/EvaluationCriterion.js models/mongo/ReputationEvent.js models/mongo/TaskProgress.js models/mongo/LoginHistory.js models/mongo/SecurityEvent.js models/mongo/SavedSearch.js | boss → 조직 › 구성원 → soldier1 → 변경 이력·활동·받은 평가, 평가·기록 › 감사 기록 |
| **DR-05**<br>데이터 특성에 따른 SQL·MongoDB 사용 | - | - | config/database.js models/sql/schema.js models/sql/*.js models/mongo/*.js | admin → 시스템 › 시스템 관리 → DB 연결 상태 (MySQL·MongoDB 모두 연결됨) |
| **DR-06**<br>학번이 들어간 DB 이름과 직접 설계한 구조 | - | - | config/index.js models/sql/schema.js models/mongo/*.js | admin → 시스템 › 시스템 관리 → DB 연결 상태 (MySQL·MongoDB DB 이름 family_202211207) |

## 4. REST API 요구사항 (AR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **AR-01**<br>목적에 맞는 HTTP Method | - | 모든 API (210개) | routes/*.js | /api-docs → API마다 Method (조회 GET, 등록·동작 POST, 수정 PATCH, 지정·교체 PUT, 삭제 DELETE) |
| **AR-02**<br>Path·Query·Header·Body의 목적에 맞는 사용 | - | 모든 API | routes/rules.js middlewares/validate.js middlewares/authenticate.js | /api-docs → 각 API의 Parameters(path·query)·Request body, [Authorize](Authorization 헤더) |
| **AR-03**<br>필터링·정렬·검색·페이지 조회 | GET | `/api/users` (#12) | routes/userRoutes.js controllers/userController.js services/userService.js | boss → 조직 › 구성원 → 역할·상태·Crew·정렬 선택 → [조회] → 아래 [다음 ›] |
|  | GET | `/api/tasks` (#61) | routes/taskRoutes.js controllers/taskController.js services/taskService.js | boss → 업무 › 업무 관리 → 검색어·상태·정렬 선택 → [조회] → 아래 [다음 ›] |
|  | GET | `/api/resources` (#116) | routes/resourceRoutes.js controllers/resourceController.js services/resourceService.js | capo1 → 자원 › 공용 자원 → 전체 자원 상태·분류·정렬 선택 → [조회] → 아래 [다음 ›] |
|  | GET | `/api/evaluations` (#160) | routes/evaluationRoutes.js controllers/recordController.js services/evaluationService.js | boss → 평가·기록 › 평가 → 평가 검색 조건 → [검색] |
|  | - | 목록 조회 API 공통 | routes/rules.js utils/pagination.js | boss → 구성원·업무 관리·공용 자원 목록에서 검색·필터·정렬 → [조회] → 아래 [다음 ›] |
| **AR-04**<br>잘못된 입력·없는 대상·권한 부족·규칙 위반 처리 | - | 모든 API | middlewares/validate.js middlewares/authenticate.js middlewares/authorize.js utils/errors.js middlewares/errorHandler.js | Swagger(boss): GET /api/users/abc → 400, GET /api/users/9999 → 404, Swagger(soldier1): POST /api/users → 403, 규칙 위반(#83 suspended1 배정) → 409 |
| **AR-05**<br>일관된 요청·응답·오류 형식 | - | 모든 API | utils/response.js utils/errors.js middlewares/errorHandler.js | Swagger: 아무 API 실행 → 성공 {"success":true,"data"}, 실패 {"success":false,"error":{code,message}} |
| **AR-06**<br>200개 이상의 REST API | - | 모든 API (210개) | routes/index.js routes/*.js tests/routeTable.js tests/integration.test.js | /api-docs → 태그별 API 목록 (210개, API 목록표와 같음) |
| **AR-07**<br>같은 동작의 반복 구현 금지 | - | 모든 API (210개) | routes/*.js tests/integration.test.js | /api-docs → API 설명 (같은 동작을 URL·이름만 바꾼 API 없음) |
| **AR-08**<br>모든 API의 요구사항 연결 | - | 모든 API (210개) | routes/*.js config/swagger.js tests/integration.test.js | /api-docs → 각 API 설명 맨 앞의 [요구사항 ID] |

## 5. 비기능 요구사항 (NFR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **NFR-01**<br>작업 성공·실패를 명확히 확인 | - | 모든 API | utils/response.js middlewares/errorHandler.js | Swagger: API 실행 → 응답의 success, 실패 시 error.message |
|  | - | 웹 화면 | middlewares/web.js views/partials/flash.ejs | 아무 처리(예: soldier1 → 내 정보 [수정]) 후 화면 위쪽 메시지 (성공 초록, 실패 빨강 + 규정 번호) |
| **NFR-02**<br>비정상 요청에도 서버가 종료되지 않음 | GET | `/api/admin/health` (#210) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | Swagger로 잘못된 요청(GET /api/users/abc 등)을 여러 번 보낸 뒤 admin → 시스템 관리 → DB 연결 상태 정상 (서버 계속 실행) |
|  | - | 모든 API | middlewares/validate.js middlewares/errorHandler.js app.js | Swagger: GET /api/users/abc, 형식이 틀린 JSON 본문 → 400 응답 후에도 다른 API가 정상 실행됨 |
| **NFR-03**<br>서버 측 권한 검사 | POST | `/api/auth/login` (#1) | routes/authRoutes.js controllers/authController.js services/authService.js | suspended1·withdrawn1 → [로그인] → 정지·탈퇴 계정이라 거부 |
|  | POST | `/api/auth/refresh` (#2) | routes/authRoutes.js controllers/authController.js services/authService.js | Swagger: POST /api/auth/login 실행 → 응답의 refreshToken으로 POST /api/auth/refresh 실행 → 새 accessToken 발급 |
|  | POST | `/api/auth/logout` (#3) | routes/authRoutes.js controllers/authController.js services/authService.js | soldier1 → 오른쪽 위 사용자 메뉴 → [로그아웃] → 로그인 화면으로 이동 |
|  | GET | `/api/auth/sessions` (#4) | routes/authRoutes.js controllers/authController.js services/authService.js | soldier1 → 사용자 메뉴 › 내 정보 → 로그인 세션 목록 |
|  | DELETE | `/api/auth/sessions` (#5) | routes/authRoutes.js controllers/authController.js services/authService.js | soldier1 → 사용자 메뉴 › 내 정보 → [모든 세션 종료] → 다시 로그인해야 함 |
|  | GET | `/api/me/permissions` (#9) | routes/meRoutes.js controllers/meController.js services/meService.js | soldier1과 boss → 사용자 메뉴 › 내 정보 → 내 권한 비교 (역할마다 다름) |
|  | GET | `/api/security-events` (#179) | routes/auditRoutes.js controllers/recordController.js services/auditLogService.js | admin → 평가·기록 › 감사 기록 → 권한 거부 기록 |
|  | PUT | `/api/admin/accounts/:userId/lock` (#200) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | soldier2 로그인 상태에서 admin이 [잠금] → soldier2 화면 새로고침 시 로그인 화면 |
|  | DELETE | `/api/admin/accounts/:userId/sessions` (#203) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | soldier1 로그인 상태에서 admin → [강제 로그아웃] → soldier1의 다음 요청이 로그인 화면으로 |
|  | GET | `/api/admin/permissions` (#205) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin → 시스템 관리 → 역할별 권한 (역할마다 허용된 권한 키) |
|  | PUT | `/api/admin/permissions/:role` (#206) | routes/adminRoutes.js controllers/opsController.js services/adminService.js | admin이 #206 실행 후 soldier1 → 주소창에 /resources 입력 → 403 화면 (다시 체크해 되돌림) |
|  | - | 모든 API | middlewares/authenticate.js middlewares/authorize.js config/permissions.js routes/webRoutes.js | soldier1 → 주소창에 /admin 입력 → 403 화면, Swagger(soldier1): GET /api/admin/accounts → 403 |
| **NFR-04**<br>데이터가 많아도 탐색할 방법 제공 | GET | `/api/search` (#180) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 위쪽 검색창에 검색어 → 종류별 결과 (결과가 많으면 종류 하나만 골라 검색) |
|  | POST | `/api/saved-searches` (#181) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 자주 쓰는 검색 조건 → [검색 조건 저장] |
|  | GET | `/api/saved-searches/:searchId/results` (#183) | routes/searchRoutes.js controllers/opsController.js services/searchService.js | soldier1 → 분석 › 통합 검색 → 저장한 검색 이름 클릭 |
|  | - | 목록 조회 API 공통 | routes/rules.js utils/pagination.js models/sql/schema.js | boss → 조직 › 구성원 → 필터·정렬 → [조회] → 아래 [다음 ›]로 페이지 이동 |
| **NFR-05**<br>일관된 응답·오류 메시지 | - | 모든 API | utils/response.js utils/errors.js middlewares/errorHandler.js | Swagger: 여러 API의 성공·실패 응답이 같은 형식 ({success, data, meta} / {success, error}) |

## 6. 기술 제약조건 (CR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **CR-01**<br>Node.js·Express 기반 | - | - | app.js createApp.js | `node app.js` 실행 → '[서버] http://localhost:3000' 출력 |
| **CR-02**<br>EJS 서버 사이드 렌더링 | - | 웹 화면 (`/`, `/login`, `/tasks` 등) | routes/webRoutes.js controllers/webController.js controllers/webTaskController.js controllers/webResourceController.js controllers/webRecordController.js controllers/webOpsController.js controllers/webHelpers.js controllers/webNav.js middlewares/web.js views/*.ejs | 브라우저에서 http://localhost:3000 → 로그인·업무 홈 등 서버에서 만든 화면 |
| **CR-03**<br>SQL과 MongoDB 모두 사용 | - | - | config/database.js models/sql/*.js models/mongo/*.js | admin → 시스템 › 시스템 관리 → DB 연결 상태 (MySQL·MongoDB 모두 연결됨) |
| **CR-04**<br>모든 API Swagger 문서화 | GET | `/api-docs`, `/api-docs.json` | config/swagger.js createApp.js routes/*.js | http://localhost:3000/api-docs → 아무 API [Try it out] → [Execute] |
| **CR-05**<br>기능별 책임 분리 (Router·Controller·Service·Model) | - | - | routes/*.js controllers/*.js services/*.js models/sql/*.js models/mongo/*.js | `midterm` 폴더의 routes·controllers·services·models 폴더 구조 |
| **CR-06**<br>`node app.js` 하나로 실행 | - | - | app.js config/database.js models/seed.js models/seedData.js | 빈 DB에서 `node app.js` 실행 → 테이블·시드 데이터 자동 생성 후 로그인 가능 |
