// 목록 조회의 페이지·정렬 (AR-03, NFR-04).
// 요청: ?page=1&size=20&sort=-createdAt  응답 meta: { page, size, total, totalPages }

// validate()의 query 규칙. sortKeys를 주면 sort 항목('키' 또는 '-키')도 받는다.
function pagingRules(sortKeys, defaultSort) {
  const rules = {
    page: { type: 'integer', min: 1, default: 1 },
    size: { type: 'integer', min: 1, max: 100, default: 20 },
  };
  if (sortKeys) {
    rules.sort = { type: 'string', enum: sortKeys.flatMap((k) => [k, `-${k}`]), default: defaultSort };
  }
  return rules;
}

const limitOffset = ({ page, size }) => [size, (page - 1) * size];

const pageMeta = ({ page, size }, total) => ({ page, size, total, totalPages: Math.max(1, Math.ceil(total / size)) });

module.exports = { pagingRules, limitOffset, pageMeta };
