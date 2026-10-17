// 동적 SQL 조각 도구. 값은 항상 자리표시자(?)로 넘겨 SQL 주입을 막는다.

// conds: [[sql, ...params] | null | false | undefined, ...] → { sql: 'WHERE ...', params }
function where(conds) {
  const active = conds.filter(Boolean);
  if (active.length === 0) return { sql: '', params: [] };
  return {
    sql: `WHERE ${active.map(([sql]) => `(${sql})`).join(' AND ')}`,
    params: active.flatMap(([, ...params]) => params),
  };
}

// LIKE 검색어. %, _, \ 는 글자 그대로 찾도록 이스케이프한다.
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// sort: 'name' 또는 '-name'(내림차순). columns: 정렬 키 → SQL 식 (화이트리스트)
function orderBy(sort, columns, tieBreaker) {
  const desc = sort.startsWith('-');
  const column = columns[desc ? sort.slice(1) : sort];
  const dir = desc ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${dir}, ${tieBreaker} ${dir}`;
}

// 운영 계층 순위 정렬식 (Administrator는 0)
const RANK_SQL = (column) => `FIELD(${column}, 'ASSOCIATE', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'BOSS')`;

module.exports = { where, like, orderBy, RANK_SQL };
