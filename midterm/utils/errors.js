// 공통 오류 형식 (AR-04, AR-05, NFR-05). 서비스와 미들웨어는 이 함수들로만 오류를 만든다.
// 응답: { success: false, error: { code, message, details } }

class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message = '입력값이 올바르지 않습니다.', details = null) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

const unauthenticated = (message = '로그인이 필요합니다.') =>
  new AppError(401, 'UNAUTHENTICATED', message);

const forbidden = (message = '이 작업을 수행할 권한이 없습니다.', details = null) =>
  new AppError(403, 'FORBIDDEN', message, details);

const notFound = (message = '대상을 찾을 수 없습니다.') =>
  new AppError(404, 'NOT_FOUND', message);

// 업무 규칙 위반. code에 위반한 규칙 ID(예: 'BR-03')를 넣는다.
const ruleViolation = (ruleId, message, details = null) =>
  new AppError(409, ruleId, message, details);

module.exports = { AppError, badRequest, unauthenticated, forbidden, notFound, ruleViolation };
