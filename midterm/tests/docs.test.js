// Swagger 문서와 API 목록표 대조 (CR-04, AR-06, AR-08). 구현을 마친 단계(IMPLEMENTED_STEP)까지 검사한다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, catalogRows, toOpenApiPath, IMPLEMENTED_STEP } = require('./helpers');

let t;
let spec;
before(async () => {
  t = await startServer();
  spec = (await t.api('GET', '/api-docs.json')).body;
});
after(async () => {
  await t.stop();
});

const operations = () => Object.entries(spec.paths).flatMap(([p, ops]) => Object.entries(ops).map(([m, op]) => ({ key: `${m.toUpperCase()} ${p}`, op })));

describe('Swagger 문서 (CR-04, AR-08)', () => {
  it('/api-docs가 열리고 bearerAuth 인증이 설정되어 있다', async () => {
    const page = await t.api('GET', '/api-docs/');
    assert.equal(page.status, 200);
    assert.match(page.text, /swagger-ui/i);
    assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  });

  it(`목록표의 단계 1~${IMPLEMENTED_STEP} API가 모두 문서화되어 있고, 목록표에 없는 API는 문서에 없다`, () => {
    const documented = operations().map((o) => o.key).sort();
    const expected = catalogRows(IMPLEMENTED_STEP).map((r) => `${r.method} ${toOpenApiPath(r.url)}`).sort();
    assert.deepEqual(documented, expected);
  });

  it('모든 API 설명이 연결된 요구사항 ID로 시작한다', () => {
    for (const { key, op } of operations()) {
      assert.match(op.description ?? '', /^\[(FR|BR|DR|AR|NFR|CR)-\d{2}/, key);
    }
  });

  it('모든 API에 요약, 태그, 응답 문서가 있다', () => {
    for (const { key, op } of operations()) {
      assert.ok(op.summary, `${key}: summary 없음`);
      assert.ok(op.tags?.length, `${key}: tags 없음`);
      assert.ok(Object.keys(op.responses ?? {}).some((code) => code.startsWith('2')), `${key}: 성공 응답 문서 없음`);
    }
  });
});

// 웹 화면에서 뺀 기능 요구사항 확인 방법 문서가 화면·시드 데이터와 어긋나지 않는지 확인한다.
describe('기능 요구사항 확인 문서 (docs/requirements_check.md)', () => {
  const fs = require('fs');
  const path = require('path');
  const config = require('../config');
  const seedData = require('../models/seedData');
  const permissions = require('../config/permissions');
  const { NAV } = require('../controllers/webNav');
  const { ROLE_INFO, MEMBER_STATUS_INFO } = require('../config/constants');
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'requirements_check.md'), 'utf8');

  it('모든 기능 요구사항(FR-01~FR-23)과 업무 규칙(BR-01~BR-10)의 확인 방법이 있다', () => {
    const ids = [
      ...Array.from({ length: 23 }, (_, i) => `FR-${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 10 }, (_, i) => `BR-${String(i + 1).padStart(2, '0')}`),
    ];
    for (const id of ids) assert.ok(doc.includes(id), `${id} 없음`);
  });

  it('테스트 계정·비밀번호·시드 Crew가 시드 데이터와 같다', () => {
    assert.ok(doc.includes(`\`${config.seedPassword}\``));
    for (const u of seedData.users) {
      assert.ok(doc.includes(`| ${u.username} | ${u.name} | ${ROLE_INFO[u.role].label} | ${MEMBER_STATUS_INFO[u.status].label} |`), u.username);
    }
    for (const c of seedData.crews) assert.ok(doc.includes(`| ${c.name} | ${c.region} | ${c.capo} | ${c.underboss} |`), c.name);
  });

  it('화면 구성 표의 메뉴 이름·주소·보이는 역할이 실제 왼쪽 메뉴와 같다', () => {
    for (const group of NAV) {
      for (const item of group.items) {
        const row = doc.split('\n').find((line) => line.startsWith(`| ${group.label ? `${group.label} › ` : ''}${item.label} | \`${item.href}\` |`));
        assert.ok(row, `${item.label} 메뉴 행 없음`);
        if (!item.perm) continue;
        const roles = permissions[item.perm].roles;
        const cell = row.split('|')[3].trim();
        const all = Object.keys(ROLE_INFO).every((r) => roles.includes(r));
        // '모든 역할', 'A~B'(순위 범위), 'A, B' 형식을 역할 목록으로 풀어 비교한다
        const order = ['ASSOCIATE', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS', 'ADMIN'];
        const byLabel = Object.fromEntries(Object.entries(ROLE_INFO).map(([k, v]) => [v.label, k]));
        const listed = cell === '모든 역할' ? order : cell.split(', ').flatMap((part) => {
          const [from, to] = part.split('~');
          return to ? order.slice(order.indexOf(byLabel[from]), order.indexOf(byLabel[to]) + 1) : [byLabel[part]];
        });
        assert.deepEqual([...listed].sort(), [...roles].sort(), `${item.label}: 문서 '${cell}' / 권한 ${roles.join(', ')}${all ? ' (모든 역할)' : ''}`);
      }
    }
  });
});
