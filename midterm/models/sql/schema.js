// 서버 시작 시 순서대로 실행하는 MySQL 테이블 정의 (DR-06: 구조 직접 설계).
// 외래 키 때문에 참조되는 테이블이 먼저 와야 한다. 단계가 진행될 때마다 테이블을 추가한다.
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO,
  TASK_STATUS_INFO, TASK_PRIORITY_INFO, ASSIGNEE_ROLE_INFO, ASSIGNMENT_RESPONSE_INFO,
  ASSIGNMENT_RELEASE_REASON_INFO, TASK_OUTCOME_INFO,
  RESOURCE_STATUS_INFO, RESOURCE_MIN_ROLES, MAINTENANCE_SOURCE_INFO, MAINTENANCE_RESULT_INFO, RETURN_CONDITION_INFO,
  RESOURCE_RELEASE_REASON_INFO,
} = require('../../config/constants');

const enumOf = (info) => Object.keys(info).map((k) => `'${k}'`).join(', ');

// 참고: MySQL은 STORED 생성 컬럼의 기반 컬럼에 걸린 외래 키에 CASCADE·SET NULL을 허용하지 않는다.
// 그래서 생성 컬럼의 기반이 되는 crew_id·user_id 외래 키는 기본값(RESTRICT)을 쓴다.

const tables = [
  {
    name: 'users',
    ddl: `CREATE TABLE IF NOT EXISTS users (
      id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username            VARCHAR(50)  NOT NULL,
      password_hash       VARCHAR(100) NOT NULL,
      name                VARCHAR(50)  NOT NULL,
      nickname            VARCHAR(50)  NULL,
      phone               VARCHAR(20)  NULL,
      email               VARCHAR(100) NULL,
      role                ENUM(${enumOf(ROLE_INFO)}) NOT NULL DEFAULT 'ASSOCIATE',
      status              ENUM(${enumOf(MEMBER_STATUS_INFO)}) NOT NULL DEFAULT 'PENDING',
      failed_login_count  INT UNSIGNED NOT NULL DEFAULT 0,
      last_login_at       DATETIME     NULL,
      locked_at           DATETIME     NULL,
      locked_reason       VARCHAR(200) NULL,
      password_changed_at DATETIME     NULL,
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_users_username (username),
      KEY idx_users_role (role),
      KEY idx_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // 로그인 세션. 리프레시 토큰은 해시로만 저장한다.
    name: 'sessions',
    ddl: `CREATE TABLE IF NOT EXISTS sessions (
      id                 CHAR(36)     NOT NULL PRIMARY KEY,
      user_id            INT UNSIGNED NOT NULL,
      refresh_token_hash CHAR(64)     NOT NULL,
      user_agent         VARCHAR(255) NULL,
      ip                 VARCHAR(45)  NULL,
      created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at         DATETIME     NOT NULL,
      revoked_at         DATETIME     NULL,
      revoke_reason      VARCHAR(50)  NULL,
      UNIQUE KEY uq_sessions_refresh (refresh_token_hash),
      KEY idx_sessions_user (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-05: Crew와 현재 책임자(Capo)·담당 Underboss. 한 Capo는 한 Crew만 책임진다.
    name: 'crews',
    ddl: `CREATE TABLE IF NOT EXISTS crews (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(50)  NOT NULL,
      region       VARCHAR(50)  NOT NULL,
      description  VARCHAR(500) NULL,
      status       ENUM(${enumOf(CREW_STATUS_INFO)}) NOT NULL DEFAULT 'ACTIVE',
      capo_id      INT UNSIGNED NULL,
      underboss_id INT UNSIGNED NULL,
      created_by   INT UNSIGNED NULL,
      disbanded_at DATETIME     NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_crews_name (name),
      UNIQUE KEY uq_crews_capo (capo_id),
      KEY idx_crews_region (region),
      KEY idx_crews_status (status),
      KEY idx_crews_underboss (underboss_id),
      CONSTRAINT fk_crews_capo FOREIGN KEY (capo_id) REFERENCES users (id),
      CONSTRAINT fk_crews_underboss FOREIGN KEY (underboss_id) REFERENCES users (id),
      CONSTRAINT fk_crews_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-05, FR-06, DR-01: Crew 소속. 종료된 소속도 지우지 않고 기간(joined_at~left_at)으로 남긴다 (BR-10).
    name: 'crew_memberships',
    ddl: `CREATE TABLE IF NOT EXISTS crew_memberships (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      crew_id      INT UNSIGNED NOT NULL,
      user_id      INT UNSIGNED NOT NULL,
      type         ENUM(${enumOf(MEMBERSHIP_TYPE_INFO)}) NOT NULL,
      join_method  ENUM(${enumOf(JOIN_METHOD_INFO)}) NOT NULL DEFAULT 'ADDED',
      from_crew_id INT UNSIGNED NULL,
      joined_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      left_at      DATETIME     NULL,
      end_reason   ENUM(${enumOf(MEMBERSHIP_END_REASON_INFO)}) NULL,
      to_crew_id   INT UNSIGNED NULL,
      added_by     INT UNSIGNED NULL,
      ended_by     INT UNSIGNED NULL,
      note         VARCHAR(200) NULL,
      -- BR-01: 종료되지 않은 정식 소속은 구성원당 하나만 있을 수 있다.
      active_regular_user_id INT UNSIGNED
        GENERATED ALWAYS AS (IF(type = 'REGULAR' AND left_at IS NULL, user_id, NULL)) STORED,
      -- 같은 Crew에 동시에 두 번 소속될 수 없다 (정식·임시 무관).
      active_crew_member VARCHAR(23)
        GENERATED ALWAYS AS (IF(left_at IS NULL, CONCAT(crew_id, ':', user_id), NULL)) STORED,
      UNIQUE KEY uq_membership_active_regular (active_regular_user_id),
      UNIQUE KEY uq_membership_active_member (active_crew_member),
      KEY idx_membership_crew (crew_id, left_at),
      KEY idx_membership_user (user_id, left_at),
      CONSTRAINT fk_membership_crew FOREIGN KEY (crew_id) REFERENCES crews (id),
      CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_membership_from_crew FOREIGN KEY (from_crew_id) REFERENCES crews (id),
      CONSTRAINT fk_membership_to_crew FOREIGN KEY (to_crew_id) REFERENCES crews (id),
      CONSTRAINT fk_membership_added_by FOREIGN KEY (added_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_membership_ended_by FOREIGN KEY (ended_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-05, BR-10: Crew 책임자 임기. 한 Crew의 현재 책임자는 한 명이다.
    name: 'crew_capo_terms',
    ddl: `CREATE TABLE IF NOT EXISTS crew_capo_terms (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      crew_id     INT UNSIGNED NOT NULL,
      user_id     INT UNSIGNED NOT NULL,
      started_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at    DATETIME     NULL,
      end_reason  ENUM(${enumOf(CAPO_TERM_END_REASON_INFO)}) NULL,
      assigned_by INT UNSIGNED NULL,
      ended_by    INT UNSIGNED NULL,
      reason      VARCHAR(500) NULL,
      active_crew_id INT UNSIGNED GENERATED ALWAYS AS (IF(ended_at IS NULL, crew_id, NULL)) STORED,
      UNIQUE KEY uq_capo_term_active (active_crew_id),
      KEY idx_capo_term_crew (crew_id, started_at),
      KEY idx_capo_term_user (user_id),
      CONSTRAINT fk_capo_term_crew FOREIGN KEY (crew_id) REFERENCES crews (id),
      CONSTRAINT fk_capo_term_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_capo_term_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_capo_term_ended_by FOREIGN KEY (ended_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-06: Crew 소속 신청. 같은 Crew에 대기 중인 신청은 한 사람당 하나다.
    name: 'crew_join_requests',
    ddl: `CREATE TABLE IF NOT EXISTS crew_join_requests (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      crew_id         INT UNSIGNED NOT NULL,
      user_id         INT UNSIGNED NOT NULL,
      type            ENUM(${enumOf(MEMBERSHIP_TYPE_INFO)}) NOT NULL DEFAULT 'REGULAR',
      message         VARCHAR(500) NULL,
      status          ENUM(${enumOf(REQUEST_STATUS_INFO)}) NOT NULL DEFAULT 'PENDING',
      decided_by      INT UNSIGNED NULL,
      decided_at      DATETIME     NULL,
      decision_reason VARCHAR(500) NULL,
      membership_id   INT UNSIGNED NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      pending_key VARCHAR(23)
        GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(crew_id, ':', user_id), NULL)) STORED,
      UNIQUE KEY uq_join_request_pending (pending_key),
      KEY idx_join_request_crew (crew_id, status, created_at),
      KEY idx_join_request_user (user_id, created_at),
      CONSTRAINT fk_join_request_crew FOREIGN KEY (crew_id) REFERENCES crews (id),
      CONSTRAINT fk_join_request_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_join_request_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_join_request_membership FOREIGN KEY (membership_id) REFERENCES crew_memberships (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-03: 역할 변경 요청(추천). 대상자당 대기 중인 요청은 하나다.
    name: 'role_change_requests',
    ddl: `CREATE TABLE IF NOT EXISTS role_change_requests (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id         INT UNSIGNED NOT NULL,
      requested_by    INT UNSIGNED NOT NULL,
      from_role       ENUM(${enumOf(ROLE_INFO)}) NOT NULL,
      to_role         ENUM(${enumOf(ROLE_INFO)}) NOT NULL,
      reason          VARCHAR(500) NOT NULL,
      status          ENUM(${enumOf(REQUEST_STATUS_INFO)}) NOT NULL DEFAULT 'PENDING',
      decided_by      INT UNSIGNED NULL,
      decided_at      DATETIME     NULL,
      decision_reason VARCHAR(500) NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      pending_user_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'PENDING', user_id, NULL)) STORED,
      UNIQUE KEY uq_role_request_pending (pending_user_id),
      KEY idx_role_request_status (status, created_at),
      KEY idx_role_request_requested_by (requested_by, created_at),
      CONSTRAINT fk_role_request_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_role_request_requested_by FOREIGN KEY (requested_by) REFERENCES users (id),
      CONSTRAINT fk_role_request_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  // ---------------------------------------------------------------------------
  // 단계 3: 업무. MySQL은 CHECK 제약에 쓰인 컬럼의 외래 키에 CASCADE를 허용하지 않으므로,
  // 같은 행 비교(예: 자기 자신을 선행 업무로 지정)는 서비스 계층에서 검사한다.
  {
    name: 'task_types',
    ddl: `CREATE TABLE IF NOT EXISTS task_types (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(50)  NOT NULL,
      description VARCHAR(300) NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_task_types_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-07, FR-10, FR-11: 업무와 일정·중요도·상태, 필요 인원, 완료 결과.
    name: 'tasks',
    ddl: `CREATE TABLE IF NOT EXISTS tasks (
      id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title              VARCHAR(100)  NOT NULL,
      description        VARCHAR(2000) NULL,
      type_id            INT UNSIGNED  NULL,
      crew_id            INT UNSIGNED  NULL,
      priority           ENUM(${enumOf(TASK_PRIORITY_INFO)}) NOT NULL DEFAULT 'MEDIUM',
      status             ENUM(${enumOf(TASK_STATUS_INFO)}) NOT NULL DEFAULT 'PLANNED',
      location           VARCHAR(100)  NULL,
      start_at           DATETIME      NOT NULL,
      end_at             DATETIME      NOT NULL,
      required_headcount INT UNSIGNED  NULL,
      leader_required    TINYINT(1)    NOT NULL DEFAULT 0,
      started_at         DATETIME      NULL,
      completed_at       DATETIME      NULL,
      cancelled_at       DATETIME      NULL,
      cancel_reason      VARCHAR(500)  NULL,
      result_outcome     ENUM(${enumOf(TASK_OUTCOME_INFO)}) NULL,
      result_summary     VARCHAR(2000) NULL,
      result_recorded_by INT UNSIGNED  NULL,
      duplicated_from    INT UNSIGNED  NULL,
      created_by         INT UNSIGNED  NULL,
      created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_tasks_status (status),
      KEY idx_tasks_crew_start (crew_id, start_at),
      KEY idx_tasks_period (start_at, end_at),
      KEY idx_tasks_type (type_id),
      CONSTRAINT chk_tasks_period CHECK (end_at > start_at),
      CONSTRAINT fk_tasks_type FOREIGN KEY (type_id) REFERENCES task_types (id),
      CONSTRAINT fk_tasks_crew FOREIGN KEY (crew_id) REFERENCES crews (id),
      CONSTRAINT fk_tasks_result_by FOREIGN KEY (result_recorded_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_tasks_duplicated_from FOREIGN KEY (duplicated_from) REFERENCES tasks (id) ON DELETE SET NULL,
      CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-08, DR-02: 업무-구성원 배정. 끝난 배정도 지우지 않고 이력으로 남긴다.
    name: 'task_assignees',
    ddl: `CREATE TABLE IF NOT EXISTS task_assignees (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id        INT UNSIGNED NOT NULL,
      user_id        INT UNSIGNED NOT NULL,
      role           ENUM(${enumOf(ASSIGNEE_ROLE_INFO)}) NOT NULL DEFAULT 'MEMBER',
      response       ENUM(${enumOf(ASSIGNMENT_RESPONSE_INFO)}) NOT NULL DEFAULT 'PENDING',
      response_note  VARCHAR(500) NULL,
      responded_at   DATETIME     NULL,
      assigned_by    INT UNSIGNED NULL,
      assigned_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at    DATETIME     NULL,
      release_reason ENUM(${enumOf(ASSIGNMENT_RELEASE_REASON_INFO)}) NULL,
      released_by    INT UNSIGNED NULL,
      replaced_by    INT UNSIGNED NULL,
      -- 같은 업무에 같은 구성원의 배정은 하나만 진행 중일 수 있다.
      active_assignment VARCHAR(23)
        GENERATED ALWAYS AS (IF(released_at IS NULL, CONCAT(task_id, ':', user_id), NULL)) STORED,
      UNIQUE KEY uq_task_assignee_active (active_assignment),
      KEY idx_task_assignee_task (task_id, released_at),
      KEY idx_task_assignee_user (user_id, released_at),
      CONSTRAINT fk_task_assignee_task FOREIGN KEY (task_id) REFERENCES tasks (id),
      CONSTRAINT fk_task_assignee_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_task_assignee_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_task_assignee_released_by FOREIGN KEY (released_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_task_assignee_replaced_by FOREIGN KEY (replaced_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-09: 참여자에게 전하는 지시사항. target_user_id가 NULL이면 참여자 전체 대상이다.
    name: 'task_notes',
    ddl: `CREATE TABLE IF NOT EXISTS task_notes (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id        INT UNSIGNED  NOT NULL,
      author_id      INT UNSIGNED  NULL,
      target_user_id INT UNSIGNED  NULL,
      content        VARCHAR(2000) NOT NULL,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_task_notes_task (task_id, created_at),
      CONSTRAINT fk_task_notes_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_task_notes_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_task_notes_target FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: 'task_checklist_items',
    ddl: `CREATE TABLE IF NOT EXISTS task_checklist_items (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id    INT UNSIGNED NOT NULL,
      content    VARCHAR(300) NOT NULL,
      position   INT UNSIGNED NOT NULL DEFAULT 0,
      done_by    INT UNSIGNED NULL,
      done_at    DATETIME     NULL,
      created_by INT UNSIGNED NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_checklist_task (task_id, position),
      CONSTRAINT fk_checklist_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_checklist_done_by FOREIGN KEY (done_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_checklist_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // 선행 업무: task_id는 depends_on_id가 끝나야 시작할 수 있다.
    name: 'task_dependencies',
    ddl: `CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id       INT UNSIGNED NOT NULL,
      depends_on_id INT UNSIGNED NOT NULL,
      created_by    INT UNSIGNED NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, depends_on_id),
      KEY idx_dependency_depends_on (depends_on_id),
      CONSTRAINT fk_dependency_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_dependency_depends_on FOREIGN KEY (depends_on_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_dependency_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-11: 참여자별 실제 참여 여부와 기여 내용. 완료 후에는 핵심 결과로 잠긴다 (BR-06).
    name: 'task_participations',
    ddl: `CREATE TABLE IF NOT EXISTS task_participations (
      task_id      INT UNSIGNED  NOT NULL,
      user_id      INT UNSIGNED  NOT NULL,
      participated TINYINT(1)    NOT NULL,
      contribution VARCHAR(1000) NULL,
      recorded_by  INT UNSIGNED  NULL,
      recorded_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, user_id),
      CONSTRAINT fk_participation_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_participation_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_participation_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-08: 배정 교대 요청. 같은 업무에서 한 사람이 낸 대기 중인 요청은 하나다.
    name: 'task_swap_requests',
    ddl: `CREATE TABLE IF NOT EXISTS task_swap_requests (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id         INT UNSIGNED NOT NULL,
      from_user_id    INT UNSIGNED NOT NULL,
      to_user_id      INT UNSIGNED NOT NULL,
      reason          VARCHAR(500) NULL,
      status          ENUM(${enumOf(REQUEST_STATUS_INFO)}) NOT NULL DEFAULT 'PENDING',
      decided_by      INT UNSIGNED NULL,
      decided_at      DATETIME     NULL,
      decision_reason VARCHAR(500) NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      pending_key VARCHAR(23)
        GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(task_id, ':', from_user_id), NULL)) STORED,
      UNIQUE KEY uq_swap_pending (pending_key),
      KEY idx_swap_task (task_id, status),
      KEY idx_swap_from (from_user_id, created_at),
      KEY idx_swap_to (to_user_id, created_at),
      CONSTRAINT fk_swap_task FOREIGN KEY (task_id) REFERENCES tasks (id),
      CONSTRAINT fk_swap_from FOREIGN KEY (from_user_id) REFERENCES users (id),
      CONSTRAINT fk_swap_to FOREIGN KEY (to_user_id) REFERENCES users (id),
      CONSTRAINT fk_swap_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  // ---------------------------------------------------------------------------
  // 단계 4: 공용 자원 (FR-13~FR-17, DR-03). 자원의 현재 상태는 resources에, 예약은 업무 할당·구성원 배정에,
  // 실제 사용·반환은 resource_usages에 남긴다. 끝난 예약과 사용 기록도 지우지 않고 이력으로 쓴다.
  {
    name: 'resource_categories',
    ddl: `CREATE TABLE IF NOT EXISTS resource_categories (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(50)  NOT NULL,
      description VARCHAR(300) NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_resource_categories_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-13, FR-14, FR-16: 자원과 현재 상태, 이용 최소 역할
    name: 'resources',
    ddl: `CREATE TABLE IF NOT EXISTS resources (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code              VARCHAR(30)   NOT NULL,
      name              VARCHAR(100)  NOT NULL,
      category_id       INT UNSIGNED  NOT NULL,
      location          VARCHAR(100)  NULL,
      description       VARCHAR(1000) NULL,
      status            ENUM(${enumOf(RESOURCE_STATUS_INFO)}) NOT NULL DEFAULT 'AVAILABLE',
      min_role          ENUM(${RESOURCE_MIN_ROLES.map((r) => `'${r}'`).join(', ')}) NOT NULL DEFAULT 'SOLDIER',
      status_changed_at DATETIME      NULL,
      created_by        INT UNSIGNED  NULL,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_resources_code (code),
      KEY idx_resources_status (status),
      KEY idx_resources_category (category_id),
      KEY idx_resources_location (location),
      CONSTRAINT fk_resources_category FOREIGN KEY (category_id) REFERENCES resource_categories (id),
      CONSTRAINT fk_resources_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-07, FR-17: 업무에 필요한 자원 분류와 수량 (시작 준비 상태 확인에 쓴다)
    name: 'task_resource_requirements',
    ddl: `CREATE TABLE IF NOT EXISTS task_resource_requirements (
      task_id     INT UNSIGNED NOT NULL,
      category_id INT UNSIGNED NOT NULL,
      quantity    INT UNSIGNED NOT NULL,
      PRIMARY KEY (task_id, category_id),
      CONSTRAINT fk_task_requirement_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT fk_task_requirement_category FOREIGN KEY (category_id) REFERENCES resource_categories (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-17, BR-07: 업무 자원 할당. 기본 시간대는 업무 일정이고, 업무 일정 안에서 조정할 수 있다.
    name: 'task_resources',
    ddl: `CREATE TABLE IF NOT EXISTS task_resources (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id        INT UNSIGNED NOT NULL,
      resource_id    INT UNSIGNED NOT NULL,
      start_at       DATETIME     NOT NULL,
      end_at         DATETIME     NOT NULL,
      note           VARCHAR(200) NULL,
      allocated_by   INT UNSIGNED NULL,
      allocated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at    DATETIME     NULL,
      release_reason ENUM(${enumOf(RESOURCE_RELEASE_REASON_INFO)}) NULL,
      released_by    INT UNSIGNED NULL,
      -- 같은 업무에 같은 자원의 할당은 하나만 진행 중일 수 있다.
      active_key VARCHAR(23)
        GENERATED ALWAYS AS (IF(released_at IS NULL, CONCAT(task_id, ':', resource_id), NULL)) STORED,
      UNIQUE KEY uq_task_resource_active (active_key),
      KEY idx_task_resource_resource (resource_id, released_at, start_at),
      KEY idx_task_resource_task (task_id, released_at),
      CONSTRAINT chk_task_resource_period CHECK (end_at > start_at),
      CONSTRAINT fk_task_resource_task FOREIGN KEY (task_id) REFERENCES tasks (id),
      CONSTRAINT fk_task_resource_resource FOREIGN KEY (resource_id) REFERENCES resources (id),
      CONSTRAINT fk_task_resource_allocated_by FOREIGN KEY (allocated_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_task_resource_released_by FOREIGN KEY (released_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-14, FR-17: 구성원의 자원 사용 신청. 같은 자원에 대기 중인 신청은 한 사람당 하나다.
    name: 'resource_requests',
    ddl: `CREATE TABLE IF NOT EXISTS resource_requests (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      resource_id     INT UNSIGNED NOT NULL,
      user_id         INT UNSIGNED NOT NULL,
      start_at        DATETIME     NOT NULL,
      end_at          DATETIME     NOT NULL,
      reason          VARCHAR(500) NOT NULL,
      status          ENUM(${enumOf(REQUEST_STATUS_INFO)}) NOT NULL DEFAULT 'PENDING',
      decided_by      INT UNSIGNED NULL,
      decided_at      DATETIME     NULL,
      decision_reason VARCHAR(500) NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      pending_key VARCHAR(23)
        GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(resource_id, ':', user_id), NULL)) STORED,
      UNIQUE KEY uq_resource_request_pending (pending_key),
      KEY idx_resource_request_status (status, created_at),
      KEY idx_resource_request_user (user_id, created_at),
      CONSTRAINT chk_resource_request_period CHECK (end_at > start_at),
      CONSTRAINT fk_resource_request_resource FOREIGN KEY (resource_id) REFERENCES resources (id),
      CONSTRAINT fk_resource_request_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_resource_request_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-17, BR-07: 구성원 자원 배정 (시간대 지정). 사용 신청을 승인하거나 인계받으면 만들어진다.
    name: 'resource_allocations',
    ddl: `CREATE TABLE IF NOT EXISTS resource_allocations (
      id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      resource_id      INT UNSIGNED NOT NULL,
      user_id          INT UNSIGNED NOT NULL,
      start_at         DATETIME     NOT NULL,
      end_at           DATETIME     NOT NULL,
      purpose          VARCHAR(500) NULL,
      request_id       INT UNSIGNED NULL,
      handed_over_from INT UNSIGNED NULL,
      allocated_by     INT UNSIGNED NULL,
      allocated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at      DATETIME     NULL,
      release_reason   ENUM(${enumOf(RESOURCE_RELEASE_REASON_INFO)}) NULL,
      released_by      INT UNSIGNED NULL,
      KEY idx_allocation_resource (resource_id, released_at, start_at),
      KEY idx_allocation_user (user_id, released_at, start_at),
      CONSTRAINT chk_allocation_period CHECK (end_at > start_at),
      CONSTRAINT fk_allocation_resource FOREIGN KEY (resource_id) REFERENCES resources (id),
      CONSTRAINT fk_allocation_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_allocation_request FOREIGN KEY (request_id) REFERENCES resource_requests (id),
      CONSTRAINT fk_allocation_handed_over_from FOREIGN KEY (handed_over_from) REFERENCES resource_allocations (id) ON DELETE SET NULL,
      CONSTRAINT fk_allocation_allocated_by FOREIGN KEY (allocated_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_allocation_released_by FOREIGN KEY (released_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-15, DR-03: 자원 사용·반환 기록. 한 자원에 반환되지 않은 사용은 하나뿐이다.
    // 업무 할당(task_resource_id) 또는 구성원 배정(allocation_id)을 근거로 사용을 시작한다.
    name: 'resource_usages',
    ddl: `CREATE TABLE IF NOT EXISTS resource_usages (
      id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      resource_id        INT UNSIGNED NOT NULL,
      user_id            INT UNSIGNED NOT NULL,
      task_id            INT UNSIGNED NULL,
      task_resource_id   INT UNSIGNED NULL,
      allocation_id      INT UNSIGNED NULL,
      started_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_at             DATETIME     NOT NULL,
      returned_at        DATETIME     NULL,
      return_condition   ENUM(${enumOf(RETURN_CONDITION_INFO)}) NULL,
      return_note        VARCHAR(500) NULL,
      returned_by        INT UNSIGNED NULL,
      handed_over_to     INT UNSIGNED NULL,
      handover_from_id   INT UNSIGNED NULL,
      damage_reported_at DATETIME     NULL,
      damage_note        VARCHAR(500) NULL,
      open_resource_id INT UNSIGNED GENERATED ALWAYS AS (IF(returned_at IS NULL, resource_id, NULL)) STORED,
      UNIQUE KEY uq_usage_open_resource (open_resource_id),
      KEY idx_usage_resource (resource_id, started_at),
      KEY idx_usage_user (user_id, started_at),
      KEY idx_usage_task (task_id),
      KEY idx_usage_due (returned_at, due_at),
      CONSTRAINT fk_usage_resource FOREIGN KEY (resource_id) REFERENCES resources (id),
      CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_usage_task FOREIGN KEY (task_id) REFERENCES tasks (id),
      CONSTRAINT fk_usage_task_resource FOREIGN KEY (task_resource_id) REFERENCES task_resources (id),
      CONSTRAINT fk_usage_allocation FOREIGN KEY (allocation_id) REFERENCES resource_allocations (id),
      CONSTRAINT fk_usage_returned_by FOREIGN KEY (returned_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_usage_handed_over_to FOREIGN KEY (handed_over_to) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_usage_handover_from FOREIGN KEY (handover_from_id) REFERENCES resource_usages (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // FR-16: 자원 점검 기록. 한 자원에 끝나지 않은 점검은 하나뿐이다.
    name: 'resource_maintenances',
    ddl: `CREATE TABLE IF NOT EXISTS resource_maintenances (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      resource_id     INT UNSIGNED NOT NULL,
      source          ENUM(${enumOf(MAINTENANCE_SOURCE_INFO)}) NOT NULL DEFAULT 'MANUAL',
      reason          VARCHAR(500) NOT NULL,
      expected_end_at DATETIME     NULL,
      usage_id        INT UNSIGNED NULL,
      started_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_by      INT UNSIGNED NULL,
      completed_at    DATETIME     NULL,
      completed_by    INT UNSIGNED NULL,
      result          ENUM(${enumOf(MAINTENANCE_RESULT_INFO)}) NULL,
      result_note     VARCHAR(500) NULL,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      open_resource_id INT UNSIGNED GENERATED ALWAYS AS (IF(completed_at IS NULL, resource_id, NULL)) STORED,
      UNIQUE KEY uq_maintenance_open_resource (open_resource_id),
      KEY idx_maintenance_resource (resource_id, started_at),
      KEY idx_maintenance_open (completed_at, expected_end_at),
      CONSTRAINT fk_maintenance_resource FOREIGN KEY (resource_id) REFERENCES resources (id),
      CONSTRAINT fk_maintenance_usage FOREIGN KEY (usage_id) REFERENCES resource_usages (id),
      CONSTRAINT fk_maintenance_started_by FOREIGN KEY (started_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_maintenance_completed_by FOREIGN KEY (completed_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  // ---------------------------------------------------------------------------
  // 단계 6: 관리자 (FR-23). 역할별 권한은 config/permissions.js 기본값과 다른 것만 저장한다.
  {
    name: 'role_permission_overrides',
    ddl: `CREATE TABLE IF NOT EXISTS role_permission_overrides (
      role           ENUM(${enumOf(ROLE_INFO)}) NOT NULL,
      permission_key VARCHAR(80)  NOT NULL,
      allowed        TINYINT(1)   NOT NULL,
      updated_by     INT UNSIGNED NULL,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role, permission_key),
      CONSTRAINT fk_permission_override_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    // 운영 설정 (config/settings.js의 항목). 저장된 값이 없으면 기본값을 쓴다.
    name: 'system_settings',
    ddl: `CREATE TABLE IF NOT EXISTS system_settings (
      setting_key   VARCHAR(50)  NOT NULL PRIMARY KEY,
      setting_value VARCHAR(200) NOT NULL,
      updated_by    INT UNSIGNED NULL,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_setting_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
];

module.exports = { tables };
