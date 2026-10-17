// 이력 기록 서비스 (FR-20, BR-10, DR-04). 모든 단계의 상태 변경·관리 활동이 이 서비스를 호출한다.
// SQL 트랜잭션이 커밋된 뒤에 호출해서, 취소된 변경이 기록되지 않게 한다.
// 이력 저장이 실패해도 이미 끝난 본 작업을 되돌리지는 않고, 서버 로그에 남긴다.
const ActivityLog = require('../models/mongo/ActivityLog');
const LoginHistory = require('../models/mongo/LoginHistory');
const SecurityEvent = require('../models/mongo/SecurityEvent');

const actorOf = (user) => (user ? { userId: user.id, username: user.username, role: user.role } : undefined);

const userTarget = (user) => ({ entity: 'user', id: String(user.id), label: user.username });
const crewTarget = (crew) => ({ entity: 'crew', id: String(crew.id), label: crew.name });

async function safely(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[audit] ${label} 저장 실패: ${err.message}`);
  }
}

// entry: { actor, action, target: { entity, id, label }, related?, before?, after?, reason?, ip? }
// action은 'USER_ROLE_CHANGED' 같은 대문자 행위 코드다.
const toDocument = ({ actor, action, target, related, before, after, reason, ip }) =>
  ({ action, actor: actorOf(actor), target, related, before, after, reason, ip });

async function record(entry) {
  await safely('활동 기록', () => ActivityLog.create(toDocument(entry)));
}

async function recordMany(entries) {
  if (entries.length === 0) return;
  await safely('활동 기록', () => ActivityLog.insertMany(entries.map(toDocument)));
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

module.exports = { record, recordMany, recordLogin, recordAccessDenied, userTarget, crewTarget };
