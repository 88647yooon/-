// MySQL·MongoDB 연결과 테이블 자동 생성 (CR-03, CR-06, DR-05).
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const config = require('./index');
const { tables } = require('../models/sql/schema');

let pool = null;

async function connectMySQL({ reset }) {
  const { host, port, user, password, database } = config.mysql;

  // DB가 없으면 만든다. --reset이면 지우고 새로 만든다.
  const admin = await mysql.createConnection({ host, port, user, password });
  try {
    if (reset) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.end();
  }

  // 모든 시각은 UTC로 저장하고 읽는다. MySQL 서버의 시스템 시간대와 무관하게 동작하도록
  // 연결마다 세션 시간대를 UTC로 고정한다.
  pool = mysql.createPool({ host, port, user, password, database, connectionLimit: 10, timezone: 'Z', charset: 'utf8mb4' });
  pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

  for (const { ddl } of tables) await pool.query(ddl);
}

async function connectMongo({ reset }) {
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  if (reset) await mongoose.connection.dropDatabase();
  // 유일성 같은 규칙을 지키는 인덱스가 요청을 받기 전에 만들어져 있도록 기다린다.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
}

async function connect({ reset = false } = {}) {
  try {
    await connectMySQL({ reset });
  } catch (err) {
    err.dbName = 'MySQL';
    throw err;
  }
  try {
    await connectMongo({ reset });
  } catch (err) {
    err.dbName = 'MongoDB';
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error('MySQL이 아직 연결되지 않았습니다.');
  return pool;
}

// fn(conn)을 하나의 트랜잭션으로 실행한다. 예외가 나면 롤백한다.
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (pool) await pool.end();
  pool = null;
  await mongoose.disconnect();
}

// 연결 실패 원인과 해결 방법을 사람이 읽을 수 있는 문장으로 만든다.
function describeConnectionError(err) {
  const { host, port, user, database } = config.mysql;
  if (err.dbName === 'MySQL') {
    switch (err.code) {
      case 'ECONNREFUSED':
        return `MySQL 서버(${host}:${port})에 연결할 수 없습니다.\n  → MySQL 서버를 실행하세요: sudo systemctl start mysql`;
      case 'ER_ACCESS_DENIED_ERROR':
      case 'ER_DBACCESS_DENIED_ERROR':
        return [
          `MySQL 계정 '${user}'로 '${database}'에 접근할 수 없습니다.`,
          '  → 계정과 권한을 만드세요:',
          `    sudo mysql -e "CREATE USER IF NOT EXISTS '${user}'@'localhost' IDENTIFIED BY '${config.mysql.password}'; ` +
            `GRANT ALL PRIVILEGES ON ${database}.* TO '${user}'@'localhost';"`,
          '  → 다른 계정을 쓰려면 config/index.js 또는 MYSQL_USER, MYSQL_PASSWORD 환경 변수를 바꾸세요.',
        ].join('\n');
      default:
        return `MySQL 연결 오류: ${err.message}`;
    }
  }
  if (err.dbName === 'MongoDB') {
    if (err.name === 'MongooseServerSelectionError') {
      return `MongoDB 서버(${config.mongo.uri})에 연결할 수 없습니다.\n  → MongoDB 서버를 실행하세요: sudo systemctl start mongod`;
    }
    return `MongoDB 연결 오류: ${err.message}`;
  }
  return `DB 연결 오류: ${err.message}`;
}

module.exports = { connect, close, getPool, withTransaction, describeConnectionError };
