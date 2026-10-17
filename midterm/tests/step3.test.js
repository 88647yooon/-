// 단계 3 업무·배정 검증 (작업지시서 5장 단계 3 완료 기준 + API 목록표 #56~#109)
// 시드 업무는 건드리지 않고, 매번 새로 만든 구성원·Crew·업무를 먼 미래 시간대에 만들어 쓴다.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const userModel = require('../models/sql/userModel');
const crewModel = require('../models/sql/crewModel');
const ActivityLog = require('../models/mongo/ActivityLog');
const { startServer, makeUser, makeCrew, unique } = require('./helpers');

let t;
const tokens = {};
const seed = {};
// 실행마다 다른 먼 미래 시각을 기준으로 삼아 다른 실행의 업무와 섞이지 않게 한다.
const HOUR = 60 * 60 * 1000;
const BASE = Math.floor(Date.now() / HOUR) * HOUR + (200 + Math.floor(Math.random() * 3000)) * 24 * HOUR;
const at = (hours) => new Date(BASE + hours * HOUR).toISOString();

before(async () => {
  t = await startServer();
  for (const name of ['admin', 'boss', 'underboss1', 'capo1', 'capo2', 'soldier1']) tokens[name] = (await t.login(name)).accessToken;
  for (const u of await userModel.findByUsernames(['boss', 'capo1', 'soldier1', 'soldier3'])) seed[u.username] = u;
  for (const name of ['Northside', 'Southside']) seed[name] = await crewModel.findByName(name);
});
after(async () => {
  await t.stop();
});

const api = (...args) => t.api(...args);
const login = async (user) => (await t.login(user.username, user.password)).accessToken;
const expectError = (res, status, code) => {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.error.code, code, res.text);
};
const expectRule = (res, status, rule) => {
  assert.equal(res.status, status, res.text);
  assert.equal(status === 409 ? res.body.error.code : res.body.error.details?.rule, rule, res.text);
};
const ok = (res, status = 200) => {
  assert.equal(res.status, status, res.text);
  return res.body.data;
};
const latestLog = (action, taskId) => ActivityLog.findOne({ action, 'target.id': String(taskId) }).sort({ createdAt: -1, _id: -1 }).lean();

// 테스트용 업무 (기본: Boss가 만드는 조직 업무, 0~2시간)
async function makeTask(body = {}, token = tokens.boss) {
  return ok(await api('POST', '/api/tasks', { token, body: { title: unique('업무-'), startAt: at(0), endAt: at(2), ...body } }), 201);
}
const assign = (taskId, assignees, token = tokens.boss) =>
  api('POST', `/api/tasks/${taskId}/assignees`, { token, body: { assignees: assignees.map((a) => (typeof a === 'number' ? { userId: a } : a)) } });
const setStatus = (taskId, status, token = tokens.boss) => api('PATCH', `/api/tasks/${taskId}/status`, { token, body: { status } });

// 책임자가 있는 테스트용 Crew와 그 책임자의 토큰
async function crewWithCapo() {
  const crew = await makeCrew(t, tokens);
  const capo = await makeUser(t, tokens, { role: 'CAPO' });
  ok(await api('PUT', `/api/crews/${crew.id}/capo`, { token: tokens.boss, body: { userId: capo.id } }));
  return { crew, capo, token: await login(capo) };
}
async function memberOf(crew, role = 'SOLDIER') {
  const u = await makeUser(t, tokens, { role });
  ok(await api('POST', `/api/crews/${crew.id}/members`, { token: tokens.boss, body: { userId: u.id } }), 201);
  return u;
}
// 시작해서 진행 중인 업무 (참여자 1명 이상 필요)
async function startedTask(userIds, body = {}) {
  const task = await makeTask(body);
  ok(await assign(task.id, userIds), 201);
  ok(await setStatus(task.id, 'IN_PROGRESS'));
  return task;
}

// ---------------------------------------------------------------------------
describe('단계 3 완료 기준', () => {
  it('정지 구성원을 배정하면 409 BR-02', async () => {
    const suspended = await makeUser(t, tokens, { role: 'SOLDIER', status: 'SUSPENDED' });
    const task = await makeTask();
    expectRule(await assign(task.id, [suspended.id]), 409, 'BR-02');
  });

  it('같은 시간대에 끝나지 않은 다른 업무가 있는 구성원을 배정하면 409 BR-03 (맞닿은 시간은 허용)', async () => {
    const u = await makeUser(t, tokens);
    const first = await makeTask({ startAt: at(10), endAt: at(12) });
    ok(await assign(first.id, [u.id]), 201);
    const overlapping = await makeTask({ startAt: at(11), endAt: at(13) });
    const res = await assign(overlapping.id, [u.id]);
    expectRule(res, 409, 'BR-03');
    assert.equal(res.body.error.details.conflicts[0].taskId, first.id);
    const adjacent = await makeTask({ startAt: at(12), endAt: at(14) });
    ok(await assign(adjacent.id, [u.id]), 201);
  });

  it('완료된 업무의 내용·결과·참여 기록을 바꾸려 하면 409 BR-06 (정정은 Underboss·Boss만 사유와 함께)', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const task = await makeTask({ crewId: crew.id }, token);
    ok(await assign(task.id, [member.id], token), 201);
    ok(await setStatus(task.id, 'IN_PROGRESS', token));
    ok(await api('POST', `/api/tasks/${task.id}/complete`, { token, body: { outcome: 'SUCCESS', summary: '완료' } }));

    expectRule(await api('PATCH', `/api/tasks/${task.id}`, { token, body: { title: '바뀐 제목' } }), 409, 'BR-06');
    expectRule(await api('PATCH', `/api/tasks/${task.id}/result`, { token, body: { summary: '조작', reason: '정정' } }), 409, 'BR-06');
    expectRule(await api('PUT', `/api/tasks/${task.id}/participations/${member.id}`, { token, body: { participated: false } }), 409, 'BR-06');
    expectRule(await api('PATCH', `/api/tasks/${task.id}/result`, { token: await login(member), body: { summary: '조작', reason: '정정' } }), 409, 'BR-06');

    expectError(await api('PATCH', `/api/tasks/${task.id}/result`, { token: tokens.boss, body: { summary: '정정' } }), 400, 'VALIDATION_ERROR');
    const corrected = ok(await api('PATCH', `/api/tasks/${task.id}/result`, { token: tokens.boss, body: { outcome: 'PARTIAL', summary: '일부만 완료', reason: '보고 누락분 반영' } }));
    assert.deepEqual([corrected.outcome, corrected.summary], ['PARTIAL', '일부만 완료']);
    assert.equal(corrected.corrections.at(-1).reason, '보고 누락분 반영');
    assert.deepEqual(corrected.corrections.at(-1).before, { outcome: 'SUCCESS', summary: '완료' });
  });
});

// ---------------------------------------------------------------------------
describe('업무 유형 (#56~#59)', () => {
  it('Underboss 이상이 등록·수정·삭제하고, 이름 중복과 사용 중인 유형 삭제는 409', async () => {
    const name = unique('유형-');
    const type = ok(await api('POST', '/api/task-types', { token: tokens.underboss1, body: { name, description: '테스트 유형' } }), 201);
    expectError(await api('POST', '/api/task-types', { token: tokens.boss, body: { name } }), 409, 'DUPLICATE');
    expectError(await api('POST', '/api/task-types', { token: tokens.capo1, body: { name: unique('유형-') } }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('PATCH', `/api/task-types/${type.id}`, { token: tokens.boss, body: { description: '수정됨' } })).description, '수정됨');

    await makeTask({ typeId: type.id });
    const listed = ok(await api('GET', '/api/task-types', { token: tokens.soldier1 })).find((x) => x.id === type.id);
    assert.equal(listed.taskCount, 1);
    expectError(await api('DELETE', `/api/task-types/${type.id}`, { token: tokens.boss }), 409, 'CONFLICT');

    const unused = ok(await api('POST', '/api/task-types', { token: tokens.boss, body: { name: unique('유형-') } }), 201);
    assert.equal(ok(await api('DELETE', `/api/task-types/${unused.id}`, { token: tokens.boss })).deleted, true);
  });
});

// ---------------------------------------------------------------------------
describe('업무 등록·조회·수정·삭제 (#60~#64)', () => {
  it('Capo는 자기 Crew의 업무만 만들고(crewId 생략 시 자기 Crew), 종료가 시작보다 이르면 400, 해산된 Crew는 409', async () => {
    const { crew, token } = await crewWithCapo();
    const mine = await makeTask({}, token);
    assert.equal(mine.crew.id, crew.id);
    assert.equal(mine.status, 'PLANNED');
    expectRule(await api('POST', '/api/tasks', { token, body: { title: 'x', crewId: seed.Northside.id, startAt: at(0), endAt: at(1) } }), 403, 'BR-05');
    expectError(await api('POST', '/api/tasks', { token, body: { title: 'x', startAt: at(2), endAt: at(1) } }), 400, 'VALIDATION_ERROR');
    expectError(await api('POST', '/api/tasks', { token: tokens.soldier1, body: { title: 'x', startAt: at(0), endAt: at(1) } }), 403, 'FORBIDDEN');

    const disbanded = await makeCrew(t, tokens);
    ok(await api('PATCH', `/api/crews/${disbanded.id}/status`, { token: tokens.boss, body: { status: 'DISBANDED' } }));
    expectError(await api('POST', '/api/tasks', { token: tokens.boss, body: { title: 'x', crewId: disbanded.id, startAt: at(0), endAt: at(1) } }), 409, 'CONFLICT');
    assert.ok(await latestLog('TASK_CREATED', mine.id));
  });

  it('목록: Capo는 자기 Crew 업무만 보고, 상태·중요도·담당자·기간으로 탐색하며 정렬·페이지를 지원한다 (FR-12)', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const low = await makeTask({ crewId: crew.id, priority: 'LOW', startAt: at(30), endAt: at(31) }, token);
    const critical = await makeTask({ crewId: crew.id, priority: 'CRITICAL', startAt: at(32), endAt: at(33) }, token);
    ok(await assign(critical.id, [member.id], token), 201);

    const own = ok(await api('GET', '/api/tasks?size=100', { token }));
    assert.ok(own.every((x) => x.crew?.id === crew.id));
    expectRule(await api('GET', `/api/tasks?crewId=${seed.Northside.id}`, { token }), 403, 'BR-05');

    const byPriority = ok(await api('GET', `/api/tasks?crewId=${crew.id}&sort=-priority`, { token: tokens.boss }));
    assert.deepEqual(byPriority.map((x) => x.id), [critical.id, low.id]);
    assert.deepEqual(ok(await api('GET', `/api/tasks?assigneeId=${member.id}`, { token: tokens.boss })).map((x) => x.id), [critical.id]);
    const window = ok(await api('GET', `/api/tasks?crewId=${crew.id}&from=${encodeURIComponent(at(30.5))}&to=${encodeURIComponent(at(31))}`, { token: tokens.boss }));
    assert.deepEqual(window.map((x) => x.id), [low.id]);
    const page = await api('GET', `/api/tasks?crewId=${crew.id}&size=1`, { token: tokens.boss });
    assert.deepEqual([page.body.meta.total, page.body.meta.totalPages, page.body.data.length], [2, 2, 1]);
    expectError(await api('GET', '/api/tasks', { token: tokens.soldier1 }), 403, 'FORBIDDEN');
  });

  it('상세: 참여자·담당 Crew 책임자·Underboss 이상만 보고, 보는 사람과의 관계를 알려 준다', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const task = await makeTask({ crewId: crew.id }, token);
    ok(await assign(task.id, [member.id], token), 201);
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}`, { token: await login(member) })).viewerRelation, 'participant');
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}`, { token })).viewerRelation, 'manager');
    expectError(await api('GET', `/api/tasks/${task.id}`, { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    expectRule(await api('PATCH', `/api/tasks/${task.id}`, { token: tokens.capo1, body: { title: 'x' } }), 403, 'BR-05');
    expectError(await api('GET', '/api/tasks/99999999', { token: tokens.boss }), 404, 'NOT_FOUND');
  });

  it('수정은 변경 전후를 남기고, 삭제는 계획 상태 업무만 된다', async () => {
    const task = await makeTask({ priority: 'LOW' });
    assert.equal(ok(await api('PATCH', `/api/tasks/${task.id}`, { token: tokens.boss, body: { priority: 'HIGH', location: '본부' } })).priority, 'HIGH');
    const log = await latestLog('TASK_UPDATED', task.id);
    assert.deepEqual([log.before.priority, log.after.priority], ['LOW', 'HIGH']);
    expectError(await api('PATCH', `/api/tasks/${task.id}`, { token: tokens.boss, body: {} }), 400, 'VALIDATION_ERROR');

    const started = await startedTask([(await makeUser(t, tokens)).id]);
    expectError(await api('DELETE', `/api/tasks/${started.id}`, { token: tokens.boss }), 409, 'CONFLICT');
    assert.equal(ok(await api('DELETE', `/api/tasks/${task.id}`, { token: tokens.boss })).deleted, true);
    expectError(await api('GET', `/api/tasks/${task.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
describe('일정·상태·복제 (#65~#68)', () => {
  it('일정 변경은 모든 참여자의 시간 겹침을 다시 검사하고(BR-03), 겹치지 않으면 바뀐다', async () => {
    const u = await makeUser(t, tokens);
    const other = await makeTask({ startAt: at(40), endAt: at(42) });
    ok(await assign(other.id, [u.id]), 201);
    const task = await makeTask({ startAt: at(43), endAt: at(44) });
    ok(await assign(task.id, [u.id]), 201);

    const res = await api('PATCH', `/api/tasks/${task.id}/schedule`, { token: tokens.boss, body: { startAt: at(41), endAt: at(44) } });
    expectRule(res, 409, 'BR-03');
    assert.equal(res.body.error.details.conflicts[0].userId, u.id);
    const moved = ok(await api('PATCH', `/api/tasks/${task.id}/schedule`, { token: tokens.boss, body: { startAt: at(45), endAt: at(46), reason: '연기' } }));
    assert.equal(new Date(moved.startAt).toISOString(), at(45));
  });

  it('상태 전이: 허용되지 않는 전이·참여자 없는 시작·선행 업무 미완료 시작은 409이고, 이력이 시간순으로 남는다', async () => {
    const u = await makeUser(t, tokens);
    const task = await makeTask();
    expectError(await setStatus(task.id, 'ON_HOLD'), 409, 'CONFLICT');
    expectError(await setStatus(task.id, 'IN_PROGRESS'), 409, 'CONFLICT'); // 참여자 없음
    expectError(await setStatus(task.id, 'COMPLETED'), 400, 'VALIDATION_ERROR');
    ok(await assign(task.id, [u.id]), 201);

    const predecessor = await makeTask({ startAt: at(-5), endAt: at(-4) });
    ok(await api('POST', `/api/tasks/${task.id}/dependencies`, { token: tokens.boss, body: { dependsOnId: predecessor.id } }), 201);
    const waiting = await setStatus(task.id, 'IN_PROGRESS');
    expectError(waiting, 409, 'CONFLICT');
    assert.equal(waiting.body.error.details.predecessors[0].taskId, predecessor.id);
    ok(await api('POST', `/api/tasks/${predecessor.id}/cancel`, { token: tokens.boss, body: { reason: '불필요' } }));

    assert.equal(ok(await setStatus(task.id, 'IN_PROGRESS')).status, 'IN_PROGRESS');
    assert.equal(ok(await setStatus(task.id, 'ON_HOLD')).status, 'ON_HOLD');
    assert.equal(ok(await setStatus(task.id, 'IN_PROGRESS')).status, 'IN_PROGRESS');
    const history = ok(await api('GET', `/api/tasks/${task.id}/status-history`, { token: tokens.boss }));
    assert.deepEqual(history.map((h) => h.to), ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'IN_PROGRESS']);
    assert.equal(history[1].from, 'PLANNED');

    const statuses = ok(await api('GET', '/api/task-statuses', { token: tokens.soldier1 }));
    assert.deepEqual(statuses.find((s) => s.status === 'PLANNED').next.map((n) => n.status), ['IN_PROGRESS', 'CANCELLED']);
    assert.equal(statuses.find((s) => s.status === 'COMPLETED').terminal, true);
  });

  it('복제: 새 일정의 계획 상태 업무를 만들고 필요 인원과 체크리스트(완료 표시 없이)를 복사한다', async () => {
    const u = await makeUser(t, tokens);
    const source = await makeTask({ requiredHeadcount: 3, leaderRequired: true });
    ok(await assign(source.id, [u.id]), 201);
    const item = ok(await api('POST', `/api/tasks/${source.id}/checklist`, { token: tokens.boss, body: { content: '장비 확인' } }), 201);
    ok(await api('POST', `/api/tasks/${source.id}/checklist/${item.id}/check`, { token: tokens.boss, body: {} }));

    const copy = ok(await api('POST', `/api/tasks/${source.id}/duplicate`, { token: tokens.boss, body: { startAt: at(50), endAt: at(51) } }), 201);
    assert.deepEqual([copy.status, copy.duplicatedFrom, copy.requiredHeadcount, copy.leaderRequired, copy.assigneeCount], ['PLANNED', source.id, 3, true, 0]);
    const checklist = ok(await api('GET', `/api/tasks/${copy.id}/checklist`, { token: tokens.boss }));
    assert.deepEqual([checklist.total, checklist.doneCount, checklist.items[0].content], [1, 0, '장비 확인']);
  });
});

// ---------------------------------------------------------------------------
describe('필요 인원·지시사항·체크리스트·선행 업무 (#69~#82, #92)', () => {
  it('필요 인원을 설정하면 시작 준비 상태가 부족한 점을 알려 주고, 채워지면 ready가 된다', async () => {
    const [a, b] = [await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask();
    ok(await api('PUT', `/api/tasks/${task.id}/requirements`, { token: tokens.boss, body: { requiredHeadcount: 2, leaderRequired: true } }));
    assert.deepEqual(ok(await api('GET', `/api/tasks/${task.id}/requirements`, { token: tokens.boss })), { taskId: task.id, requiredHeadcount: 2, leaderRequired: true, resources: [] });

    ok(await assign(task.id, [a.id]), 201);
    const notReady = ok(await api('GET', `/api/tasks/${task.id}/readiness`, { token: tokens.boss }));
    assert.equal(notReady.ready, false);
    assert.equal(notReady.issues.length, 3); // 인원 부족, 응답 대기, 리더 없음

    ok(await assign(task.id, [{ userId: b.id, role: 'LEADER' }]), 201);
    for (const u of [a, b]) ok(await api('PATCH', `/api/tasks/${task.id}/assignees/${u.id}/response`, { token: await login(u), body: { response: 'ACCEPTED' } }));
    const ready = ok(await api('GET', `/api/tasks/${task.id}/readiness`, { token: tokens.boss }));
    assert.deepEqual([ready.ready, ready.personnel.acceptedCount, ready.personnel.hasLeader], [true, 2, true]);
  });

  it('지시사항: 특정 참여자 대상은 그 사람만 보고, 수정은 작성자만, 삭제는 작성자나 Underboss 이상', async () => {
    const [a, b] = [await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask();
    ok(await assign(task.id, [a.id, b.id]), 201);
    const all = ok(await api('POST', `/api/tasks/${task.id}/notes`, { token: tokens.boss, body: { content: '전체 공지' } }), 201);
    const toA = ok(await api('POST', `/api/tasks/${task.id}/notes`, { token: tokens.boss, body: { content: 'A에게만', targetUserId: a.id } }), 201);
    expectError(await api('POST', `/api/tasks/${task.id}/notes`, { token: tokens.boss, body: { content: 'x', targetUserId: seed.soldier1.id } }), 409, 'CONFLICT');

    assert.deepEqual(ok(await api('GET', `/api/tasks/${task.id}/notes`, { token: await login(a) })).map((n) => n.id), [all.id, toA.id]);
    assert.deepEqual(ok(await api('GET', `/api/tasks/${task.id}/notes`, { token: await login(b) })).map((n) => n.id), [all.id]);
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}/notes`, { token: tokens.boss })).length, 2);

    expectError(await api('PATCH', `/api/tasks/${task.id}/notes/${all.id}`, { token: tokens.underboss1, body: { content: 'x' } }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('PATCH', `/api/tasks/${task.id}/notes/${all.id}`, { token: tokens.boss, body: { content: '수정된 공지' } })).content, '수정된 공지');
    assert.equal(ok(await api('DELETE', `/api/tasks/${task.id}/notes/${toA.id}`, { token: tokens.underboss1 })).deleted, true);
  });

  it('체크리스트: 참여자가 완료 표시하면 누가 했는지 남고, 중복 표시는 409, 완료된 업무는 BR-06', async () => {
    const u = await makeUser(t, tokens);
    const task = await makeTask();
    ok(await assign(task.id, [u.id]), 201);
    const first = ok(await api('POST', `/api/tasks/${task.id}/checklist`, { token: tokens.boss, body: { content: '차량 점검' } }), 201);
    const second = ok(await api('POST', `/api/tasks/${task.id}/checklist`, { token: tokens.boss, body: { content: '무전기 지급' } }), 201);
    assert.equal(second.position, first.position + 1);

    const token = await login(u);
    const checked = ok(await api('POST', `/api/tasks/${task.id}/checklist/${first.id}/check`, { token, body: {} }));
    assert.deepEqual([checked.done, checked.doneBy.id], [true, u.id]);
    expectError(await api('POST', `/api/tasks/${task.id}/checklist/${first.id}/check`, { token, body: {} }), 409, 'CONFLICT');
    assert.equal(ok(await api('POST', `/api/tasks/${task.id}/checklist/${first.id}/check`, { token, body: { done: false } })).done, false);
    expectError(await api('PATCH', `/api/tasks/${task.id}/checklist/${second.id}`, { token, body: { content: 'x' } }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('PATCH', `/api/tasks/${task.id}/checklist/${second.id}`, { token: tokens.boss, body: { content: '무전기 2대 지급' } })).content, '무전기 2대 지급');
    assert.equal(ok(await api('DELETE', `/api/tasks/${task.id}/checklist/${second.id}`, { token: tokens.boss })).deleted, true);

    ok(await setStatus(task.id, 'IN_PROGRESS'));
    ok(await api('POST', `/api/tasks/${task.id}/complete`, { token: tokens.boss, body: { outcome: 'SUCCESS', summary: '끝' } }));
    expectRule(await api('POST', `/api/tasks/${task.id}/checklist/${first.id}/check`, { token, body: {} }), 409, 'BR-06');
    expectRule(await api('POST', `/api/tasks/${task.id}/checklist`, { token: tokens.boss, body: { content: 'x' } }), 409, 'BR-06');
  });

  it('선행 업무: 자기 자신은 400, 중복과 순환은 409이고, 선행·후행 목록과 삭제가 된다', async () => {
    const [a, b, c] = [await makeTask(), await makeTask(), await makeTask()];
    const add = (taskId, dependsOnId) => api('POST', `/api/tasks/${taskId}/dependencies`, { token: tokens.boss, body: { dependsOnId } });
    ok(await add(b.id, a.id), 201);
    ok(await add(c.id, b.id), 201);
    expectError(await add(a.id, a.id), 400, 'VALIDATION_ERROR');
    expectError(await add(c.id, b.id), 409, 'CONFLICT');
    expectError(await add(a.id, c.id), 409, 'CONFLICT'); // a → c → b → a 순환

    const deps = ok(await api('GET', `/api/tasks/${b.id}/dependencies`, { token: tokens.boss }));
    assert.deepEqual([deps.predecessors.map((x) => x.id), deps.successors.map((x) => x.id), deps.waitingFor], [[a.id], [c.id], 1]);
    ok(await api('DELETE', `/api/tasks/${c.id}/dependencies/${b.id}`, { token: tokens.boss }));
    expectError(await api('DELETE', `/api/tasks/${c.id}/dependencies/${b.id}`, { token: tokens.boss }), 404, 'NOT_FOUND');
    ok(await add(a.id, c.id), 201); // 순환이 풀렸으므로 이제 가능
  });
});

// ---------------------------------------------------------------------------
describe('업무 배정 (#83~#91)', () => {
  it('여러 명을 한 번에 배정하고, 한 명이라도 안 되면 아무도 배정하지 않는다 (BULK_REJECTED)', async () => {
    const [a, b] = [await makeUser(t, tokens), await makeUser(t, tokens)];
    const suspended = await makeUser(t, tokens, { status: 'SUSPENDED' });
    const task = await makeTask();
    const rejected = await assign(task.id, [a.id, suspended.id, 99999999]);
    expectError(rejected, 409, 'BULK_REJECTED');
    assert.deepEqual(rejected.body.error.details.map((d) => [d.index, d.code]), [[1, 'BR-02'], [2, 'NOT_FOUND']]);
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}/assignees`, { token: tokens.boss })).length, 0);

    expectError(await assign(task.id, [a.id, a.id]), 400, 'VALIDATION_ERROR');
    expectError(await assign(task.id, [{ userId: a.id, role: 'LEADER' }, { userId: b.id, role: 'LEADER' }]), 400, 'VALIDATION_ERROR');
    const assigned = ok(await assign(task.id, [{ userId: a.id, role: 'LEADER' }, b.id]), 201);
    assert.deepEqual(assigned.map((x) => [x.user.id, x.role, x.response]), [[a.id, 'LEADER', 'PENDING'], [b.id, 'MEMBER', 'PENDING']]);
    expectError(await assign(task.id, [a.id]), 409, 'CONFLICT');
  });

  it('Capo는 자기 Crew 소속원만 배정할 수 있고(BR-05), Administrator는 배정할 수 없다', async () => {
    const { crew, token } = await crewWithCapo();
    const member = await memberOf(crew);
    const task = await makeTask({ crewId: crew.id }, token);
    expectRule(await assign(task.id, [seed.soldier3.id], token), 403, 'BR-05');
    ok(await assign(task.id, [member.id], token), 201);
    const admin = await userModel.findByUsername('admin');
    expectError(await assign(task.id, [admin.id]), 409, 'CONFLICT');
  });

  it('BR-03은 구성원 행 잠금으로 동시 요청에서도 지켜져서, 같은 사람을 겹치는 두 업무에 동시에 배정하면 한 건만 성공한다', async () => {
    const u = await makeUser(t, tokens);
    const [x, y] = [await makeTask({ startAt: at(60), endAt: at(62) }), await makeTask({ startAt: at(61), endAt: at(63) })];
    const results = await Promise.all([assign(x.id, [u.id]), assign(y.id, [u.id])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(results.find((r) => r.status === 409).body.error.code, 'BR-03');
  });

  it('역할 변경·해제·교체가 되고 모두 배정 이력에 남는다', async () => {
    const [a, b, c] = [await makeUser(t, tokens), await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask({ startAt: at(70), endAt: at(72) });
    ok(await assign(task.id, [{ userId: a.id, role: 'LEADER' }, b.id]), 201);

    const roles = ok(await api('PATCH', `/api/tasks/${task.id}/assignees/${b.id}`, { token: tokens.boss, body: { role: 'LEADER' } }));
    assert.deepEqual(roles.map((x) => [x.user.id, x.role]), [[b.id, 'LEADER'], [a.id, 'MEMBER']]);

    const busy = await makeTask({ startAt: at(71), endAt: at(73) });
    ok(await assign(busy.id, [c.id]), 201);
    expectRule(await api('POST', `/api/tasks/${task.id}/assignees/${b.id}/replacement`, { token: tokens.boss, body: { newUserId: c.id } }), 409, 'BR-03');
    ok(await api('DELETE', `/api/tasks/${busy.id}/assignees/${c.id}`, { token: tokens.boss }));
    const replaced = ok(await api('POST', `/api/tasks/${task.id}/assignees/${b.id}/replacement`, { token: tokens.boss, body: { newUserId: c.id, reason: '일정' } }));
    assert.deepEqual(replaced.find((x) => x.user.id === c.id).role, 'LEADER');
    ok(await api('DELETE', `/api/tasks/${task.id}/assignees/${a.id}`, { token: tokens.boss }));

    const history = ok(await api('GET', `/api/tasks/${task.id}/assignment-history`, { token: tokens.boss }));
    const reasons = Object.fromEntries(history.map((h) => [h.user.id, h.releaseReason]));
    assert.deepEqual([reasons[a.id], reasons[b.id], reasons[c.id]], ['REMOVED', 'REPLACED', null]);
    assert.equal(history.find((h) => h.user.id === b.id).replacedBy.id, c.id);
  });

  it('배정 응답: 본인만 할 수 있고, 거절하면 배정이 해제되어 같은 시간대에 다시 배정될 수 있다', async () => {
    const u = await makeUser(t, tokens);
    const task = await makeTask({ startAt: at(80), endAt: at(82) });
    ok(await assign(task.id, [u.id]), 201);
    const token = await login(u);
    expectError(await api('PATCH', `/api/tasks/${task.id}/assignees/${u.id}/response`, { token: tokens.soldier1, body: { response: 'ACCEPTED' } }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('PATCH', `/api/tasks/${task.id}/assignees/${u.id}/response`, { token, body: { response: 'ACCEPTED' } })).response, 'ACCEPTED');
    const declined = ok(await api('PATCH', `/api/tasks/${task.id}/assignees/${u.id}/response`, { token, body: { response: 'DECLINED', note: '사정' } }));
    assert.deepEqual([declined.active, declined.releaseReason], [false, 'DECLINED']);
    const other = await makeTask({ startAt: at(81), endAt: at(83) });
    ok(await assign(other.id, [u.id]), 201);
  });

  it('후보는 활동중이고 시간이 비어 있는 구성원만 보여 주고, Crew 업무는 기본으로 그 Crew 소속원만 보인다', async () => {
    const { crew, token } = await crewWithCapo();
    const [free, busy] = [await memberOf(crew), await memberOf(crew)];
    const suspended = await memberOf(crew);
    ok(await api('PATCH', `/api/users/${suspended.id}/status`, { token: tokens.boss, body: { status: 'SUSPENDED' } }));
    const outsider = await makeUser(t, tokens);
    const blocker = await makeTask({ startAt: at(90), endAt: at(92) });
    ok(await assign(blocker.id, [busy.id]), 201);
    const task = await makeTask({ crewId: crew.id, startAt: at(91), endAt: at(93) }, token);

    const names = async (query, actor = token) => ok(await api('GET', `/api/tasks/${task.id}/assignee-candidates?size=100&${query}`, { token: actor })).map((u) => u.username);
    const inCrew = await names('');
    assert.ok(inCrew.includes(free.username) && !inCrew.includes(busy.username) && !inCrew.includes(suspended.username) && !inCrew.includes(outsider.username));
    assert.ok((await names(`scope=all&q=${outsider.username}`, tokens.boss)).includes(outsider.username));
    assert.deepEqual(await names(`scope=all&q=${outsider.username}`), []); // Capo는 scope=all이어도 자기 Crew만
  });

  it('가용 여부: 겹치는 업무와 배정할 수 없는 이유를 알려 주고, 본인·소속 Crew 책임자·Underboss 이상만 볼 수 있다', async () => {
    const u = await makeUser(t, tokens);
    const task = await makeTask({ startAt: at(100), endAt: at(102) });
    ok(await assign(task.id, [u.id]), 201);
    const q = (from, to) => `/api/users/${u.id}/availability?from=${encodeURIComponent(at(from))}&to=${encodeURIComponent(at(to))}`;

    const busy = ok(await api('GET', q(101, 103), { token: tokens.boss }));
    assert.deepEqual([busy.available, busy.conflicts.map((c) => c.taskId)], [false, [task.id]]);
    assert.equal(ok(await api('GET', q(102, 104), { token: await login(u) })).available, true);
    expectError(await api('GET', q(101, 103), { token: tokens.soldier1 }), 403, 'FORBIDDEN');
    expectError(await api('GET', q(103, 101), { token: tokens.boss }), 400, 'VALIDATION_ERROR');

    ok(await api('PATCH', `/api/users/${u.id}/status`, { token: tokens.boss, body: { status: 'SUSPENDED' } }));
    const suspended = ok(await api('GET', q(110, 111), { token: tokens.boss }));
    assert.equal(suspended.available, false);
    assert.match(suspended.unassignableReason, /정지/);
  });

  it('취소하면 참여자 배정이 모두 해제되고 대기 중인 교대 요청이 취소되며, 탈퇴하면 그 구성원의 배정이 끝난다', async () => {
    const [a, b, c] = [await makeUser(t, tokens), await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask({ startAt: at(120), endAt: at(122) });
    ok(await assign(task.id, [a.id, b.id]), 201);
    const swap = ok(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: await login(a), body: { toUserId: c.id } }), 201);
    expectError(await api('POST', `/api/tasks/${task.id}/cancel`, { token: tokens.boss, body: {} }), 400, 'VALIDATION_ERROR');
    const cancelled = ok(await api('POST', `/api/tasks/${task.id}/cancel`, { token: tokens.boss, body: { reason: '계획 변경' } }));
    assert.deepEqual([cancelled.status, cancelled.assigneeCount, cancelled.cancelReason], ['CANCELLED', 0, '계획 변경']);
    const history = ok(await api('GET', `/api/tasks/${task.id}/assignment-history`, { token: tokens.boss }));
    assert.ok(history.every((h) => h.releaseReason === 'TASK_CANCELLED'));
    const swaps = ok(await api('GET', '/api/swap-requests?box=sent', { token: await login(a) }));
    assert.equal(swaps.find((s) => s.id === swap.id).status, 'CANCELLED');
    expectError(await api('POST', `/api/tasks/${task.id}/cancel`, { token: tokens.boss, body: { reason: 'x' } }), 409, 'CONFLICT');

    const next = await makeTask({ startAt: at(125), endAt: at(126) });
    ok(await assign(next.id, [c.id]), 201);
    ok(await api('PATCH', `/api/users/${c.id}/status`, { token: tokens.boss, body: { status: 'WITHDRAWN' } }));
    assert.equal(ok(await api('GET', `/api/tasks/${next.id}/assignees`, { token: tokens.boss })).length, 0);
    const released = ok(await api('GET', `/api/tasks/${next.id}/assignment-history`, { token: tokens.boss }));
    assert.equal(released[0].releaseReason, 'WITHDRAWN');
  });
});

// ---------------------------------------------------------------------------
describe('내 업무 (#94~#96)', () => {
  it('내 업무 목록·상세·일정에 내 역할, 나에게 온 지시사항, 함께하는 참여자가 보인다', async () => {
    const [me, mate] = [await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask({ startAt: at(130), endAt: at(132) });
    const later = await makeTask({ startAt: at(140), endAt: at(141) });
    ok(await assign(task.id, [{ userId: me.id, role: 'LEADER' }, mate.id]), 201);
    ok(await assign(later.id, [me.id]), 201);
    ok(await api('POST', `/api/tasks/${task.id}/notes`, { token: tokens.boss, body: { content: '리더 전달 사항', targetUserId: me.id } }), 201);
    ok(await api('POST', `/api/tasks/${task.id}/notes`, { token: tokens.boss, body: { content: '동료에게만', targetUserId: mate.id } }), 201);
    const token = await login(me);

    const mine = ok(await api('GET', '/api/me/tasks?sort=startAt', { token }));
    assert.deepEqual(mine.map((x) => [x.task.id, x.assignment.role]), [[task.id, 'LEADER'], [later.id, 'MEMBER']]);
    assert.equal(ok(await api('GET', `/api/me/tasks?from=${encodeURIComponent(at(135))}`, { token })).length, 1);

    const detail = ok(await api('GET', `/api/me/tasks/${task.id}`, { token }));
    assert.deepEqual(detail.notes.map((n) => n.content), ['리더 전달 사항']);
    assert.deepEqual(detail.teammates.map((m) => m.user.id), [mate.id]);
    expectError(await api('GET', `/api/me/tasks/${task.id}`, { token: tokens.soldier1 }), 404, 'NOT_FOUND');

    const schedule = ok(await api('GET', `/api/me/schedule?from=${encodeURIComponent(at(129))}&to=${encodeURIComponent(at(150))}`, { token }));
    assert.deepEqual(schedule.items.map((i) => i.taskId), [task.id, later.id]);
  });
});

// ---------------------------------------------------------------------------
describe('업무 교대 요청 (#97~#101)', () => {
  it('참여자가 요청하고 담당 Crew 책임자가 승인하면 배정이 바뀌며, 승인 때 배정 규칙을 다시 검사한다', async () => {
    const { crew, token: capoToken } = await crewWithCapo();
    const [from, to, late] = [await memberOf(crew), await memberOf(crew), await memberOf(crew)];
    const task = await makeTask({ crewId: crew.id, startAt: at(150), endAt: at(152) }, capoToken);
    ok(await assign(task.id, [{ userId: from.id, role: 'LEADER' }], capoToken), 201);
    const fromToken = await login(from);

    expectError(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: await login(to), body: { toUserId: late.id } }), 403, 'FORBIDDEN');
    const request = ok(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: fromToken, body: { toUserId: to.id, reason: '사정' } }), 201);
    expectError(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: fromToken, body: { toUserId: late.id } }), 409, 'CONFLICT');

    assert.ok(ok(await api('GET', '/api/swap-requests?box=received', { token: await login(to) })).some((s) => s.id === request.id));
    assert.ok(ok(await api('GET', '/api/swap-requests?box=review', { token: capoToken })).some((s) => s.id === request.id));
    expectError(await api('POST', `/api/swap-requests/${request.id}/approve`, { token: fromToken }), 403, 'FORBIDDEN');
    expectRule(await api('POST', `/api/swap-requests/${request.id}/approve`, { token: tokens.capo1 }), 403, 'BR-05');

    const approved = ok(await api('POST', `/api/swap-requests/${request.id}/approve`, { token: capoToken }));
    assert.equal(approved.status, 'APPROVED');
    const assignees = ok(await api('GET', `/api/tasks/${task.id}/assignees`, { token: capoToken }));
    assert.deepEqual(assignees.map((a) => [a.user.id, a.role]), [[to.id, 'LEADER']]);
    const history = ok(await api('GET', `/api/tasks/${task.id}/assignment-history`, { token: capoToken }));
    assert.equal(history.find((h) => h.user.id === from.id).releaseReason, 'SWAPPED');
  });

  it('받을 사람이 요청 뒤 정지되면 승인 때 BR-02로 거부되고, 받을 사람은 거절할 수 있으며, 요청자는 취소할 수 있다', async () => {
    const [from, to, other] = [await makeUser(t, tokens), await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask({ startAt: at(160), endAt: at(162) });
    ok(await assign(task.id, [from.id]), 201);
    const fromToken = await login(from);

    const busyTask = await makeTask({ startAt: at(161), endAt: at(163) });
    ok(await assign(busyTask.id, [other.id]), 201);
    expectRule(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: fromToken, body: { toUserId: other.id } }), 409, 'BR-03');

    const first = ok(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: fromToken, body: { toUserId: to.id } }), 201);
    ok(await api('PATCH', `/api/users/${to.id}/status`, { token: tokens.boss, body: { status: 'SUSPENDED' } }));
    expectRule(await api('POST', `/api/swap-requests/${first.id}/approve`, { token: tokens.boss }), 409, 'BR-02');
    ok(await api('PATCH', `/api/users/${to.id}/status`, { token: tokens.boss, body: { status: 'ACTIVE' } }));
    const rejected = ok(await api('POST', `/api/swap-requests/${first.id}/reject`, { token: await login(to), body: { reason: '불가' } }));
    assert.deepEqual([rejected.status, rejected.decisionReason], ['REJECTED', '불가']);

    const second = ok(await api('POST', `/api/tasks/${task.id}/swap-requests`, { token: fromToken, body: { toUserId: to.id } }), 201);
    expectError(await api('DELETE', `/api/swap-requests/${second.id}`, { token: tokens.boss }), 403, 'FORBIDDEN');
    assert.equal(ok(await api('DELETE', `/api/swap-requests/${second.id}`, { token: fromToken })).status, 'CANCELLED');
    expectError(await api('POST', `/api/swap-requests/${second.id}/approve`, { token: tokens.boss }), 409, 'CONFLICT');
  });
});

// ---------------------------------------------------------------------------
describe('진행·완료·결과 (#102~#109)', () => {
  it('진행 보고는 진행 중인 업무의 참여자만 남기고, 최근 순으로 조회된다', async () => {
    const u = await makeUser(t, tokens);
    const task = await makeTask({ startAt: at(170), endAt: at(172) });
    ok(await assign(task.id, [u.id]), 201);
    const token = await login(u);
    expectError(await api('POST', `/api/tasks/${task.id}/progress`, { token, body: { percent: 10 } }), 409, 'CONFLICT'); // 아직 계획 상태
    ok(await setStatus(task.id, 'IN_PROGRESS'));
    ok(await api('POST', `/api/tasks/${task.id}/progress`, { token, body: { percent: 30, note: '출발' } }), 201);
    ok(await api('POST', `/api/tasks/${task.id}/progress`, { token, body: { percent: 70 } }), 201);
    expectError(await api('POST', `/api/tasks/${task.id}/progress`, { token: tokens.boss, body: { percent: 90 } }), 403, 'FORBIDDEN');
    expectError(await api('POST', `/api/tasks/${task.id}/progress`, { token, body: { percent: 120 } }), 400, 'VALIDATION_ERROR');
    const reports = await api('GET', `/api/tasks/${task.id}/progress`, { token: tokens.boss });
    assert.deepEqual([reports.body.meta.total, reports.body.data.map((r) => r.percent)], [2, [70, 30]]);
  });

  it('완료하면 결과와 참여 기록이 남고, 보내지 않은 참여자는 수락 여부로 기록되며, 상태 이력에 완료가 남는다', async () => {
    const [a, b, gone] = [await makeUser(t, tokens), await makeUser(t, tokens), await makeUser(t, tokens)];
    const task = await makeTask({ startAt: at(180), endAt: at(182) });
    ok(await assign(task.id, [a.id, b.id, gone.id]), 201);
    ok(await api('PATCH', `/api/tasks/${task.id}/assignees/${a.id}/response`, { token: await login(a), body: { response: 'ACCEPTED' } }));
    ok(await api('DELETE', `/api/tasks/${task.id}/assignees/${gone.id}`, { token: tokens.boss }));
    expectError(await api('POST', `/api/tasks/${task.id}/complete`, { token: tokens.boss, body: { outcome: 'SUCCESS', summary: 'x' } }), 409, 'CONFLICT'); // 계획 상태
    ok(await setStatus(task.id, 'IN_PROGRESS'));
    ok(await api('PUT', `/api/tasks/${task.id}/participations/${b.id}`, { token: tokens.boss, body: { participated: true, contribution: '중간 기록' } }));
    expectError(await api('PUT', `/api/tasks/${task.id}/participations/${seed.soldier1.id}`, { token: tokens.boss, body: { participated: true } }), 409, 'CONFLICT');
    expectError(await api('GET', `/api/tasks/${task.id}/result`, { token: tokens.boss }), 409, 'CONFLICT');

    const result = ok(await api('POST', `/api/tasks/${task.id}/complete`, {
      token: tokens.boss, body: { outcome: 'SUCCESS', summary: '목표 달성', participations: [{ userId: gone.id, participated: false, contribution: '중도 이탈' }] },
    }));
    const byUser = Object.fromEntries(result.participations.map((p) => [p.user.id, p]));
    assert.deepEqual([byUser[a.id].participated, byUser[b.id].participated, byUser[gone.id].participated], [true, false, false]);
    assert.deepEqual([result.outcome, result.summary], ['SUCCESS', '목표 달성']);
    expectRule(await api('POST', `/api/tasks/${task.id}/complete`, { token: tokens.boss, body: { outcome: 'SUCCESS', summary: 'x' } }), 409, 'BR-06');
    expectRule(await api('POST', `/api/tasks/${task.id}/assignees`, { token: tokens.boss, body: { assignees: [{ userId: seed.soldier1.id }] } }), 409, 'BR-06');

    expectError(await api('PUT', `/api/tasks/${task.id}/participations/${b.id}`, { token: tokens.boss, body: { participated: true } }), 400, 'VALIDATION_ERROR');
    const fixed = ok(await api('PUT', `/api/tasks/${task.id}/participations/${b.id}`, { token: tokens.boss, body: { participated: true, reason: '참여 확인' } }));
    assert.equal(fixed.participated, true);
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}/result`, { token: await login(a) })).corrections.at(-1).action, 'PARTICIPATION_CORRECTED');
    assert.equal(ok(await api('GET', `/api/tasks/${task.id}/participations`, { token: tokens.boss })).length, 3);

    const history = ok(await api('GET', `/api/tasks/${task.id}/status-history`, { token: tokens.boss }));
    assert.deepEqual(history.at(-1).to, 'COMPLETED');
  });
});
