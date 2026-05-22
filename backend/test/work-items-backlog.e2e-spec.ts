import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Backlog Endpoint (e2e)', () => {
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

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  const getBacklog = () =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/backlog`)
      .set('Authorization', `Bearer ${adminToken}`);

  it('returns empty tree and zero stats when no items', async () => {
    const res = await getBacklog().expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0111');
    expect(res.body.data.tree).toHaveLength(0);
    expect(res.body.data.stats.totalItems).toBe(0);
    expect(res.body.data.stats.totalPoints).toBe(0);
  });

  it('returns hierarchical tree via associations: epic → story → task → subtask', async () => {
    const epicRes = await createItem({ itemType: 'epic', title: 'E1' });
    const epicId = epicRes.body.data.item.id;

    const storyRes = await createItem({ itemType: 'story', title: 'S1' });
    const storyId = storyRes.body.data.item.id;

    const taskRes = await createItem({ itemType: 'task', title: 'T1', storyPoints: 3 });
    const taskId = taskRes.body.data.item.id;

    await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });

    // Link via associations
    await createAssociation(storyId, epicId, 'belongs_to');
    await createAssociation(taskId, storyId, 'belongs_to');

    const res = await getBacklog().expect(200);

    // Root level: only the epic (story/task are linked as children)
    expect(res.body.data.tree).toHaveLength(1);
    const epic = res.body.data.tree[0];
    expect(epic.itemType).toBe('epic');
    expect(epic.title).toBe('E1');

    // Epic children: story (via belongs_to)
    expect(epic.children).toHaveLength(1);
    const story = epic.children[0];
    expect(story.itemType).toBe('story');

    // Story children: task (via belongs_to)
    expect(story.children).toHaveLength(1);
    const task = story.children[0];
    expect(task.itemType).toBe('task');

    // Task children: subtask (via parentId)
    expect(task.children).toHaveLength(1);
    expect(task.children[0].itemType).toBe('subtask');
  });

  it('standalone items appear at root level', async () => {
    await createItem({ itemType: 'task', title: 'Standalone Task', storyPoints: 2 });
    await createItem({ itemType: 'story', title: 'Standalone Story' });

    const res = await getBacklog().expect(200);

    // Both standalone items at root
    const types = res.body.data.tree.map((n: any) => n.itemType);
    expect(types).toContain('task');
    expect(types).toContain('story');
  });

  it('excludes items that are in a sprint (tasks with sprintId)', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    await createItem({ itemType: 'task', title: 'In Sprint', sprintId: sprint.id });
    await createItem({ itemType: 'task', title: 'In Backlog' });

    const res = await getBacklog().expect(200);

    // Only the backlog task appears
    const titles = res.body.data.tree.map((n: any) => n.title);
    expect(titles).toContain('In Backlog');
    expect(titles).not.toContain('In Sprint');
  });

  it('includes epic even if epic has sprintId (informational) when it has unsprinted linked children', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    // Epic with sprint label + unsprinted child task linked via belongs_to
    const epicRes = await createItem({ itemType: 'epic', title: 'E1', sprintId: sprint.id });
    const epicId = epicRes.body.data.item.id;
    const taskRes = await createItem({ itemType: 'task', title: 'Backlog Task' });
    const taskId = taskRes.body.data.item.id;

    await createAssociation(taskId, epicId, 'belongs_to');

    const res = await getBacklog().expect(200);

    // Epic should appear because it has unsprinted children
    const epicNode = res.body.data.tree.find((n: any) => n.itemType === 'epic');
    expect(epicNode).toBeDefined();
    expect(epicNode.children).toHaveLength(1);
  });

  it('returns correct stats', async () => {
    await createItem({ itemType: 'epic', title: 'E1' });
    await createItem({ itemType: 'story', title: 'S1' });
    await createItem({ itemType: 'task', title: 'T1', storyPoints: 3, priority: 'high' });
    await createItem({ itemType: 'task', title: 'T2', storyPoints: 5, priority: 'low' });

    const res = await getBacklog().expect(200);

    const stats = res.body.data.stats;
    // 4 items total: 1 epic + 1 story + 2 tasks (all standalone, not linked)
    expect(stats.totalItems).toBe(4);
    expect(stats.totalPoints).toBe(8);
    expect(stats.byType.epic).toBe(1);
    expect(stats.byType.story).toBe(1);
    expect(stats.byType.task).toBe(2);
    expect(stats.byPriority.high).toBe(1);
    expect(stats.byPriority.low).toBe(1);
  });

  it('subtasks of sprinted tasks are excluded from backlog', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    const taskRes = await createItem({ itemType: 'task', title: 'Sprinted Task', sprintId: sprint.id });
    const taskId = taskRes.body.data.item.id;
    // Subtask of sprinted task — should NOT be in backlog
    await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });

    // A backlog task with subtask — should be in backlog
    const t2Res = await createItem({ itemType: 'task', title: 'Backlog Task' });
    const t2Id = t2Res.body.data.item.id;
    await createItem({ itemType: 'subtask', title: 'ST2', parentId: t2Id });

    const res = await getBacklog().expect(200);

    // Only backlog task + its subtask at root
    expect(res.body.data.tree).toHaveLength(1);
    expect(res.body.data.tree[0].title).toBe('Backlog Task');
    expect(res.body.data.tree[0].children).toHaveLength(1);
    expect(res.body.data.tree[0].children[0].title).toBe('ST2');
  });
});
