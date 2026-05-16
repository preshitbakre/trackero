import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Comments & Attachments (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;
  let projectId: number;
  let taskId: number;

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
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123', displayName: 'Admin' });
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
    const memberId = memberReg.body.data.user.id;

    // Viewer
    const viewerReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'viewer@test.com', password: 'password123', displayName: 'Viewer' });
    viewerToken = viewerReg.body.data.accessToken;
    const viewerId = viewerReg.body.data.user.id;

    // Project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Add member + viewer
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerId, role: 'viewer' });

    // Task
    const taskRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test task' });
    taskId = taskRes.body.data.item.id;
  });

  describe('Comments', () => {
    it('creates comment -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Great work!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0141');
      expect(res.body.data.item.body).toBe('Great work!');
      expect(res.body.data.item.editedAt).toBeNull();
    });

    it('viewer cannot comment -> 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ body: 'Should fail' })
        .expect(403);
    });

    it('lists comments -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Comment 1' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0140');
      expect(res.body.data.list.length).toBe(1);
    });

    it('edits comment sets editedAt -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Original' });
      const commentId = createRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Edited' })
        .expect(200);

      expect(res.body.code).toBe('S-0142');
      expect(res.body.data.body).toBe('Edited');
      expect(res.body.data.editedAt).not.toBeNull();
    });

    it('deletes comment -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'To delete' });
      const commentId = createRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Attachments', () => {
    it('uploads file -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0151');
      expect(res.body.data.item.originalFilename).toBe('test.txt');
      expect(res.body.data.item.sizeBytes).toBeGreaterThan(0);
    });

    it('rejects file > max size -> 400', async () => {
      // Create a buffer > 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', largeBuffer, 'large.bin')
        .expect(400);

      expect(res.body.code).toBe('F-L-0061');
    });

    it('gets presigned download URL -> 200', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('download me'), 'file.txt');
      const attachmentId = uploadRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0152');
      expect(res.body.data.url).toBeDefined();
      expect(res.body.data.expiresIn).toBe(3600);
    });

    it('deletes attachment -> 200', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('delete me'), 'del.txt');
      const attachmentId = uploadRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Activity Log', () => {
    it('records activity on task creation', async () => {
      // Create another task (the one in beforeEach already created one)
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Activity test task' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0160');
      expect(res.body.data.list.length).toBeGreaterThan(0);
      const createdLog = res.body.data.list.find((l: any) => l.action === 'created');
      expect(createdLog).toBeDefined();
    });
  });
});
