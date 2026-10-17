// 요청의 Cookie 헤더를 { 이름: 값 } 객체로 읽는다. (쿠키 쓰기는 Express의 res.cookie를 쓴다)
function parseCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

module.exports = { parseCookies };
