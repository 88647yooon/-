// 서비스 계층이 Express 요청 객체에 의존하지 않도록, 이력 기록에 필요한 요청 정보만 꺼낸다.
const contextOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

module.exports = { contextOf };
