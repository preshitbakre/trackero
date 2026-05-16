import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Notifications & Real-Time (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    const ds = app.get(DataSource);

    // Admin
    const adminReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123', displayName: 'Admin' });
    adminId = adminReg.body.data.user.id;
    await ds.query(`UPDATE users SET role = 'admin' WHERE email = $1`, ['admin@test.com']);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = adminLogin.body.data.accessToken;

    // Member
    const memberReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'member@test.com', password: 'password123', displayName: 'Member' });
    memberToken = memberReg.body.data.accessToken;
    memberId = memberReg.body.data.user.id;

    // Project + add member
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Notif Project', prefix: 'NOT' });
    projectId = projRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  describe('Notification creation on task assign', () => {
    it('creates notification for assignee (not self)', async () => {
      // Create task
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Assign task' });
      const taskId = taskRes.body.data.item.id;

      // Assign to member (admin is actor, member is assignee)
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: memberId });

      // Wait for async event processing
      await new Promise((r) => setTimeout(r, 200));

      // Check member's notifications
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0170');
      expect(res.body.data.list.length).toBeGreaterThan(0);
      const notif = res.body.data.list.find((n: any) => n.type === 'task_assigned');
      expect(notif).toBeDefined();
      expect(notif.referenceType).toBe('task');
      expect(notif.referenceId).toBe(taskId);
    });

    it('does NOT notify actor when assigning to self', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Self assign' });
      const taskId = taskRes.body.data.item.id;

      // Admin assigns to self
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: adminId });

      await new Promise((r) => setTimeout(r, 200));

      // Admin should not have a notification for this
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const selfNotif = res.body.data.list.find(
        (n: any) => n.type === 'task_assigned' && n.referenceId === taskId,
      );
      expect(selfNotif).toBeUndefined();
    });
  });

  describe('Duplicate suppression', () => {
    it('suppresses duplicate notification within 5 minutes', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Dup test' });
      const taskId = taskRes.body.data.item.id;

      // Assign twice quickly
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: memberId });

      await new Promise((r) => setTimeout(r, 100));

      // Unassign and reassign
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: null });
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: memberId });

      await new Promise((r) => setTimeout(r, 200));

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      // Should only have 1 notification for this task (duplicate suppressed)
      const taskNotifs = res.body.data.list.filter(
        (n: any) => n.type === 'task_assigned' && n.referenceId === taskId,
      );
      expect(taskNotifs.length).toBe(1);
    });
  });

  describe('Notification CRUD', () => {
    beforeEach(async () => {
      // Create a notification directly
      const ds = app.get(DataSource);
      await ds.query(
        `INSERT INTO notifications (user_id, type, reference_type, reference_id, title, body, is_read)
         VALUES ($1, 'task_assigned', 'task', 1, 'Test notification', 'Body', false)`,
        [memberId],
      );
    });

    it('lists notifications -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0170');
      expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    it('gets unread count -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0173');
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('marks notification as read -> 200', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${memberToken}`);
      const notifId = listRes.body.data.list[0].id;

      const res = await request(app.getHttpServer())
        .put(`/api/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0171');
    });

    it('marks all as read -> 200', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0172');

      // Verify unread count is 0
      const countRes = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(countRes.body.data.count).toBe(0);
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .get('/api/notifications')
        .expect(401);
    });
  });
});
