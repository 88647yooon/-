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

// 대상의 현재 상태와 맞지 않는 요청 (이미 해산된 Crew, 허용되지 않는 상태 전이 등)
// 중복 값은 code를 'DUPLICATE'로 준다.
const conflict = (message, details = null, code = 'CONFLICT') =>
  new AppError(409, code, message, details);

// 일괄 처리에서 한 건이라도 실패해 전체를 취소한 경우. details에 행별 오류(code 포함)를 담는다.
const bulkRejected = (total, rows) =>
  new AppError(409, 'BULK_REJECTED', `${total}건 중 ${rows.length}건이 처리될 수 없어 전체를 취소했습니다.`, rows);

module.exports = { AppError, badRequest, unauthenticated, forbidden, notFound, ruleViolation, conflict, bulkRejected };
