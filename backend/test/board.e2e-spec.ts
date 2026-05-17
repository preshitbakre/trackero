import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Board Module (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let projectId: number;
  let backlogStatusId: number;
  let todoStatusId: number;
  let doneStatusId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Board Project', prefix: 'BRD' });
    projectId = projRes.body.data.item.id;

    // Get statuses
    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    backlogStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    todoStatusId = statuses.find((s: any) => s.category === 'todo').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  describe('GET /api/projects/:projectId/board', () => {
    it('returns grouped columns with tasks -> 200', async () => {
      // Create tasks
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 1' });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 2' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/board`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0109');
      expect(res.body.data.columns).toBeDefined();
      expect(res.body.data.columns.length).toBe(6); // 6 default statuses

      // Tasks should be in the backlog column (default status)
      const backlogCol = res.body.data.columns.find((c: any) => c.status.category === 'backlog');
      expect(backlogCol.tasks.length).toBe(2);
      expect(backlogCol.taskCount).toBe(2);
    });

    it('filters by sprintId', async () => {
      // Create sprint
      const sprintRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });
      const sprintId = sprintRes.body.data.item.id;

      // Create tasks - one in sprint, one without
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Sprint task', sprintId });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Backlog task' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/board?sprintId=${sprintId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const allTasks = res.body.data.columns.reduce((acc: any[], col: any) => [...acc, ...col.tasks], []);
      expect(allTasks.length).toBe(1);
      expect(allTasks[0].title).toBe('Sprint task');
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/board`)
        .expect(401);
    });
  });

  describe('PUT /api/projects/:projectId/board/move', () => {
    it('moves card and returns lightweight response -> 200', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Move me' });
      const taskId = taskRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taskId, statusId: todoStatusId, sortOrder: 'n' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0110');
      // Lightweight response - just the task fields, not full mutation response
      expect(res.body.data.id).toBe(taskId);
      expect(res.body.data.statusId).toBe(todoStatusId);
      expect(res.body.data.sortOrder).toBe('n');
      // Should NOT have list/pagination fields
      expect(res.body.data.list).toBeUndefined();
    });

    it('sets completedAt when moving to done -> 200', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Complete me' });
      const taskId = taskRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taskId, statusId: doneStatusId, sortOrder: 'n' })
        .expect(200);

      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('blocked task cannot move to done -> 409', async () => {
      // Create blocker and blocked task
      const blockerRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Blocker' });
      const blockedRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Blocked' });

      const blockerId = blockerRes.body.data.item.id;
      const blockedId = blockedRes.body.data.item.id;

      // Create dependency
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: blockerId, dependencyType: 'blocks' });

      // Try to move blocked to done
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taskId: blockedId, statusId: doneStatusId, sortOrder: 'n' })
        .expect(409);

      expect(res.body.code).toBe('F-L-0030');
    });

    it('clears completedAt when moving out of done', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Reopen me' });
      const taskId = taskRes.body.data.item.id;

      // Move to done first
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taskId, statusId: doneStatusId, sortOrder: 'n' });

      // Move back to todo
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taskId, statusId: todoStatusId, sortOrder: 'n' })
        .expect(200);

      expect(res.body.data.completedAt).toBeNull();
    });
  });
});
