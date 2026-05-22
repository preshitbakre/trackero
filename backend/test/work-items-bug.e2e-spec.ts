import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Bug ItemType (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;
  let inProgressStatusId: number;
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
    inProgressStatusId = statuses.find((s: any) => s.category === 'in_progress').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const createAssociation = (itemId: number, body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const getBoard = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const assignSprint = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}/sprint`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  // =========================================================================
  // BUG CREATION
  // =========================================================================

  it('create bug → 201, itemType is bug', async () => {
    const res = await createItem({
      itemType: 'bug',
      title: 'Login crash on empty password',
      priority: 'high',
    }).expect(201);

    const item = res.body.data.item;
    expect(item.itemType).toBe('bug');
    expect(item.title).toBe('Login crash on empty password');
    expect(item.parentId).toBeNull();
    expect(item.priority).toBe('high');
    expect(item.statusId).toBe(defaultStatusId);
  });

  // =========================================================================
  // BUG REJECTION: no parent, no children
  // =========================================================================

  it('bug with parentId → 400 (bugs cannot have parent)', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;

    const res = await createItem({
      itemType: 'bug',
      title: 'Bug with parent',
      parentId: taskId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  it('create subtask under bug → 400 (bugs cannot have children)', async () => {
    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    const res = await createItem({
      itemType: 'subtask',
      title: 'Subtask under bug',
      parentId: bugId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  // =========================================================================
  // BUG ON BOARD
  // =========================================================================

  it('bug shows on board', async () => {
    await createItem({ itemType: 'bug', title: 'Board Bug', priority: 'urgent' });

    const res = await getBoard().expect(200);

    const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
    const bug = allItems.find((t: any) => t.itemType === 'bug');
    expect(bug).toBeDefined();
    expect(bug.title).toBe('Board Bug');
  });

  // =========================================================================
  // BUG SPRINT ASSIGNMENT
  // =========================================================================

  it('bug can have sprint assignment', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    const res = await assignSprint(bugId, { sprintId: sprint.id }).expect(200);

    expect(res.body.data.item.sprintId).toBe(sprint.id);
  });

  // =========================================================================
  // BUG ASSOCIATIONS
  // =========================================================================

  it('bug can have belongs_to association', async () => {
    const storyRes = await createItem({ itemType: 'story', title: 'S1' });
    const storyId = storyRes.body.data.item.id;
    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    const res = await createAssociation(bugId, {
      linkedItemId: storyId,
      linkType: 'belongs_to',
    }).expect(201);

    expect(res.body.data.linkType).toBe('belongs_to');
    expect(res.body.data.linkedItemId).toBe(storyId);
  });

  it('bug can have caused_by association', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;
    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    const res = await createAssociation(bugId, {
      linkedItemId: taskId,
      linkType: 'caused_by',
    }).expect(201);

    expect(res.body.data.linkType).toBe('caused_by');
  });
});
