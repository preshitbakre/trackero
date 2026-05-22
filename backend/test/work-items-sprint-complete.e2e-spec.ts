import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Sprint Completion with WorkItems (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;
  let doneStatusId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  it('moves incomplete tasks to next planning sprint on completion', async () => {
    // Create active sprint with tasks
    const [sprint1] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
       VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE - 14, CURRENT_DATE) RETURNING id`,
      [projectId, adminId],
    );
    // Create next planning sprint
    const [sprint2] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 2', 'planning', 2, $2) RETURNING id`,
      [projectId, adminId],
    );

    // Create tasks: one done, one incomplete
    await createItem({ itemType: 'task', title: 'Done task', sprintId: sprint1.id, statusId: doneStatusId });
    const incompleteRes = await createItem({ itemType: 'task', title: 'Incomplete', sprintId: sprint1.id });
    const incompleteId = incompleteRes.body.data.item.id;

    // Complete the sprint
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprint1.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.movedTasks).toBe(1);

    // Verify incomplete task moved to sprint 2
    const [moved] = await ds.query(`SELECT sprint_id FROM work_items WHERE id = $1`, [incompleteId]);
    expect(moved.sprint_id).toBe(sprint2.id);
  });

  it('moves incomplete tasks to backlog if no next sprint', async () => {
    const [sprint1] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
       VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE - 14, CURRENT_DATE) RETURNING id`,
      [projectId, adminId],
    );

    const taskRes = await createItem({ itemType: 'task', title: 'Incomplete', sprintId: sprint1.id });
    const taskId = taskRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprint1.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const [moved] = await ds.query(`SELECT sprint_id FROM work_items WHERE id = $1`, [taskId]);
    expect(moved.sprint_id).toBeNull();
  });

  it('subtasks are not directly affected (they have null sprint_id)', async () => {
    const [sprint1] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
       VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE - 14, CURRENT_DATE) RETURNING id`,
      [projectId, adminId],
    );

    const taskRes = await createItem({ itemType: 'task', title: 'T1', sprintId: sprint1.id });
    const taskId = taskRes.body.data.item.id;
    const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
    const subId = subRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprint1.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Subtask sprint_id should still be null (subtasks never have sprint_id)
    const [sub] = await ds.query(`SELECT sprint_id FROM work_items WHERE id = $1`, [subId]);
    expect(sub.sprint_id).toBeNull();
  });

  it('creates SprintScopeChange records with work_item_id', async () => {
    const [sprint1] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
       VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE - 14, CURRENT_DATE) RETURNING id`,
      [projectId, adminId],
    );

    await createItem({ itemType: 'task', title: 'T1', sprintId: sprint1.id, storyPoints: 3 });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprint1.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const scopeChanges = await ds.query(
      `SELECT work_item_id, action, story_points FROM sprint_scope_changes WHERE sprint_id = $1`,
      [sprint1.id],
    );
    // Should have a 'removed' record for the incomplete task
    const removed = scopeChanges.filter((s: any) => s.action === 'removed');
    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(removed[0].work_item_id).toBeDefined();
  });
});
