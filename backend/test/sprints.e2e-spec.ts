import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

// Register an admin with a password that satisfies IsStrongPassword
// (8–20 chars, upper + lower + digit + special). The shared helper in
// setup.ts uses 'password123' which fails that regex after the DTO
// validation tightened in commit e2fccba, so we register inline here.
async function registerStrongAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: 'admin@test.com', password: 'Password1!', displayName: 'Admin' });
  return { token: res.body.data.accessToken, id: res.body.data.user.id };
}

/** A date `daysFromNow` days ahead of today, as YYYY-MM-DD — sprints reject past start dates. */
const futureDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];

describe('Sprints entity columns (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint Cols Project', prefix: 'SCP' });
    projectId = projRes.body.data.item.id;
  });

  it('persists carry_over_policy, capacity, started_by columns on sprints table', async () => {
    // Create a sprint via the existing endpoint.
    const createRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sprint A',
        goal: 'Verify new sprint columns persist',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    const sprintId = createRes.body.data.item.id;

    const ds = app.get(DataSource);

    // Default carry_over_policy should be 'ask' on a freshly created sprint.
    const defaults = await ds.query(
      `SELECT carry_over_policy, capacity, started_by FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].carry_over_policy).toBe('ask');
    expect(defaults[0].capacity).toBeNull();
    expect(defaults[0].started_by).toBeNull();

    // Update the new columns via raw SQL.
    await ds.query(
      `UPDATE sprints
         SET carry_over_policy = $1,
             capacity = $2,
             started_by = $3
       WHERE id = $4`,
      ['roll', 42, adminId, sprintId],
    );

    // Select them back and assert they persist.
    const updated = await ds.query(
      `SELECT carry_over_policy, capacity, started_by FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].carry_over_policy).toBe('roll');
    expect(updated[0].capacity).toBe(42);
    expect(updated[0].started_by).toBe(adminId);

    // Round-trip the other allowed policy values too.
    for (const policy of ['backlog', 'ask']) {
      await ds.query(
        `UPDATE sprints SET carry_over_policy = $1 WHERE id = $2`,
        [policy, sprintId],
      );
      const row = await ds.query(
        `SELECT carry_over_policy FROM sprints WHERE id = $1`,
        [sprintId],
      );
      expect(row[0].carry_over_policy).toBe(policy);
    }
  });
});

describe('Sprints UpdateSprintDto carryOverPolicy + capacity (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint Update Project', prefix: 'SUP' });
    projectId = projRes.body.data.item.id;
  });

  async function createPlanningSprint() {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sprint 1',
        goal: 'Initial sprint',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    return res.body.data.item.id as number;
  }

  it('PUT accepts carryOverPolicy and capacity and persists them', async () => {
    const sprintId = await createPlanningSprint();

    const updateRes = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll', capacity: 40 })
      .expect(200);

    expect(updateRes.body.data.item.carryOverPolicy).toBe('roll');
    expect(updateRes.body.data.item.capacity).toBe(40);

    const ds = app.get(DataSource);
    const row = await ds.query(
      `SELECT carry_over_policy, capacity FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(row[0].carry_over_policy).toBe('roll');
    expect(row[0].capacity).toBe(40);
  });

  it('PUT accepts capacity: null to clear the override', async () => {
    const sprintId = await createPlanningSprint();

    // First set a value...
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 25 })
      .expect(200);

    // ...then clear it with null.
    const clearRes = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: null })
      .expect(200);

    expect(clearRes.body.data.item.capacity).toBeNull();

    const ds = app.get(DataSource);
    const row = await ds.query(
      `SELECT capacity FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(row[0].capacity).toBeNull();
  });

  it('PUT rejects carryOverPolicy: "bogus" with 400', async () => {
    const sprintId = await createPlanningSprint();

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'bogus' })
      .expect(400);
  });

  it('PUT rejects capacity: 0 with 400 (Min(1))', async () => {
    const sprintId = await createPlanningSprint();

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 0 })
      .expect(400);
  });

  it('PUT rejects carryOverPolicy/capacity changes on a completed sprint with 400', async () => {
    const sprintId = await createPlanningSprint();

    // Force the sprint into 'completed' state via raw SQL — the test only
    // needs the status guard to trip; we don't need a real complete flow here.
    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'completed' WHERE id = $1`, [sprintId]);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll' })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 30 })
      .expect(400);
  });

  it('PUT rejects carryOverPolicy/capacity changes on a cancelled sprint with 400', async () => {
    const sprintId = await createPlanningSprint();

    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'cancelled' WHERE id = $1`, [sprintId]);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'backlog' })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 10 })
      .expect(400);
  });

  it('PUT allows carryOverPolicy and capacity changes on an active sprint', async () => {
    const sprintId = await createPlanningSprint();

    // Flip the sprint to 'active' directly — start() requires tasks and we
    // don't need that wiring just to test the editable-on-active rule.
    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'active' WHERE id = $1`, [sprintId]);

    const res = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll', capacity: 50 })
      .expect(200);

    expect(res.body.data.item.carryOverPolicy).toBe('roll');
    expect(res.body.data.item.capacity).toBe(50);
  });
});

describe('Sprints listSprints enrichment (assignees, statusCounts, scope deltas) (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let userBId: number;
  let userCId: number;
  let statusOpenId: number;
  let statusInProgressId: number;
  let statusDoneId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    // Two extra users for assignee coverage.
    async function inviteAndRegister(email: string, displayName: string) {
      const invRes = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, role: 'member' });
      const inviteToken = invRes.body.data.item.token;
      const regRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'Password1!', displayName, inviteToken });
      return regRes.body.data.user.id as number;
    }
    userBId = await inviteAndRegister('bob@test.com', 'Bob');
    userCId = await inviteAndRegister('carol@test.com', 'Carol');

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Enrich Project', prefix: 'ENR' });
    projectId = projRes.body.data.item.id;

    // Add bob + carol as project members so they can be assignees.
    for (const userId of [userBId, userCId]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId, role: 'member' })
        .expect(201);
    }

    // Default seeded statuses are 'Open' (backlog), 'In Progress' (in_progress), 'Done' (done).
    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    statusOpenId = statuses.find((s: any) => s.category === 'backlog').id;
    statusInProgressId = statuses.find((s: any) => s.category === 'in_progress').id;
    statusDoneId = statuses.find((s: any) => s.category === 'done').id;
  });

  it('returns assignees, statusCounts, scopeAdded, and scopeDropped per sprint', async () => {
    // Create a planning sprint.
    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Enrich Sprint',
        goal: 'Verify enrichment',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    const sprintId = sprintRes.body.data.item.id;

    // Helper to create a task in this sprint with explicit assignee/status/points.
    async function createTask(opts: {
      title: string;
      assigneeId?: number | null;
      statusId: number;
      storyPoints: number;
    }) {
      const body: any = {
        itemType: 'task',
        title: opts.title,
        statusId: opts.statusId,
        sprintId,
        storyPoints: opts.storyPoints,
      };
      if (opts.assigneeId !== undefined && opts.assigneeId !== null) {
        body.assigneeId = opts.assigneeId;
      }
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(201);
      return res.body.data.item.id as number;
    }

    // Two tasks for admin (one Open, one In Progress).
    await createTask({ title: 'Admin task 1', assigneeId: adminId, statusId: statusOpenId, storyPoints: 3 });
    await createTask({ title: 'Admin task 2', assigneeId: adminId, statusId: statusInProgressId, storyPoints: 5 });
    // Two tasks for bob (one Done, one In Progress). The work_items.completed_at
    // column is only populated on a status transition INTO 'done' (see
    // WorkItemsService.update), not on direct creation. So we create Bob's
    // done task as in_progress, then PUT it to Done, which sets completed_at
    // and makes it count toward completedPoints.
    const bobDoneId = await createTask({ title: 'Bob task 1', assigneeId: userBId, statusId: statusInProgressId, storyPoints: 2 });
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${bobDoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusDoneId })
      .expect(200);
    await createTask({ title: 'Bob task 2', assigneeId: userBId, statusId: statusInProgressId, storyPoints: 1 });
    // One task with no assignee, Open category.
    await createTask({ title: 'Unassigned task', assigneeId: null, statusId: statusOpenId, storyPoints: 8 });

    // Insert scope changes manually: 3 added, 1 removed.
    const ds = app.get(DataSource);
    // We need a work_item_id to satisfy the column — use the first task we created.
    const [wi] = await ds.query(
      `SELECT id FROM work_items WHERE sprint_id = $1 ORDER BY id LIMIT 1`,
      [sprintId],
    );
    const wiId = wi.id;
    await ds.query(
      `INSERT INTO sprint_scope_changes (sprint_id, work_item_id, action, story_points)
       VALUES ($1, $2, 'added', 3), ($1, $2, 'added', 5), ($1, $2, 'added', 2), ($1, $2, 'removed', 1)`,
      [sprintId, wiId],
    );

    // Fetch the list.
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const sprints = listRes.body.data.list;
    expect(sprints).toHaveLength(1);
    const s = sprints[0];

    // Existing fields still present.
    expect(s.id).toBe(sprintId);
    expect(s.taskCount).toBe(5);
    expect(s.totalPoints).toBe(19);
    // One Done task (Bob's, 2 points) — completedPoints reflects it.
    expect(s.completedPoints).toBe(2);

    // assignees — admin + Bob, no Carol (no items), no null.
    expect(Array.isArray(s.assignees)).toBe(true);
    expect(s.assignees).toHaveLength(2);
    const assigneeIds = s.assignees.map((a: any) => a.id).sort();
    expect(assigneeIds).toEqual([adminId, userBId].sort());
    // Each assignee carries shape { id, displayName, avatarUrl }.
    for (const a of s.assignees) {
      expect(typeof a.id).toBe('number');
      expect(typeof a.displayName).toBe('string');
      // avatarUrl may be null; ensure key exists and null preserved.
      expect(a).toHaveProperty('avatarUrl');
      expect(a.avatarUrl === null || typeof a.avatarUrl === 'string').toBe(true);
    }

    // statusCounts — 3 user-facing buckets (open / in_progress / done).
    // The DB `backlog` category is translated to `open` at the API boundary
    // per the design specs, so Admin task 1 + Unassigned task land in `open`.
    expect(s.statusCounts).toEqual({
      open: 2,
      in_progress: 2,
      done: 1,
    });

    // Scope deltas — 3 added, 1 removed.
    expect(s.scopeAdded).toBe(3);
    expect(s.scopeDropped).toBe(1);

    // Carol has no items in any sprint — not in assignees.
    expect(s.assignees.find((a: any) => a.id === userCId)).toBeUndefined();
  });

  it('returns zero defaults for an empty sprint', async () => {
    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Empty Sprint',
        goal: 'No items',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listRes.body.data.list).toHaveLength(1);
    const s = listRes.body.data.list[0];
    expect(s.id).toBe(sprintRes.body.data.item.id);
    expect(s.assignees).toEqual([]);
    expect(s.statusCounts).toEqual({
      open: 0,
      in_progress: 0,
      done: 0,
    });
    expect(s.scopeAdded).toBe(0);
    expect(s.scopeDropped).toBe(0);
  });

  it('returns an empty list cleanly when the project has no sprints', async () => {
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body.data.list).toEqual([]);
  });
});

describe('Sprints findOne enrichment (statusCounts, typeCounts, assignees, autoCapacity) (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let userBId: number;
  let userCId: number;
  let statusOpenId: number;
  let statusInProgressId: number;
  let statusDoneId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    // Two extra users for assignee coverage.
    async function inviteAndRegister(email: string, displayName: string) {
      const invRes = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, role: 'member' });
      const inviteToken = invRes.body.data.item.token;
      const regRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'Password1!', displayName, inviteToken });
      return regRes.body.data.user.id as number;
    }
    userBId = await inviteAndRegister('bob@test.com', 'Bob');
    userCId = await inviteAndRegister('carol@test.com', 'Carol');

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'FindOne Enrich Project', prefix: 'FOE' });
    projectId = projRes.body.data.item.id;

    for (const userId of [userBId, userCId]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId, role: 'member' })
        .expect(201);
    }

    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    statusOpenId = statuses.find((s: any) => s.category === 'backlog').id;
    statusInProgressId = statuses.find((s: any) => s.category === 'in_progress').id;
    statusDoneId = statuses.find((s: any) => s.category === 'done').id;
  });

  async function createSprint(name: string, dayOffset: number) {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        goal: `Goal for ${name}`,
        startDate: futureDate(1 + dayOffset),
        endDate: futureDate(15 + dayOffset),
      })
      .expect(201);
    return res.body.data.item.id as number;
  }

  async function createItem(opts: {
    sprintId: number;
    itemType?: 'task' | 'bug' | 'story' | 'subtask' | 'epic';
    title: string;
    assigneeId?: number | null;
    statusId: number;
    storyPoints: number;
    parentId?: number;
  }) {
    const body: any = {
      itemType: opts.itemType ?? 'task',
      title: opts.title,
      statusId: opts.statusId,
      sprintId: opts.sprintId,
      storyPoints: opts.storyPoints,
    };
    if (opts.assigneeId !== undefined && opts.assigneeId !== null) {
      body.assigneeId = opts.assigneeId;
    }
    if (opts.parentId !== undefined) body.parentId = opts.parentId;
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    return res.body.data.item.id as number;
  }

  it('returns enriched detail with statusCounts, typeCounts, totals, assignees, and autoCapacity=0 when no completed sprints', async () => {
    const sprintId = await createSprint('Enriched Sprint', 0);

    // Mix of items: admin (2 open), bob (in_progress + done via transition), unassigned (open)
    await createItem({ sprintId, title: 'Admin task 1', assigneeId: adminId, statusId: statusOpenId, storyPoints: 3 });
    await createItem({ sprintId, title: 'Admin task 2', assigneeId: adminId, statusId: statusInProgressId, storyPoints: 5 });
    const bobDoneId = await createItem({ sprintId, title: 'Bob task 1', assigneeId: userBId, statusId: statusInProgressId, storyPoints: 2 });
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${bobDoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusDoneId })
      .expect(200);
    await createItem({ sprintId, title: 'Bob task 2', assigneeId: userBId, statusId: statusInProgressId, storyPoints: 1 });
    await createItem({ sprintId, title: 'Unassigned task', assigneeId: null, statusId: statusOpenId, storyPoints: 8 });

    // A bug to cover typeCounts on a second item_type.
    await createItem({ sprintId, itemType: 'bug', title: 'A bug', assigneeId: adminId, statusId: statusOpenId, storyPoints: 0 });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const item = res.body.data;
    expect(item.id).toBe(sprintId);

    // statusCounts: backlog → open. open=admin1 + unassigned + bug = 3; in_progress=admin2 + bob2 = 2; done=bob1 = 1.
    expect(item.statusCounts).toEqual({ open: 3, in_progress: 2, done: 1 });

    // typeCounts: 5 known keys; task=5, bug=1, others 0.
    expect(item.typeCounts).toEqual({ task: 5, bug: 1, story: 0, subtask: 0, epic: 0 });

    // Totals — 6 items, 3+5+2+1+8+0 = 19 points, 2 completed (Bob's done).
    expect(item.totalItems).toBe(6);
    expect(item.totalPoints).toBe(19);
    expect(item.completedPoints).toBe(2);

    // Assignees: admin and Bob only — Carol has no items.
    expect(Array.isArray(item.assignees)).toBe(true);
    expect(item.assignees).toHaveLength(2);
    const byId = new Map<number, any>(item.assignees.map((a: any) => [a.id, a]));
    expect(byId.has(adminId)).toBe(true);
    expect(byId.has(userBId)).toBe(true);
    expect(byId.has(userCId)).toBe(false);

    // Admin assigned points: 3 + 5 + 0 = 8. Bob assigned points: 2 + 1 = 3.
    expect(byId.get(adminId).assigned).toBe(8);
    expect(byId.get(userBId).assigned).toBe(3);

    // Shape: { id, displayName, avatarUrl, assigned, capacity }
    for (const a of item.assignees) {
      expect(typeof a.id).toBe('number');
      expect(typeof a.displayName).toBe('string');
      expect(a).toHaveProperty('avatarUrl');
      expect(a).toHaveProperty('assigned');
      expect(a).toHaveProperty('capacity');
      // project_members has no capacity column, so capacity is always null.
      expect(a.capacity).toBeNull();
    }

    // autoCapacity = 0 with no completed sprints in the project.
    expect(item.autoCapacity).toBe(0);
  });

  it('returns zero counts and empty assignees for an empty sprint', async () => {
    const sprintId = await createSprint('Empty Sprint', 0);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const item = res.body.data;
    expect(item.id).toBe(sprintId);
    expect(item.statusCounts).toEqual({ open: 0, in_progress: 0, done: 0 });
    expect(item.typeCounts).toEqual({ task: 0, bug: 0, story: 0, subtask: 0, epic: 0 });
    expect(item.totalItems).toBe(0);
    expect(item.totalPoints).toBe(0);
    expect(item.completedPoints).toBe(0);
    expect(item.assignees).toEqual([]);
    expect(item.autoCapacity).toBe(0);
  });

  it('autoCapacity averages the last 3 completed sprints (excluding current) when more exist', async () => {
    // The "current" sprint we'll fetch findOne on.
    const currentSprintId = await createSprint('Current', 0);

    // Create 4 prior completed sprints with controlled donePoints: 10, 20, 30, 40.
    // The cap of 3 means the average should come from the most recent 3 by completed_at desc — 40, 30, 20 → 30.
    const ds = app.get(DataSource);

    async function buildCompletedSprintWithDonePoints(name: string, dayOffset: number, donePoints: number, completedDaysAgo: number) {
      const sId = await createSprint(name, dayOffset);
      if (donePoints > 0) {
        // Create a single done item with storyPoints = donePoints to control the sum precisely.
        const wiId = await createItem({
          sprintId: sId,
          title: `${name} item`,
          assigneeId: adminId,
          statusId: statusInProgressId,
          storyPoints: donePoints,
        });
        // Transition to done to set completed_at on the work_item.
        await request(app.getHttpServer())
          .put(`/api/projects/${projectId}/items/${wiId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ statusId: statusDoneId })
          .expect(200);
      }
      // Force the sprint into 'completed' state with a known completed_at offset.
      await ds.query(
        `UPDATE sprints SET status = 'completed', completed_at = NOW() - ($1 || ' days')::interval WHERE id = $2`,
        [String(completedDaysAgo), sId],
      );
      return sId;
    }

    // Older to newer (by completedDaysAgo desc → older first). Newest 3 = 20, 30, 40 → avg 30.
    await buildCompletedSprintWithDonePoints('Old1', 20, 10, 40);
    await buildCompletedSprintWithDonePoints('Old2', 40, 20, 30);
    await buildCompletedSprintWithDonePoints('Old3', 60, 30, 20);
    await buildCompletedSprintWithDonePoints('Old4', 80, 40, 10);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${currentSprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const item = res.body.data;
    expect(item.id).toBe(currentSprintId);
    // (20 + 30 + 40) / 3 = 30.
    expect(item.autoCapacity).toBe(30);
  });

  it('autoCapacity excludes the current sprint even if it is completed', async () => {
    // If we ask for findOne on a completed sprint, autoCapacity must come
    // from OTHER completed sprints, not include itself.
    const ds = app.get(DataSource);
    const currentSprintId = await createSprint('Current Done', 0);

    // Give current sprint a huge done-points footprint we should NOT see in autoCapacity.
    const wiId = await createItem({
      sprintId: currentSprintId,
      title: 'Current done item',
      assigneeId: adminId,
      statusId: statusInProgressId,
      storyPoints: 999,
    });
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${wiId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusDoneId })
      .expect(200);
    await ds.query(
      `UPDATE sprints SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [currentSprintId],
    );

    // One other completed sprint with donePoints = 12.
    const otherId = await createSprint('Other', 20);
    const otherWiId = await createItem({
      sprintId: otherId,
      title: 'Other item',
      assigneeId: adminId,
      statusId: statusInProgressId,
      storyPoints: 12,
    });
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${otherWiId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusId: statusDoneId })
      .expect(200);
    await ds.query(
      `UPDATE sprints SET status = 'completed', completed_at = NOW() - INTERVAL '5 days' WHERE id = $1`,
      [otherId],
    );

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${currentSprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const item = res.body.data;
    expect(item.id).toBe(currentSprintId);
    // Should equal the other sprint's donePoints (12), NOT include this sprint's 999.
    expect(item.autoCapacity).toBe(12);
  });
});

describe('Sprints getScopeChanges (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let userBId: number;
  let statusOpenId: number;
  let statusInProgressId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    // One extra user so we can test the assignee-as-actor proxy.
    const invRes = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'bob@test.com', role: 'member' });
    const inviteToken = invRes.body.data.item.token;
    const regRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'bob@test.com', password: 'Password1!', displayName: 'Bob', inviteToken });
    userBId = regRes.body.data.user.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scope Project', prefix: 'SCP' });
    projectId = projRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: userBId, role: 'member' })
      .expect(201);

    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    statusOpenId = statuses.find((s: any) => s.category === 'backlog').id;
    statusInProgressId = statuses.find((s: any) => s.category === 'in_progress').id;
  });

  async function createPlanningSprint(name = 'Sprint S') {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        goal: 'goal',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    return res.body.data.item.id as number;
  }

  async function createItem(opts: {
    sprintId?: number | null;
    title: string;
    assigneeId?: number | null;
    statusId: number;
    storyPoints: number;
    itemType?: 'task' | 'bug' | 'story';
  }) {
    const body: any = {
      itemType: opts.itemType ?? 'task',
      title: opts.title,
      statusId: opts.statusId,
      storyPoints: opts.storyPoints,
    };
    if (opts.sprintId !== undefined && opts.sprintId !== null) body.sprintId = opts.sprintId;
    if (opts.assigneeId !== undefined && opts.assigneeId !== null) body.assigneeId = opts.assigneeId;
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    return res.body.data.item.id as number;
  }

  it('returns 404 for a non-existent sprint', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/999999/scope-changes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('planning sprint (not started) returns no commit entry and no scope changes', async () => {
    const sprintId = await createPlanningSprint('Planning S');
    // Add a task so the sprint isn't empty, but DO NOT start it.
    await createItem({
      sprintId,
      title: 'Planned task',
      assigneeId: adminId,
      statusId: statusOpenId,
      storyPoints: 5,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const data = res.body.data;
    expect(data.summary).toEqual({ ptsAdded: 0, ptsDropped: 0, itemsAdded: 0, itemsDropped: 0 });
    expect(data.entries).toEqual([]);
  });

  it('freshly started sprint with no further changes returns only the commit entry', async () => {
    const sprintId = await createPlanningSprint('Started S');
    // 2 tasks: 5 + 3 = 8 pts, 2 items
    await createItem({
      sprintId,
      title: 'Task A',
      assigneeId: adminId,
      statusId: statusOpenId,
      storyPoints: 5,
    });
    await createItem({
      sprintId,
      title: 'Task B',
      assigneeId: userBId,
      statusId: statusOpenId,
      storyPoints: 3,
    });

    // Start the sprint
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const data = res.body.data;
    // No post-commit additions or removals, so summary is all zeros.
    expect(data.summary).toEqual({ ptsAdded: 0, ptsDropped: 0, itemsAdded: 0, itemsDropped: 0 });

    // One entry: the commit.
    expect(data.entries).toHaveLength(1);
    const commit = data.entries[0];
    expect(commit.id).toBe(0);
    expect(commit.action).toBe('commit');
    expect(commit.pointsDelta).toBe(8);
    expect(commit.totalItems).toBe(2);
    expect(commit.workItem).toBeUndefined();
    expect(commit.user).toBeDefined();
    expect(commit.user.id).toBe(adminId);
    expect(commit.user.displayName).toBe('Admin');
    expect(commit.user).toHaveProperty('avatarUrl');
    expect(typeof commit.createdAt).toBe('string');
  });

  it('active sprint with multiple post-start scope changes returns commit + entries newest-first', async () => {
    const sprintId = await createPlanningSprint('Active S');
    // Initial commit batch: Task1 (5) + Task2 (3) = 8 pts, 2 items
    const initialTask1 = await createItem({
      sprintId,
      title: 'Task 1',
      assigneeId: adminId,
      statusId: statusOpenId,
      storyPoints: 5,
    });
    await createItem({
      sprintId,
      title: 'Task 2',
      assigneeId: userBId,
      statusId: statusOpenId,
      storyPoints: 3,
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Now insert post-commit scope changes manually so we can control timing
    // and ordering. We INSERT directly because scope changes are only written
    // by start() and complete() today — no public mid-sprint API.
    const ds = app.get(DataSource);
    // Pick a real work item id to put on the manual rows so the join works.
    const addedTaskRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemType: 'bug',
        title: 'Late bug',
        statusId: statusOpenId,
        sprintId,
        storyPoints: 2,
        assigneeId: userBId,
      })
      .expect(201);
    const lateBugId = addedTaskRes.body.data.item.id;

    // Insert scope-changes far enough after start that they fall outside the
    // 5-second commit-batch window: an 'added' (+2) and a 'removed' (-5).
    await ds.query(
      `INSERT INTO sprint_scope_changes (sprint_id, work_item_id, action, story_points, created_at)
       VALUES
         ($1, $2, 'added',   2, NOW() + INTERVAL '60 seconds'),
         ($1, $3, 'removed', 5, NOW() + INTERVAL '120 seconds')`,
      [sprintId, lateBugId, initialTask1],
    );

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const data = res.body.data;

    // Summary covers post-commit changes only.
    expect(data.summary).toEqual({
      ptsAdded: 2,
      ptsDropped: 5,
      itemsAdded: 1,
      itemsDropped: 1,
    });

    // 3 entries: 2 scope changes + 1 commit. Scope changes newest-first
    // (removed at +120s, then added at +60s), commit last.
    expect(data.entries).toHaveLength(3);

    const [first, second, third] = data.entries;

    expect(first.action).toBe('removed');
    expect(first.pointsDelta).toBe(5);
    expect(first.workItem).toBeDefined();
    expect(first.workItem.id).toBe(initialTask1);
    expect(first.workItem.itemKey).toMatch(/^SCP-\d+$/);
    expect(first.workItem.title).toBe('Task 1');
    expect(first.workItem.itemType).toBe('task');
    // Assignee-as-actor proxy: Task 1 was assigned to admin.
    expect(first.user.id).toBe(adminId);

    expect(second.action).toBe('added');
    expect(second.pointsDelta).toBe(2);
    expect(second.workItem.id).toBe(lateBugId);
    expect(second.workItem.itemType).toBe('bug');
    // Late bug was assigned to Bob → Bob is the actor proxy.
    expect(second.user.id).toBe(userBId);

    // Commit entry comes last (oldest).
    expect(third.id).toBe(0);
    expect(third.action).toBe('commit');
    // 3 items existed at start time (the 3rd was added before start too —
    // the late bug we created above came BEFORE the manual INSERT but AFTER
    // start(). Actually, late bug was created AFTER start completes, so it
    // generated NO start-time scope change. Only the 2 initial tasks did.)
    expect(third.totalItems).toBe(2);
    expect(third.pointsDelta).toBe(8);
    expect(third.user.id).toBe(adminId); // startedBy
  });

  it('falls back to sprint.createdBy when work item has no assignee', async () => {
    const sprintId = await createPlanningSprint('Fallback S');
    await createItem({
      sprintId,
      title: 'Unassigned task',
      assigneeId: null,
      statusId: statusOpenId,
      storyPoints: 4,
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Manually insert a post-commit 'added' for an unassigned item.
    const ds = app.get(DataSource);
    const unassignedRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemType: 'task',
        title: 'Another unassigned',
        statusId: statusOpenId,
        sprintId,
        storyPoints: 1,
      })
      .expect(201);
    const otherId = unassignedRes.body.data.item.id;
    await ds.query(
      `INSERT INTO sprint_scope_changes (sprint_id, work_item_id, action, story_points, created_at)
       VALUES ($1, $2, 'added', 1, NOW() + INTERVAL '60 seconds')`,
      [sprintId, otherId],
    );

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const data = res.body.data;
    // Scope-change entry first, then commit.
    expect(data.entries).toHaveLength(2);
    const scopeEntry = data.entries[0];
    expect(scopeEntry.action).toBe('added');
    // No assignee → falls back to sprint.createdBy (admin in this test).
    expect(scopeEntry.user.id).toBe(adminId);
  });

  it('returns 403 for non-member viewers via the ProjectAccessGuard', async () => {
    // Register a second user who is NOT a member of this project.
    const invRes2 = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'outsider@test.com', role: 'member' });
    const inviteToken2 = invRes2.body.data.item.token;
    const regRes2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'outsider@test.com', password: 'Password1!', displayName: 'Outsider', inviteToken: inviteToken2 });
    const outsiderToken = regRes2.body.data.accessToken;

    const sprintId = await createPlanningSprint('Guarded S');

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
