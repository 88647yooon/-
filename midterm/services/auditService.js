// 이력 기록 서비스 (FR-20, BR-10, DR-04). 모든 단계의 상태 변경·관리 활동이 이 서비스를 호출한다.
// 이력 저장이 실패해도 이미 끝난 본 작업을 되돌리지는 않고, 서버 로그에 남긴다.
const ActivityLog = require('../models/mongo/ActivityLog');
const LoginHistory = require('../models/mongo/LoginHistory');
const SecurityEvent = require('../models/mongo/SecurityEvent');

const actorOf = (user) => (user ? { userId: user.id, username: user.username, role: user.role } : undefined);

const userTarget = (user) => ({ entity: 'user', id: String(user.id), label: user.username });

async function safely(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[audit] ${label} 저장 실패: ${err.message}`);
  }
}

// action: 'USER_PROFILE_UPDATED' 같은 대문자 행위 코드
// target: { entity, id, label }
async function record({ actor, action, target, before, after, reason, ip }) {
  await safely('활동 기록', () =>
    ActivityLog.create({ action, actor: actorOf(actor), target, before, after, reason, ip }));
}

async function recordLogin({ user, username, success, reason, ip, userAgent }) {
  await safely('로그인 기록', () =>
    LoginHistory.create({ userId: user?.id ?? null, username, success, reason, ip, userAgent }));
}

async function recordAccessDenied({ user, req, reason, details }) {
  await safely('권한 거부 기록', () =>
    SecurityEvent.create({
      event: 'ACCESS_DENIED',
      user: actorOf(user),
      method: req.method,
      path: req.originalUrl,
      reason,
      details,
      ip: req.ip,
    }));
}

module.exports = { record, recordLogin, recordAccessDenied, userTarget };
