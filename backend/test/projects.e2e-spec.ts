import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Projects Module (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    // Register admin (seed creates one, but let's use register for control)
    const adminRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123', displayName: 'Admin' });
    adminToken = adminRes.body.data.accessToken;

    // Make user admin directly via DB
    const ds = app.get(DataSource);
    await ds.query(`UPDATE users SET role = 'admin' WHERE email = $1`, ['admin@test.com']);

    // Re-login to get token with admin role
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = loginRes.body.data.accessToken;

    // Register a member
    const memberRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'member@test.com', password: 'password123', displayName: 'Member' });
    memberToken = memberRes.body.data.accessToken;
    memberId = memberRes.body.data.user.id;
  });

  describe('POST /api/projects', () => {
    it('creates project with valid data -> 201, default statuses created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Backend API', prefix: 'BACK', description: 'API project' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0021');
      expect(res.body.data.item.name).toBe('Backend API');
      expect(res.body.data.item.prefix).toBe('BACK');
      expect(res.body.data.item.status).toBe('active');

      // Check default statuses were created
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${res.body.data.item.id}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statusRes.body.data.length).toBe(6);
      const categories = statusRes.body.data.map((s: any) => s.category);
      expect(categories).toContain('backlog');
      expect(categories).toContain('todo');
      expect(categories).toContain('in_progress');
      expect(categories).toContain('in_review');
      expect(categories).toContain('done');
      expect(categories).toContain('cancelled');
    });

    it('auto-adds creator as project member', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Project', prefix: 'TEST' })
        .expect(201);

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${res.body.data.item.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(membersRes.body.data.list.length).toBe(1);
      expect(membersRes.body.data.list[0].role).toBe('project_manager');
    });

    it('rejects duplicate prefix -> 409', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Project A', prefix: 'DUP' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Project B', prefix: 'DUP' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: 'No Auth', prefix: 'NOAU' })
        .expect(401);
    });

    it('rejects member role -> 403', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Member Project', prefix: 'MEMB' })
        .expect(403);
    });

    it('rejects invalid prefix format -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Prefix', prefix: 'ab' })
        .expect(400);

      expect(res.body.code).toBe('F-V-0001');
    });
  });

  describe('GET /api/projects', () => {
    beforeEach(async () => {
      // Create a project
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Visible Project', prefix: 'VIS' });
    });

    it('admin sees all projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0020');
      expect(res.body.data.list.length).toBe(1);
    });

    it('member sees only assigned projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Delete', prefix: 'DEL' });
      projectId = res.body.data.item.id;
    });

    it('admin can delete project -> 200', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0024');
    });

    it('member cannot delete project -> 403', async () => {
      // Add member to project first
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' });

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  describe('Project Members', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Members Project', prefix: 'MEM' });
      projectId = res.body.data.item.id;
    });

    it('adds member to project -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0026');
    });

    it('removes member from project -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' });

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0027');
    });
  });

  describe('Project Statuses', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Status Project', prefix: 'STAT' });
      projectId = res.body.data.item.id;
    });

    it('creates custom status -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'QA Testing', category: 'in_review', color: '#9333EA' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0031');
    });

    it('cannot delete last status of required category -> 409', async () => {
      // Get the statuses
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`);

      const backlogStatus = statusRes.body.data.find((s: any) => s.category === 'backlog');

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/statuses/${backlogStatus.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.code).toBe('F-L-0041');
    });
  });

  describe('Labels', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Label Project', prefix: 'LBL' });
      projectId = res.body.data.item.id;
    });

    it('creates label -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'frontend', color: '#EF4444' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0037');
    });

    it('lists labels for project -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'backend', color: '#3B82F6' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0036');
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Users (Admin)', () => {
    it('lists users as admin -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0010');
      expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    it('rejects non-admin listing users -> 403', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('changes user role as admin -> 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/users/${memberId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'project_manager' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0011');
    });
  });
});
