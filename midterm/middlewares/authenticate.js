// JWT 인증 미들웨어 (NFR-03, BR-09).
// 토큰 서명뿐 아니라 세션이 살아 있는지, 계정이 지금도 사용 가능한지 매 요청마다 DB에서 확인한다.
// 그래서 로그아웃·강제 종료·정지된 계정은 토큰 만료 전이라도 즉시 막힌다.
const jwt = require('jsonwebtoken');
const config = require('../config');
const sessionModel = require('../models/sql/sessionModel');
const userModel = require('../models/sql/userModel');
const authService = require('../services/authService');
const { unauthenticated } = require('../utils/errors');

async function authenticate(req, res, next) {
  // 같은 경로에 라우터 여러 개가 붙어 있어도 한 번만 검사한다.
  if (req.user) return next();

  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthenticated('로그인이 필요합니다. Authorization 헤더에 "Bearer <accessToken>"을 넣어 주세요.');
  }

  let payload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret);
  } catch (err) {
    throw unauthenticated(err.name === 'TokenExpiredError'
      ? '액세스 토큰이 만료되었습니다. /api/auth/refresh로 재발급받아 주세요.'
      : '유효하지 않은 액세스 토큰입니다.');
  }

  const session = await sessionModel.findActiveById(payload.sid);
  if (!session || String(session.userId) !== payload.sub) {
    throw unauthenticated('종료되었거나 만료된 세션입니다. 다시 로그인해 주세요.');
  }

  const user = await userModel.findById(session.userId);
  authService.assertCanSignIn(user);
  await sessionModel.touch(session.id);

  req.user = user;
  req.sessionId = session.id;
  next();
}

module.exports = { authenticate };
