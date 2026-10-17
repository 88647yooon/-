// 공통 성공 응답 형식 (AR-05, NFR-01, NFR-05).
// 응답: { success: true, data, meta? }  (meta는 목록 조회에만)

function ok(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

// 서비스가 돌려준 { data, meta } 목록 결과를 그대로 응답한다.
const okPage = (res, { data, meta }) => ok(res, data, { meta });

const created = (res, data) => ok(res, data, { status: 201 });

module.exports = { ok, okPage, created };
