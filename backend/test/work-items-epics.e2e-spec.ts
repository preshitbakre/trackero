import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Epics List Endpoint (e2e)', () => {
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

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  const listEpics = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  it('returns empty list when no epics exist', async () => {
    const res = await listEpics().expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0109');
    expect(res.body.data.list).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('returns epics with progress and childBreakdown via associations', async () => {
    // Epic with story + tasks linked via belongs_to
    const epicRes = await createItem({ itemType: 'epic', title: 'Auth', color: '#7C5CFC', priority: 'high' });
    const epicId = epicRes.body.data.item.id;

    const storyRes = await createItem({ itemType: 'story', title: 'Login' });
    const storyId = storyRes.body.data.item.id;

    const t1Res = await createItem({ itemType: 'task', title: 'T1', statusId: doneStatusId, storyPoints: 3 });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'T2', storyPoints: 5 });
    const t2Id = t2Res.body.data.item.id;
    const t3Res = await createItem({ itemType: 'task', title: 'T3', statusId: doneStatusId, storyPoints: 2 });
    const t3Id = t3Res.body.data.item.id;

    // Story belongs_to epic, tasks belong_to story, T3 belongs_to epic directly
    await createAssociation(storyId, epicId, 'belongs_to');
    await createAssociation(t1Id, storyId, 'belongs_to');
    await createAssociation(t2Id, storyId, 'belongs_to');
    await createAssociation(t3Id, epicId, 'belongs_to');

    const res = await listEpics().expect(200);

    expect(res.body.data.list).toHaveLength(1);
    const epic = res.body.data.list[0];
    expect(epic.id).toBe(epicId);
    expect(epic.itemType).toBe('epic');
    expect(epic.title).toBe('Auth');
    expect(epic.color).toBe('#7C5CFC');
    expect(epic.priority).toBe('high');

    // Descendants via belongs_to CTE:
    // Epic <- story(backlog), T3(done) [direct]
    // Story <- T1(done), T2(backlog) [recursive]
    // Total: 4 (story, T1, T2, T3), Completed: 2 (T1, T3)
    expect(epic.progress).toBeDefined();
    expect(epic.progress.totalItems).toBe(4);
    expect(epic.progress.completedItems).toBe(2);
    expect(epic.progress.progressPercent).toBe(50);
    // Points: T1=3(done), T2=5, T3=2(done) = total 10, completed 5
    expect(epic.progress.totalPoints).toBe(10);
    expect(epic.progress.completedPoints).toBe(5);

    // Child breakdown
    expect(epic.childBreakdown).toBeDefined();
    expect(epic.childBreakdown.stories).toBe(1);
    expect(epic.childBreakdown.tasks).toBe(3);
  });

  it('returns epic with no associations — progress is zero, breakdown is zero', async () => {
    await createItem({ itemType: 'epic', title: 'Empty' });

    const res = await listEpics().expect(200);
    const epic = res.body.data.list[0];

    expect(epic.progress.totalItems).toBe(0);
    expect(epic.progress.completedItems).toBe(0);
    expect(epic.progress.progressPercent).toBe(0);
    expect(epic.childBreakdown.stories).toBe(0);
    expect(epic.childBreakdown.tasks).toBe(0);
    expect(epic.childBreakdown.subtasks).toBe(0);
  });

  it('does not return non-epic items', async () => {
    await createItem({ itemType: 'epic', title: 'E1' });
    await createItem({ itemType: 'story', title: 'S1' });
    await createItem({ itemType: 'task', title: 'T1' });

    const res = await listEpics().expect(200);

    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.list[0].itemType).toBe('epic');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await createItem({ itemType: 'epic', title: `Epic ${i}` });
    }

    const res = await listEpics('page=1&limit=2').expect(200);

    expect(res.body.data.list).toHaveLength(2);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.hasNext).toBe(true);
  });

  it('includes status, assignee, sprint, endDate', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'S1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    await createItem({
      itemType: 'epic',
      title: 'E1',
      assigneeId: adminId,
      sprintId: sprint.id,
      endDate: '2026-07-01',
      statusId: inProgressStatusId,
    });

    const res = await listEpics().expect(200);
    const epic = res.body.data.list[0];

    expect(epic.status).toBeDefined();
    expect(epic.status.id).toBe(inProgressStatusId);
    expect(epic.assignee).toBeDefined();
    expect(epic.assignee.id).toBe(adminId);
    expect(epic.sprint).toBeDefined();
    expect(epic.sprint.id).toBe(sprint.id);
    expect(epic.endDate).toBe('2026-07-01');
  });
});
