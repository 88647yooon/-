// 역할 변경 요청(추천) (FR-03, BR-04, BR-05)
// Capo는 역할을 직접 바꿀 수 없으므로 자기 Crew 소속원의 역할 변경을 추천하고, Underboss·Boss가 승인한다.
const { withTransaction } = require('../config/database');
const roleRequestModel = require('../models/sql/roleRequestModel');
const auditService = require('./auditService');
const access = require('./accessService');
const userService = require('./userService');
const { requireUser } = require('./lookup');
const { loadRefs } = require('./refs');
const P = require('./presenters');
const { ROLE_INFO, REQUEST_STATUS_INFO, CREW_MEMBER_ROLES } = require('../config/constants');
const { forbidden, conflict, notFound } = require('../utils/errors');
const { pageMeta } = require('../utils/pagination');

const { userTarget } = auditService;

async function presentMany(rows) {
  const refs = await loadRefs({ userIds: rows.flatMap((r) => [r.userId, r.requestedBy, r.decidedBy]) });
  return rows.map((r) => P.presentRoleRequest(r, refs));
}

const presentOne = async (id) => (await presentMany([await roleRequestModel.findById(id)]))[0];

async function requireRequest(id, conn, { pending = false } = {}) {
  const request = await roleRequestModel.findById(id, conn, { forUpdate: Boolean(conn) });
  if (!request) throw notFound(`역할 변경 요청(ID ${id})을 찾을 수 없습니다.`);
  if (pending && request.status !== 'PENDING') {
    throw conflict(`이미 처리된 요청입니다. (현재 상태: ${REQUEST_STATUS_INFO[request.status].label})`, { status: request.status });
  }
  return request;
}

// #51 역할 변경 요청. 요청자보다 낮은 역할의 구성원만 대상이 될 수 있다 (BR-04).
// Capo는 자기 Crew 소속원에 대해 Associate·Soldier·Capo 역할만 추천할 수 있다 (BR-05).
async function create(actor, { userId, role, reason }, ctx) {
  const { target, requestId } = await withTransaction(async (conn) => {
    const user = await requireUser(userId, conn, { forUpdate: true });
    if (user.id === actor.id) throw forbidden('본인의 역할 변경은 요청할 수 없습니다.');
    if (user.status === 'WITHDRAWN') throw conflict('탈퇴한 구성원의 역할은 바꿀 수 없습니다.');
    if (user.role === role) throw conflict(`이미 ${ROLE_INFO[role].label} 역할입니다.`);
    if (user.role === 'ADMIN' || role === 'ADMIN') throw forbidden('Administrator 역할은 역할 변경 요청의 대상이 아닙니다.');
    if (!access.outranks(actor, user)) {
      throw forbidden('자신과 같거나 높은 역할의 구성원은 역할 변경을 요청할 수 없습니다.',
        { rule: 'BR-04', actorRole: actor.role, targetRole: user.role });
    }
    if (actor.role === 'CAPO') {
      if (!(await access.isInCapoCrew(actor, user.id, conn))) {
        throw forbidden('Capo는 자신이 책임자인 Crew의 소속원만 추천할 수 있습니다.', { rule: 'BR-05' });
      }
      if (!CREW_MEMBER_ROLES.includes(role)) {
        throw forbidden('Capo는 Associate·Soldier·Capo 역할만 추천할 수 있습니다.', { rule: 'BR-04', role });
      }
    }
    if (await roleRequestModel.findPendingByUser(userId, conn)) {
      throw conflict('이 구성원에 대해 처리 대기 중인 역할 변경 요청이 이미 있습니다.');
    }
    try {
      const id = await roleRequestModel.insert({ userId, requestedBy: actor.id, fromRole: user.role, toRole: role, reason }, conn);
      return { target: user, requestId: id };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('이 구성원에 대해 처리 대기 중인 역할 변경 요청이 이미 있습니다.');
      throw err;
    }
  });
  await auditService.record({
    actor, action: 'ROLE_REQUEST_CREATED', target: userTarget(target),
    before: { role: target.role }, after: { requestId, toRole: role }, reason, ip: ctx.ip,
  });
  return presentOne(requestId);
}

// #52 요청 목록. Capo는 자신이 한 요청만 본다.
async function list(actor, query) {
  const filter = actor.role === 'CAPO' ? { ...query, requestedBy: actor.id } : query;
  const { rows, total } = await roleRequestModel.search(filter);
  return { data: await presentMany(rows), meta: pageMeta(query, total) };
}

// #53 요청 상세
async function get(actor, requestId) {
  const request = await requireRequest(requestId);
  if (actor.role === 'CAPO' && request.requestedBy !== actor.id) throw forbidden('Capo는 자신이 한 요청만 볼 수 있습니다.');
  return presentOne(requestId);
}

// #54 승인. 승인하는 사람 기준으로 역할 변경 규칙(BR-04)을 다시 검사하고 역할을 바꾼다.
async function approve(actor, requestId, ctx) {
  const { request, target } = await withTransaction(async (conn) => {
    const r = await requireRequest(requestId, conn, { pending: true });
    if (r.requestedBy === actor.id) throw forbidden('자신이 한 요청은 승인할 수 없습니다.');
    const user = await requireUser(r.userId, conn, { forUpdate: true });
    if (user.role !== r.fromRole) {
      throw conflict(`요청 이후 대상의 역할이 바뀌었습니다. (요청 시 ${ROLE_INFO[r.fromRole].label}, 현재 ${ROLE_INFO[user.role].label})`,
        { fromRole: r.fromRole, currentRole: user.role });
    }
    await userService.applyRoleChange(conn, actor, user, r.toRole);
    await roleRequestModel.decide(requestId, { status: 'APPROVED', decidedBy: actor.id }, conn);
    return { request: r, target: user };
  });
  await auditService.recordMany([
    { actor, action: 'ROLE_REQUEST_APPROVED', target: userTarget(target), after: { requestId }, ip: ctx.ip },
    {
      actor, action: 'USER_ROLE_CHANGED', target: userTarget(target), before: { role: request.fromRole }, after: { role: request.toRole, requestId },
      reason: request.reason, ip: ctx.ip,
    },
  ]);
  return presentOne(requestId);
}

// #55 거절 (사유 필수)
async function reject(actor, requestId, { reason }, ctx) {
  const request = await withTransaction(async (conn) => {
    const r = await requireRequest(requestId, conn, { pending: true });
    await roleRequestModel.decide(requestId, { status: 'REJECTED', decidedBy: actor.id, reason }, conn);
    return r;
  });
  await auditService.record({
    actor, action: 'ROLE_REQUEST_REJECTED', target: { entity: 'user', id: String(request.userId) }, after: { requestId }, reason, ip: ctx.ip,
  });
  return presentOne(requestId);
}

module.exports = { create, list, get, approve, reject };
