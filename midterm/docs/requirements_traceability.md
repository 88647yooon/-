# 요구사항 추적표

The Family 통합 정보시스템(학번 202211207)의 요구사항(Requirement ID)을 그 요구사항을 구현한 API와 코드 위치에 연결한 표입니다.

- 기준 요구사항: `requirements_spec.md`의 58개 (기능 FR 23, 업무 규칙 BR 10, 데이터 DR 6, REST API AR 8, 비기능 NFR 5, 기술 제약 CR 6)
- API와 요구사항의 연결은 [API 목록표](api_catalog.md)의 요구사항 열, Swagger 설명 맨 앞의 [ ]와 같습니다. `(#번호)`는 API 목록표의 번호입니다.
- 확인방법 열은 추후 작성합니다.

## 구현 위치 읽는 법

`routes/userRoutes.js` → `userController.create` → `userService.create` 는 아래 순서로 처리된다는 뜻입니다.

| 순서 | 위치 | 하는 일 |
| --- | --- | --- |
| 1 | `routes/userRoutes.js` | URL·HTTP Method, 권한 검사(`requirePermission`), 입력 검증(`validate`), Swagger 문서 |
| 2 | `userController.create` | `controllers/userController.js`의 `create`. 요청 값을 꺼내 서비스를 부르고 응답 형식을 맞춘다 |
| 3 | `userService.create` | `services/userService.js`의 `create`. 업무 규칙 검사, 트랜잭션, DB 저장, 변경 이력 기록 |

업무 규칙(BR) 행에는 그 규칙을 실제로 지키는 곳을 함께 적었습니다.

- **규칙 검사**: 위반하면 요청을 거부하는 함수 (409 `BR-xx` 또는 403)
- **조회 조건**: 후보·가용 조회에서 규칙에 맞지 않는 대상을 처음부터 빼는 쿼리
- **상태 전환**: 규칙이 적용되는 상태(점검중·사용불가 등)로 바꾸는 함수
- **이력 기록 / 이력 원천**: 변경 이력을 남기는 함수 / 이력을 읽어 오는 저장소

모든 API에 공통으로 인증(`middlewares/authenticate.js`), 권한 검사(`middlewares/authorize.js`), 입력 검증(`middlewares/validate.js`), 오류 응답(`middlewares/errorHandler.js`)이 적용됩니다.

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
| **FR-01**<br>구성원 기본 정보 등록·관리 | PATCH | `/api/me` (#7) | `routes/meRoutes.js` → `meController.updateMe` → `meService.updateMe` |  |
|  | PUT | `/api/me/password` (#8) | `routes/meRoutes.js` → `meController.changePassword` → `meService.changePassword` |  |
|  | POST | `/api/users` (#10) | `routes/userRoutes.js` → `userController.create` → `userService.create` |  |
|  | POST | `/api/users/bulk` (#11) | `routes/userRoutes.js` → `userController.bulkCreate` → `userService.bulkCreate` |  |
|  | GET | `/api/users` (#12) | `routes/userRoutes.js` → `userController.list` → `userService.list` |  |
|  | GET | `/api/users/check-username` (#13) | `routes/userRoutes.js` → `userController.checkUsername` → `userService.checkUsername` |  |
|  | GET | `/api/users/:userId` (#14) | `routes/userRoutes.js` → `userController.get` → `userService.get` |  |
|  | PATCH | `/api/users/:userId` (#15) | `routes/userRoutes.js` → `userController.update` → `userService.update` |  |
|  | DELETE | `/api/users/:userId` (#16) | `routes/userRoutes.js` → `userController.remove` → `userService.remove` |  |
| **FR-02**<br>본인의 소속·역할·상태·활동 확인 | POST | `/api/auth/login` (#1) | `routes/authRoutes.js` → `authController.login` → `authService.login` |  |
|  | GET | `/api/me` (#6) | `routes/meRoutes.js` → `meController.getMe` → `meService.getMe` |  |
|  | GET | `/api/me/permissions` (#9) | `routes/meRoutes.js` → `meController.getPermissions` → `meService.getPermissions` |  |
|  | GET | `/api/users/:userId/memberships` (#19) | `routes/userRoutes.js` → `userController.memberships` → `userService.memberships` |  |
|  | GET | `/api/users/:userId/chain-of-command` (#21) | `routes/userRoutes.js` → `userController.chainOfCommand` → `userService.chainOfCommand` |  |
|  | GET | `/api/me/join-requests` (#50) | `routes/meRoutes.js` → `joinRequestController.listMine` → `joinRequestService.listMine` |  |
|  | GET | `/api/me/dashboard` (#198) | `routes/statsRoutes.js` → `opsController.myDashboard` → `dashboardService.me` |  |
| **FR-03**<br>구성원 역할·상태·소속 변경 | PATCH | `/api/users/:userId/role` (#17) | `routes/userRoutes.js` → `userController.changeRole` → `userService.changeRole` |  |
|  | PATCH | `/api/users/:userId/status` (#18) | `routes/userRoutes.js` → `userController.changeStatus` → `userService.changeStatus` |  |
|  | GET | `/api/roles` (#22) | `routes/referenceRoutes.js` → `userController.roles` → `userService.roles` |  |
|  | POST | `/api/role-change-requests` (#51) | `routes/roleRequestRoutes.js` → `roleRequestController.create` → `roleRequestService.create` |  |
|  | GET | `/api/role-change-requests` (#52) | `routes/roleRequestRoutes.js` → `roleRequestController.list` → `roleRequestService.list` |  |
|  | GET | `/api/role-change-requests/:requestId` (#53) | `routes/roleRequestRoutes.js` → `roleRequestController.get` → `roleRequestService.get` |  |
|  | POST | `/api/role-change-requests/:requestId/approve` (#54) | `routes/roleRequestRoutes.js` → `roleRequestController.approve` → `roleRequestService.approve` |  |
|  | POST | `/api/role-change-requests/:requestId/reject` (#55) | `routes/roleRequestRoutes.js` → `roleRequestController.reject` → `roleRequestService.reject` |  |
| **FR-04**<br>구성원 상태 구분 관리 | PATCH | `/api/users/:userId/status` (#18) | `routes/userRoutes.js` → `userController.changeStatus` → `userService.changeStatus` |  |
|  | GET | `/api/member-statuses` (#23) | `routes/referenceRoutes.js` → `userController.memberStatuses` → `userService.memberStatuses` |  |
| **FR-05**<br>Crew와 책임자·구성원 관리 | GET | `/api/users/:userId/subordinates` (#20) | `routes/userRoutes.js` → `userController.subordinates` → `userService.subordinates` |  |
|  | GET | `/api/users/:userId/chain-of-command` (#21) | `routes/userRoutes.js` → `userController.chainOfCommand` → `userService.chainOfCommand` |  |
|  | POST | `/api/crews` (#24) | `routes/crewRoutes.js` → `crewController.create` → `crewService.create` |  |
|  | GET | `/api/crews` (#25) | `routes/crewRoutes.js` → `crewController.list` → `crewService.list` |  |
|  | GET | `/api/crews/:crewId` (#26) | `routes/crewRoutes.js` → `crewController.get` → `crewService.get` |  |
|  | PATCH | `/api/crews/:crewId` (#27) | `routes/crewRoutes.js` → `crewController.update` → `crewService.update` |  |
|  | DELETE | `/api/crews/:crewId` (#28) | `routes/crewRoutes.js` → `crewController.remove` → `crewService.remove` |  |
|  | PATCH | `/api/crews/:crewId/status` (#29) | `routes/crewRoutes.js` → `crewController.changeStatus` → `crewService.changeStatus` |  |
|  | PUT | `/api/crews/:crewId/capo` (#30) | `routes/crewRoutes.js` → `crewController.assignCapo` → `crewService.assignCapo` |  |
|  | DELETE | `/api/crews/:crewId/capo` (#31) | `routes/crewRoutes.js` → `crewController.removeCapo` → `crewService.removeCapo` |  |
|  | PUT | `/api/crews/:crewId/underboss` (#32) | `routes/crewRoutes.js` → `crewController.assignUnderboss` → `crewService.assignUnderboss` |  |
|  | GET | `/api/crews/:crewId/capo-history` (#33) | `routes/crewRoutes.js` → `crewController.capoHistory` → `crewService.capoHistory` |  |
|  | GET | `/api/crews/:crewId/hierarchy` (#34) | `routes/crewRoutes.js` → `crewController.hierarchy` → `crewService.hierarchy` |  |
|  | GET | `/api/crews/:crewId/members` (#35) | `routes/membershipRoutes.js` → `membershipController.listMembers` → `membershipService.listMembers` |  |
|  | GET | `/api/crews/:crewId/members/:userId` (#36) | `routes/membershipRoutes.js` → `membershipController.getMember` → `membershipService.getMember` |  |
| **FR-06**<br>관리 범위 안의 Crew 편성 변경 | PATCH | `/api/crews/:crewId/status` (#29) | `routes/crewRoutes.js` → `crewController.changeStatus` → `crewService.changeStatus` |  |
|  | POST | `/api/crews/:crewId/members` (#37) | `routes/membershipRoutes.js` → `membershipController.addMember` → `membershipService.addMember` |  |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | `routes/membershipRoutes.js` → `membershipController.bulkAdd` → `membershipService.bulkAdd` |  |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | `routes/membershipRoutes.js` → `membershipController.changeType` → `membershipService.changeType` |  |
|  | DELETE | `/api/crews/:crewId/members/:userId` (#40) | `routes/membershipRoutes.js` → `membershipController.removeMember` → `membershipService.removeMember` |  |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | `routes/membershipRoutes.js` → `membershipController.transfer` → `membershipService.transfer` |  |
|  | GET | `/api/crews/:crewId/candidates` (#42) | `routes/membershipRoutes.js` → `membershipController.candidates` → `membershipService.candidates` |  |
|  | GET | `/api/crews/:crewId/membership-history` (#43) | `routes/membershipRoutes.js` → `membershipController.history` → `membershipService.history` |  |
|  | POST | `/api/crews/merge` (#44) | `routes/membershipRoutes.js` → `membershipController.merge` → `membershipService.merge` |  |
|  | POST | `/api/crews/:crewId/join-requests` (#45) | `routes/joinRequestRoutes.js` → `joinRequestController.apply` → `joinRequestService.apply` |  |
|  | GET | `/api/crews/:crewId/join-requests` (#46) | `routes/joinRequestRoutes.js` → `joinRequestController.listForCrew` → `joinRequestService.listForCrew` |  |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | `routes/joinRequestRoutes.js` → `joinRequestController.approve` → `joinRequestService.approve` |  |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/reject` (#48) | `routes/joinRequestRoutes.js` → `joinRequestController.reject` → `joinRequestService.reject` |  |
|  | DELETE | `/api/crews/:crewId/join-requests/:requestId` (#49) | `routes/joinRequestRoutes.js` → `joinRequestController.cancel` → `joinRequestService.cancel` |  |
|  | GET | `/api/me/join-requests` (#50) | `routes/meRoutes.js` → `joinRequestController.listMine` → `joinRequestService.listMine` |  |
| **FR-07**<br>업무 등록과 일정·중요도·상태 관리 | POST | `/api/task-types` (#56) | `routes/taskTypeRoutes.js` → `taskController.createType` → `taskTypeService.create` |  |
|  | GET | `/api/task-types` (#57) | `routes/taskTypeRoutes.js` → `taskController.listTypes` → `taskTypeService.list` |  |
|  | PATCH | `/api/task-types/:typeId` (#58) | `routes/taskTypeRoutes.js` → `taskController.updateType` → `taskTypeService.update` |  |
|  | DELETE | `/api/task-types/:typeId` (#59) | `routes/taskTypeRoutes.js` → `taskController.removeType` → `taskTypeService.remove` |  |
|  | POST | `/api/tasks` (#60) | `routes/taskRoutes.js` → `taskController.create` → `taskService.create` |  |
|  | GET | `/api/tasks` (#61) | `routes/taskRoutes.js` → `taskController.list` → `taskService.list` |  |
|  | GET | `/api/tasks/:taskId` (#62) | `routes/taskRoutes.js` → `taskController.get` → `taskService.get` |  |
|  | PATCH | `/api/tasks/:taskId` (#63) | `routes/taskRoutes.js` → `taskController.update` → `taskService.update` |  |
|  | DELETE | `/api/tasks/:taskId` (#64) | `routes/taskRoutes.js` → `taskController.remove` → `taskService.remove` |  |
|  | PATCH | `/api/tasks/:taskId/schedule` (#65) | `routes/taskRoutes.js` → `taskController.changeSchedule` → `taskService.changeSchedule` |  |
|  | POST | `/api/tasks/:taskId/duplicate` (#67) | `routes/taskRoutes.js` → `taskController.duplicate` → `taskService.duplicate` |  |
|  | PUT | `/api/tasks/:taskId/requirements` (#69) | `routes/taskRoutes.js` → `taskController.setRequirements` → `taskService.setRequirements` |  |
|  | GET | `/api/tasks/:taskId/requirements` (#70) | `routes/taskRoutes.js` → `taskController.getRequirements` → `taskService.getRequirements` |  |
|  | POST | `/api/tasks/:taskId/checklist` (#75) | `routes/taskContentRoutes.js` → `taskController.addItem` → `taskContentService.addItem` |  |
|  | PATCH | `/api/tasks/:taskId/checklist/:itemId` (#77) | `routes/taskContentRoutes.js` → `taskController.updateItem` → `taskContentService.updateItem` |  |
|  | DELETE | `/api/tasks/:taskId/checklist/:itemId` (#79) | `routes/taskContentRoutes.js` → `taskController.removeItem` → `taskContentService.removeItem` |  |
|  | POST | `/api/tasks/:taskId/dependencies` (#80) | `routes/taskContentRoutes.js` → `taskController.addDependency` → `taskContentService.addDependency` |  |
|  | GET | `/api/tasks/:taskId/dependencies` (#81) | `routes/taskContentRoutes.js` → `taskController.listDependencies` → `taskContentService.listDependencies` |  |
|  | DELETE | `/api/tasks/:taskId/dependencies/:dependsOnId` (#82) | `routes/taskContentRoutes.js` → `taskController.removeDependency` → `taskContentService.removeDependency` |  |
|  | GET | `/api/tasks/:taskId/readiness` (#92) | `routes/taskRoutes.js` → `taskController.readiness` → `taskService.readiness` |  |
| **FR-08**<br>한 업무에 여러 구성원 참여 | POST | `/api/tasks/:taskId/assignees` (#83) | `routes/assignmentRoutes.js` → `taskController.assign` → `assignmentService.assign` |  |
|  | GET | `/api/tasks/:taskId/assignees` (#84) | `routes/assignmentRoutes.js` → `taskController.listAssignees` → `assignmentService.listAssignees` |  |
|  | PATCH | `/api/tasks/:taskId/assignees/:userId` (#85) | `routes/assignmentRoutes.js` → `taskController.changeAssigneeRole` → `assignmentService.changeRole` |  |
|  | DELETE | `/api/tasks/:taskId/assignees/:userId` (#86) | `routes/assignmentRoutes.js` → `taskController.unassign` → `assignmentService.unassign` |  |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | `routes/assignmentRoutes.js` → `taskController.replace` → `assignmentService.replace` |  |
|  | GET | `/api/tasks/:taskId/assignment-history` (#90) | `routes/assignmentRoutes.js` → `taskController.history` → `assignmentService.history` |  |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | `routes/assignmentRoutes.js` → `taskController.createSwap` → `swapService.create` |  |
|  | GET | `/api/swap-requests` (#98) | `routes/swapRoutes.js` → `taskController.listSwaps` → `swapService.list` |  |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | `routes/swapRoutes.js` → `taskController.approveSwap` → `swapService.approve` |  |
|  | POST | `/api/swap-requests/:requestId/reject` (#100) | `routes/swapRoutes.js` → `taskController.rejectSwap` → `swapService.reject` |  |
|  | DELETE | `/api/swap-requests/:requestId` (#101) | `routes/swapRoutes.js` → `taskController.cancelSwap` → `swapService.cancel` |  |
| **FR-09**<br>내게 배정된 업무와 확인할 정보 조회 | POST | `/api/tasks/:taskId/notes` (#71) | `routes/taskContentRoutes.js` → `taskController.createNote` → `taskContentService.createNote` |  |
|  | GET | `/api/tasks/:taskId/notes` (#72) | `routes/taskContentRoutes.js` → `taskController.listNotes` → `taskContentService.listNotes` |  |
|  | PATCH | `/api/tasks/:taskId/notes/:noteId` (#73) | `routes/taskContentRoutes.js` → `taskController.updateNote` → `taskContentService.updateNote` |  |
|  | DELETE | `/api/tasks/:taskId/notes/:noteId` (#74) | `routes/taskContentRoutes.js` → `taskController.deleteNote` → `taskContentService.deleteNote` |  |
|  | GET | `/api/tasks/:taskId/checklist` (#76) | `routes/taskContentRoutes.js` → `taskController.listItems` → `taskContentService.listItems` |  |
|  | PATCH | `/api/tasks/:taskId/assignees/:userId/response` (#88) | `routes/assignmentRoutes.js` → `taskController.respond` → `assignmentService.respond` |  |
|  | GET | `/api/me/tasks` (#94) | `routes/meRoutes.js` → `taskController.myTasks` → `assignmentService.myTasks` |  |
|  | GET | `/api/me/tasks/:taskId` (#95) | `routes/meRoutes.js` → `taskController.myTask` → `assignmentService.myTask` |  |
|  | GET | `/api/me/schedule` (#96) | `routes/meRoutes.js` → `taskController.mySchedule` → `assignmentService.mySchedule` |  |
|  | GET | `/api/me/dashboard` (#198) | `routes/statsRoutes.js` → `opsController.myDashboard` → `dashboardService.me` |  |
| **FR-10**<br>업무 진행 상태 변경과 변경 이력 | PATCH | `/api/tasks/:taskId/status` (#66) | `routes/taskRoutes.js` → `taskController.changeStatus` → `taskService.changeStatus` |  |
|  | GET | `/api/task-statuses` (#68) | `routes/referenceRoutes.js` → `taskController.statuses` → `taskService.statuses` |  |
|  | GET | `/api/tasks/:taskId/checklist` (#76) | `routes/taskContentRoutes.js` → `taskController.listItems` → `taskContentService.listItems` |  |
|  | POST | `/api/tasks/:taskId/checklist/:itemId/check` (#78) | `routes/taskContentRoutes.js` → `taskController.checkItem` → `taskContentService.checkItem` |  |
|  | GET | `/api/tasks/:taskId/assignment-history` (#90) | `routes/assignmentRoutes.js` → `taskController.history` → `assignmentService.history` |  |
|  | POST | `/api/tasks/:taskId/cancel` (#93) | `routes/taskRoutes.js` → `taskController.cancel` → `taskService.cancel` |  |
|  | POST | `/api/tasks/:taskId/complete` (#102) | `routes/taskRoutes.js` → `taskController.complete` → `taskResultService.complete` |  |
|  | POST | `/api/tasks/:taskId/progress` (#107) | `routes/taskRoutes.js` → `taskController.reportProgress` → `taskResultService.reportProgress` |  |
|  | GET | `/api/tasks/:taskId/progress` (#108) | `routes/taskRoutes.js` → `taskController.listProgress` → `taskResultService.listProgress` |  |
|  | GET | `/api/tasks/:taskId/status-history` (#109) | `routes/taskRoutes.js` → `taskController.statusHistory` → `taskService.statusHistory` |  |
| **FR-11**<br>완료 업무의 결과·참여 기록 활용 | POST | `/api/tasks/:taskId/complete` (#102) | `routes/taskRoutes.js` → `taskController.complete` → `taskResultService.complete` |  |
|  | GET | `/api/tasks/:taskId/result` (#103) | `routes/taskRoutes.js` → `taskController.getResult` → `taskResultService.getResult` |  |
|  | PATCH | `/api/tasks/:taskId/result` (#104) | `routes/taskRoutes.js` → `taskController.correctResult` → `taskResultService.correctResult` |  |
|  | PUT | `/api/tasks/:taskId/participations/:userId` (#105) | `routes/taskRoutes.js` → `taskController.recordParticipation` → `taskResultService.recordParticipation` |  |
|  | GET | `/api/tasks/:taskId/participations` (#106) | `routes/taskRoutes.js` → `taskController.listParticipations` → `taskResultService.listParticipations` |  |
|  | GET | `/api/tasks/:taskId/evaluations` (#159) | `routes/evaluationRoutes.js` → `recordController.taskEvaluations` → `evaluationService.listByTask` |  |
| **FR-12**<br>기간·Crew·상태·담당자로 업무 탐색 | GET | `/api/tasks` (#61) | `routes/taskRoutes.js` → `taskController.list` → `taskService.list` |  |
|  | GET | `/api/crews/:crewId/workload` (#197) | `routes/statsRoutes.js` → `opsController.crewWorkload` → `statsService.crewWorkload` |  |
| **FR-13**<br>공용 자원 등록과 상태 관리 | POST | `/api/resource-categories` (#110) | `routes/resourceCategoryRoutes.js` → `resourceController.createCategory` → `resourceCategoryService.create` |  |
|  | GET | `/api/resource-categories` (#111) | `routes/resourceCategoryRoutes.js` → `resourceController.listCategories` → `resourceCategoryService.list` |  |
|  | PATCH | `/api/resource-categories/:categoryId` (#112) | `routes/resourceCategoryRoutes.js` → `resourceController.updateCategory` → `resourceCategoryService.update` |  |
|  | DELETE | `/api/resource-categories/:categoryId` (#113) | `routes/resourceCategoryRoutes.js` → `resourceController.removeCategory` → `resourceCategoryService.remove` |  |
|  | POST | `/api/resources` (#114) | `routes/resourceRoutes.js` → `resourceController.create` → `resourceService.create` |  |
|  | POST | `/api/resources/bulk` (#115) | `routes/resourceRoutes.js` → `resourceController.bulkCreate` → `resourceService.bulkCreate` |  |
|  | GET | `/api/resources` (#116) | `routes/resourceRoutes.js` → `resourceController.list` → `resourceService.list` |  |
|  | GET | `/api/resources/:resourceId` (#118) | `routes/resourceRoutes.js` → `resourceController.get` → `resourceService.get` |  |
|  | PATCH | `/api/resources/:resourceId` (#119) | `routes/resourceRoutes.js` → `resourceController.update` → `resourceService.update` |  |
|  | DELETE | `/api/resources/:resourceId` (#120) | `routes/resourceRoutes.js` → `resourceController.remove` → `resourceService.remove` |  |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | `routes/resourceRoutes.js` → `resourceController.changeStatus` → `resourceService.changeStatus` |  |
| **FR-14**<br>권한·상태에 따른 이용 가능 자원 확인 | GET | `/api/resources/available` (#117) | `routes/resourceRoutes.js` → `resourceController.available` → `resourceService.available` |  |
|  | PATCH | `/api/resources/:resourceId/access-level` (#122) | `routes/resourceRoutes.js` → `resourceController.changeAccessLevel` → `resourceService.changeAccessLevel` |  |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | `routes/taskResourceRoutes.js` → `resourceController.taskCandidates` → `taskResourceService.candidates` |  |
|  | GET | `/api/users/:userId/allocations` (#138) | `routes/resourceAllocationRoutes.js` → `resourceController.userAllocations` → `resourceAllocationService.listByUser` |  |
|  | POST | `/api/resource-requests` (#141) | `routes/resourceRequestRoutes.js` → `resourceController.createRequest` → `resourceRequestService.create` |  |
| **FR-15**<br>자원 사용·반환·상태 변경 이력 | GET | `/api/resources/:resourceId/status-history` (#124) | `routes/resourceRoutes.js` → `resourceController.statusHistory` → `resourceService.statusHistory` |  |
|  | GET | `/api/resources/:resourceId/maintenances` (#126) | `routes/maintenanceRoutes.js` → `resourceController.listMaintenances` → `maintenanceService.listByResource` |  |
|  | GET | `/api/resources/:resourceId/schedule` (#136) | `routes/resourceRoutes.js` → `resourceController.schedule` → `resourceService.schedule` |  |
|  | POST | `/api/resources/:resourceId/checkout` (#147) | `routes/resourceUsageRoutes.js` → `resourceController.checkout` → `resourceUsageService.checkout` |  |
|  | POST | `/api/resources/:resourceId/return` (#148) | `routes/resourceUsageRoutes.js` → `resourceController.returnResource` → `resourceUsageService.returnResource` |  |
|  | POST | `/api/tasks/:taskId/resources/return` (#149) | `routes/taskResourceRoutes.js` → `resourceController.returnTaskResources` → `taskResourceService.returnAll` |  |
|  | GET | `/api/resources/:resourceId/usages` (#150) | `routes/resourceUsageRoutes.js` → `resourceController.usages` → `resourceUsageService.listByResource` |  |
|  | PATCH | `/api/resource-usages/:usageId` (#151) | `routes/resourceUsageRoutes.js` → `resourceController.extendUsage` → `resourceUsageService.extend` |  |
|  | POST | `/api/resource-usages/:usageId/handover` (#152) | `routes/resourceUsageRoutes.js` → `resourceController.handover` → `resourceUsageService.handover` |  |
|  | GET | `/api/resource-usages/overdue` (#154) | `routes/resourceUsageRoutes.js` → `resourceController.overdue` → `resourceUsageService.overdue` |  |
|  | GET | `/api/stats/resources/usage-ranking` (#192) | `routes/statsRoutes.js` → `opsController.usageRanking` → `statsService.usageRanking` |  |
|  | GET | `/api/stats/alerts` (#196) | `routes/statsRoutes.js` → `opsController.alerts` → `statsService.alerts` |  |
| **FR-16**<br>점검·사용불가 자원 구분 관리 | GET | `/api/resources` (#116) | `routes/resourceRoutes.js` → `resourceController.list` → `resourceService.list` |  |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | `routes/resourceRoutes.js` → `resourceController.changeStatus` → `resourceService.changeStatus` |  |
|  | GET | `/api/resource-statuses` (#123) | `routes/referenceRoutes.js` → `resourceController.statuses` → `resourceService.statuses` |  |
|  | POST | `/api/resources/:resourceId/maintenances` (#125) | `routes/maintenanceRoutes.js` → `resourceController.createMaintenance` → `maintenanceService.create` |  |
|  | GET | `/api/resources/:resourceId/maintenances` (#126) | `routes/maintenanceRoutes.js` → `resourceController.listMaintenances` → `maintenanceService.listByResource` |  |
|  | PATCH | `/api/resources/:resourceId/maintenances/:maintenanceId` (#127) | `routes/maintenanceRoutes.js` → `resourceController.updateMaintenance` → `maintenanceService.update` |  |
|  | POST | `/api/resources/:resourceId/maintenances/:maintenanceId/complete` (#128) | `routes/maintenanceRoutes.js` → `resourceController.completeMaintenance` → `maintenanceService.complete` |  |
|  | GET | `/api/maintenances` (#129) | `routes/maintenanceRoutes.js` → `resourceController.openMaintenances` → `maintenanceService.listOpen` |  |
|  | POST | `/api/resources/:resourceId/return` (#148) | `routes/resourceUsageRoutes.js` → `resourceController.returnResource` → `resourceUsageService.returnResource` |  |
|  | POST | `/api/resource-usages/:usageId/damage-reports` (#153) | `routes/resourceUsageRoutes.js` → `resourceController.reportDamage` → `resourceUsageService.reportDamage` |  |
|  | GET | `/api/stats/resources` (#191) | `routes/statsRoutes.js` → `opsController.resources` → `statsService.resources` |  |
|  | GET | `/api/stats/alerts` (#196) | `routes/statsRoutes.js` → `opsController.alerts` → `statsService.alerts` |  |
| **FR-17**<br>업무·구성원에게 자원 배정 | PUT | `/api/tasks/:taskId/requirements` (#69) | `routes/taskRoutes.js` → `taskController.setRequirements` → `taskService.setRequirements` |  |
|  | GET | `/api/tasks/:taskId/requirements` (#70) | `routes/taskRoutes.js` → `taskController.getRequirements` → `taskService.getRequirements` |  |
|  | GET | `/api/tasks/:taskId/readiness` (#92) | `routes/taskRoutes.js` → `taskController.readiness` → `taskService.readiness` |  |
|  | POST | `/api/tasks/:taskId/resources` (#130) | `routes/taskResourceRoutes.js` → `resourceController.allocateToTask` → `taskResourceService.allocate` |  |
|  | GET | `/api/tasks/:taskId/resources` (#131) | `routes/taskResourceRoutes.js` → `resourceController.listTaskResources` → `taskResourceService.list` |  |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | `routes/taskResourceRoutes.js` → `resourceController.adjustTaskResource` → `taskResourceService.adjust` |  |
|  | DELETE | `/api/tasks/:taskId/resources/:resourceId` (#133) | `routes/taskResourceRoutes.js` → `resourceController.releaseTaskResource` → `taskResourceService.release` |  |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | `routes/taskResourceRoutes.js` → `resourceController.taskCandidates` → `taskResourceService.candidates` |  |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | `routes/resourceAllocationRoutes.js` → `resourceController.allocate` → `resourceAllocationService.allocate` |  |
|  | GET | `/api/users/:userId/allocations` (#138) | `routes/resourceAllocationRoutes.js` → `resourceController.userAllocations` → `resourceAllocationService.listByUser` |  |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | `routes/resourceAllocationRoutes.js` → `resourceController.updateAllocation` → `resourceAllocationService.update` |  |
|  | DELETE | `/api/resource-allocations/:allocationId` (#140) | `routes/resourceAllocationRoutes.js` → `resourceController.cancelAllocation` → `resourceAllocationService.cancel` |  |
|  | POST | `/api/resource-requests` (#141) | `routes/resourceRequestRoutes.js` → `resourceController.createRequest` → `resourceRequestService.create` |  |
|  | GET | `/api/resource-requests` (#142) | `routes/resourceRequestRoutes.js` → `resourceController.listRequests` → `resourceRequestService.list` |  |
|  | GET | `/api/resource-requests/:requestId` (#143) | `routes/resourceRequestRoutes.js` → `resourceController.getRequest` → `resourceRequestService.get` |  |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | `routes/resourceRequestRoutes.js` → `resourceController.approveRequest` → `resourceRequestService.approve` |  |
|  | POST | `/api/resource-requests/:requestId/reject` (#145) | `routes/resourceRequestRoutes.js` → `resourceController.rejectRequest` → `resourceRequestService.reject` |  |
|  | DELETE | `/api/resource-requests/:requestId` (#146) | `routes/resourceRequestRoutes.js` → `resourceController.cancelRequest` → `resourceRequestService.cancel` |  |
| **FR-18**<br>평가·평판 기록 | POST | `/api/tasks/:taskId/evaluations` (#158) | `routes/evaluationRoutes.js` → `recordController.createEvaluation` → `evaluationService.create` |  |
|  | GET | `/api/evaluations/pending` (#161) | `routes/evaluationRoutes.js` → `recordController.pendingEvaluations` → `evaluationService.pending` |  |
|  | PATCH | `/api/evaluations/:evaluationId` (#163) | `routes/evaluationRoutes.js` → `recordController.updateEvaluation` → `evaluationService.update` |  |
|  | DELETE | `/api/evaluations/:evaluationId` (#164) | `routes/evaluationRoutes.js` → `recordController.withdrawEvaluation` → `evaluationService.withdraw` |  |
|  | GET | `/api/evaluation-criteria` (#166) | `routes/evaluationRoutes.js` → `recordController.listCriteria` → `evaluationService.listCriteria` |  |
|  | PUT | `/api/evaluation-criteria` (#167) | `routes/evaluationRoutes.js` → `recordController.replaceCriteria` → `evaluationService.replaceCriteria` |  |
|  | POST | `/api/evaluations/:evaluationId/appeals` (#168) | `routes/evaluationRoutes.js` → `recordController.appeal` → `evaluationService.appeal` |  |
|  | POST | `/api/evaluation-appeals/:appealId/resolve` (#170) | `routes/evaluationRoutes.js` → `recordController.resolveAppeal` → `evaluationService.resolveAppeal` |  |
|  | GET | `/api/users/:userId/reputation` (#171) | `routes/reputationRoutes.js` → `recordController.reputation` → `reputationService.summary` |  |
|  | POST | `/api/users/:userId/reputation-events` (#172) | `routes/reputationRoutes.js` → `recordController.recordReputationEvent` → `reputationService.recordEvent` |  |
|  | DELETE | `/api/reputation-events/:eventId` (#174) | `routes/reputationRoutes.js` → `recordController.cancelReputationEvent` → `reputationService.cancelEvent` |  |
|  | GET | `/api/stats/evaluations` (#193) | `routes/statsRoutes.js` → `opsController.evaluations` → `statsService.evaluations` |  |
| **FR-19**<br>권한 범위 안의 활동·평가 이력 조회 | GET | `/api/users/:userId` (#14) | `routes/userRoutes.js` → `userController.get` → `userService.get` |  |
|  | GET | `/api/users/:userId/memberships` (#19) | `routes/userRoutes.js` → `userController.memberships` → `userService.memberships` |  |
|  | GET | `/api/users/:userId/change-history` (#155) | `routes/historyRoutes.js` → `recordController.changeHistory` → `historyService.changeHistory` |  |
|  | GET | `/api/users/:userId/activity` (#156) | `routes/historyRoutes.js` → `recordController.userActivity` → `historyService.userActivity` |  |
|  | GET | `/api/crews/:crewId/activity` (#157) | `routes/historyRoutes.js` → `recordController.crewActivity` → `historyService.crewActivity` |  |
|  | GET | `/api/tasks/:taskId/evaluations` (#159) | `routes/evaluationRoutes.js` → `recordController.taskEvaluations` → `evaluationService.listByTask` |  |
|  | GET | `/api/evaluations` (#160) | `routes/evaluationRoutes.js` → `recordController.searchEvaluations` → `evaluationService.search` |  |
|  | GET | `/api/evaluations/:evaluationId` (#162) | `routes/evaluationRoutes.js` → `recordController.getEvaluation` → `evaluationService.get` |  |
|  | GET | `/api/users/:userId/evaluations` (#165) | `routes/evaluationRoutes.js` → `recordController.userEvaluations` → `evaluationService.listForUser` |  |
|  | GET | `/api/evaluation-appeals` (#169) | `routes/evaluationRoutes.js` → `recordController.listAppeals` → `evaluationService.listAppeals` |  |
|  | GET | `/api/users/:userId/reputation` (#171) | `routes/reputationRoutes.js` → `recordController.reputation` → `reputationService.summary` |  |
|  | GET | `/api/users/:userId/reputation-events` (#173) | `routes/reputationRoutes.js` → `recordController.reputationEvents` → `reputationService.listEvents` |  |
| **FR-20**<br>중요 상태 변경·관리 활동 기록 | GET | `/api/audit-logs` (#176) | `routes/auditRoutes.js` → `recordController.auditLogs` → `auditLogService.search` |  |
|  | GET | `/api/audit-logs/:logId` (#177) | `routes/auditRoutes.js` → `recordController.auditLog` → `auditLogService.get` |  |
|  | GET | `/api/audit-logs/export` (#178) | `routes/auditRoutes.js` → `recordController.exportAuditLogs` → `auditLogService.exportCsv` |  |
|  | GET | `/api/stats/admin-activity` (#195) | `routes/statsRoutes.js` → `opsController.adminActivity` → `statsService.adminActivity` |  |
|  | - | 모든 상태 변경 API | `services/auditService.js` `record` → `models/mongo/ActivityLog.js` (activity_logs). 로그인 이력 `recordLogin` → `LoginHistory`, 권한 거부 `recordAccessDenied` → `SecurityEvent` |  |
| **FR-21**<br>권한 범위 안의 검색·조건 조회 | GET | `/api/users` (#12) | `routes/userRoutes.js` → `userController.list` → `userService.list` |  |
|  | GET | `/api/crews` (#25) | `routes/crewRoutes.js` → `crewController.list` → `crewService.list` |  |
|  | GET | `/api/resources` (#116) | `routes/resourceRoutes.js` → `resourceController.list` → `resourceService.list` |  |
|  | GET | `/api/evaluations` (#160) | `routes/evaluationRoutes.js` → `recordController.searchEvaluations` → `evaluationService.search` |  |
|  | GET | `/api/search` (#180) | `routes/searchRoutes.js` → `opsController.search` → `searchService.search` |  |
|  | POST | `/api/saved-searches` (#181) | `routes/searchRoutes.js` → `opsController.saveSearch` → `searchService.save` |  |
|  | GET | `/api/saved-searches` (#182) | `routes/searchRoutes.js` → `opsController.listSavedSearches` → `searchService.list` |  |
|  | GET | `/api/saved-searches/:searchId/results` (#183) | `routes/searchRoutes.js` → `opsController.runSavedSearch` → `searchService.run` |  |
|  | DELETE | `/api/saved-searches/:searchId` (#184) | `routes/searchRoutes.js` → `opsController.removeSavedSearch` → `searchService.remove` |  |
| **FR-22**<br>운영 현황 확인 | GET | `/api/crews/:crewId/activity` (#157) | `routes/historyRoutes.js` → `recordController.crewActivity` → `historyService.crewActivity` |  |
|  | GET | `/api/reputation/rankings` (#175) | `routes/reputationRoutes.js` → `recordController.rankings` → `reputationService.rankings` |  |
|  | GET | `/api/stats/overview` (#185) | `routes/statsRoutes.js` → `opsController.overview` → `statsService.overview` |  |
|  | GET | `/api/stats/members` (#186) | `routes/statsRoutes.js` → `opsController.members` → `statsService.members` |  |
|  | GET | `/api/stats/crews` (#187) | `routes/statsRoutes.js` → `opsController.crews` → `statsService.crews` |  |
|  | GET | `/api/stats/regions` (#188) | `routes/statsRoutes.js` → `opsController.regions` → `statsService.regions` |  |
|  | GET | `/api/stats/tasks` (#189) | `routes/statsRoutes.js` → `opsController.taskTrend` → `statsService.taskTrend` |  |
|  | GET | `/api/stats/tasks/lead-time` (#190) | `routes/statsRoutes.js` → `opsController.leadTimes` → `statsService.leadTimes` |  |
|  | GET | `/api/stats/resources` (#191) | `routes/statsRoutes.js` → `opsController.resources` → `statsService.resources` |  |
|  | GET | `/api/stats/resources/usage-ranking` (#192) | `routes/statsRoutes.js` → `opsController.usageRanking` → `statsService.usageRanking` |  |
|  | GET | `/api/stats/evaluations` (#193) | `routes/statsRoutes.js` → `opsController.evaluations` → `statsService.evaluations` |  |
|  | GET | `/api/stats/membership-changes` (#194) | `routes/statsRoutes.js` → `opsController.membershipChanges` → `statsService.membershipChanges` |  |
|  | GET | `/api/stats/admin-activity` (#195) | `routes/statsRoutes.js` → `opsController.adminActivity` → `statsService.adminActivity` |  |
|  | GET | `/api/stats/alerts` (#196) | `routes/statsRoutes.js` → `opsController.alerts` → `statsService.alerts` |  |
|  | GET | `/api/crews/:crewId/workload` (#197) | `routes/statsRoutes.js` → `opsController.crewWorkload` → `statsService.crewWorkload` |  |
| **FR-23**<br>계정·권한 관리 | GET | `/api/audit-logs` (#176) | `routes/auditRoutes.js` → `recordController.auditLogs` → `auditLogService.search` |  |
|  | GET | `/api/admin/accounts` (#199) | `routes/adminRoutes.js` → `opsController.accounts` → `adminService.accounts` |  |
|  | PUT | `/api/admin/accounts/:userId/lock` (#200) | `routes/adminRoutes.js` → `opsController.lock` → `adminService.lock` |  |
|  | DELETE | `/api/admin/accounts/:userId/lock` (#201) | `routes/adminRoutes.js` → `opsController.unlock` → `adminService.unlock` |  |
|  | POST | `/api/admin/accounts/:userId/password-reset` (#202) | `routes/adminRoutes.js` → `opsController.resetPassword` → `adminService.resetPassword` |  |
|  | DELETE | `/api/admin/accounts/:userId/sessions` (#203) | `routes/adminRoutes.js` → `opsController.forceLogout` → `adminService.forceLogout` |  |
|  | GET | `/api/admin/login-history` (#204) | `routes/adminRoutes.js` → `opsController.loginHistory` → `adminService.loginHistory` |  |
|  | GET | `/api/admin/permissions` (#205) | `routes/adminRoutes.js` → `opsController.permissions` → `adminService.permissions` |  |
|  | PUT | `/api/admin/permissions/:role` (#206) | `routes/adminRoutes.js` → `opsController.setRolePermissions` → `adminService.setRolePermissions` |  |
|  | GET | `/api/admin/settings` (#207) | `routes/adminRoutes.js` → `opsController.settings` → `adminService.getSettings` |  |
|  | PUT | `/api/admin/settings` (#208) | `routes/adminRoutes.js` → `opsController.updateSettings` → `adminService.updateSettings` |  |
|  | GET | `/api/admin/health` (#210) | `routes/adminRoutes.js` → `opsController.health` → `adminService.health` |  |

## 2. 업무 규칙 (BR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **BR-01**<br>정식 소속은 한 Crew만 | PUT | `/api/crews/:crewId/capo` (#30) | `routes/crewRoutes.js` → `crewController.assignCapo` → `crewService.assignCapo`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | POST | `/api/crews/:crewId/members` (#37) | `routes/membershipRoutes.js` → `membershipController.addMember` → `membershipService.addMember`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | `routes/membershipRoutes.js` → `membershipController.bulkAdd` → `membershipService.bulkAdd`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | `routes/membershipRoutes.js` → `membershipController.changeType` → `membershipService.changeType`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | `routes/membershipRoutes.js` → `membershipController.transfer` → `membershipService.transfer`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | GET | `/api/crews/:crewId/candidates` (#42) | `routes/membershipRoutes.js` → `membershipController.candidates` → `membershipService.candidates`<br>조회 조건: `userModel.searchCandidates` (정식 편성 후보에서 다른 Crew 정식 소속자 제외) |  |
|  | POST | `/api/crews/merge` (#44) | `routes/membershipRoutes.js` → `membershipController.merge` → `membershipService.merge`<br>규칙 검사: `enrollment.insertMembership` → `translateDuplicate` (crew_memberships 유니크 인덱스 위반을 BR-01로 변환) |  |
|  | POST | `/api/crews/:crewId/join-requests` (#45) | `routes/joinRequestRoutes.js` → `joinRequestController.apply` → `joinRequestService.apply`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | `routes/joinRequestRoutes.js` → `joinRequestController.approve` → `joinRequestService.approve`<br>규칙 검사: `enrollment.assertNoRegularMembership` |  |
|  | GET | `/api/admin/integrity-check` (#209) | `routes/adminRoutes.js` → `opsController.integrityCheck` → `adminService.integrityCheck`<br>무결성 점검: `integrityModel.multipleRegularMemberships` |  |
|  | - | 공통 (편성 모듈·DB 제약) | `services/enrollment.js` `assertNoRegularMembership`·`checkEnroll` (편성·이동·병합·신청 승인·책임자 지정이 모두 거침), `models/sql/schema.js` crew_memberships의 `uq_membership_active_regular` 유니크 인덱스 (동시 요청 차단) |  |
| **BR-02**<br>정지·탈퇴 구성원은 새 업무 배정 불가 | POST | `/api/tasks/:taskId/assignees` (#83) | `routes/assignmentRoutes.js` → `taskController.assign` → `assignmentService.assign`<br>규칙 검사: `assignmentRules.checkAssignable` |  |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | `routes/assignmentRoutes.js` → `taskController.replace` → `assignmentService.replace`<br>규칙 검사: `assignmentRules.checkAssignable` |  |
|  | GET | `/api/tasks/:taskId/assignee-candidates` (#89) | `routes/assignmentRoutes.js` → `taskController.candidates` → `assignmentService.candidates`<br>조회 조건: `userModel.searchAssignable` (활동중인 구성원만) |  |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | `routes/assignmentRoutes.js` → `taskController.createSwap` → `swapService.create`<br>규칙 검사: `assignmentRules.checkAssignable` |  |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | `routes/swapRoutes.js` → `taskController.approveSwap` → `swapService.approve`<br>규칙 검사: `assignmentRules.checkAssignable` |  |
|  | - | 공통 (배정 규칙) | `services/assignmentRules.js` `checkAssignable` (배정·교체·교대 승인이 모두 거침) |  |
| **BR-03**<br>같은 시간대 업무 중복 배정 불가 | PATCH | `/api/tasks/:taskId/schedule` (#65) | `routes/taskRoutes.js` → `taskController.changeSchedule` → `taskService.changeSchedule`<br>규칙 검사: `taskService.changeSchedule` (참여자마다 `taskAssigneeModel.findOverlaps`로 새 일정과 겹치는 업무 확인) |  |
|  | POST | `/api/tasks/:taskId/assignees` (#83) | `routes/assignmentRoutes.js` → `taskController.assign` → `assignmentService.assign`<br>규칙 검사: `assignmentRules.assertNoOverlap` |  |
|  | POST | `/api/tasks/:taskId/assignees/:userId/replacement` (#87) | `routes/assignmentRoutes.js` → `taskController.replace` → `assignmentService.replace`<br>규칙 검사: `assignmentRules.assertNoOverlap` |  |
|  | GET | `/api/tasks/:taskId/assignee-candidates` (#89) | `routes/assignmentRoutes.js` → `taskController.candidates` → `assignmentService.candidates`<br>조회 조건: `userModel.searchAssignable` (업무 시간대에 끝나지 않은 다른 업무가 없는 구성원만) |  |
|  | GET | `/api/users/:userId/availability` (#91) | `routes/userRoutes.js` → `taskController.availability` → `assignmentService.availability`<br>겹침 조회: `taskAssigneeModel.findOverlaps` |  |
|  | POST | `/api/tasks/:taskId/swap-requests` (#97) | `routes/assignmentRoutes.js` → `taskController.createSwap` → `swapService.create`<br>규칙 검사: `assignmentRules.assertNoOverlap` |  |
|  | POST | `/api/swap-requests/:requestId/approve` (#99) | `routes/swapRoutes.js` → `taskController.approveSwap` → `swapService.approve`<br>규칙 검사: `assignmentRules.assertNoOverlap` |  |
|  | GET | `/api/admin/integrity-check` (#209) | `routes/adminRoutes.js` → `opsController.integrityCheck` → `adminService.integrityCheck`<br>무결성 점검: `integrityModel.overlappingAssignments` |  |
|  | - | 공통 (배정 규칙) | `services/assignmentRules.js` `assertNoOverlap` → `taskAssigneeModel.findOverlaps`, 같은 구성원의 배정 변경은 구성원 행 잠금(`FOR UPDATE`)으로 순서대로 처리 |  |
| **BR-04**<br>자신보다 높은 역할의 역할 변경 불가 | PATCH | `/api/users/:userId/role` (#17) | `routes/userRoutes.js` → `userController.changeRole` → `userService.changeRole`<br>규칙 검사: `accessService.assertCanChangeRole` |  |
|  | POST | `/api/role-change-requests` (#51) | `routes/roleRequestRoutes.js` → `roleRequestController.create` → `roleRequestService.create`<br>규칙 검사: `roleRequestService.create` (`accessService.outranks`로 요청자와 대상의 역할 순위 비교) |  |
|  | POST | `/api/role-change-requests/:requestId/approve` (#54) | `routes/roleRequestRoutes.js` → `roleRequestController.approve` → `roleRequestService.approve`<br>규칙 검사: `accessService.assertCanChangeRole` |  |
|  | - | 공통 (역할 순위 검사) | `services/accessService.js` `assertCanChangeRole`·`outranks` (구성원 정보 수정·상태 변경·공로·징계도 `assertCanManageUser`로 같은 순위 규칙 적용) |  |
| **BR-05**<br>관리하지 않는 Crew의 편성 변경 불가 | POST | `/api/crews/:crewId/members` (#37) | `routes/membershipRoutes.js` → `membershipController.addMember` → `membershipService.addMember`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | POST | `/api/crews/:crewId/members/bulk` (#38) | `routes/membershipRoutes.js` → `membershipController.bulkAdd` → `membershipService.bulkAdd`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | PATCH | `/api/crews/:crewId/members/:userId` (#39) | `routes/membershipRoutes.js` → `membershipController.changeType` → `membershipService.changeType`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | DELETE | `/api/crews/:crewId/members/:userId` (#40) | `routes/membershipRoutes.js` → `membershipController.removeMember` → `membershipService.removeMember`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | POST | `/api/crews/:crewId/members/:userId/transfer` (#41) | `routes/membershipRoutes.js` → `membershipController.transfer` → `membershipService.transfer`<br>권한 키: `crew.members.transfer` (Underboss·Boss만, `config/permissions.js`) — Capo는 다른 Crew로 이동시킬 수 없음 |  |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/approve` (#47) | `routes/joinRequestRoutes.js` → `joinRequestController.approve` → `joinRequestService.approve`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | POST | `/api/crews/:crewId/join-requests/:requestId/reject` (#48) | `routes/joinRequestRoutes.js` → `joinRequestController.reject` → `joinRequestService.reject`<br>규칙 검사: `accessService.assertCanManageCrew` |  |
|  | - | 공통 (관리 범위 검사) | `services/accessService.js` `assertCanManageCrew`·`assertCanManageUser` (Capo는 자신이 책임자인 Crew만) |  |
| **BR-06**<br>완료 업무의 핵심 결과 변경 불가 | PATCH | `/api/tasks/:taskId` (#63) | `routes/taskRoutes.js` → `taskController.update` → `taskService.update`<br>규칙 검사: `taskAccess.assertTaskOpen` |  |
|  | POST | `/api/tasks/:taskId/checklist` (#75) | `routes/taskContentRoutes.js` → `taskController.addItem` → `taskContentService.addItem`<br>규칙 검사: `taskAccess.assertTaskOpen` |  |
|  | POST | `/api/tasks/:taskId/checklist/:itemId/check` (#78) | `routes/taskContentRoutes.js` → `taskController.checkItem` → `taskContentService.checkItem`<br>규칙 검사: `taskAccess.assertTaskOpen` |  |
|  | POST | `/api/tasks/:taskId/cancel` (#93) | `routes/taskRoutes.js` → `taskController.cancel` → `taskService.cancel`<br>규칙 검사: `taskAccess.assertTaskOpen` |  |
|  | POST | `/api/tasks/:taskId/complete` (#102) | `routes/taskRoutes.js` → `taskController.complete` → `taskResultService.complete`<br>규칙 검사: `taskResultService.complete` (이미 완료된 업무는 다시 완료할 수 없음) |  |
|  | PATCH | `/api/tasks/:taskId/result` (#104) | `routes/taskRoutes.js` → `taskController.correctResult` → `taskResultService.correctResult`<br>규칙 검사: `taskResultService.correctResult` (Underboss·Boss가 아니면 거부) |  |
|  | PUT | `/api/tasks/:taskId/participations/:userId` (#105) | `routes/taskRoutes.js` → `taskController.recordParticipation` → `taskResultService.recordParticipation`<br>규칙 검사: `taskResultService.recordParticipation` (완료된 업무의 참여 기록은 Underboss·Boss만 정정) |  |
|  | POST | `/api/tasks/:taskId/progress` (#107) | `routes/taskRoutes.js` → `taskController.reportProgress` → `taskResultService.reportProgress`<br>규칙 검사: `taskResultService.reportProgress` (완료된 업무에는 진행 보고 불가) |  |
|  | - | 공통 (완료 업무 잠금) | `services/taskAccess.js` `assertTaskOpen` (업무 내용·일정·배정·체크리스트·자원 할당을 바꾸는 API가 모두 호출), 결과·참여 기록 정정은 `taskResultService` (Underboss·Boss만) |  |
| **BR-07**<br>사용 중인 자원의 같은 시간대 중복 배정 불가 | PATCH | `/api/tasks/:taskId/schedule` (#65) | `routes/taskRoutes.js` → `taskController.changeSchedule` → `taskService.changeSchedule`<br>규칙 검사: `taskResourceService.rescheduleForTask` |  |
|  | GET | `/api/resources/available` (#117) | `routes/resourceRoutes.js` → `resourceController.available` → `resourceService.available`<br>조회 조건: `resourceModel.searchAvailable` (그 시간대 예약·사용이 없는 자원만) |  |
|  | POST | `/api/tasks/:taskId/resources` (#130) | `routes/taskResourceRoutes.js` → `resourceController.allocateToTask` → `taskResourceService.allocate`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | `routes/taskResourceRoutes.js` → `resourceController.adjustTaskResource` → `taskResourceService.adjust`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | `routes/taskResourceRoutes.js` → `resourceController.taskCandidates` → `taskResourceService.candidates`<br>조회 조건: `resourceModel.searchTaskCandidates` (업무 시간대가 비어 있는 자원만) |  |
|  | GET | `/api/resources/:resourceId/availability` (#135) | `routes/resourceRoutes.js` → `resourceController.availability` → `resourceService.availability`<br>겹침 조회: `resourceScheduleModel.findConflicts` |  |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | `routes/resourceAllocationRoutes.js` → `resourceController.allocate` → `resourceAllocationService.allocate`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | `routes/resourceAllocationRoutes.js` → `resourceController.updateAllocation` → `resourceAllocationService.update`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | POST | `/api/resource-requests` (#141) | `routes/resourceRequestRoutes.js` → `resourceController.createRequest` → `resourceRequestService.create`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | `routes/resourceRequestRoutes.js` → `resourceController.approveRequest` → `resourceRequestService.approve`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | PATCH | `/api/resource-usages/:usageId` (#151) | `routes/resourceUsageRoutes.js` → `resourceController.extendUsage` → `resourceUsageService.extend`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | POST | `/api/resource-usages/:usageId/handover` (#152) | `routes/resourceUsageRoutes.js` → `resourceController.handover` → `resourceUsageService.handover`<br>규칙 검사: `resourceRules.assertNoConflict` |  |
|  | GET | `/api/admin/integrity-check` (#209) | `routes/adminRoutes.js` → `opsController.integrityCheck` → `adminService.integrityCheck`<br>무결성 점검: `integrityModel.overlappingReservations` |  |
|  | - | 공통 (자원 예약 규칙) | `services/resourceRules.js` `assertNoConflict` → `resourceScheduleModel.findConflicts`, 같은 자원의 예약 변경은 자원 행 잠금(`lockResources`)으로 순서대로 처리 |  |
| **BR-08**<br>사용 불가 자원의 새 배정 불가 | GET | `/api/resources/available` (#117) | `routes/resourceRoutes.js` → `resourceController.available` → `resourceService.available`<br>조회 조건: `resourceModel.searchAvailable` (점검중·사용불가 제외) |  |
|  | PATCH | `/api/resources/:resourceId/status` (#121) | `routes/resourceRoutes.js` → `resourceController.changeStatus` → `resourceService.changeStatus`<br>상태 전환: `resourceModel.setStatus`, 영향받는 예약 안내 `resourceService.upcomingReservations` |  |
|  | GET | `/api/resource-statuses` (#123) | `routes/referenceRoutes.js` → `resourceController.statuses` → `resourceService.statuses`<br>상태 정의: `config/constants.js` `RESOURCE_STATUS_INFO` (상태별 배정 가능 여부) |  |
|  | POST | `/api/resources/:resourceId/maintenances` (#125) | `routes/maintenanceRoutes.js` → `resourceController.createMaintenance` → `maintenanceService.create`<br>상태 전환: `maintenanceService.openMaintenance` (점검중으로 바꿈) |  |
|  | POST | `/api/tasks/:taskId/resources` (#130) | `routes/taskResourceRoutes.js` → `resourceController.allocateToTask` → `taskResourceService.allocate`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | PATCH | `/api/tasks/:taskId/resources/:resourceId` (#132) | `routes/taskResourceRoutes.js` → `resourceController.adjustTaskResource` → `taskResourceService.adjust`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | GET | `/api/tasks/:taskId/resource-candidates` (#134) | `routes/taskResourceRoutes.js` → `resourceController.taskCandidates` → `taskResourceService.candidates`<br>조회 조건: `resourceModel.searchTaskCandidates` (점검중·사용불가 제외) |  |
|  | GET | `/api/resources/:resourceId/availability` (#135) | `routes/resourceRoutes.js` → `resourceController.availability` → `resourceService.availability`<br>상태 확인: `resourceService.availability` (배정 가능 상태인지) |  |
|  | POST | `/api/resources/:resourceId/allocations` (#137) | `routes/resourceAllocationRoutes.js` → `resourceController.allocate` → `resourceAllocationService.allocate`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | PATCH | `/api/resource-allocations/:allocationId` (#139) | `routes/resourceAllocationRoutes.js` → `resourceController.updateAllocation` → `resourceAllocationService.update`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | POST | `/api/resource-requests` (#141) | `routes/resourceRequestRoutes.js` → `resourceController.createRequest` → `resourceRequestService.create`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | POST | `/api/resource-requests/:requestId/approve` (#144) | `routes/resourceRequestRoutes.js` → `resourceController.approveRequest` → `resourceRequestService.approve`<br>규칙 검사: `resourceRules.assertAssignable` |  |
|  | POST | `/api/resource-usages/:usageId/damage-reports` (#153) | `routes/resourceUsageRoutes.js` → `resourceController.reportDamage` → `resourceUsageService.reportDamage`<br>상태 전환: `maintenanceService.openMaintenance` (고장 신고 → 점검중) |  |
|  | - | 공통 (자원 상태 규칙) | `services/resourceRules.js` `assertAssignable`, 상태별 배정 가능 여부 `config/constants.js` `RESOURCE_STATUS_INFO` |  |
| **BR-09**<br>권한 없는 직접 URL 접근 차단 | GET | `/api/security-events` (#179) | `routes/auditRoutes.js` → `recordController.securityEvents` → `auditLogService.securityEvents`<br>거부 기록: `middlewares/errorHandler.js` → `auditService.recordAccessDenied` (security_events) |  |
|  | - | 모든 API (`/api/*`) | `middlewares/authenticate.js` `authenticate` → `middlewares/authorize.js` `requirePermission` (권한 키 `config/permissions.js`, 역할별 변경 `services/permissionService.js`) — 라우트마다 서버에서 다시 검사 |  |
|  | - | 웹 화면 | `routes/webRoutes.js` (API와 같은 권한 키) → `middlewares/web.js` `requireLogin`·`webErrorHandler` (403 화면, 거부 기록) |  |
| **BR-10**<br>역할·소속·상태·평가 변경 이력 보존 | GET | `/api/users/:userId/memberships` (#19) | `routes/userRoutes.js` → `userController.memberships` → `userService.memberships`<br>이력 원천: `membershipModel.searchByUser` (crew_memberships, 종료된 소속 포함) |  |
|  | GET | `/api/crews/:crewId/capo-history` (#33) | `routes/crewRoutes.js` → `crewController.capoHistory` → `crewService.capoHistory`<br>이력 원천: `capoTermModel.searchByCrew` (crew_capo_terms) |  |
|  | GET | `/api/crews/:crewId/membership-history` (#43) | `routes/membershipRoutes.js` → `membershipController.history` → `membershipService.history`<br>이력 원천: `membershipModel.searchHistoryByCrew` (crew_memberships) |  |
|  | GET | `/api/users/:userId/change-history` (#155) | `routes/historyRoutes.js` → `recordController.changeHistory` → `historyService.changeHistory`<br>이력 원천: `ActivityLog` (MongoDB activity_logs) |  |
|  | GET | `/api/evaluations/:evaluationId` (#162) | `routes/evaluationRoutes.js` → `recordController.getEvaluation` → `evaluationService.get`<br>수정·정정 이력: `Evaluation.revisions` (MongoDB evaluations) |  |
|  | PATCH | `/api/evaluations/:evaluationId` (#163) | `routes/evaluationRoutes.js` → `recordController.updateEvaluation` → `evaluationService.update`<br>이력 기록: `auditService.record` (MongoDB activity_logs) + 평가 수정·정정 이력 `Evaluation.revisions` |  |
|  | DELETE | `/api/evaluations/:evaluationId` (#164) | `routes/evaluationRoutes.js` → `recordController.withdrawEvaluation` → `evaluationService.withdraw`<br>이력 기록: `auditService.record` (MongoDB activity_logs) |  |
|  | POST | `/api/evaluations/:evaluationId/appeals` (#168) | `routes/evaluationRoutes.js` → `recordController.appeal` → `evaluationService.appeal`<br>이력 기록: `auditService.record` (MongoDB activity_logs) |  |
|  | POST | `/api/evaluation-appeals/:appealId/resolve` (#170) | `routes/evaluationRoutes.js` → `recordController.resolveAppeal` → `evaluationService.resolveAppeal`<br>이력 기록: `auditService.record` (MongoDB activity_logs) + 평가 수정·정정 이력 `Evaluation.revisions` |  |
|  | POST | `/api/users/:userId/reputation-events` (#172) | `routes/reputationRoutes.js` → `recordController.recordReputationEvent` → `reputationService.recordEvent`<br>이력 기록: `auditService.record` (MongoDB activity_logs) |  |
|  | DELETE | `/api/reputation-events/:eventId` (#174) | `routes/reputationRoutes.js` → `recordController.cancelReputationEvent` → `reputationService.cancelEvent`<br>이력 기록: `auditService.record` (MongoDB activity_logs) |  |
|  | GET | `/api/stats/membership-changes` (#194) | `routes/statsRoutes.js` → `opsController.membershipChanges` → `statsService.membershipChanges`<br>이력 집계: `statsModel.membershipChanges` (crew_memberships) |  |
|  | - | 공통 (변경 이력 기록) | `services/auditService.js` `record` → `models/mongo/ActivityLog.js` (activity_logs), 소속·책임자 이력 `crew_memberships`·`crew_capo_terms` 테이블, 평가 수정 이력 `models/mongo/Evaluation.js` revisions |  |

## 3. 데이터 요구사항 (DR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **DR-01**<br>계정·권한·구성원·Crew 소속·상태 관계의 일관성 | GET | `/api/admin/integrity-check` (#209) | `routes/adminRoutes.js` → `opsController.integrityCheck` → `adminService.integrityCheck`<br>무결성 점검: `integrityModel.capoNotRegularMember`, `integrityModel.multipleRegularMemberships` |  |
|  | - | 공통 (스키마·트랜잭션) | `models/sql/schema.js` users·sessions·crews·crew_memberships·crew_capo_terms·role_permission_overrides의 외래 키·유니크 인덱스, `config/database.js` `withTransaction` + 행 잠금, `services/enrollment.js` |  |
| **DR-02**<br>업무와 참여 구성원의 관계 | - | 업무 참여자 조회 API (#84, #94, #106) | `models/sql/schema.js` tasks·task_assignees·task_participations·task_swap_requests 테이블, `models/sql/taskAssigneeModel.js` |  |
| **DR-03**<br>자원의 현재 상태와 사용 이력 | GET | `/api/resources/:resourceId/usages` (#150) | `routes/resourceUsageRoutes.js` → `resourceController.usages` → `resourceUsageService.listByResource` |  |
|  | - | 공통 (자원 상태·이력 저장) | `models/sql/schema.js` resources(현재 상태)·resource_usages·resource_allocations·task_resources·resource_maintenances 테이블, 상태 변경 이력은 `auditService.record` → activity_logs |  |
| **DR-04**<br>활동·상태 변경·기록·평가 정보 저장 | - | 이력·평가 조회 API (#155~#157, #160, #176) | `models/mongo/` ActivityLog(activity_logs)·Evaluation(evaluations)·EvaluationAppeal·ReputationEvent·TaskProgress·LoginHistory·SecurityEvent·SavedSearch 컬렉션 |  |
| **DR-05**<br>데이터 특성에 따른 SQL·MongoDB 사용 | - | - | SQL: `models/sql/schema.js` (관계·제약이 중요한 계정·조직·업무·자원 25개 테이블), MongoDB: `models/mongo/` (시간에 따라 쌓이는 기록·평가 9개 컬렉션), 연결 `config/database.js` |  |
| **DR-06**<br>학번이 들어간 DB 이름과 직접 설계한 구조 | - | - | DB 이름 `config/index.js` (MySQL·MongoDB 모두 `family_202211207`), 테이블 `models/sql/schema.js`, 컬렉션 `models/mongo/*.js` |  |

## 4. REST API 요구사항 (AR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **AR-01**<br>목적에 맞는 HTTP Method | - | 모든 API (210개) | `routes/*.js` (조회 GET, 생성과 승인·완료 같은 동작 POST, 일부 수정 PATCH, 지정·전체 교체 PUT, 삭제 DELETE), API별 Method `docs/api_catalog.md` |  |
| **AR-02**<br>Path·Query·Header·Body의 목적에 맞는 사용 | - | 모든 API | 데이터 위치 규칙 `docs/api_catalog.md` 2장 (대상 ID는 Path, 필터·정렬·페이지는 Query, 토큰은 Header, 입력 데이터는 Body), 검증 `middlewares/validate.js` `validate` + `routes/rules.js`, 인증 헤더 `Authorization: Bearer` → `middlewares/authenticate.js` |  |
| **AR-03**<br>필터링·정렬·검색·페이지 조회 | GET | `/api/users` (#12) | `routes/userRoutes.js` → `userController.list` → `userService.list` |  |
|  | GET | `/api/tasks` (#61) | `routes/taskRoutes.js` → `taskController.list` → `taskService.list` |  |
|  | GET | `/api/resources` (#116) | `routes/resourceRoutes.js` → `resourceController.list` → `resourceService.list` |  |
|  | GET | `/api/evaluations` (#160) | `routes/evaluationRoutes.js` → `recordController.searchEvaluations` → `evaluationService.search` |  |
|  | - | 목록 조회 API 공통 | 페이지·정렬 규칙 `routes/rules.js` `paging`·`SORTS`, 페이지 정보 `utils/pagination.js` `pageMeta` |  |
| **AR-04**<br>잘못된 입력·없는 대상·권한 부족·규칙 위반 처리 | - | 모든 API | 입력 오류 400 `middlewares/validate.js`, 인증 401 `middlewares/authenticate.js`, 권한 403 `middlewares/authorize.js`, 없음 404·규칙 위반 409 `utils/errors.js` (`notFound`·`ruleViolation`), 응답 변환 `middlewares/errorHandler.js` |  |
| **AR-05**<br>일관된 요청·응답·오류 형식 | - | 모든 API | 성공 `utils/response.js` (`ok`·`okPage`·`created`), 실패 `middlewares/errorHandler.js` + `utils/errors.js` (`AppError`) |  |
| **AR-06**<br>200개 이상의 REST API | - | 모든 API (210개) | `routes/index.js` (라우터 등록), 개수·목록 대조 `tests/integration.test.js`·`tests/routeTable.js`, 목록 `docs/api_catalog.md` |  |
| **AR-07**<br>같은 동작의 반복 구현 금지 | - | 모든 API (210개) | API별 고유 동작 정의 `docs/api_catalog.md`, 같은 Method·URL 중복 등록 검사 `tests/integration.test.js` |  |
| **AR-08**<br>모든 API의 요구사항 연결 | - | 모든 API (210개) | 요구사항 열 `docs/api_catalog.md`, Swagger 설명 앞 [요구사항] `routes/*.js` @openapi, 두 문서 일치 검사 `tests/integration.test.js`, 이 추적표 |  |

## 5. 비기능 요구사항 (NFR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **NFR-01**<br>작업 성공·실패를 명확히 확인 | - | 모든 API | `utils/response.js` (`success: true`), `middlewares/errorHandler.js` (`success: false` + 오류 코드·메시지) |  |
|  | - | 웹 화면 | `middlewares/web.js` `setFlash` → `views/partials/flash.ejs` (성공·실패 메시지) |  |
| **NFR-02**<br>비정상 요청에도 서버가 종료되지 않음 | GET | `/api/admin/health` (#210) | `routes/adminRoutes.js` → `opsController.health` → `adminService.health` |  |
|  | - | 모든 API | `middlewares/validate.js` (처리 전 입력 거부), `middlewares/errorHandler.js` (모든 오류를 응답으로 변환), `app.js` (`unhandledRejection`·`uncaughtException` 기록 후 계속 실행) |  |
| **NFR-03**<br>서버 측 권한 검사 | POST | `/api/auth/login` (#1) | `routes/authRoutes.js` → `authController.login` → `authService.login` |  |
|  | POST | `/api/auth/refresh` (#2) | `routes/authRoutes.js` → `authController.refresh` → `authService.refresh` |  |
|  | POST | `/api/auth/logout` (#3) | `routes/authRoutes.js` → `authController.logout` → `authService.logout` |  |
|  | GET | `/api/auth/sessions` (#4) | `routes/authRoutes.js` → `authController.listSessions` → `authService.listSessions` |  |
|  | DELETE | `/api/auth/sessions` (#5) | `routes/authRoutes.js` → `authController.revokeAllSessions` → `authService.revokeAllSessions` |  |
|  | GET | `/api/me/permissions` (#9) | `routes/meRoutes.js` → `meController.getPermissions` → `meService.getPermissions` |  |
|  | GET | `/api/security-events` (#179) | `routes/auditRoutes.js` → `recordController.securityEvents` → `auditLogService.securityEvents` |  |
|  | PUT | `/api/admin/accounts/:userId/lock` (#200) | `routes/adminRoutes.js` → `opsController.lock` → `adminService.lock` |  |
|  | DELETE | `/api/admin/accounts/:userId/sessions` (#203) | `routes/adminRoutes.js` → `opsController.forceLogout` → `adminService.forceLogout` |  |
|  | GET | `/api/admin/permissions` (#205) | `routes/adminRoutes.js` → `opsController.permissions` → `adminService.permissions` |  |
|  | PUT | `/api/admin/permissions/:role` (#206) | `routes/adminRoutes.js` → `opsController.setRolePermissions` → `adminService.setRolePermissions` |  |
|  | - | 모든 API | `middlewares/authenticate.js` (토큰·세션 확인) → `middlewares/authorize.js` `requirePermission` (`config/permissions.js`), 웹 화면도 `routes/webRoutes.js`에서 같은 권한 키 검사 |  |
| **NFR-04**<br>데이터가 많아도 탐색할 방법 제공 | GET | `/api/search` (#180) | `routes/searchRoutes.js` → `opsController.search` → `searchService.search` |  |
|  | POST | `/api/saved-searches` (#181) | `routes/searchRoutes.js` → `opsController.saveSearch` → `searchService.save` |  |
|  | GET | `/api/saved-searches/:searchId/results` (#183) | `routes/searchRoutes.js` → `opsController.runSavedSearch` → `searchService.run` |  |
|  | - | 목록 조회 API 공통 | 페이지·정렬 `routes/rules.js` `paging`·`SORTS`, `utils/pagination.js` `pageMeta`, 검색·필터용 인덱스 `models/sql/schema.js` |  |
| **NFR-05**<br>일관된 응답·오류 메시지 | - | 모든 API | `utils/response.js`, `utils/errors.js`, `middlewares/errorHandler.js` (`{ success, data, meta }` / `{ success, error: { code, message, details } }`) |  |

## 6. 기술 제약조건 (CR)

| Requirement ID | Method | API | 구현 위치 | 확인방법 |
| --- | --- | --- | --- | --- |
| **CR-01**<br>Node.js·Express 기반 | - | - | `package.json` (express 5), `app.js` (서버 시작), `createApp.js` (Express 앱 구성) |  |
| **CR-02**<br>EJS 서버 사이드 렌더링 | - | 웹 화면 (`/`, `/login`, `/tasks` 등) | `views/*.ejs`, `routes/webRoutes.js`, `controllers/web*.js`, `middlewares/web.js` |  |
| **CR-03**<br>SQL과 MongoDB 모두 사용 | - | - | `config/database.js` (MySQL `mysql2` 연결·테이블 생성, MongoDB `mongoose` 연결), `models/sql/`, `models/mongo/` |  |
| **CR-04**<br>모든 API Swagger 문서화 | GET | `/api-docs`, `/api-docs.json` | `config/swagger.js` (swagger-jsdoc), 각 API 문서 `routes/*.js` @openapi 주석, `createApp.js` (Swagger UI 연결) |  |
| **CR-05**<br>기능별 책임 분리 (Router·Controller·Service·Model) | - | - | `routes/` (경로·권한·입력 검증) → `controllers/` (요청·응답) → `services/` (업무 규칙·트랜잭션) → `models/` (SQL·MongoDB 접근), 공통 `middlewares/`·`utils/` |  |
| **CR-06**<br>`node app.js` 하나로 실행 | - | - | `app.js` → `config/database.js` `connect` (DB·테이블·인덱스 자동 생성) → `models/seed.js` `seed` (빈 테이블에 시드 데이터), 점검 `tests/integration-check.js` |  |
