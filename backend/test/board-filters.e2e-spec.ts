import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

const futureDate = (d: number) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];

describe('Board Filters (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let memberId: number;
  let memberToken: string;
  let projectId: number;
  let sprintId: number;
  let todoStatusId: number;
  let epicId: number;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;
    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberId = member.id;
    memberToken = member.token;

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'FilterTest', prefix: 'FLT' });
    projectId = projRes.body.data.item.id;

    // Add member to the project so they can be assigned tasks
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    // Get statuses
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`, [projectId],
    );
    todoStatusId = statuses.find((s: any) => s.category === 'backlog').id;

    // Create sprint
    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'S1', goal: 'Filter test sprint', startDate: futureDate(1), endDate: futureDate(15) });
    sprintId = sprintRes.body.data.item.id;

    // Create epic
    const epicRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Epic A', itemType: 'epic' });
    epicId = epicRes.body.data.item.id;
  });

  async function createTask(overrides: Record<string, unknown> = {}) {
    // Strip null values — class-validator rejects null for @IsInt() fields;
    // use undefined (i.e., omit the key) to leave optional fields unset.
    const payload: Record<string, unknown> = { title: 'Task', itemType: 'task', sprintId };
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && v !== undefined) payload[k] = v;
    }
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    return res.body.data.item;
  }

  // Board response: { data: { columns: [ { status, tasks, taskCount }, ... ] } }
  // Each task: { id, itemKey, itemType, title, priority, assignee: { id, ... } | null, ... }
  function allTasks(body: any): any[] {
    return body.data.columns.flatMap((c: any) => c.tasks);
  }

  it('filters by single assigneeId', async () => {
    await createTask({ assigneeId: memberId });
    await createTask({ assigneeId: null });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&assigneeId=${memberId}`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee.id).toBe(memberId);
  });

  it('filters by multiple assigneeIds (comma-separated)', async () => {
    const admin = (await ds.query(`SELECT id FROM users WHERE email = 'admin@test.com'`))[0];
    await createTask({ assigneeId: memberId });
    await createTask({ assigneeId: admin.id });
    await createTask({ assigneeId: null });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&assigneeId=${memberId},${admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(2);
  });

  it('filters by priority', async () => {
    await createTask({ priority: 'high' });
    await createTask({ priority: 'low' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&priority=high`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(1);
    expect(tasks[0].priority).toBe('high');
  });

  it('filters by epicId', async () => {
    const t1 = await createTask();
    await createTask();

    // Link t1 to epic via belongs_to
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${t1.id}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId: epicId, linkType: 'belongs_to' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&epicId=${epicId}`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(t1.id);
  });

  it('filters by hasSprint=true', async () => {
    await createTask(); // has sprint
    // Create one without sprint
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'No Sprint', itemType: 'task' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?hasSprint=true`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    // All returned tasks must have a sprint in the DB
    const taskIds = tasks.map((t: any) => t.id);
    if (taskIds.length > 0) {
      const rows = await ds.query(
        `SELECT id, sprint_id FROM work_items WHERE id = ANY($1)`,
        [taskIds],
      );
      expect(rows.every((r: any) => r.sprint_id != null)).toBe(true);
    }
    // Must have at least one task (the one with a sprint)
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('combined filters: assigneeId + priority', async () => {
    await createTask({ assigneeId: memberId, priority: 'high' });
    await createTask({ assigneeId: memberId, priority: 'low' });
    await createTask({ priority: 'high' }); // unassigned

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&assigneeId=${memberId}&priority=high`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(1);
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].assignee.id).toBe(memberId);
  });

  it('empty result returns columns with zero tasks', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&priority=urgent`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(res.body.data.columns.length).toBeGreaterThan(0);
    expect(allTasks(res.body).length).toBe(0);
  });

  it('unassigned tasks excluded when assigneeId specified', async () => {
    await createTask({ assigneeId: null, title: 'Unassigned' });
    await createTask({ assigneeId: memberId, title: 'Assigned' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board?sprintId=${sprintId}&assigneeId=${memberId}`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    const tasks = allTasks(res.body);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Assigned');
  });
});
