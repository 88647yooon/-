// 없는 경로 처리와 전역 오류 처리 (AR-04, AR-05, NFR-02, NFR-05).
// 어떤 오류든 공통 오류 형식으로 응답하고, 서버 프로세스는 계속 동작한다.
const { AppError, notFound } = require('../utils/errors');
const auditService = require('../services/auditService');

function notFoundHandler(req, res, next) {
  next(notFound(`요청한 경로를 찾을 수 없습니다: ${req.method} ${req.originalUrl}`));
}

// 라이브러리·DB 오류를 공통 오류로 바꾼다.
function normalize(err) {
  if (err instanceof AppError) return err;
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', '요청 본문이 올바른 JSON 형식이 아닙니다.');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 본문이 너무 큽니다.');
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return new AppError(409, 'DUPLICATE', '이미 존재하는 값입니다.');
  }
  return new AppError(500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
}

async function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const e = normalize(err);
  if (e.status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}\n`, err);

  // 로그인한 사용자의 권한 거부는 보안 이벤트로 남긴다 (BR-09).
  if (e.status === 403 && req.user) {
    await auditService.recordAccessDenied({ user: req.user, req, reason: e.message, details: e.details });
  }

  res.status(e.status).json({
    success: false,
    error: { code: e.code, message: e.message, details: e.details ?? null },
  });
}

module.exports = { notFoundHandler, errorHandler };
