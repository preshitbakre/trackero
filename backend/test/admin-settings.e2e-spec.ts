import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Admin, Settings & Invitations (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
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
    const ds = app.get(DataSource);

    const adminReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123', displayName: 'Admin' });
    adminId = adminReg.body.data.user.id;
    await ds.query(`UPDATE users SET role = 'admin' WHERE email = $1`, ['admin@test.com']);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = adminLogin.body.data.accessToken;

    const memberReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'member@test.com', password: 'password123', displayName: 'Member' });
    memberToken = memberReg.body.data.accessToken;
    memberId = memberReg.body.data.user.id;
  });

  describe('Settings', () => {
    it('GET /api/settings -> admin only, returns settings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0210');
      expect(res.body.data.appName).toBeDefined();
      expect(res.body.data.defaultRole).toBeDefined();
    });

    it('GET /api/settings -> non-admin 403', async () => {
      await request(app.getHttpServer())
        .get('/api/settings')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('PUT /api/settings -> updates settings', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ appName: 'My Trackero', defaultRole: 'viewer' })
        .expect(200);

      expect(res.body.code).toBe('S-0211');
      expect(res.body.data.appName).toBe('My Trackero');
      expect(res.body.data.defaultRole).toBe('viewer');
    });
  });

  describe('Admin User Management', () => {
    it('cannot remove last admin -> 409', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'member' })
        .expect(409);

      expect(res.body.code).toBe('F-L-0050');
    });

    it('cannot change own role -> 409', async () => {
      // Create another admin so the "last admin" check doesn't trigger first
      const admin2Reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'admin2@test.com', password: 'password123', displayName: 'Admin 2' });
      const ds = app.get(DataSource);
      await ds.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin2Reg.body.data.user.id]);

      const res = await request(app.getHttpServer())
        .put(`/api/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'member' })
        .expect(409);

      expect(res.body.code).toBe('F-L-0051');
    });

    it('deactivates user -> 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0012');
    });
  });

  describe('Invite Flow', () => {
    it('sends invitation -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'newuser@test.com', role: 'member' })
        .expect(201);

      expect(res.body.code).toBe('S-0013');
      expect(res.body.data.item.email).toBe('newuser@test.com');
      expect(res.body.data.item.status).toBe('pending');
    });

    it('registers with invite token -> gets assigned role', async () => {
      // Create invitation
      const inviteRes = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'invited@test.com', role: 'project_manager' });

      const token = inviteRes.body.data.item.token;

      // Register with invite token
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'invited@test.com',
          password: 'password123',
          displayName: 'Invited User',
          inviteToken: token,
        })
        .expect(201);

      expect(registerRes.body.data.user.role).toBe('project_manager');
    });

    it('non-admin cannot invite -> 403', async () => {
      await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: 'x@test.com', role: 'member' })
        .expect(403);
    });
  });

  describe('Health', () => {
    it('GET /api/health -> 200 healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body.code).toBe('S-0300');
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.database).toBe('connected');
    });
  });
});
