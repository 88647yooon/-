// 엔트리 포인트 (CR-06). `node app.js` 한 줄로 DB 준비, 시드 데이터, 서버 시작까지 한다.
//   node app.js           기존 데이터를 유지하고 시작
//   node app.js --reset   두 DB를 비우고 테이블과 시드 데이터를 새로 만든 뒤 시작
const config = require('./config');
const database = require('./config/database');
const { seed } = require('./models/seed');
const createApp = require('./createApp');

// NFR-02: 처리되지 않은 오류가 있어도 서버 프로세스를 종료하지 않고 기록만 남긴다.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

async function main() {
  const reset = process.argv.includes('--reset');

  try {
    await database.connect({ reset });
  } catch (err) {
    console.error(`\n[DB 연결 실패] ${database.describeConnectionError(err)}\n`);
    process.exit(1);
  }

  const seeded = await seed();
  console.log(`[DB] MySQL ${config.mysql.database}, MongoDB 연결 완료${reset ? ' (초기화함)' : ''}`);
  if (seeded.users > 0) console.log(`[DB] 시드 계정 ${seeded.users}개 생성 (비밀번호: ${config.seedPassword})`);
  if (seeded.crews > 0) console.log(`[DB] 시드 Crew ${seeded.crews}개와 소속·신청·요청 생성`);
  if (seeded.tasks > 0) console.log(`[DB] 시드 업무 ${seeded.tasks}개와 배정·지시사항·체크리스트·결과 생성`);
  if (seeded.resources > 0) console.log(`[DB] 시드 자원 ${seeded.resources}개와 할당·배정·사용 기록·점검·신청 생성`);

  // Express 5는 listen 실패 시에도 콜백을 오류와 함께 호출한다.
  const server = createApp().listen(config.port, (err) => {
    if (err) {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[서버 시작 실패] ${config.port}번 포트를 이미 다른 프로그램이 쓰고 있습니다.` +
          '\n  → 그 프로그램을 종료하거나 PORT 환경 변수로 다른 포트를 지정하세요. 예: PORT=3001 node app.js\n');
      } else {
        console.error('\n[서버 시작 실패]', err);
      }
      process.exit(1);
    }
    console.log(`[서버] http://localhost:${config.port}`);
    console.log(`[문서] http://localhost:${config.port}/api-docs`);
  });

  const shutdown = async () => {
    server.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[시작 실패]', err);
  process.exit(1);
});
