import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Board Endpoint (e2e)', () => {
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

  const getBoard = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const moveCard = (body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/board/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  describe('GET board', () => {
    it('returns columns with tasks, bugs, and subtasks only', async () => {
      // Create items of all types — board should only show tasks + bugs + subtasks
      await createItem({ itemType: 'epic', title: 'E1' });
      await createItem({ itemType: 'story', title: 'S1' });
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'bug', title: 'B1' });

      const res = await getBoard().expect(200);

      expect(res.body.code).toBe('S-0109');
      expect(res.body.data.columns).toBeDefined();
      expect(res.body.data.columns.length).toBeGreaterThan(0);

      // Collect all items from all columns
      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const types = allItems.map((t: any) => t.itemType);
      expect(types).not.toContain('epic');
      expect(types).not.toContain('story');
      expect(types).toContain('task');
      expect(types).toContain('subtask');
      expect(types).toContain('bug');
    });

    it('subtask cards include parentRef', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'Parent Task' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const subtask = allItems.find((t: any) => t.itemType === 'subtask');
      expect(subtask).toBeDefined();
      expect(subtask.parentRef).toBeDefined();
      expect(subtask.parentRef.title).toBe('Parent Task');
    });

    it('filters by sprintId', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'S1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      await createItem({ itemType: 'task', title: 'In sprint', sprintId: sprint.id });
      await createItem({ itemType: 'task', title: 'Not in sprint' });

      const res = await getBoard(`sprintId=${sprint.id}`).expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      expect(allItems).toHaveLength(1);
      expect(allItems[0].title).toBe('In sprint');
    });

    it('includes subtaskCount and subtaskDoneCount', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId, statusId: doneStatusId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const task = allItems.find((t: any) => t.id === taskId);
      expect(task.subtaskCount).toBe(2);
      expect(task.subtaskDoneCount).toBe(1);
    });

    it('includes hasBlockers flag', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1 (outgoing association from T2 to T1 with type 'blocks')
      await createAssociation(t2Id, t1Id, 'blocks');

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const blocked = allItems.find((t: any) => t.id === t2Id);
      expect(blocked.hasBlockers).toBe(true);
      const blocker = allItems.find((t: any) => t.id === t1Id);
      expect(blocker.hasBlockers).toBe(false);
    });

    it('bug shows on board', async () => {
      await createItem({ itemType: 'bug', title: 'Login Crash' });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const bug = allItems.find((t: any) => t.itemType === 'bug');
      expect(bug).toBeDefined();
      expect(bug.title).toBe('Login Crash');
    });
  });

  describe('PUT board/move', () => {
    it('moves a card to a new status', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await moveCard({
        itemId: taskId,
        statusId: inProgressStatusId,
        sortOrder: 'am',
      }).expect(200);

      expect(res.body.code).toBe('S-0110');
      expect(res.body.data.statusId).toBe(inProgressStatusId);
      expect(res.body.data.sortOrder).toBe('am');
    });

    it('move to done sets completedAt', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await moveCard({
        itemId: taskId,
        statusId: doneStatusId,
        sortOrder: 'n',
      }).expect(200);

      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('move to done blocked by association → 400', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1
      await createAssociation(t2Id, t1Id, 'blocks');

      await moveCard({
        itemId: t2Id,
        statusId: doneStatusId,
        sortOrder: 'n',
      }).expect(400);
    });
  });
});
