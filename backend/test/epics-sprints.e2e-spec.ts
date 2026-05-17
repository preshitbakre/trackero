import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Epics & Sprints (e2e)', () => {
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

    // Create a project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Project', prefix: 'TEST' });
    projectId = projRes.body.data.item.id;
  });

  describe('Epics', () => {
    it('creates epic -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'User Authentication', priority: 'high', color: '#6366F1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0041');
      expect(res.body.data.item.title).toBe('User Authentication');
      expect(res.body.data.item.status).toBe('open');
      expect(res.body.data.item.priority).toBe('high');
    });

    it('lists epics -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Epic 1' });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Epic 2' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0040');
      expect(res.body.data.list.length).toBe(2);
    });

    it('updates epic -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Original' });

      const epicId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/epics/${epicId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated', status: 'in_progress' })
        .expect(200);

      expect(res.body.data.item.title).toBe('Updated');
      expect(res.body.data.item.status).toBe('in_progress');
    });

    it('deletes epic -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/epics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'To Delete' });

      const epicId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/epics/${epicId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0044');
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/epics`)
        .expect(401);
    });
  });

  describe('Sprints', () => {
    it('creates sprint -> 201 with auto sprintNumber', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Complete auth' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0051');
      expect(res.body.data.item.name).toBe('Sprint 1');
      expect(res.body.data.item.status).toBe('planning');
      expect(res.body.data.item.sprintNumber).toBe(1);
    });

    it('auto-increments sprintNumber per project', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2' })
        .expect(201);

      expect(res.body.data.item.sprintNumber).toBe(2);
    });

    it('cannot start sprint with no tasks -> 400', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Empty Sprint' });

      const sprintId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.code).toBe('F-L-0021');
    });

    it('cannot start when another sprint is active -> 409', async () => {
      // Create two sprints
      const s1Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });
      const s2Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2' });

      const sprint1Id = s1Res.body.data.item.id;
      const sprint2Id = s2Res.body.data.item.id;

      // Add a task to sprint 1 so it can start
      const ds = app.get(DataSource);
      const statuses = await ds.query(
        `SELECT id FROM project_statuses WHERE project_id = $1 AND is_default = true`,
        [projectId],
      );
      await ds.query(
        `INSERT INTO tasks (project_id, status_id, sprint_id, task_number, title, reporter_id, sort_order)
         VALUES ($1, $2, $3, 1, 'Task 1', 1, 'n')`,
        [projectId, statuses[0].id, sprint1Id],
      );
      await ds.query(`UPDATE projects SET task_counter = 1 WHERE id = $1`, [projectId]);

      // Start sprint 1
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Add a task to sprint 2
      await ds.query(
        `INSERT INTO tasks (project_id, status_id, sprint_id, task_number, title, reporter_id, sort_order)
         VALUES ($1, $2, $3, 2, 'Task 2', 1, 'n')`,
        [projectId, statuses[0].id, sprint2Id],
      );
      await ds.query(`UPDATE projects SET task_counter = 2 WHERE id = $1`, [projectId]);

      // Try to start sprint 2
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint2Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.code).toBe('F-L-0020');
    });

    it('sprint start sets status to active -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });
      const sprintId = createRes.body.data.item.id;

      // Add a task directly
      const ds = app.get(DataSource);
      const statuses = await ds.query(
        `SELECT id FROM project_statuses WHERE project_id = $1 AND is_default = true`,
        [projectId],
      );
      await ds.query(
        `INSERT INTO tasks (project_id, status_id, sprint_id, task_number, title, reporter_id, sort_order)
         VALUES ($1, $2, $3, 1, 'Task 1', 1, 'n')`,
        [projectId, statuses[0].id, sprintId],
      );
      await ds.query(`UPDATE projects SET task_counter = 1 WHERE id = $1`, [projectId]);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0055');
      expect(res.body.data.status).toBe('active');
    });

    it('sprint complete moves incomplete tasks to next sprint or backlog', async () => {
      const s1Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });
      const sprint1Id = s1Res.body.data.item.id;

      // Create sprint 2 (planning) to receive incomplete tasks
      const s2Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2' });
      const sprint2Id = s2Res.body.data.item.id;

      // Add task to sprint 1
      const ds = app.get(DataSource);
      const statuses = await ds.query(
        `SELECT id, category FROM project_statuses WHERE project_id = $1`,
        [projectId],
      );
      const backlogStatus = statuses.find((s: any) => s.category === 'backlog');
      await ds.query(
        `INSERT INTO tasks (project_id, status_id, sprint_id, task_number, title, reporter_id, sort_order)
         VALUES ($1, $2, $3, 1, 'Incomplete Task', 1, 'n')`,
        [projectId, backlogStatus.id, sprint1Id],
      );
      await ds.query(`UPDATE projects SET task_counter = 1 WHERE id = $1`, [projectId]);

      // Start sprint 1
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Complete sprint 1
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0056');
      expect(res.body.data.movedTasks).toBe(1);
      expect(res.body.data.movedTo).toBe('Sprint 2');

      // Verify task moved to sprint 2
      const tasks = await ds.query(
        `SELECT sprint_id FROM tasks WHERE project_id = $1 AND task_number = 1`,
        [projectId],
      );
      expect(tasks[0].sprint_id).toBe(sprint2Id);
    });

    it('cannot complete sprint that is not active -> 400', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Not Active' });

      const sprintId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.code).toBe('F-L-0023');
    });

    it('lists sprints -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0050');
      expect(res.body.data.list.length).toBe(1);
    });
  });
});
