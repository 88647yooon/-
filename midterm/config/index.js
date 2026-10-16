// 실행 설정. `node app.js`만으로 동작하도록 모든 값에 기본값을 두고, 필요하면 환경 변수로 덮어쓴다.
const env = process.env;

module.exports = {
  port: Number(env.PORT) || 3000,

  // DR-06: DB 이름에 학번(202211207)을 포함한다.
  mysql: {
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT) || 3306,
    user: env.MYSQL_USER || 'family',
    password: env.MYSQL_PASSWORD ?? 'family1234',
    database: env.MYSQL_DATABASE || 'family_202211207',
  },
  mongo: {
    uri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/family_202211207',
  },

  auth: {
    jwtSecret: env.JWT_SECRET || 'family-202211207-jwt-secret',
    accessTokenTtlSeconds: 60 * 60,
    refreshTokenTtlDays: 14,
    bcryptRounds: 10,
  },

  // 시드 계정의 공통 비밀번호. 기술 보고서의 기능 확인 방법에 적는다.
  seedPassword: 'Family2026!',
};
