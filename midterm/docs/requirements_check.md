# 기능 요구사항 확인 방법

The Family 통합 정보시스템(학번 202211207)의 기능 요구사항(FR)과 업무 규칙(BR)을 웹 화면과 Swagger에서 확인하는 방법입니다.
모든 절차는 **시드 데이터만 있는 처음 상태**를 기준으로 합니다.

## 1. 준비

1. MySQL·MongoDB 서버를 켠 뒤 `midterm` 폴더에서 `node app.js`를 실행합니다. DB·테이블·시드 데이터는 자동으로 만들어집니다.
2. 브라우저에서 <http://localhost:9800> 에 접속하면 로그인 화면이 나옵니다. 아래 계정의 아이디와 비밀번호를 입력합니다.
3. 계정을 바꾸려면 오른쪽 위 **사용자 메뉴 → 로그아웃** 후 다른 계정으로 로그인합니다.
4. 확인하다가 데이터가 바뀌어 처음 상태로 되돌리려면 서버를 끄고 `node app.js --reset`으로 다시 시작합니다.

화면에서 처리가 거부되면 화면 위쪽에 이유와 함께 **규정 번호**(예: `규정 BR-01`)가 표시됩니다.
권한이 없는 화면에 주소로 직접 들어가면 403 화면이 나옵니다.

### 테스트 계정 (비밀번호 모두 `Family2026!`)

| 아이디 | 이름 | 역할 | 상태 |
| --- | --- | --- | --- |
| admin | System Admin | Administrator | 활동중 |
| boss | Vittorio Romano | Boss | 활동중 |
| underboss1 | Salvatore Greco | Underboss | 활동중 |
| underboss2 | Antonio Lombardi | Underboss | 활동중 |
| capo1 | Lorenzo Bianchi | Capo | 활동중 |
| capo2 | Matteo Ferrari | Capo | 활동중 |
| capo3 | Franco Rinaldi | Capo | 활동중 |
| soldier1 | Luca Esposito | Soldier | 활동중 |
| soldier2 | Marco Ricci | Soldier | 활동중 |
| soldier3 | Giovanni Conti | Soldier | 활동중 |
| soldier4 | Stefano Galli | Soldier | 활동중 |
| associate1 | Paolo Moretti | Associate | 활동중 |
| associate2 | Enzo Marino | Associate | 활동중 |
| pending1 | Nico Costa | Associate | 대기 |
| suspended1 | Dario Gallo | Soldier | 정지 |
| withdrawn1 | Rocco Bruno | Soldier | 탈퇴 |

### 시드 Crew

| Crew | 지역 | 책임자(Capo) | 담당 Underboss | 소속원 |
| --- | --- | --- | --- | --- |
| Northside | 서울 강북 | capo1 | underboss1 | capo1, soldier1, soldier2, associate1, suspended1 |
| Southside | 서울 강남 | capo2 | underboss1 | capo2, soldier3, soldier1(임시) |
| Harbor | 부산 | capo3 | underboss2 | capo3, soldier4 |

### 시드 업무 (시드를 만든 날 기준)

| 업무 | 담당 | 상태 | 일정 |
| --- | --- | --- | --- |
| 강북 정기 순찰 | Northside | 계획 | 다음 날 10:00~12:00 |
| 물품 운송 | Northside | 진행 | 1시간 전부터 진행 중 |
| 강남 정보 수집 | Southside | 완료 | 전날 14:00 |
| 항만 물품 확인 | Harbor | 계획 | 이틀 뒤 09:00 |
| 간부 정기 회의 | 조직 업무 | 계획 | 사흘 뒤 14:00 |

## 2. 화면 구성

로그인하면 왼쪽 메뉴, 위쪽 통합 검색창과 사용자 메뉴가 있는 화면이 나옵니다. 메뉴는 로그인한 계정의 역할에 허용된 것만 보입니다.

| 메뉴 | 주소 | 보이는 역할 | 내용 |
| --- | --- | --- | --- |
| 업무 홈 | `/` | 모든 역할 | 내 업무·일정·사용 중인 자원·평판, 처리할 일, 운영 경고(Underboss·Boss), 시스템 상태(Administrator) |
| 업무 › 내 업무 | `/my-tasks` | Associate~Boss | 내게 배정된 업무, 앞으로 2주 일정, 업무 교대 요청 |
| 업무 › 업무 관리 | `/tasks` | Capo, Underboss, Boss | 업무 목록·필터, ＋ 업무 등록, 업무 화면(참여자·자원·지시사항·체크리스트·결과·이력) |
| 조직 › 구성원 | `/users` | Soldier~Boss, Administrator | 구성원 목록·필터, ＋ 구성원 등록, 구성원 화면(소속 이력·지휘 계통·평판·변경 이력·활동·구성원 관리) |
| 조직 › Crew | `/crews` | 모든 역할 | Crew 목록, ＋ Crew 생성, Crew 화면(조직도·소속원·편성·소속 신청·Crew 관리·이력·업무량·활동) |
| 조직 › 역할 변경 요청 | `/role-requests` | Capo, Underboss, Boss | Capo의 역할 변경 추천과 승인·거절 |
| 자원 › 내 자원 | `/my-resources` | Associate~Boss | 사용 중인 자원 반환, 배정된 자원 사용 시작, 자원 사용 신청, 처리할 사용 신청 |
| 자원 › 공용 자원 | `/resources` | Soldier~Boss | 이용 가능한 자원, 전체 자원(관리), 진행 중인 점검, 미반환 자원, 자원 분류, ＋ 자원 등록 |
| 평가·기록 › 평가 | `/evaluations` | Associate~Boss | 작성해야 할 평가, 처리할 이의 제기, 내가 낸 이의 제기, 평가 검색, 평가 항목, 평판 순위 |
| 평가·기록 › 감사 기록 | `/audit-logs` | Boss, Administrator | 상태 변경·관리 활동 기록 검색과 상세, CSV 내려받기, 권한 거부 기록 |
| 분석 › 운영 현황 | `/dashboard` | Underboss, Boss | 기간별 업무 추이, 자원 상태·가동률, Crew 비교, 구성원 분포, 운영 경고 |
| 분석 › 통합 검색 | `/search` | 모든 역할 | 위쪽 검색창과 같은 화면. 검색 조건 저장·실행 |
| 시스템 › 시스템 관리 | `/admin` | Administrator | 시스템 상태, 데이터 무결성, 계정 보안, 로그인 이력, 역할별 권한, 운영 설정 |
| 사용자 메뉴 › 내 정보 | `/me` | 모든 역할 | 계정·소속, 연락처·비밀번호 변경, 로그인 세션, 내 권한, 내 Crew 소속 신청 |
| 사용자 메뉴 › 내 기록·평판 | `/users/{내 ID}` | Administrator 제외 | 내 평판, 받은 평가, 변경 이력, 활동 |

업무·구성원·자원·평가는 목록에서 이름을 누르면 상세 화면이 열립니다. 상세 화면 위쪽의 구역 바로가기(예: 개요·참여자·자원·…)로 원하는 영역으로 이동할 수 있습니다.

## 3. 기능 요구사항 확인 (단계 1~6)

| 단계 | 요구사항 | 기능 | 확인 방법 | 관련 API |
| --- | --- | --- | --- | --- |
| 1 | FR-02 | 로그인과 본인 정보 확인 | 아무 계정으로 로그인하면 업무 홈에 역할·소속·처리할 일이 나온다. 사용자 메뉴 → 내 정보에서 계정·역할·상태와 내 권한 목록을 본다. | POST /api/auth/login, GET /api/me, GET /api/me/permissions |
| 1 | NFR-03 | 서버 측 인증과 세션 관리 | 내 정보의 로그인 세션 목록과 [모든 세션 종료]. suspended1·withdrawn1은 로그인이 거부된다. 로그인하지 않고 `/users`에 들어가면 로그인 화면으로 이동한다. | GET·DELETE /api/auth/sessions, POST /api/auth/logout |
| 1 | FR-01 | 내 연락처·비밀번호 변경 | 내 정보 → 정보 변경에서 연락처·별명을 수정하고 비밀번호를 바꾼다. 변경 내용은 감사 기록에 남는다. | PATCH /api/me, PUT /api/me/password |
| 2 | FR-01 | 구성원 등록·관리 | admin 또는 underboss1로 조직 › 구성원 → [＋ 구성원 등록]. 등록하면 그 구성원 화면이 열리고, [구성원 관리]에서 기본 정보를 수정한다. | POST /api/users, PATCH·DELETE /api/users/{userId} |
| 2 | FR-02 | 현재 소속·역할·상태와 활동 확인 | 업무 홈의 내 소속, 내 정보의 현재 소속(정식·임시·맡은 Crew)을 본다. 구성원 화면에서 소속 이력과 상위 지휘 계통을 본다. | GET /api/me, GET /api/users/{userId}/memberships, /chain-of-command |
| 2 | FR-03 | 역할·상태·소속 변경 | boss로 구성원 화면 → [구성원 관리]에서 역할·상태를 바꾼다. capo1은 자기 Crew 소속원 화면의 [구성원 관리]에서 역할 변경을 추천하고, underboss1이 조직 › 역할 변경 요청에서 승인한다. | PATCH /api/users/{userId}/role, /status, /api/role-change-requests |
| 2 | FR-04 | 구성원 상태 구분 관리 | 조직 › 구성원에서 상태로 거르고, 구성원 화면 → [구성원 관리] → 상태 변경. 지금 상태에서 바꿀 수 있는 상태가 안내되고, 허용되지 않는 변경(예: 활동중 → 대기)은 거부된다. | GET /api/member-statuses, PATCH /api/users/{userId}/status |
| 2 | FR-05 | Crew와 책임자·구성원 확인 | boss로 조직 › Crew → [＋ Crew 생성]. Crew 화면에서 조직도·현재 소속원·책임자 이력을 본다. | GET·POST /api/crews, GET /api/crews/{crewId}/hierarchy, /members |
| 2 | FR-06 | 관리 범위 안의 편성 변경 | Crew 화면의 구성원 편성, 현재 소속원의 [임시로·정식으로]·[제외]·[이동], [Crew 관리]의 병합, 소속 신청의 승인·거절. | POST /api/crews/{crewId}/members, /transfer, /join-requests, /api/crews/merge |
| 3 | FR-07 | 업무 등록과 일정·중요도·상태 관리 | capo1로 업무 › 업무 관리 → [＋ 업무 등록]. 업무 화면 위쪽의 [업무 시작]·[보류], [업무 관리]의 정보 수정·일정 변경·필요 인원·자원. | POST /api/tasks, PATCH /api/tasks/{taskId}, /schedule, /status |
| 3 | FR-08 | 한 업무에 여러 구성원 참여 | 업무 화면의 참여자에서 아이디를 쉼표로 여러 개 넣어 한 번에 배정하고, 역할 변경·해제·교체를 한다. 참여자는 같은 곳에서 교대를 요청한다. | POST /api/tasks/{taskId}/assignees, /replacement, /swap-requests |
| 3 | FR-09 | 내 업무와 확인할 정보 | soldier1로 업무 › 내 업무에서 배정된 업무를 열면 나에게 온 지시사항·체크리스트·함께하는 참여자가 보이고 배정을 수락·거절할 수 있다. 업무 홈의 다가오는 일정에도 나온다. | GET /api/me/tasks, /api/me/tasks/{taskId}, /api/me/schedule |
| 3 | FR-10 | 진행 상태 변경과 변경 이력 | 업무 화면 위쪽의 [업무 시작]·[보류], 완료와 결과의 [완료 처리]. 참여자는 진행 중인 업무에 진행 보고를 남긴다. 이력 › 상태 변경 이력에 처리자·사유가 쌓인다. | PATCH /api/tasks/{taskId}/status, POST /complete, /progress, GET /status-history |
| 3 | FR-11 | 완료 결과와 참여 기록 | boss로 업무 관리에서 상태를 '완료'로 거른 뒤 강남 정보 수집을 연다. 완료와 결과에서 성과·결과 요약·참여자별 참여 기록을 본다. | GET /api/tasks/{taskId}/result, /participations |
| 3 | FR-12 | 기간·Crew·상태·담당자로 업무 탐색 | boss로 업무 관리에서 검색어·상태·중요도·Crew로 거르고 정렬한다. API는 기간(from·to)과 담당자(assigneeId)도 지원한다. | GET /api/tasks?status=&crewId=&from=&to=&assigneeId= |
| 4 | FR-13 | 공용 자원 등록과 상태 관리 | underboss1로 자원 › 공용 자원 → [＋ 자원 등록]. 자원 화면 → [자원 관리]에서 상태(사용가능·점검중·사용불가)와 정보를 바꾼다. | POST /api/resources, /bulk, PATCH /api/resources/{resourceId}, /status |
| 4 | FR-14 | 권한·상태에 따른 이용 가능 자원 확인 | soldier1과 capo1로 공용 자원의 '이용 가능한 자원'을 비교한다. 이용 최소 역할이 Capo인 세단·방탄 조끼와 점검중·사용불가 자원은 soldier1에게 보이지 않는다. | GET /api/resources/available, PATCH /api/resources/{resourceId}/access-level |
| 4 | FR-15 | 자원 사용·반환·상태 변경 이력 | soldier1로 자원 › 내 자원 → 나에게 배정된 자원의 무전기 2호 [사용 시작] → 지금 사용 중인 자원에서 [반환]. capo1로 공용 자원 → 무전기 2호 화면의 사용·반환 이력과 상태 변경 이력에서 확인한다. | POST /api/resources/{resourceId}/checkout, /return, GET /usages, /status-history |
| 4 | FR-16 | 점검·사용불가 자원 구분 관리 | capo1로 공용 자원 → 전체 자원에서 구분을 '점검중·사용불가'로 거르고, 진행 중인 점검(화물 트럭)을 열어 점검을 완료한다. 사용 중 고장 신고와 손상 반환도 점검을 연다. | POST /api/resources/{resourceId}/maintenances, GET /api/maintenances, POST /api/resource-usages/{usageId}/damage-reports |
| 4 | FR-17 | 업무·구성원에게 자원 배정 | capo1로 업무 화면의 자원 → [자원 할당], 자원 화면의 '구성원에게 배정'. soldier3의 무전기 사용 신청은 capo2가 자원 › 내 자원 → 처리할 사용 신청에서 승인한다(업무 홈의 처리할 일에도 나온다). | POST /api/tasks/{taskId}/resources, /api/resources/{resourceId}/allocations, /api/resource-requests/{requestId}/approve |
| 5 | FR-18 | 평가·평판 기록 | capo2로 평가·기록 › 평가 → 작성해야 할 평가 → 강남 정보 수집 [평가하기] → 업무 화면의 참여자 평가에서 soldier1을 평가한다. underboss1로 구성원 화면 → 평판·평가의 공로·징계를 기록하면 평판 점수가 바뀐다. | POST /api/tasks/{taskId}/evaluations, PATCH /api/evaluations/{evaluationId}, POST /api/users/{userId}/reputation-events |
| 5 | FR-19 | 권한 범위 안의 활동·평가 이력 조회 | soldier1로 사용자 메뉴 → 내 기록·평판에서 평판, 받은 평가, 변경 이력, 활동을 본다. 조직 › 구성원에서 다른 Soldier 화면을 열면 이 영역들이 막혀 있다. | GET /api/users/{userId}/change-history, /activity, /evaluations, /reputation |
| 5 | FR-20 | 중요 상태 변경·관리 활동 기록 | boss 또는 admin으로 평가·기록 › 감사 기록에서 행위·대상·기간으로 찾고, 시각을 눌러 변경 전후를 본다. admin은 CSV로 내려받고 권한 거부 기록도 본다. | GET /api/audit-logs, /api/audit-logs/{logId}, /export, /api/security-events |
| 6 | FR-21 | 권한 범위 안의 통합 검색과 조건 저장 | 위쪽 검색창에 "강북"을 boss와 soldier1로 각각 검색한다. soldier1은 내가 참여 중인 업무와 이용할 수 있는 자원만, associate1은 구성원·자원이 막힌다. [검색 조건 저장] 후 저장한 검색에서 다시 실행한다. | GET /api/search, POST·GET /api/saved-searches, GET /api/saved-searches/{searchId}/results |
| 6 | FR-22 | 기간·Crew·구성원 상태·업무 상태별 운영 현황 | boss로 분석 › 운영 현황에서 기간을 바꾸며 업무 상태 추이, 자원 상태·가동률, Crew 비교, 구성원 분포, 운영 경고를 본다. 업무 홈에도 운영 경고가 나오고, Crew 화면에는 소속원별 업무량이 있다. | GET /api/stats/overview, /members, /crews, /tasks, /resources, /alerts, /api/crews/{crewId}/workload |
| 6 | FR-23 | 계정·권한 관리 | admin으로 시스템 › 시스템 관리의 계정 보안 현황에서 잠금·해제·임시 비밀번호·강제 로그아웃, 역할별 권한, 운영 설정을 바꾼다. 시스템 상태·데이터 무결성은 같은 화면과 admin의 업무 홈에 나온다. | PUT·DELETE /api/admin/accounts/{userId}/lock, PUT /api/admin/permissions/{role}, PUT /api/admin/settings |

## 4. 업무 규칙 확인 시나리오

각 시나리오는 시드 데이터만 있는 상태에서 시작합니다. 앞 시나리오가 데이터를 바꿨다면 `node app.js --reset`으로 되돌린 뒤 진행합니다.

### BR-01 정식 소속은 한 Crew만
1. boss로 로그인 → 조직 › Crew → Northside
2. 구성원 편성: 아이디 `soldier3`, 유형 정식 → `규정 BR-01`로 거부 (soldier3는 Southside 정식 소속)
3. 같은 구성원을 유형 임시로 편성하면 성공

### BR-05 Capo는 자신이 책임자인 Crew만 편성
1. capo1로 로그인 → 조직 › Crew → Southside
2. 구성원 편성: 아이디 `associate2` → `규정 BR-05`로 거부
3. Northside에서는 편성·제외가 된다

### BR-04 같거나 높은 역할의 구성원은 역할 변경 불가
1. underboss1로 로그인 → 조직 › 구성원 → boss
2. [구성원 관리] → 역할 변경 → `규정 BR-04`로 거부
3. 같은 방법으로 Soldier·Associate의 역할은 바꿀 수 있다

### FR-06 소속 신청과 승인
1. associate2로 로그인 → 사용자 메뉴 → 내 정보 → 내 Crew 소속 신청에서 Southside 신청(대기) 확인
2. capo2로 로그인 → 조직 › Crew → Southside → 소속 신청 → [승인]
3. associate2로 다시 로그인하면 업무 홈의 내 소속과 내 정보에 Southside 정식 소속이 보인다

### FR-03 역할 변경 추천과 승인
1. underboss1로 로그인 → 업무 홈의 처리할 일 '승인 대기 역할 변경 요청' 또는 조직 › 역할 변경 요청
2. capo1이 associate1을 Soldier로 추천한 요청을 [승인]
3. 조직 › 구성원 → associate1 화면에서 역할이 Soldier로 바뀐 것을 확인

### BR-02 정지·탈퇴 구성원은 새 업무에 배정 불가
1. capo1로 로그인 → 업무 › 업무 관리 → 강북 정기 순찰
2. 참여자 배정: 아이디 `suspended1` → `규정 BR-02`로 거부 (정지 상태)

### BR-03 같은 시간대 업무 중복 배정 불가
1. capo1로 로그인 → 업무 › 업무 관리 → [＋ 업무 등록]: 지금부터 1시간짜리 업무
2. 등록된 업무 화면 → 참여자 배정: 아이디 `soldier2` → `규정 BR-03`으로 거부 (지금 진행 중인 물품 운송과 겹침)
3. 시간이 맞닿기만 하면(한 업무의 끝나는 시각 = 다른 업무의 시작 시각) 배정된다

### BR-06 완료된 업무의 핵심 결과는 일반 구성원이 변경 불가
1. capo2로 로그인 → 업무 › 업무 관리 → 상태 '완료' → 강남 정보 수집. 완료와 결과에 "결과와 참여 기록은 잠겨 있다"는 안내만 있고 정정 양식이 없다
2. 서버 검사 확인: Swagger(<http://localhost:9800/api-docs>)에서 capo2로 로그인해 Authorize한 뒤 `PATCH /api/tasks/{taskId}/result`를 강남 정보 수집의 업무 번호(업무 화면의 `업무 #번호`, 처음 상태에서는 3)로 `{"summary": "정정 시도", "reason": "확인"}` 본문과 함께 실행 → 409, `error.code`가 `BR-06`
3. boss로 같은 업무 화면 → 결과 정정에서 사유를 넣어 정정하면 성공하고 정정 이력에 변경 전후가 남는다

### FR-08 업무 교대 요청과 승인
1. capo1로 로그인 → 업무 › 내 업무 → 업무 교대 요청에서 soldier2가 associate1에게 넘기려는 강북 정기 순찰 교대 요청을 [승인]
2. 승인할 때 배정 조건을 다시 확인한 뒤 associate1이 강북 정기 순찰 참여자로 배정된다

### BR-07 사용 중인 자원은 같은 시간대에 중복 배정 불가
1. capo1로 로그인 → 자원 › 공용 자원 → 승합차 2호 (VH-002)
2. 구성원에게 배정: 아이디 `soldier1`, 강북 정기 순찰 일정 안의 시간(시드 다음 날 10:30~11:30) → `규정 BR-07`로 거부 (강북 정기 순찰에 할당됨)
3. 같은 자원을 다음 날 12:00~13:00로 배정하면 성공한다 (맞닿은 시간은 허용)

### BR-08 사용불가·점검중 자원은 새로 배정 불가
1. capo1로 로그인 → 업무 › 업무 관리 → 강북 정기 순찰 → 자원 할당: 관리 번호 `RD-003` → `규정 BR-08`로 거부 (사용불가)
2. 관리 번호 `VH-004`(화물 트럭, 점검중)도 `규정 BR-08`로 거부된다
3. capo3로 로그인 → 자원 › 공용 자원 → 화물 트럭 → 점검을 정상 복구로 완료하면 사용가능이 되어 할당할 수 있다

### FR-15 자원 사용과 반환 이력
1. soldier1로 로그인 → 자원 › 내 자원 → 나에게 배정된 자원의 무전기 2호 [사용 시작] (지금이 배정 시간대)
2. 지금 사용 중인 자원에서 반환 상태 '정상'으로 [반환] → 자원이 사용가능으로 돌아온다
3. capo1로 로그인 → 자원 › 공용 자원 → 무전기 2호 → 사용·반환 이력과 상태 변경 이력에서 확인

### FR-18 완료되지 않은 업무는 평가 불가
1. Swagger에서 capo1로 로그인해 Authorize한 뒤 `POST /api/tasks/{taskId}/evaluations`를 강북 정기 순찰의 업무 번호(처음 상태에서는 1)와 예시 본문으로 실행
2. 계획 상태 업무라 409로 거부된다 (완료된 업무만 평가)
3. capo2로 로그인 → 평가·기록 › 평가 → 작성해야 할 평가 → 강남 정보 수집 [평가하기] → 참여자 평가에서 soldier1을 평가하면 성공한다

### BR-10 평가 이의 제기와 정정 이력
1. boss로 로그인 → 평가·기록 › 평가 → 처리할 이의 제기에서 soldier1이 underboss1에게 받은 강남 정보 수집 평가에 낸 이의(대기)를 '평가 정정'으로 처리한다 (모든 항목 점수 입력)
2. [평가 상세 보기]의 수정·정정 이력에 변경 전후 점수와 사유가 남는다
3. soldier1로 로그인 → 사용자 메뉴 → 내 기록·평판 → 변경 이력에 평가 정정이 시간순으로 추가된다

### BR-10 역할·소속·상태·평가 변경 이력
1. boss로 로그인 → 조직 › 구성원 → associate1 → 변경 이력에서 계정 등록·소속·징계 기록을 시간순으로 확인
2. [구성원 관리]에서 역할을 바꾸면 변경 이력에 이전 역할 → 새 역할과 사유가 바로 추가된다
3. Crew 화면의 편성·책임자 이력과 Crew 활동에서 처리한 사람과 시각을 확인

### BR-09 권한 없는 직접 접근 차단
1. associate1로 로그인 → 왼쪽 메뉴에 구성원이 없다. 주소창에 `/users` 입력 → 403 화면 (보안 기록에 남음)
2. boss로 로그인 → 주소창에 `/admin` 입력 → 403 화면. Swagger에서 boss로 Authorize하고 `GET /api/admin/accounts`를 실행해도 403
3. admin으로 로그인 → 평가·기록 › 감사 기록 → 권한 거부 기록에서 위 시도를 확인. 토큰 없이 API를 호출하면 401

### FR-23 계정 잠금과 역할별 권한 즉시 반영
1. admin으로 로그인 → 시스템 › 시스템 관리 → 계정 보안 현황에서 soldier2를 사유와 함께 [잠금] → soldier2로 로그인하면 "잠긴 계정" 메시지 (확인 후 [잠금 해제])
2. 역할별 권한 → Soldier → `resource.read`의 체크를 빼고 저장 → soldier1로 로그인하면 왼쪽 메뉴에서 공용 자원이 사라지고, 주소창의 `/resources`는 403
3. 기본값이 '허용'인 것만 체크해 다시 저장하면 원래대로 돌아온다

## 5. Swagger에서 확인

1. <http://localhost:9800/api-docs> 를 연다 (왼쪽 메뉴 맨 아래의 API 문서).
2. **인증 → POST /api/auth/login**을 위 계정으로 실행하고, 응답의 `data.accessToken`을 오른쪽 위 **Authorize**에 붙여 넣는다.
3. 모든 API의 Try it out에는 검증을 통과하는 예시 값이 채워져 있어 바로 실행할 수 있다. 각 API 설명 맨 앞의 [ ] 안은 연결된 요구사항 ID이고, 전체 목록은 [API 목록표](api_catalog.md)에 있다.
