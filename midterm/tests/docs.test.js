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
