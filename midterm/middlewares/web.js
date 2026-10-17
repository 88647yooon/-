// 웹 화면(EJS) 공통 미들웨어 (CR-02).
// 로그인 상태는 HttpOnly 쿠키에 담은 JWT 액세스 토큰으로 유지하고, API와 같은 authenticate로 검증한다.
// SameSite=Lax 쿠키라서 다른 사이트의 폼 전송(POST)에는 쿠키가 실리지 않는다.
const { authenticate } = require('./authenticate');
const { normalize } = require('./errorHandler');
const permissionService = require('../services/permissionService');
const auditService = require('../services/auditService');
const { presentUser } = require('../services/presenters');
const constants = require('../config/constants');
const { parseCookies } = require('../utils/cookies');

const TOKEN_COOKIE = 'family_token';
const FLASH_COOKIE = 'family_flash';
const COOKIE_BASE = { httpOnly: true, sameSite: 'lax', path: '/' };

const setLoginCookie = (res, { accessToken, expiresIn }) =>
  res.cookie(TOKEN_COOKIE, accessToken, { ...COOKIE_BASE, maxAge: expiresIn * 1000 });
const clearLoginCookie = (res) => res.clearCookie(TOKEN_COOKIE, COOKIE_BASE);

// 다음 화면에 한 번 보여 줄 결과 메시지 (NFR-01: 작업 성공·실패를 명확히 알린다)
function setFlash(res, type, message, extra = {}) {
  const value = Buffer.from(JSON.stringify({ type, message, ...extra })).toString('base64url');
  res.cookie(FLASH_COOKIE, value, { ...COOKIE_BASE, maxAge: 60 * 1000 });
}

// 로그인 후 이동할 주소. 다른 사이트로 넘어가지 않도록 이 사이트의 경로만 받는다.
const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/');

// 폼을 보낸 화면의 경로 (같은 사이트일 때만)
function backPath(req) {
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.host === req.get('host') ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '-');

// 모든 화면 요청: 로그인 사용자를 확인하고 템플릿이 함께 쓰는 값을 준비한다.
async function webContext(req, res, next) {
  const cookies = parseCookies(req);

  res.locals.flash = null;
  if (cookies[FLASH_COOKIE]) {
    try {
      res.locals.flash = JSON.parse(Buffer.from(cookies[FLASH_COOKIE], 'base64url').toString());
    } catch {
      // 깨진 메시지는 무시한다.
    }
    // 메시지는 실제로 화면을 그릴 때 지운다 (중간에 다른 화면으로 넘어가도 사라지지 않게).
    const render = res.render.bind(res);
    res.render = (...args) => {
      res.clearCookie(FLASH_COOKIE, COOKIE_BASE);
      return render(...args);
    };
  }

  res.locals.me = null;
  res.locals.can = () => false;
  res.locals.C = constants;
  res.locals.fmt = formatDate;
  res.locals.path = req.path;
  res.locals.pageUrl = (page) => `${req.path}?${new URLSearchParams({ ...req.query, page: String(page) })}`;

  const token = cookies[TOKEN_COOKIE];
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
    try {
      await authenticate(req, res, () => {});
      const keys = new Set((await permissionService.listFor(req.user.role)).map((p) => p.key));
      res.locals.me = presentUser(req.user);
      res.locals.can = (key) => keys.has(key);
    } catch {
      // 만료·종료된 세션이거나 사용할 수 없게 된 계정이면 로그아웃 상태로 둔다.
      req.user = undefined;
      clearLoginCookie(res);
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  setFlash(res, 'info', '로그인이 필요합니다.');
  const target = req.method === 'GET' ? req.originalUrl : (backPath(req) ?? '/');
  return res.redirect(`/login?next=${encodeURIComponent(target)}`);
}

function webNotFound(req, res) {
  res.status(404).render('error', {
    title: '페이지 없음',
    error: { status: 404, code: 'NOT_FOUND', message: `페이지를 찾을 수 없습니다: ${req.originalUrl}` },
  });
}

// 화면 요청의 오류 처리. 폼 전송이 실패하면 오류 메시지를 남기고 원래 화면으로 돌려보낸다.
async function webErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const e = normalize(err);
  if (e.status >= 500) console.error(`[web error] ${req.method} ${req.originalUrl}\n`, err);

  // 로그인한 사용자의 권한 거부는 API와 똑같이 보안 이벤트로 남긴다 (BR-09).
  if (e.status === 403 && req.user) {
    await auditService.recordAccessDenied({ user: req.user, req, reason: e.message, details: e.details });
  }
  if (e.status === 401) {
    clearLoginCookie(res);
    setFlash(res, 'error', e.message, { code: e.code });
    return res.redirect('/login');
  }
  if (req.method === 'POST') {
    setFlash(res, 'error', e.message, {
      code: e.code,
      rule: e.details?.rule ?? null,
      details: Array.isArray(e.details) ? e.details : null,
    });
    return res.redirect(backPath(req) ?? '/');
  }
  return res.status(e.status).render('error', { title: '오류', error: e });
}

module.exports = {
  setLoginCookie,
  clearLoginCookie,
  setFlash,
  safeNext,
  backPath,
  webContext,
  requireLogin,
  webNotFound,
  webErrorHandler,
};
