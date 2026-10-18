// 역할별 권한 (NFR-03, FR-23). config/permissions.js의 기본값에 관리자가 바꾼 값(role_permission_overrides)을 겹쳐 쓴다.
// 수정값은 메모리에 올려 두고, 바뀌면 바로 다시 읽어 RBAC 미들웨어에 즉시 반영한다.
const DEFAULT_PERMISSIONS = require('../config/permissions');
const permissionModel = require('../models/sql/permissionModel');

let overrides = null; // Map<'ROLE:key', allowed>

function assertKnown(key) {
  if (!DEFAULT_PERMISSIONS[key]) throw new Error(`config/permissions.js에 정의되지 않은 권한 키입니다: ${key}`);
}

async function loadOverrides() {
  if (!overrides) {
    const rows = await permissionModel.listOverrides();
    overrides = new Map(rows.filter((r) => DEFAULT_PERMISSIONS[r.key]).map((r) => [`${r.role}:${r.key}`, r.allowed]));
  }
  return overrides;
}

// 저장된 수정값을 다시 읽게 한다 (수정 직후, 테스트에서 DB를 바꾼 뒤).
function invalidate() {
  overrides = null;
}

const isDefault = (role, key) => DEFAULT_PERMISSIONS[key].roles.includes(role);

function effective(map, role, key) {
  const o = map.get(`${role}:${key}`);
  return o === undefined ? isDefault(role, key) : o;
}

async function has(role, key) {
  assertKnown(key);
  return effective(await loadOverrides(), role, key);
}

async function listFor(role) {
  const map = await loadOverrides();
  return Object.entries(DEFAULT_PERMISSIONS)
    .filter(([key]) => effective(map, role, key))
    .map(([key, p]) => ({ key, description: p.description }));
}

// 권한 키 × 역할 매트릭스 (지금 값과 기본값)
async function matrix(roles) {
  const map = await loadOverrides();
  return Object.entries(DEFAULT_PERMISSIONS).map(([key, p]) => ({
    key,
    description: p.description,
    roles: Object.fromEntries(roles.map((role) => [role, { allowed: effective(map, role, key), default: isDefault(role, key) }])),
  }));
}

// 한 역할이 가질 권한 키 목록으로 바꾼다. 기본값과 다른 것만 저장한다.
async function replaceRole(role, allowedKeys, updatedBy) {
  const allowed = new Set(allowedKeys);
  const items = Object.keys(DEFAULT_PERMISSIONS)
    .filter((key) => allowed.has(key) !== isDefault(role, key))
    .map((key) => ({ key, allowed: allowed.has(key) }));
  await permissionModel.replaceForRole(role, items, updatedBy);
  invalidate();
  return items;
}

module.exports = { DEFAULT_PERMISSIONS, assertKnown, invalidate, has, listFor, matrix, replaceRole };
