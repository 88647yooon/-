// 서버 시작 시 순서대로 실행하는 MySQL 테이블 정의 (DR-06: 구조 직접 설계).
// 외래 키 때문에 참조되는 테이블이 먼저 와야 한다. 단계가 진행될 때마다 테이블을 추가한다.
const {
  ROLE_INFO, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, JOIN_METHOD_INFO,
  MEMBERSHIP_END_REASON_INFO, CAPO_TERM_END_REASON_INFO, REQUEST_STATUS_INFO,
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
];

module.exports = { tables };
