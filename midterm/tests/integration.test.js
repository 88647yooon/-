// 통합 점검 (작업지시서 5장 단계 7, AR-06~AR-08, CR-04, BR-09, NFR-02~NFR-03).
// 1) 실제로 등록된 라우트 = API 목록표 = Swagger 문서인지,
// 2) Swagger 문서가 라우트의 입력 검증 규칙과 같고, Swagger UI의 Try it out 기본값이 검증을 통과하는지,
// 3) 모든 라우트에서 토큰 없음(401)·권한 없음(403)·잘못된 입력(400)이 처리기 실행 전에 막히고 500이 없는지 확인한다.
// 3)의 요청은 모두 처리기에 닿기 전에 거부되므로 데이터를 바꾸지 않는다. 빈 DB에서 실행하는 점검은 tests/integration-check.js에 있다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { apiRoutes } = require('./routeTable'); // createApp보다 먼저 불러와야 라우트 경로가 기록된다
const { startServer, catalogRows, toOpenApiPath } = require('./helpers');
const spec = require('../config/swagger');
const permissionService = require('../services/permissionService');
const { validate, FORMATS } = require('../middlewares/validate');

const routes = apiRoutes();
const PUBLIC = ['POST /api/auth/login', 'POST /api/auth/refresh']; // 토큰 없이 쓰는 API
const AUTH_ONLY = ['POST /api/auth/logout']; // 로그인만 필요 (권한을 바꿔도 로그아웃은 항상 할 수 있어야 한다)
const SEED = { ASSOCIATE: 'associate1', SOLDIER: 'soldier1', CAPO: 'capo1', UNDERBOSS: 'underboss1', BOSS: 'boss', ADMIN: 'admin' };
const ROLES = Object.keys(SEED);

const deref = (o) => {
  let x = o;
  while (x && x.$ref) x = x.$ref.split('/').slice(1).reduce((acc, k) => acc[k], spec);
  return x;
};
// $ref를 따라가고 allOf를 하나로 합친 스키마
function resolve(schema) {
  const s = deref(schema);
  if (!s?.allOf) return s ?? {};
  const parts = s.allOf.map(resolve);
  const { allOf, ...rest } = s;
  return {
    ...Object.assign({}, ...parts),
    ...rest,
    properties: Object.assign({}, ...parts.map((part) => part.properties ?? {}), s.properties ?? {}),
    required: [...parts.flatMap((part) => part.required ?? []), ...(s.required ?? [])],
  };
}
const operationOf = (route) => spec.paths[route.key.split(' ')[1]]?.[route.method.toLowerCase()];
const pathParams = (route) => [...route.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
const expectNone = (problems, title) => assert.equal(problems.length, 0, `${title} ${problems.length}건\n${problems.join('\n')}`);

const DOC_TYPE = { string: 'string', integer: 'integer', number: 'number', boolean: 'boolean', datetime: 'string', array: 'array', object: 'object' };
const LIMITS = { string: ['minLength', 'maxLength'], array: ['minItems', 'maxItems'], integer: ['minimum', 'maximum'], number: ['minimum', 'maximum'] };
const sorted = (list) => list && [...list].sort().join();

// 검증 규칙 하나와 그 항목의 문서 스키마를 비교한다 (형식·선택지·범위·길이·null 허용·기본값, 배열 원소와 객체 하위 항목까지).
function compareRule(where, rule, docSchema) {
  const d = resolve(docSchema);
  const out = [];
  const same = (name, documented, expected) => {
    if (documented !== expected) out.push(`${where}: ${name} 문서 ${documented ?? '없음'} / 규칙 ${expected ?? '없음'}`);
  };
  same('type', d.type, DOC_TYPE[rule.type]);
  if (rule.type === 'datetime') same('format', d.format, 'date-time');
  if (rule.format === 'email') same('format', d.format, 'email');
  if (rule.format === 'phone') same('pattern', d.pattern, FORMATS.phone.re.source);
  if (rule.pattern) same('pattern', d.pattern, rule.pattern.source);
  same('enum', sorted(d.enum), sorted(rule.enum));
  const [minKey, maxKey] = LIMITS[rule.type] ?? [];
  if (minKey) {
    // 필수 문자열은 공백만 보내도 거부되므로 문서의 minLength 1은 있어도 되고 없어도 된다.
    same(minKey, d[minKey], rule.min ?? (rule.type === 'string' && rule.required && d.minLength === 1 ? 1 : undefined));
    same(maxKey, d[maxKey], rule.max);
  }
  same('nullable', Boolean(d.nullable), Boolean(rule.nullable));
  if (rule.default !== undefined) same('default', JSON.stringify(d.default), JSON.stringify(rule.default));
  if (rule.items) out.push(...compareRule(`${where}[]`, rule.items, d.items));
  if (rule.fields) out.push(...compareFields(where, rule.fields, d));
  return out;
}

// 객체의 하위 항목: 이름과 필수 여부가 같고, 항목마다 제약이 같아야 한다.
function compareFields(where, fields, docSchema) {
  const d = resolve(docSchema);
  const props = d.properties ?? {};
  const required = d.required ?? [];
  const out = [];
  for (const k of Object.keys(fields).filter((x) => !(x in props))) out.push(`${where}.${k}: 문서 없음`);
  for (const k of Object.keys(props).filter((x) => !(x in fields))) out.push(`${where}.${k}: 문서에만 있음 (서버가 거부함)`);
  for (const [k, rule] of Object.entries(fields)) {
    if (!(k in props)) continue;
    if (Boolean(rule.required) !== required.includes(k)) out.push(`${where}.${k}: 필수 여부 문서 ${required.includes(k)} / 규칙 ${Boolean(rule.required)}`);
    out.push(...compareRule(`${where}.${k}`, rule, props[k]));
  }
  return out;
}

// Swagger UI(OAS 3.0)의 Try it out이 채우는 기본값: 예시 → 선택지의 첫 값 → 형식별 기본값. 읽기 전용 항목은 뺀다.
// 실제 Swagger UI보다 보수적이다(최솟값·정규식을 고려하지 않는다). 그래서 예시가 없는 제약 항목은 실패로 드러난다.
function swaggerUiSample(schema) {
  const s = resolve(schema);
  if (s.example !== undefined) return s.example;
  if (s.enum) return s.enum[0];
  switch (s.type ?? (s.properties ? 'object' : undefined)) {
    case 'object':
      return Object.fromEntries(Object.entries(s.properties ?? {}).filter(([, v]) => !resolve(v).readOnly).map(([k, v]) => [k, swaggerUiSample(v)]));
    case 'array':
      return [swaggerUiSample(s.items)];
    case 'string':
      return { 'date-time': new Date().toISOString(), date: new Date().toISOString().slice(0, 10), email: 'user@example.com' }[s.format] ?? 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
describe('라우트·목록표·Swagger 대조 (AR-06, AR-07, CR-04)', () => {
  it('실제 등록된 /api 라우트가 200개 이상이고, API 목록표·Swagger 문서와 하나도 빠짐없이 같다', () => {
    const registered = routes.map((r) => r.key);
    const catalog = catalogRows(Infinity).map((r) => `${r.method} ${toOpenApiPath(r.url)}`);
    const documented = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
    assert.ok(registered.length >= 200, `등록된 API ${registered.length}개`);
    assert.equal(new Set(registered).size, registered.length, '같은 Method·URL이 두 번 등록됨');
    assert.equal(new Set(catalog).size, catalog.length, '목록표에 같은 API가 두 번 있음');
    assert.deepEqual([...registered].sort(), [...catalog].sort());
    assert.deepEqual([...registered].sort(), [...documented].sort());
  });

  it('공개 API(로그인·토큰 재발급)와 로그아웃을 빼면 모든 라우트에 권한 검사가 하나씩 붙어 있다 (BR-09)', () => {
    const problems = routes
      .filter((r) => ![...PUBLIC, ...AUTH_ONLY].includes(r.key))
      .filter((r) => r.permissions.length !== 1)
      .map((r) => `${r.key}: 권한 키 ${r.permissions.length}개`);
    expectNone(problems, '권한 검사가 없거나 여러 개인 라우트');
    for (const key of [...PUBLIC, ...AUTH_ONLY]) assert.equal(routes.find((r) => r.key === key).permissions.length, 0, key);
  });

  it('Swagger의 Path·Query·Body 문서가 라우트의 입력 검증 규칙과 항목·필수 여부·형식·선택지·범위·길이·기본값까지 같다', () => {
    const problems = [];
    for (const r of routes) {
      const op = operationOf(r);
      const params = (op.parameters ?? []).map(deref);
      const schema = r.schema ?? {};
      for (const [source, location] of [['params', 'path'], ['query', 'query']]) {
        const rules = schema[source] ?? {};
        const documented = params.filter((p) => p.in === location);
        const names = location === 'path' ? pathParams(r) : Object.keys(rules);
        for (const name of names.filter((n) => !documented.some((p) => p.name === n))) problems.push(`${r.key} ${location}.${name}: 문서 없음`);
        for (const p of documented.filter((x) => !names.includes(x.name))) problems.push(`${r.key} ${location}.${p.name}: 문서에만 있음 (서버가 받지 않음)`);
        for (const p of documented.filter((x) => names.includes(x.name))) {
          const rule = rules[p.name];
          if (!rule) {
            problems.push(`${r.key} ${location}.${p.name}: 검증 규칙 없음`);
            continue;
          }
          if (Boolean(p.required) !== (location === 'path' || Boolean(rule.required))) problems.push(`${r.key} ${location}.${p.name}: 필수 여부 문서 ${Boolean(p.required)}`);
          problems.push(...compareRule(`${r.key} ${location}.${p.name}`, rule, p.schema));
        }
      }
      const requestBody = deref(op.requestBody);
      const bodyDoc = requestBody?.content?.['application/json']?.schema;
      if (schema.body) {
        problems.push(...compareFields(`${r.key} body`, schema.body, bodyDoc));
        if (Object.values(schema.body).some((rule) => rule.required) && !requestBody?.required) problems.push(`${r.key}: requestBody.required 아님`);
        if (resolve(bodyDoc).minProperties !== schema.bodyMinFields) problems.push(`${r.key} body: minProperties 문서 ${resolve(bodyDoc).minProperties} / 규칙 ${schema.bodyMinFields}`);
      } else if (requestBody) {
        problems.push(`${r.key}: 문서에는 요청 본문이 있지만 서버는 본문을 받지 않음`);
      }
    }
    expectNone(problems, '문서와 검증 규칙이 다른 곳');
  });

  it('Swagger UI의 Try it out이 채워 주는 기본 요청 본문과 파라미터 예시가 모두 입력 검증을 통과한다', () => {
    const problems = [];
    const run = (schema, req) => {
      try {
        validate(schema)({ params: {}, query: {}, ...req }, {}, () => {});
        return null;
      } catch (err) {
        return (err.details ?? [err.message]).map((d) => `${d.field} ${d.message}`).join(', ');
      }
    };
    for (const r of routes) {
      const op = operationOf(r);
      const media = deref(op.requestBody)?.content?.['application/json'];
      if (media && r.schema?.body) {
        const body = media.example ?? Object.values(media.examples ?? {})[0]?.value ?? swaggerUiSample(media.schema);
        const error = run({ body: r.schema.body, bodyMinFields: r.schema.bodyMinFields }, { body });
        if (error) problems.push(`${r.key} 본문 ${JSON.stringify(body)}: ${error}`);
      }
      for (const p of (op.parameters ?? []).map(deref)) {
        const example = p.example ?? resolve(p.schema).example;
        const source = p.in === 'path' ? 'params' : 'query';
        if (example === undefined || !r.schema?.[source]?.[p.name]) continue;
        const error = run({ [source]: { [p.name]: r.schema[source][p.name] } }, { [source]: { [p.name]: String(example) } });
        if (error) problems.push(`${r.key} ${p.in}.${p.name} 예시 ${example}: ${error}`);
      }
    }
    expectNone(problems, '예시 값이 검증에 걸리는 곳');
  });

  it('API 목록표의 요구사항 열과 Swagger 설명 앞의 [요구사항]이 API마다 같다 (AR-08, 요구사항 추적표의 기준)', () => {
    const problems = [];
    for (const row of catalogRows(Infinity)) {
      const op = spec.paths[toOpenApiPath(row.url)][row.method.toLowerCase()];
      const documented = (op.description.match(/^\[([^\]]*)\]/) ?? ['', ''])[1];
      if (documented !== row.requirements) problems.push(`#${row.no} ${row.method} ${row.url}: 목록표 [${row.requirements}] / Swagger [${documented}]`);
    }
    expectNone(problems, '요구사항 연결이 다른 API');
  });

  it('요구사항 추적표가 요구사항 58개를 모두 다루고, API 행이 API 목록표의 연결·실제 라우트 파일·컨트롤러 파일과 같으며, 모든 행에 확인방법이 있다', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'requirements_traceability.md'), 'utf8');
    const controllers = new Map();
    for (const file of fs.readdirSync(path.join(__dirname, '..', 'controllers')).filter((f) => /Controller\.js$/.test(f) && !f.startsWith('web'))) {
      for (const fn of Object.values(require(`../controllers/${file}`))) controllers.set(fn, `controllers/${file}`);
    }
    const problems = [];
    const ids = new Set();
    const documented = new Set();
    let current = null;
    for (const line of doc.split('\n')) {
      const cells = line.match(/^\| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/);
      if (!cells) continue;
      const [, idCell, method, apiCell, where, howToCheck] = cells;
      if (where === '구현 위치' || where === '---') continue;
      const id = idCell.match(/\*\*((?:FR|BR|DR|AR|NFR|CR)-\d{2})\*\*/)?.[1];
      if (id) {
        current = id;
        ids.add(id);
      }
      if (!howToCheck.trim()) problems.push(`${current} ${apiCell}: 확인방법 없음`);
      const api = apiCell.match(/^`([^`]+)` \(#(\d+)\)$/);
      if (!api) continue;
      documented.add(`${current} #${api[2]}`);
      const route = routes.find((r) => r.method === method && r.path === api[1]);
      if (!route) {
        problems.push(`${current} #${api[2]}: 등록되지 않은 API ${method} ${api[1]}`);
        continue;
      }
      // 구현 위치는 라우트 파일, 컨트롤러 파일 순으로 시작하고, 적은 파일은 모두 실제로 있어야 한다
      const expected = `${route.file} ${controllers.get(route.handler)}`;
      for (const file of where.split(/\s+/).filter(Boolean)) {
        if (!fs.existsSync(path.join(__dirname, '..', file))) problems.push(`${current} #${api[2]}: 없는 파일 ${file}`);
      }
      if (!where.startsWith(expected)) problems.push(`${current} #${api[2]}: 구현 위치가 실제(${expected})와 다름`);
    }
    const expectedPairs = catalogRows(Infinity).flatMap((r) => r.requirements.split(',').map((s) => `${s.trim()} #${r.no}`));
    for (const pair of expectedPairs.filter((p) => !documented.has(p))) problems.push(`${pair}: 추적표에 행 없음`);
    for (const pair of [...documented].filter((p) => !expectedPairs.includes(p))) problems.push(`${pair}: API 목록표에 없는 연결`);
    const all = [['FR', 23], ['BR', 10], ['DR', 6], ['AR', 8], ['NFR', 5], ['CR', 6]]
      .flatMap(([kind, n]) => Array.from({ length: n }, (_, i) => `${kind}-${String(i + 1).padStart(2, '0')}`));
    for (const id of all.filter((x) => !ids.has(x))) problems.push(`${id}: 추적표에 없음`);
    expectNone(problems, '추적표 문제');
  });

  it('모든 기능 요구사항(FR)과 업무 규칙(BR)이 하나 이상의 API와 연결되고, 목록표의 요구사항 연결 점검 표가 실제 행과 같다 (AR-08)', () => {
    const rows = catalogRows(Infinity);
    const byId = new Map();
    for (const r of rows) {
      for (const id of r.requirements.split(',').map((s) => s.trim()).filter(Boolean)) byId.set(id, [...(byId.get(id) ?? []), r.no]);
    }
    // 연속된 번호는 a~b로 묶는다 (목록표의 표기)
    const ranges = (nums) => {
      const list = [...new Set(nums)].sort((a, b) => a - b);
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        let j = i;
        while (j + 1 < list.length && list[j + 1] === list[j] + 1) j += 1;
        out.push(j > i ? `${list[i]}~${list[j]}` : String(list[i]));
        i = j;
      }
      return out.join(', ');
    };
    const text = fs.readFileSync(path.join(__dirname, '..', 'docs', 'api_catalog.md'), 'utf8');
    const section = text.slice(text.indexOf('## 12. 요구사항 연결 점검'), text.indexOf('## 13.'));
    const table = new Map([...section.matchAll(/^\| ((?:FR|BR)-\d{2}) \| ([^|]+?) \|/gm)].map((m) => [m[1], m[2].replace(/\s*\(.*\)$/, '').trim()]));
    const descriptions = Object.values(spec.paths).flatMap((ops) => Object.values(ops).map((op) => op.description ?? ''));
    const ids = [
      ...Array.from({ length: 23 }, (_, i) => `FR-${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 10 }, (_, i) => `BR-${String(i + 1).padStart(2, '0')}`),
    ];
    const problems = [];
    for (const id of ids) {
      if (!byId.has(id)) problems.push(`${id}: 목록표의 어느 API와도 연결되지 않음`);
      if (!descriptions.some((d) => d.includes(id))) problems.push(`${id}: Swagger 설명에 없음`);
      if (table.get(id) !== ranges(byId.get(id) ?? [])) problems.push(`${id}: 연결 점검 표 "${table.get(id)}" / 실제 "${ranges(byId.get(id) ?? [])}"`);
    }
    expectNone(problems, '요구사항 연결 문제');
  });
});

// ---------------------------------------------------------------------------
describe('모든 라우트의 거부 처리 (BR-09, NFR-02, NFR-03, AR-04)', () => {
  let t;
  const tokens = {};
  before(async () => {
    t = await startServer();
    for (const [role, username] of Object.entries(SEED)) tokens[role] = (await t.login(username)).accessToken;
  });
  after(async () => {
    await t.stop();
  });

  // 형식이 맞는 값(검사 통과)과 틀린 값(검증 실패). 만들 수 없으면 undefined
  function sample(rule = {}, valid = true) {
    if (rule.enum) return valid ? rule.enum[0] : 'NOT_IN_ENUM';
    if (rule.pattern) return valid ? '0'.repeat(24) : 'not-a-valid-id';
    if (rule.type === 'integer' || rule.type === 'number') return valid ? String(rule.min ?? 1) : 'abc';
    if (rule.type === 'boolean') return valid ? 'true' : 'maybe';
    if (rule.type === 'datetime') return valid ? new Date().toISOString() : 'not-a-date';
    if (rule.type === 'array' && rule.items) return valid ? undefined : sample(rule.items, false);
    if (rule.type === 'string' && rule.max) return valid ? 'x' : 'x'.repeat(rule.max + 1);
    return valid ? '1' : undefined;
  }
  const validParams = (route) => Object.fromEntries(pathParams(route).map((name) => [name, sample(route.schema?.params?.[name])]));
  const urlOf = (route, params = validParams(route), query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return route.path.replace(/:(\w+)/g, (_, name) => encodeURIComponent(params[name])) + (qs ? `?${qs}` : '');
  };
  const withBody = (route) => (['GET', 'HEAD'].includes(route.method) ? undefined : {});

  // 라우트의 검증 미들웨어가 이 요청을 거부하는지 서버에 보내기 전에 확인한다 (통과하는 요청은 처리기까지 가므로 보내지 않는다).
  function rejectedLocally(route, { params, query = {}, body }) {
    try {
      validate(route.schema)({ params, query, body }, {}, () => {});
      return false;
    } catch (err) {
      return err.code === 'VALIDATION_ERROR';
    }
  }

  // Path·Query·Body 각각에서 하나만 틀리게 만든 요청과 오류가 나야 할 항목. 해당 입력이 없거나 틀린 값을 만들 수 없으면 그 종류는 빠진다.
  function invalidRequests(route) {
    const s = route.schema;
    if (!s) return [];
    const params = validParams(route);
    const candidates = [];
    const pathKey = pathParams(route).find((k) => sample(s.params?.[k], false) !== undefined);
    if (pathKey) candidates.push({ source: 'path', field: `params.${pathKey}`, params: { ...params, [pathKey]: sample(s.params[pathKey], false) } });
    const queryKey = Object.keys(s.query ?? {}).find((k) => sample(s.query[k], false) !== undefined);
    if (queryKey) candidates.push({ source: 'query', field: `query.${queryKey}`, params, query: { [queryKey]: sample(s.query[queryKey], false) } });
    if (s.body) candidates.push({ source: 'body', field: 'body.__unexpected', params, body: { __unexpected: true } });
    return candidates
      .filter((c) => rejectedLocally(route, c))
      .map((c) => ({ source: c.source, field: c.field, url: urlOf(route, c.params, c.query), body: c.body }));
  }

  async function firstRole(key, allowed) {
    for (const role of ROLES) if ((await permissionService.has(role, key)) === allowed) return role;
    return null;
  }

  it('토큰 없이 부르면 공개 API를 빼고 모두 401, 공개 API는 빈 본문에 400이다', async () => {
    const problems = [];
    for (const r of routes) {
      const res = await t.api(r.method, urlOf(r), PUBLIC.includes(r.key) ? { body: {} } : {});
      const expected = PUBLIC.includes(r.key) ? 400 : 401;
      if (res.status !== expected) problems.push(`${r.key}: ${res.status} (${res.body?.error?.code})`);
    }
    expectNone(problems, '예상과 다른 응답');
  });

  it('권한이 없는 역할로 부르면 모두 403이고 어떤 권한이 필요한지 알려 준다 (모든 역할이 가진 권한 키는 제외)', async (ctx) => {
    const problems = [];
    let checked = 0;
    for (const r of routes.filter((x) => x.permissions.length === 1)) {
      const [key] = r.permissions;
      const role = await firstRole(key, false);
      if (!role) continue;
      checked += 1;
      const res = await t.api(r.method, urlOf(r), { token: tokens[role], body: withBody(r) });
      if (res.status !== 403 || res.body?.error?.details?.permission !== key) problems.push(`${r.key} (${role}): ${res.status} ${res.text.slice(0, 120)}`);
    }
    ctx.diagnostic(`403 확인 ${checked}개 라우트`);
    expectNone(problems, '권한 없이 통과하거나 다른 응답을 준 라우트');
  });

  it('권한이 있어도 잘못된 Path·Query·Body는 처리 전에 400으로 막히고, 500은 한 번도 없다', async (ctx) => {
    const problems = [];
    const counts = { path: 0, query: 0, body: 0 };
    let skipped = 0;
    for (const r of routes) {
      const requests = invalidRequests(r);
      if (requests.length === 0) skipped += 1;
      const role = r.permissions.length ? await firstRole(r.permissions[0], true) : null;
      for (const req of requests) {
        counts[req.source] += 1;
        const res = await t.api(r.method, req.url, { token: role ? tokens[role] : undefined, body: req.body });
        const fields = (res.body?.error?.details ?? []).map((d) => d.field);
        if (res.status !== 400 || res.body?.error?.code !== 'VALIDATION_ERROR' || !fields.some((f) => f.startsWith(req.field))) {
          problems.push(`${r.key} [${req.source}] ${req.url}: ${res.status} ${res.text.slice(0, 160)}`);
        }
      }
    }
    ctx.diagnostic(`400 확인 path ${counts.path}·query ${counts.query}·body ${counts.body}건, 입력이 없어 제외한 라우트 ${skipped}개`);
    expectNone(problems, '잘못된 입력을 막지 못한 요청');
    const health = await t.api('GET', '/api/admin/health', { token: tokens.ADMIN });
    assert.equal(health.status, 200);
    assert.equal(health.body.data.status, 'ok');
  });

  it('응답 문서에 실제로 돌려주는 401·403·400이 적혀 있다', async () => {
    const problems = [];
    for (const r of routes) {
      const responses = operationOf(r).responses ?? {};
      if (!PUBLIC.includes(r.key) && !responses['401']) problems.push(`${r.key}: 401 문서 없음`);
      if (r.permissions.length && (await firstRole(r.permissions[0], false)) && !responses['403']) problems.push(`${r.key}: 403 문서 없음`);
      if (invalidRequests(r).length > 0 && !responses['400']) problems.push(`${r.key}: 400 문서 없음`);
    }
    expectNone(problems, '응답 문서 누락');
  });

  it('Swagger UI 화면과 스크립트가 열리고, 문서에 bearerAuth가 걸려 있다 (CR-04)', async () => {
    const page = await t.api('GET', '/api-docs/');
    assert.equal(page.status, 200);
    for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'swagger-ui-init.js']) {
      assert.ok(page.text.includes(asset), asset);
      const res = await t.api('GET', `/api-docs/${asset}`);
      assert.equal(res.status, 200, asset);
    }
    const init = await t.api('GET', '/api-docs/swagger-ui-init.js');
    assert.ok(init.text.includes('/api/auth/login') && init.text.includes('persistAuthorization'));
    // Authorize에 넣은 토큰이 공개 API를 뺀 모든 요청에 붙고, 요청은 지금 열린 주소(포트)로 간다(servers 미지정).
    assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
    for (const r of routes) assert.deepEqual(operationOf(r).security, PUBLIC.includes(r.key) ? [] : undefined, r.key);
    assert.equal(spec.servers, undefined);
  });
});
