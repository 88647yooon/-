// 서버 시작 시 비어 있는 테이블에만 시드 데이터를 넣는다. 이미 데이터가 있으면 건드리지 않는다.
const bcrypt = require('bcryptjs');
const config = require('../config');
const { withTransaction } = require('../config/database');
const userModel = require('./sql/userModel');
const crewModel = require('./sql/crewModel');
const membershipModel = require('./sql/membershipModel');
const capoTermModel = require('./sql/capoTermModel');
const joinRequestModel = require('./sql/joinRequestModel');
const roleRequestModel = require('./sql/roleRequestModel');
const taskTypeModel = require('./sql/taskTypeModel');
const taskModel = require('./sql/taskModel');
const taskAssigneeModel = require('./sql/taskAssigneeModel');
const taskContentModel = require('./sql/taskContentModel');
const taskResultModel = require('./sql/taskResultModel');
const swapRequestModel = require('./sql/swapRequestModel');
const resourceCategoryModel = require('./sql/resourceCategoryModel');
const resourceModel = require('./sql/resourceModel');
const taskResourceModel = require('./sql/taskResourceModel');
const allocationModel = require('./sql/resourceAllocationModel');
const resourceUsageModel = require('./sql/resourceUsageModel');
const maintenanceModel = require('./sql/maintenanceModel');
const resourceRequestModel = require('./sql/resourceRequestModel');
const ActivityLog = require('./mongo/ActivityLog');
const TaskProgress = require('./mongo/TaskProgress');
const seedData = require('./seedData');

async function seedUsers() {
  if ((await userModel.count()) > 0) return 0;
  const passwordHash = await bcrypt.hash(config.seedPassword, config.auth.bcryptRounds);
  return userModel.insertMany(seedData.users.map((u) => ({ ...u, passwordHash })));
}

// Crew, 소속, 책임자 임기, 대기 중인 소속 신청·역할 변경 요청
async function seedCrews() {
  if ((await crewModel.count()) > 0) return 0;
  const users = await userModel.findByUsernames(seedData.users.map((u) => u.username));
  const byName = new Map(users.map((u) => [u.username, u]));
  const boss = byName.get('boss');

  return withTransaction(async (conn) => {
    for (const c of seedData.crews) {
      const crewId = await crewModel.insert({
        name: c.name, region: c.region, description: c.description, underbossId: byName.get(c.underboss).id, createdBy: boss.id,
      }, conn);
      for (const [username, type] of c.members) {
        await membershipModel.insert({ crewId, userId: byName.get(username).id, type, addedBy: boss.id, note: '초기 편성' }, conn);
      }
      const capo = byName.get(c.capo);
      await crewModel.setCapo(crewId, capo.id, conn);
      await capoTermModel.start({ crewId, userId: capo.id, assignedBy: boss.id, reason: '초기 편성' }, conn);
    }
    for (const r of seedData.joinRequests) {
      const crew = await crewModel.findByName(r.crew, conn);
      await joinRequestModel.insert({ crewId: crew.id, userId: byName.get(r.username).id, type: r.type, message: r.message }, conn);
    }
    for (const r of seedData.roleRequests) {
      const user = byName.get(r.username);
      await roleRequestModel.insert({
        userId: user.id, requestedBy: byName.get(r.requestedBy).id, fromRole: user.role, toRole: r.toRole, reason: r.reason,
      }, conn);
    }
    return seedData.crews.length;
  });
}

// 시드 일정 → 실제 시각. { day, hour }는 오늘(KST) 기준, { hoursFromNow }는 지금 기준이다.
const KST_OFFSET = 9 * 60 * 60 * 1000;
function seedTime(spec, now) {
  if (spec.hoursFromNow !== undefined) return new Date(now.getTime() + spec.hoursFromNow * 60 * 60 * 1000);
  const kst = new Date(now.getTime() + KST_OFFSET);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + spec.day, spec.hour) - KST_OFFSET);
}

async function seedTaskTypes() {
  if ((await taskTypeModel.count()) > 0) return 0;
  for (const t of seedData.taskTypes) await taskTypeModel.insert(t);
  return seedData.taskTypes.length;
}

// 업무와 배정·지시사항·체크리스트·선행 관계·결과·교대 요청, 그리고 MongoDB의 상태 이력·진행 보고
async function seedTasks() {
  if ((await taskModel.count()) > 0) return 0;
  const now = new Date();
  const users = new Map((await userModel.findByUsernames(seedData.users.map((u) => u.username))).map((u) => [u.username, u]));
  const types = new Map((await taskTypeModel.listWithUsage()).map((t) => [t.name, t]));
  const ids = new Map();
  const logs = [];
  const progress = [];
  const log = (actor, action, task, before, after) => logs.push({
    action, actor: { userId: actor.id, username: actor.username, role: actor.role },
    target: { entity: 'task', id: String(task.id), label: task.title }, before, after, reason: '시드 데이터',
  });

  await withTransaction(async (conn) => {
    for (const t of seedData.tasks) {
      const crew = t.crew ? await crewModel.findByName(t.crew, conn) : null;
      const creator = users.get(t.createdBy);
      const startAt = seedTime(t.start, now);
      const endAt = seedTime(t.end, now);
      const id = await taskModel.insert({
        title: t.title, typeId: types.get(t.type).id, crewId: crew?.id ?? null, priority: t.priority, location: t.location,
        startAt, endAt, requiredHeadcount: t.requiredHeadcount, leaderRequired: t.leaderRequired, createdBy: creator.id,
      }, conn);
      ids.set(t.key, id);
      const task = { id, title: t.title };
      log(creator, 'TASK_CREATED', task, null, { status: 'PLANNED' });

      for (const [username, role, response] of t.assignees) {
        const assigneeId = await taskAssigneeModel.insert({ taskId: id, userId: users.get(username).id, role, assignedBy: creator.id }, conn);
        if (response !== 'PENDING') await taskAssigneeModel.respond(assigneeId, { response }, conn);
      }
      for (const n of t.notes ?? []) {
        await taskContentModel.insertNote({ taskId: id, authorId: users.get(n.author).id, targetUserId: n.target ? users.get(n.target).id : null, content: n.content }, conn);
      }
      for (const item of t.checklist ?? []) {
        const itemId = await taskContentModel.insertItem({ taskId: id, content: item.content, createdBy: creator.id }, conn);
        if (item.doneBy) await taskContentModel.setItemDone(itemId, { done: true, userId: users.get(item.doneBy).id }, conn);
      }

      if (t.status !== 'PLANNED') {
        await conn.query('UPDATE tasks SET status = ?, started_at = ? WHERE id = ?', ['IN_PROGRESS', startAt, id]);
        log(creator, 'TASK_STATUS_CHANGED', task, { status: 'PLANNED' }, { status: 'IN_PROGRESS' });
      }
      if (t.status === 'COMPLETED') {
        const by = users.get(t.result.by);
        await conn.query(
          `UPDATE tasks SET status = 'COMPLETED', completed_at = ?, result_outcome = ?, result_summary = ?, result_recorded_by = ? WHERE id = ?`,
          [endAt, t.result.outcome, t.result.summary, by.id, id],
        );
        for (const [username, participated, contribution] of t.participations) {
          await taskResultModel.upsertParticipation({ taskId: id, userId: users.get(username).id, participated, contribution, recordedBy: by.id }, conn);
        }
        log(by, 'TASK_COMPLETED', task, { status: 'IN_PROGRESS' }, { status: 'COMPLETED', outcome: t.result.outcome });
      }
      for (const p of t.progress ?? []) {
        const reporter = users.get(p.by);
        progress.push({ taskId: id, reporter: { userId: reporter.id, username: reporter.username, name: reporter.name }, percent: p.percent, note: p.note });
      }
    }
    for (const t of seedData.tasks) {
      for (const key of t.dependsOn ?? []) {
        await taskContentModel.insertDependency({ taskId: ids.get(t.key), dependsOnId: ids.get(key), createdBy: users.get(t.createdBy).id }, conn);
      }
    }
    for (const s of seedData.swapRequests) {
      await swapRequestModel.insert({ taskId: ids.get(s.task), fromUserId: users.get(s.from).id, toUserId: users.get(s.to).id, reason: s.reason }, conn);
    }
  });

  await ActivityLog.insertMany(logs);
  if (progress.length > 0) await TaskProgress.insertMany(progress);
  return seedData.tasks.length;
}

// 자원 분류·자원과 업무 할당·필요 자원·구성원 배정·사용 기록·점검·사용 신청, 그리고 MongoDB의 상태 이력.
// 업무는 제목으로 찾는다 (이전 단계에서 이미 시드된 DB에도 자원 시드를 넣을 수 있게).
async function seedResources() {
  if ((await resourceModel.count()) > 0) return 0;
  const now = new Date();
  const users = new Map((await userModel.findByUsernames(seedData.users.map((u) => u.username))).map((u) => [u.username, u]));
  const logs = [];
  const actorOf = (u) => ({ userId: u.id, username: u.username, role: u.role });
  const target = (r) => ({ entity: 'resource', id: String(r.id), label: `${r.code} ${r.name}` });
  const log = (actor, action, r, extra) => logs.push({ action, actor: actorOf(actor), target: target(r), reason: '시드 데이터', ...extra });
  const statusLog = (actor, r, from, to, cause, reason = '시드 데이터') =>
    log(actor, 'RESOURCE_STATUS_CHANGED', r, { before: { status: from }, after: { status: to, cause }, reason });

  await withTransaction(async (conn) => {
    const [taskRows] = await conn.query('SELECT id, title, start_at, end_at FROM tasks WHERE title IN (?)', [seedData.tasks.map((t) => t.title)]);
    const byTitle = new Map(taskRows.map((t) => [t.title, t]));
    const tasks = new Map(seedData.tasks.filter((t) => byTitle.has(t.title)).map((t) => [t.key, byTitle.get(t.title)]));
    const creatorOf = (key) => users.get(seedData.tasks.find((t) => t.key === key).createdBy);

    const categories = new Map();
    for (const c of seedData.resourceCategories) categories.set(c.name, await resourceCategoryModel.insert(c, conn));
    const resources = new Map();
    const boss = users.get('boss');
    for (const r of seedData.resources) {
      const id = await resourceModel.insert({ ...r, categoryId: categories.get(r.category), createdBy: boss.id }, conn);
      resources.set(r.code, { id, ...r, status: 'AVAILABLE' });
      log(boss, 'RESOURCE_CREATED', { id, ...r }, { after: { status: 'AVAILABLE', minRole: r.minRole } });
    }
    const setStatus = async (r, status, actor, cause) => {
      statusLog(actor, r, r.status, status, cause);
      await resourceModel.setStatus(r.id, status, conn);
      r.status = status;
    };

    for (const [key, category, quantity] of seedData.taskResourceRequirements) {
      if (tasks.has(key)) await conn.query('INSERT INTO task_resource_requirements (task_id, category_id, quantity) VALUES (?, ?, ?)', [tasks.get(key).id, categories.get(category), quantity]);
    }
    const taskAllocations = new Map();
    for (const [key, code] of seedData.taskResources) {
      const task = tasks.get(key);
      if (!task) continue;
      const id = await taskResourceModel.insert({ taskId: task.id, resourceId: resources.get(code).id, startAt: task.start_at, endAt: task.end_at, allocatedBy: creatorOf(key).id }, conn);
      taskAllocations.set(`${key}:${code}`, { id, taskId: task.id, endAt: task.end_at });
    }
    const memberAllocations = new Map();
    for (const a of seedData.resourceAllocations) {
      const endAt = seedTime(a.end, now);
      const id = await allocationModel.insert({
        resourceId: resources.get(a.code).id, userId: users.get(a.user).id, startAt: seedTime(a.start, now), endAt, purpose: a.purpose, allocatedBy: users.get(a.by).id,
      }, conn);
      memberAllocations.set(a.key, { id, endAt });
      log(users.get(a.by), 'RESOURCE_ALLOCATED', resources.get(a.code), { related: [{ entity: 'user', id: String(users.get(a.user).id), label: a.user }], after: { allocationId: id } });
    }

    for (const u of seedData.resourceUsages) {
      const r = resources.get(u.code);
      const user = users.get(u.user);
      const basis = u.task ? taskAllocations.get(`${u.task}:${u.code}`) : memberAllocations.get(u.allocation);
      if (!basis) continue;
      const id = await resourceUsageModel.insert({
        resourceId: r.id, userId: user.id, taskId: basis.taskId, taskResourceId: u.task ? basis.id : null, allocationId: u.allocation ? basis.id : null, dueAt: basis.endAt,
      }, conn);
      await conn.query('UPDATE resource_usages SET started_at = ? WHERE id = ?', [seedTime(u.start, now), id]);
      await setStatus(r, 'IN_USE', user, 'CHECKOUT');
      if (u.returned) {
        await conn.query('UPDATE resource_usages SET returned_at = ?, return_condition = ?, return_note = ?, returned_by = ? WHERE id = ?',
          [seedTime(u.returned, now), u.condition, u.note, user.id, id]);
        await setStatus(r, 'AVAILABLE', user, 'RETURN');
      }
    }

    for (const m of seedData.maintenances) {
      const r = resources.get(m.code);
      const by = users.get(m.by);
      await maintenanceModel.insert({ resourceId: r.id, reason: m.reason, expectedEndAt: seedTime(m.expectedEnd, now), startedBy: by.id }, conn);
      await setStatus(r, 'MAINTENANCE', by, 'MAINTENANCE_START');
    }
    for (const c of seedData.resourceStatusChanges) {
      const r = resources.get(c.code);
      statusLog(users.get(c.by), r, r.status, c.status, 'MANUAL', c.reason);
      await resourceModel.setStatus(r.id, c.status, conn);
      r.status = c.status;
    }
    for (const q of seedData.resourceRequests) {
      await resourceRequestModel.insert({
        resourceId: resources.get(q.code).id, userId: users.get(q.user).id, startAt: seedTime(q.start, now), endAt: seedTime(q.end, now), reason: q.reason,
      }, conn);
    }
  });

  await ActivityLog.insertMany(logs);
  return seedData.resources.length;
}

async function seed() {
  const users = await seedUsers();
  const crews = await seedCrews();
  const taskTypes = await seedTaskTypes();
  const tasks = await seedTasks();
  const resources = await seedResources();
  return { users, crews, taskTypes, tasks, resources };
}

module.exports = { seed };
