// 서버 시작 시 순서대로 실행하는 MySQL 테이블 정의 (DR-06: 구조 직접 설계).
// 외래 키 때문에 참조되는 테이블이 먼저 와야 한다. 단계가 진행될 때마다 테이블을 추가한다.
const { ROLE_INFO, MEMBER_STATUS_INFO } = require('../../config/constants');

const enumOf = (info) => Object.keys(info).map((k) => `'${k}'`).join(', ');

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
];

module.exports = { tables };
