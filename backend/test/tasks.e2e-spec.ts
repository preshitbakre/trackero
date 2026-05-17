import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Tasks Module (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;
  let projectId: number;
  let defaultStatusId: number;
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

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Add member to project
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    // Get statuses
    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1`,
      [projectId],
    );
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  describe('Task CRUD', () => {
    it('creates task with auto taskNumber -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'First task', priority: 'high' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0101');
      expect(res.body.data.item.title).toBe('First task');
      expect(res.body.data.item.taskNumber).toBe(1);
      expect(res.body.data.item.priority).toBe('high');
      expect(res.body.data.item.statusId).toBe(defaultStatusId);
    });

    it('auto-increments taskNumber per project', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 1' });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 2' })
        .expect(201);

      expect(res.body.data.item.taskNumber).toBe(2);
    });

    it('lists tasks with pagination -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task A' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0100');
      expect(res.body.data.list.length).toBe(1);
      expect(res.body.data.total).toBe(1);
    });

    it('gets task detail -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Detail task' });
      const taskId = createRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0102');
      expect(res.body.data.title).toBe('Detail task');
    });

    it('updates task -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Original' });
      const taskId = createRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated', priority: 'urgent' })
        .expect(200);

      expect(res.body.data.item.title).toBe('Updated');
      expect(res.body.data.item.priority).toBe('urgent');
    });

    it('member can delete own task -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Member task' });
      const taskId = createRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });

    it('member cannot delete others task -> 403', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin task' });
      const taskId = createRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks`)
        .expect(401);
    });
  });

  describe('Task Status Change', () => {
    it('changes status -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Status task' });
      const taskId = createRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: doneStatusId })
        .expect(200);

      expect(res.body.code).toBe('S-0105');
      expect(res.body.data.item.statusId).toBe(doneStatusId);
      expect(res.body.data.item.completedAt).not.toBeNull();
    });
  });

  describe('Subtasks', () => {
    it('creates subtask -> 201', async () => {
      const parentRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Parent task' });
      const parentId = parentRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Subtask 1' })
        .expect(201);

      expect(res.body.code).toBe('S-0121');
      expect(res.body.data.item.parentId).toBe(parentId);
    });

    it('rejects subtask of subtask -> 400', async () => {
      const parentRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Parent' });
      const parentId = parentRes.body.data.item.id;

      const subRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Subtask' });
      const subtaskId = subRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${subtaskId}/subtasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Sub-subtask' })
        .expect(400);

      expect(res.body.code).toBe('F-L-0032');
    });
  });

  describe('Checklist', () => {
    it('creates checklist item on subtask -> 201', async () => {
      const parentRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Parent' });
      const parentId = parentRes.body.data.item.id;

      const subRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Subtask' });
      const subtaskId = subRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${subtaskId}/checklist`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Check item' })
        .expect(201);

      expect(res.body.code).toBe('S-0125');
    });

    it('allows checklist on top-level task -> 201', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Top level' });
      const taskId = taskRes.body.data.item.id;

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/checklist`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Check item' })
        .expect(201);
    });
  });

  describe('Dependencies', () => {
    it('creates dependency -> 201', async () => {
      const t1 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task A' });
      const t2 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task B' });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${t2.body.data.item.id}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: t1.body.data.item.id, dependencyType: 'blocks' })
        .expect(201);

      expect(res.body.code).toBe('S-0131');
    });

    it('rejects circular dependency A->B->A -> 409', async () => {
      const t1 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task A' });
      const t2 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task B' });

      const taskAId = t1.body.data.item.id;
      const taskBId = t2.body.data.item.id;

      // A blocks B
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskBId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: taskAId, dependencyType: 'blocks' });

      // B blocks A -> circular
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskAId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: taskBId, dependencyType: 'blocks' })
        .expect(409);

      expect(res.body.code).toBe('F-L-0031');
    });

    it('rejects deep circular A->B->C->A -> 409', async () => {
      const t1 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task A' });
      const t2 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task B' });
      const t3 = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task C' });

      const aId = t1.body.data.item.id;
      const bId = t2.body.data.item.id;
      const cId = t3.body.data.item.id;

      // A blocks B
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${bId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: aId, dependencyType: 'blocks' });

      // B blocks C
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${cId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: bId, dependencyType: 'blocks' });

      // C blocks A -> circular
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${aId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: cId, dependencyType: 'blocks' })
        .expect(409);

      expect(res.body.code).toBe('F-L-0031');
    });

    it('hard block: blocked task cannot move to done -> 409', async () => {
      const blocker = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Blocker' });
      const blocked = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Blocked' });

      const blockerId = blocker.body.data.item.id;
      const blockedId = blocked.body.data.item.id;

      // Create dependency: blocker blocks blocked
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dependsOnTaskId: blockerId, dependencyType: 'blocks' });

      // Try to move blocked to done -> should fail
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${blockedId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: doneStatusId })
        .expect(409);

      expect(res.body.code).toBe('F-L-0030');
    });
  });

  describe('Search', () => {
    it('finds tasks by title', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Fix login validation bug' });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Add user profile page' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks?search=login`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(1);
      expect(res.body.data.list[0].title).toBe('Fix login validation bug');
    });
  });
});
