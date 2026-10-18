// 통합 점검 (작업지시서 5장 단계 7, CR-04, CR-06, AR-06): 빈 DB에서 `node app.js`만으로 시작되는지와 모든 API가 실제로 실행되는지 확인한다.
//   npm run check:integration
// 개발 DB와 실행 중인 서버는 건드리지 않는다. 이 PC의 mysqld·mongod로 아무것도 없는 MySQL·MongoDB 서버를 임시 폴더에 새로 띄워
// 점검하고, 끝나면 지운다. (실행 파일 경로는 MYSQLD_BIN·MONGOD_BIN 환경 변수로 바꿀 수 있다)
//   1) 앱의 MySQL 계정이 없으면 계정을 만드는 방법을 안내하고 종료한다. 그 안내대로 계정만 만든다.
//   2) 빈 DB에서 `node app.js`가 테이블과 시드 데이터를 만들고, 웹 화면·Swagger·API가 동작하며, Ctrl+C로 정상 종료된다.
//   3) 다른 폴더에서 다시 실행해도 데이터가 그대로이고 시드 데이터가 다시 들어가지 않는다.
//   4) 전체 테스트를 이 DB로 실행하며 API 호출 결과를 모아, Swagger 문서의 모든 API가 한 번 이상 성공(2xx)했는지,
//      돌려준 상태 코드가 모두 문서에 있는지, 500대 응답이 없는지 센다.
//   5) `node app.js --reset`이 두 DB를 비우고 시드 데이터만 있는 상태로 다시 시작한다.
const { apiRoutes } = require('./routeTable'); // 라우트 파일보다 먼저 불러와야 라우트 경로가 기록된다
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const config = require('../config');
const spec = require('../config/swagger');
const seedData = require('../models/seedData');
const { tables } = require('../models/sql/schema');

// 앱이 쓰는 MongoDB 모델 전체 (컬렉션이 모두 만들어졌는지 확인한다)
for (const file of fs.readdirSync(path.join(__dirname, '..', 'models', 'mongo'))) require(path.join(__dirname, '..', 'models', 'mongo', file));

const ROOT = path.join(__dirname, '..');
const MYSQLD = process.env.MYSQLD_BIN || (fs.existsSync('/usr/sbin/mysqld') ? '/usr/sbin/mysqld' : 'mysqld');
const MONGOD = process.env.MONGOD_BIN || 'mongod';
const MONGO_DB = new URL(config.mongo.uri).pathname.slice(1);
const START_TIMEOUT = 60_000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (since) => `${((Date.now() - since) / 1000).toFixed(1)}초`;

// ---------------------------------------------------------------------------
// 결과 출력
const results = [];
function check(title, ok, detail) {
  results.push(ok);
  console.log(`${ok ? '✔' : '✖'} ${title}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
const section = (title) => console.log(`\n[${title}]`);
const tail = (text, lines = 25) => text.trim().split('\n').slice(-lines).map((l) => `    | ${l}`).join('\n');

// ---------------------------------------------------------------------------
// 자식 프로세스 (DB 서버, 앱, 테스트). 점검이 중간에 끝나도 남지 않게 종료 시 정리한다.
const children = new Set();
let tempDir = null;
process.on('exit', () => {
  for (const child of children) child.kill('SIGKILL');
  try {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // 강제 종료된 DB 서버가 아직 파일을 쓰고 있으면 남을 수 있다 (임시 폴더라 괜찮다).
  }
});
process.on('SIGINT', () => process.exit(130));

function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.add(child);
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk; });
  child.stderr.on('data', (chunk) => { child.output += chunk; });
  child.done = new Promise((resolve) => {
    child.once('error', (err) => { child.output += String(err); resolve({ code: null }); });
    child.once('close', (code, signal) => { children.delete(child); resolve({ code, signal }); });
  });
  return child;
}

async function waitForOutput(child, pattern, timeout = START_TIMEOUT) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (pattern.test(child.output)) return true;
    if (!children.has(child)) return false;
    await delay(100);
  }
  return false;
}

async function stop(child, signal = 'SIGTERM', timeout = 15_000) {
  if (!children.has(child)) return child.done;
  child.kill(signal);
  const result = await Promise.race([child.done, delay(timeout).then(() => null)]);
  if (result) return result;
  child.kill('SIGKILL');
  await child.done;
  return { code: null, signal: 'timeout' };
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

// DB 서버가 연결을 받을 때까지 기다린다. 서버 프로세스가 먼저 끝나면 그 로그와 함께 실패한다.
async function connectWhenReady(server, logFile, connect) {
  const until = Date.now() + START_TIMEOUT;
  for (;;) {
    try {
      return await connect();
    } catch (err) {
      const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      if (!children.has(server)) throw new Error(`DB 서버가 시작되지 않았습니다.\n${tail(`${server.output}\n${log}`)}`);
      if (Date.now() > until) throw err;
      await delay(300);
    }
  }
}

async function http(port, method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body && JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML·스크립트 응답
  }
  return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type') ?? '', text, body: json };
}

// ---------------------------------------------------------------------------
// 임시 MySQL·MongoDB 서버
async function startDatabases(dir) {
  const mysqlPort = await freePort();
  const mongoPort = await freePort();
  const socket = path.join(dir, 's');
  if (socket.length > 100) throw new Error(`임시 폴더 경로가 너무 깁니다(${dir}). TMPDIR을 짧은 경로로 지정하세요.`);

  try {
    execFileSync(MYSQLD, ['--no-defaults', '--initialize-insecure', `--datadir=${path.join(dir, 'mysql')}`, `--log-error=${path.join(dir, 'mysql-init.log')}`], { stdio: 'pipe' });
  } catch (err) {
    const log = fs.existsSync(path.join(dir, 'mysql-init.log')) ? fs.readFileSync(path.join(dir, 'mysql-init.log'), 'utf8') : '';
    throw new Error(`MySQL 데이터 폴더를 만들지 못했습니다 (${MYSQLD}).\n${tail(`${err.message}\n${log}`)}`);
  }
  const mysqld = run(MYSQLD, [
    '--no-defaults', `--datadir=${path.join(dir, 'mysql')}`, `--port=${mysqlPort}`, '--bind-address=127.0.0.1', `--socket=${socket}`,
    '--mysqlx=OFF', `--pid-file=${path.join(dir, 'mysqld.pid')}`, `--log-error=${path.join(dir, 'mysqld.log')}`,
  ]);
  fs.mkdirSync(path.join(dir, 'mongo'));
  const mongod = run(MONGOD, ['--dbpath', path.join(dir, 'mongo'), '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--nounixsocket', '--logpath', path.join(dir, 'mongod.log')]);

  // root는 --initialize-insecure로 비밀번호 없이 만들어진다.
  const root = await connectWhenReady(mysqld, path.join(dir, 'mysqld.log'), () => mysql.createConnection({ host: '127.0.0.1', port: mysqlPort, user: 'root', password: '' }));
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/${MONGO_DB}`;
  const mongo = await connectWhenReady(mongod, path.join(dir, 'mongod.log'), () => mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 2000 }).asPromise());
  return { mysqld, mongod, mysqlPort, mongoUri, root, mongo };
}

// 모든 테이블과 컬렉션의 행(문서) 수. --reset이 DB를 지웠다 다시 만들어도 같은 연결로 셀 수 있게 DB 이름을 붙인다.
async function snapshot(db) {
  const counts = {};
  for (const { name } of tables) {
    const [[row]] = await db.sql.query(`SELECT COUNT(*) AS n FROM \`${config.mysql.database}\`.\`${name}\``);
    counts[name] = Number(row.n);
  }
  for (const { name } of await db.mongo.db.listCollections().toArray()) counts[`mongo.${name}`] = await db.mongo.db.collection(name).countDocuments();
  return counts;
}
const differences = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}→${b[k]}`);

// 시드 데이터 정의(models/seedData.js)와 개수가 같아야 하는 테이블·컬렉션
const SEED_COUNTS = {
  users: seedData.users.length,
  crews: seedData.crews.length,
  task_types: seedData.taskTypes.length,
  tasks: seedData.tasks.length,
  resource_categories: seedData.resourceCategories.length,
  resources: seedData.resources.length,
  'mongo.evaluation_criteria': seedData.evaluationCriteria.length,
  'mongo.evaluations': seedData.evaluations.length,
};

async function startApp(env, { cwd = ROOT, args = ['app.js'] } = {}) {
  const started = Date.now();
  const app = run(process.execPath, args, { cwd, env });
  const ok = await waitForOutput(app, new RegExp(`\\[서버\\] http://localhost:${env.PORT}`));
  return { app, ok, took: seconds(started) };
}

// ---------------------------------------------------------------------------
async function main() {
  const startedAt = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-'));
  tempDir = dir;
  let db;
  try {
    section('준비: 빈 MySQL·MongoDB 서버');
    db = await startDatabases(dir);
    const appPort = await freePort();
    const env = { ...process.env, PORT: String(appPort), MYSQL_HOST: '127.0.0.1', MYSQL_PORT: String(db.mysqlPort), MONGO_URI: db.mongoUri };
    console.log(`  임시 폴더 ${dir}`);
    console.log(`  MySQL 127.0.0.1:${db.mysqlPort}, MongoDB ${db.mongoUri}, 앱 포트 ${appPort}`);

    // 1) 계정 없음 → 안내 후 종료
    section('1. 앱의 DB 계정이 없을 때');
    const noAccount = run(process.execPath, ['app.js'], { cwd: ROOT, env });
    const { code: noAccountCode } = await noAccount.done;
    const guide = noAccount.output.match(/mysql -e "([^"]+)"/);
    check('DB 연결 실패 원인과 계정 만드는 방법을 안내하고 종료 코드 1로 끝난다', noAccountCode === 1 && /\[DB 연결 실패\]/.test(noAccount.output) && Boolean(guide), `종료 코드 ${noAccountCode}`);
    if (!guide) throw new Error(`계정 안내 문구를 찾지 못했습니다.\n${tail(noAccount.output)}`);
    for (const statement of guide[1].split(';').map((s) => s.trim()).filter(Boolean)) await db.root.query(statement);
    console.log(`  안내대로 계정을 만들었다: ${guide[1]}`);

    const [databases] = await db.root.query('SHOW DATABASES LIKE ?', [config.mysql.database]);
    const mongoDatabases = (await db.mongo.db.admin().listDatabases()).databases.map((d) => d.name);
    check('점검 전 상태: MySQL·MongoDB 모두 앱의 DB가 없다', databases.length === 0 && !mongoDatabases.includes(MONGO_DB));

    // 2) 빈 DB에서 첫 실행
    section('2. 빈 DB에서 `node app.js`');
    let { app, ok, took } = await startApp(env);
    check('`node app.js` 하나로 DB·테이블·시드 데이터를 준비하고 서버가 시작된다', ok, ok ? `시작까지 ${took}` : tail(app.output));
    if (!ok) throw new Error('앱이 시작되지 않았습니다.');
    db.sql = await mysql.createConnection({ host: '127.0.0.1', port: db.mysqlPort, user: config.mysql.user, password: config.mysql.password });

    const [tableRows] = await db.sql.query(`SHOW TABLES FROM \`${config.mysql.database}\``);
    const created = tableRows.map((row) => Object.values(row)[0]).sort();
    const expectedTables = tables.map((t) => t.name).sort();
    check(`MySQL 테이블 ${expectedTables.length}개가 모두 만들어졌다`, JSON.stringify(created) === JSON.stringify(expectedTables), `만들어진 테이블 ${created.length}개`);
    const collections = (await db.mongo.db.listCollections().toArray()).map((c) => c.name);
    const models = [...new Set(Object.values(mongoose.models).map((m) => m.collection.collectionName))];
    const missingCollections = models.filter((name) => !collections.includes(name));
    check(`MongoDB 컬렉션 ${models.length}개가 인덱스와 함께 만들어졌다`, missingCollections.length === 0, missingCollections.length ? `없음: ${missingCollections.join(', ')}` : collections.sort().join(', '));

    const seeded = await snapshot(db);
    const seedProblems = Object.entries(SEED_COUNTS).filter(([k, n]) => seeded[k] !== n).map(([k, n]) => `${k} ${seeded[k]}개(정의 ${n}개)`);
    check('시드 데이터가 정의한 개수만큼 들어갔다', seedProblems.length === 0, seedProblems.join(', ') || Object.entries(SEED_COUNTS).map(([k, n]) => `${k.replace('mongo.', '')} ${n}`).join(', '));
    const empty = Object.entries(seeded).filter(([, n]) => n === 0).map(([k]) => k);
    console.log(`  시드 직후 행 수: ${Object.entries(seeded).map(([k, n]) => `${k}=${n}`).join(' ')}`);
    console.log(`  비어 있는 테이블·컬렉션(시드 대상 아님): ${empty.join(', ') || '없음'}`);
    check('시작 로그에 시드 결과가 나온다', app.output.includes(`[DB] 시드 계정 ${seedData.users.length}개 생성`));

    const home = await http(appPort, 'GET', '/');
    const loginPage = await http(appPort, 'GET', '/login');
    const css = await http(appPort, 'GET', '/style.css');
    check('웹 화면(첫 화면 → 로그인 화면)과 정적 파일이 열린다', home.status === 302 && home.location === '/login' && loginPage.status === 200 && loginPage.type.includes('text/html') && css.status === 200,
      `/ ${home.status} → ${home.location}, /login ${loginPage.status}, /style.css ${css.status}`);
    const docsPage = await http(appPort, 'GET', '/api-docs/');
    const docsJson = await http(appPort, 'GET', '/api-docs.json');
    const operations = Object.values(docsJson.body?.paths ?? {}).reduce((n, ops) => n + Object.keys(ops).length, 0);
    check('Swagger UI(/api-docs)와 문서(/api-docs.json)가 열린다', docsPage.status === 200 && docsJson.status === 200 && operations >= 200, `API ${operations}개 문서화`);
    const login = await http(appPort, 'POST', '/api/auth/login', { body: { username: 'admin', password: config.seedPassword } });
    const health = login.status === 200 ? await http(appPort, 'GET', '/api/admin/health', { token: login.body.data.accessToken }) : null;
    check('시드 계정으로 로그인하고 두 DB 연결 상태를 조회할 수 있다', health?.status === 200 && health.body.data.status === 'ok',
      health ? `MySQL ${health.body.data.mysql.database}, MongoDB ${health.body.data.mongodb.database}` : `로그인 ${login.status}`);
    let { code } = await stop(app, 'SIGINT');
    check('Ctrl+C(SIGINT)로 연결을 닫고 정상 종료된다', code === 0, `종료 코드 ${code}`);

    // 3) 다른 폴더에서 다시 실행
    section('3. 다른 폴더에서 다시 실행');
    const before = await snapshot(db);
    ({ app, ok, took } = await startApp(env, { cwd: os.tmpdir(), args: [path.join(ROOT, 'app.js')] }));
    check(`다른 폴더(${os.tmpdir()})에서 \`node ${path.join(ROOT, 'app.js')}\`로 시작된다`, ok, ok ? `시작까지 ${took}` : tail(app.output));
    if (!ok) throw new Error('앱이 다시 시작되지 않았습니다.');
    const changed = differences(before, await snapshot(db));
    check('기존 데이터를 유지하고 시드 데이터를 다시 넣지 않는다', changed.length === 0 && !app.output.includes('시드'), changed.join(', ') || '모든 테이블·컬렉션 행 수 그대로');
    const login2 = await http(appPort, 'GET', '/login');
    const css2 = await http(appPort, 'GET', '/style.css');
    check('실행 폴더와 상관없이 화면과 정적 파일을 찾는다', login2.status === 200 && css2.status === 200, `/login ${login2.status}, /style.css ${css2.status}`);
    ({ code } = await stop(app, 'SIGINT'));
    check('다시 정상 종료된다', code === 0, `종료 코드 ${code}`);

    // 4) 전체 테스트 + API 호출 기록
    section('4. 전체 테스트로 모든 API 실행');
    const callLog = path.join(dir, 'api-calls.jsonl');
    const testFiles = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('tests', f));
    const testStarted = Date.now();
    const suite = run(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=1', ...testFiles], { cwd: ROOT, env: { ...env, API_CALL_LOG: callLog } });
    ({ code } = await suite.done);
    const count = (name) => Number(suite.output.match(new RegExp(`^ℹ ${name} (\\d+)`, 'm'))?.[1] ?? NaN);
    check(`전체 테스트(${testFiles.length}개 파일)가 빈 DB에서 시작해 모두 통과한다`, code === 0 && count('fail') === 0,
      `통과 ${count('pass')}, 실패 ${count('fail')}, ${seconds(testStarted)}`);
    if (code !== 0) console.log(tail(suite.output.split('✖ failing tests:')[1] ?? suite.output, 60));

    const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
    const routes = apiRoutes().map((r) => ({ ...r, re: new RegExp(`^${r.path.replace(/:\w+/g, '[^/]+')}$`), statuses: new Map() }));
    let unmatched = 0;
    const serverErrors = [];
    for (const call of calls) {
      const route = routes.find((r) => r.method === call.method && r.re.test(call.url.split('?')[0]));
      if (call.status >= 500) serverErrors.push(`${call.method} ${call.url} → ${call.status}`);
      if (!route) {
        unmatched += 1;
        continue;
      }
      route.statuses.set(call.status, (route.statuses.get(call.status) ?? 0) + 1);
    }
    const documentedOps = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
    const neverOk = routes.filter((r) => ![...r.statuses.keys()].some((s) => s >= 200 && s < 300)).map((r) => `${r.key} (${[...r.statuses.keys()].join('·') || '호출 없음'})`);
    const undocumented = routes.flatMap((r) => {
      const responses = spec.paths[r.key.split(' ')[1]]?.[r.method.toLowerCase()]?.responses ?? {};
      return [...r.statuses].filter(([s]) => !responses[String(s)]).map(([s, n]) => `${r.key}: ${s} (${n}회)`);
    });
    const statusTotals = [...routes.reduce((m, r) => {
      for (const [s, n] of r.statuses) m.set(s, (m.get(s) ?? 0) + n);
      return m;
    }, new Map())].sort(([a], [b]) => a - b).map(([s, n]) => `${s}:${n}`).join(' ');
    console.log(`  API 호출 ${calls.length}회 기록 (라우트에 없는 경로 ${unmatched}회 — 404 확인용), 상태 코드별 ${statusTotals}`);
    check(`등록된 라우트 ${routes.length}개 = Swagger 문서 ${documentedOps.length}개`, routes.length === documentedOps.length && routes.every((r) => documentedOps.includes(r.key)));
    check(`Swagger 문서의 API ${routes.length}개가 모두 한 번 이상 성공(2xx)했다`, neverOk.length === 0, neverOk.length ? `성공 없음 ${neverOk.length}개\n    ${neverOk.join('\n    ')}` : '');
    check('API가 돌려준 상태 코드가 모두 그 API의 Swagger 응답 문서에 있다', undocumented.length === 0, undocumented.length ? `문서 없음 ${undocumented.length}건\n    ${undocumented.join('\n    ')}` : '');
    check('500대(서버 오류) 응답이 한 번도 없다', serverErrors.length === 0, serverErrors.slice(0, 20).join('\n    '));

    // 5) --reset
    section('5. `node app.js --reset`');
    const fixtures = await snapshot(db);
    ({ app, ok, took } = await startApp(env, { args: ['app.js', '--reset'] }));
    const afterReset = ok ? await snapshot(db) : {};
    const resetDiff = differences(seeded, afterReset);
    check('두 DB를 비우고 시드 데이터만 있는 처음 상태로 다시 시작한다', ok && app.output.includes('초기화함') && resetDiff.length === 0,
      ok ? `구성원 ${fixtures.users}명 → ${afterReset.users}명${resetDiff.length ? `, 처음과 다름: ${resetDiff.join(', ')}` : ', 모든 행 수가 첫 실행 직후와 같음'}` : tail(app.output));
    ({ code } = await stop(app, 'SIGINT'));
    check('정상 종료된다', code === 0, `종료 코드 ${code}`);
  } catch (err) {
    check('점검을 끝까지 진행했다', false, err.stack ?? String(err));
  } finally {
    section('정리');
    await db?.sql?.end().catch(() => {});
    await db?.root?.end().catch(() => {});
    await db?.mongo?.close().catch(() => {});
    if (db) await Promise.all([stop(db.mysqld), stop(db.mongod)]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  임시 DB 서버를 종료하고 ${dir}를 지웠다.`);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n통합 점검 ${passed}/${results.length} 통과 (${seconds(startedAt)})`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
