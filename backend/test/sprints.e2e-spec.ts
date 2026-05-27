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
    // Two tasks for bob (one Done, one In Progress).
    await createTask({ title: 'Bob task 1', assigneeId: userBId, statusId: statusDoneId, storyPoints: 2 });
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

    // statusCounts — all 6 defaults present, non-zero entries match.
    expect(s.statusCounts).toEqual({
      open: 0,
      in_progress: 2,
      in_review: 0,
      done: 1,
      blocked: 0,
      cancelled: 0,
      // 'backlog' category (2 admin/unassigned open tasks) is mapped from the
      // 'backlog' DB category — see below for our policy.
      backlog: 2,
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
      in_review: 0,
      done: 0,
      blocked: 0,
      cancelled: 0,
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
