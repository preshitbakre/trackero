import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('WorkItems Checklist (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;

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

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Default statuses are auto-created on project create
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
  });

  // Helper: create work item via HTTP
  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const addChecklist = (itemId: number, title: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/checklist`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title });

  // =========================================================================
  // ALLOWED: task and subtask
  // =========================================================================
  it('allows adding a checklist item to a task → 201', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'Task1' });
    const taskId = taskRes.body.data.item.id;

    const res = await addChecklist(taskId, 'Step 1').expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0125'); // CHECKLIST_ITEM_CREATED
  });

  it('allows adding a checklist item to a subtask → 201', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'Task1' });
    const taskId = taskRes.body.data.item.id;
    const subtaskRes = await createItem({
      itemType: 'subtask',
      title: 'Subtask1',
      parentId: taskId,
    });
    const subtaskId = subtaskRes.body.data.item.id;

    const res = await addChecklist(subtaskId, 'Step 1').expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0125');
  });

  // =========================================================================
  // REJECTED: epic, story, bug — CHECKLIST_NOT_SUBTASK (F-L-0033)
  // =========================================================================
  it('rejects checklist on an epic → 400 CHECKLIST_NOT_SUBTASK', async () => {
    const epicRes = await createItem({ itemType: 'epic', title: 'Epic1' });
    const epicId = epicRes.body.data.item.id;

    const res = await addChecklist(epicId, 'Step 1').expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('F-L-0033');
  });

  it('rejects checklist on a story → 400 CHECKLIST_NOT_SUBTASK', async () => {
    const storyRes = await createItem({ itemType: 'story', title: 'Story1' });
    const storyId = storyRes.body.data.item.id;

    const res = await addChecklist(storyId, 'Step 1').expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('F-L-0033');
  });

  it('rejects checklist on a bug → 400 CHECKLIST_NOT_SUBTASK', async () => {
    const bugRes = await createItem({ itemType: 'bug', title: 'Bug1' });
    const bugId = bugRes.body.data.item.id;

    const res = await addChecklist(bugId, 'Step 1').expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('F-L-0033');
  });
});
