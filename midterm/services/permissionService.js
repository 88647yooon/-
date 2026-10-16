// 역할별 권한 조회 (NFR-03). 지금은 config/permissions.js의 기본값만 사용한다.
// 단계 6에서 관리자가 역할별 권한을 수정할 수 있게 되면 여기서 수정값을 함께 반영한다.
const DEFAULT_PERMISSIONS = require('../config/permissions');

function assertKnown(key) {
  if (!DEFAULT_PERMISSIONS[key]) throw new Error(`config/permissions.js에 정의되지 않은 권한 키입니다: ${key}`);
}

async function has(role, key) {
  assertKnown(key);
  return DEFAULT_PERMISSIONS[key].roles.includes(role);
}

async function listFor(role) {
  return Object.entries(DEFAULT_PERMISSIONS)
    .filter(([, p]) => p.roles.includes(role))
    .map(([key, p]) => ({ key, description: p.description }));
}

module.exports = { assertKnown, has, listFor };
