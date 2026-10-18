// 역할 기반 접근 제어 미들웨어 (NFR-03, BR-09). authenticate 다음에 사용한다.
// 권한 키와 역할의 대응은 config/permissions.js에 있다.
const permissionService = require('../services/permissionService');
const { unauthenticated, forbidden } = require('../utils/errors');

function requirePermission(key) {
  permissionService.assertKnown(key); // 오타는 서버 시작 시점에 바로 드러나게 한다.

  const middleware = async (req, res, next) => {
    if (!req.user) throw unauthenticated();
    if (!(await permissionService.has(req.user.role, key))) {
      throw forbidden('이 작업을 수행할 권한이 없습니다.', { permission: key, role: req.user.role });
    }
    next();
  };
  // 통합 점검(tests/integration.test.js)이 라우트마다 권한 검사가 붙었는지 확인할 수 있게 키를 붙여 둔다.
  middleware.permission = key;
  return middleware;
}

module.exports = { requirePermission };
