import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

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

    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;
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
      const admin2 = await registerInvitedUser(app, adminToken, 'admin2@test.com', 'admin');

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
