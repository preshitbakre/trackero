import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Gap Fixes (e2e)', () => {
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

    const admin = await registerAdmin(app);
    adminToken = admin.token;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Project', prefix: 'TST' });
    projectId = projRes.body.data.item.id;
  });

  describe('Archived project enforcement', () => {
    it('blocks task creation on archived project -> 403 F-L-0052', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Should fail' })
        .expect(403);

      expect(res.body.code).toBe('F-L-0052');
    });

    it('allows reads on archived project -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Project unarchive', () => {
    it('unarchives project -> allows mutations again', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/unarchive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // Should now be able to create tasks
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Works now' })
        .expect(201);
    });
  });

  describe('Sprint cancel', () => {
    it('cancel moves tasks to backlog -> 200', async () => {
      const sprintRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint to cancel', startDate: '2026-05-18', endDate: '2026-06-01' });
      const sprintId = sprintRes.body.data.item.id;

      // Create task in sprint
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Sprint task', sprintId });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0057');
    });
  });

  describe('Task assign', () => {
    it('assigns task to user -> 200', async () => {
      const assignee = await registerInvitedUser(app, adminToken, 'assignee@test.com', 'member');
      const assigneeId = assignee.id;

      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Assign me' });
      const taskId = taskRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId })
        .expect(200);

      expect(res.body.code).toBe('S-0106');
      expect(res.body.data.item.assigneeId).toBe(assigneeId);
    });

    it('unassigns task -> 200', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Unassign me' });
      const taskId = taskRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: null })
        .expect(200);

      expect(res.body.data.item.assigneeId).toBeNull();
    });
  });

  describe('Task labels', () => {
    it('creates task with labels and verifies in detail', async () => {
      // Create label
      const labelRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'frontend', color: '#EF4444' });
      const labelId = labelRes.body.data.id;

      // Create task with label
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Labeled task', labelIds: [labelId] })
        .expect(201);

      const taskId = taskRes.body.data.item.id;

      // Verify in detail
      const detailRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detailRes.body.data.labels).toBeDefined();
      expect(detailRes.body.data.labels.length).toBe(1);
      expect(detailRes.body.data.labels[0].name).toBe('frontend');
    });
  });

  describe('Epic progress fields', () => {
    it('returns totalTasks, completedTasks, progressPercent', async () => {
      const epicRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Progress Epic' });
      const epicId = epicRes.body.data.item.id;

      // Create task in epic
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Epic task', epicId, storyPoints: 5 });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const epic = res.body.data.list.find((e: any) => e.id === epicId);
      expect(epic.totalTasks).toBe(1);
      expect(epic.completedTasks).toBe(0);
      expect(epic.totalPoints).toBe(5);
      expect(epic.progressPercent).toBe(0);
    });
  });

  describe('Task response shape', () => {
    it('task list includes nested status object', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Shape test' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const task = res.body.data.list[0];
      expect(task.status).toBeDefined();
      expect(task.status.id).toBeDefined();
      expect(task.status.name).toBeDefined();
      expect(task.status.category).toBeDefined();
      expect(task.status.color).toBeDefined();
    });
  });

  describe('Project computed fields', () => {
    it('project list includes memberCount and taskCount', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Count task' });

      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const proj = res.body.data.list.find((p: any) => p.id === projectId);
      expect(proj.memberCount).toBeGreaterThanOrEqual(1);
      expect(proj.taskCount).toBe(1);
    });
  });
});
