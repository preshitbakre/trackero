import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Auth Module (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  describe('POST /api/auth/register', () => {
    it('registers with valid data -> 201 + user + tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          displayName: 'Test User',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0002');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.user.displayName).toBe('Test User');
      expect(res.body.data.user.role).toBe('admin'); // First user is auto-admin
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Should not expose password hash
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects duplicate email -> F-L-0010 (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'dup@example.com',
          password: 'password123',
          displayName: 'First User',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'dup@example.com',
          password: 'password456',
          displayName: 'Second User',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0010');
    });

    it('rejects weak password (< 8 chars) -> F-V-0001 (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          displayName: 'Test User',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-V-0001');
      expect(res.body.validationErrors).toBeDefined();
      expect(res.body.validationErrors.length).toBeGreaterThan(0);
    });

    it('rejects missing required fields -> F-V-0001 (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-V-0001');
      expect(res.body.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'login@example.com',
          password: 'password123',
          displayName: 'Login User',
        });
    });

    it('logs in with valid credentials -> 200 + tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0001');
      expect(res.body.data.user.email).toBe('login@example.com');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('rejects wrong password -> F-L-0005 (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0005');
    });

    it('rejects non-existent email -> F-L-0005 (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0005');
    });

    it('rejects deactivated account -> F-L-0008 (403)', async () => {
      // Deactivate the user directly in DB
      const dataSource = app.get(DataSource);
      await dataSource.query(
        `UPDATE users SET is_active = false WHERE email = $1`,
        ['login@example.com'],
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0008');
    });
  });

  describe('GET /api/auth/me', () => {
    it('rejects without token -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('returns user profile with valid token -> 200', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'me@example.com',
          password: 'password123',
          displayName: 'Me User',
        });

      const token = registerRes.body.data.accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0005');
      expect(res.body.data.email).toBe('me@example.com');
      expect(res.body.data.displayName).toBe('Me User');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('refreshes with valid token -> new tokens', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'refresh@example.com',
          password: 'password123',
          displayName: 'Refresh User',
        });

      const refreshToken = registerRes.body.data.refreshToken;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0004');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New refresh token should be different (rotation)
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('rejects invalid token -> F-L-0007 (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token-here' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0007');
    });

    it('rejects already-used token (rotation) -> F-L-0007 (401)', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'rotate@example.com',
          password: 'password123',
          displayName: 'Rotate User',
        });

      const refreshToken = registerRes.body.data.refreshToken;

      // Use it once
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Use it again - should fail (revoked after first use)
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0007');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out successfully -> 200', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'logout@example.com',
          password: 'password123',
          displayName: 'Logout User',
        });

      const { accessToken, refreshToken } = registerRes.body.data;

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0003');

      // Refresh token should no longer work
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('PUT /api/auth/me/password', () => {
    it('changes password and invalidates old tokens', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'pwchange@example.com',
          password: 'oldpassword1',
          displayName: 'PW User',
        });

      const { accessToken } = registerRes.body.data;

      // Change password
      const res = await request(app.getHttpServer())
        .put('/api/auth/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'oldpassword1',
          newPassword: 'newpassword1',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0007');

      // Old token should be invalidated (tokenVersion incremented)
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // Login with new password should work
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'pwchange@example.com',
          password: 'newpassword1',
        })
        .expect(200);

      expect(loginRes.body.data.accessToken).toBeDefined();
    });

    it('rejects wrong current password -> 401', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'pwfail@example.com',
          password: 'password123',
          displayName: 'PW Fail User',
        });

      const { accessToken } = registerRes.body.data;

      const res = await request(app.getHttpServer())
        .put('/api/auth/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongcurrent',
          newPassword: 'newpassword1',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0005');
    });
  });

  describe('PUT /api/auth/me', () => {
    it('updates profile -> 200', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'profile@example.com',
          password: 'password123',
          displayName: 'Original Name',
        });

      const { accessToken } = registerRes.body.data;

      const res = await request(app.getHttpServer())
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          displayName: 'Updated Name',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0006');
      expect(res.body.data.displayName).toBe('Updated Name');
    });
  });

  describe('Global JwtAuthGuard + @Public() opt-out', () => {
    it('@Public() route GET /api/health returns 200 without a token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBeDefined();
    });

    it('@Public() route GET /api/auth/setup-status returns 200 without a token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/setup-status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isSetup).toBeDefined();
    });

    it('protected route rejects with 401 when no token is supplied', async () => {
      // /api/auth/me has no @Public() — global JwtAuthGuard must reject anonymous access
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('protected feature route rejects with 401 when no token is supplied', async () => {
      // /api/dashboard is guarded; without a token the global guard fails closed
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('First-user-is-admin', () => {
    it('first registered user gets admin role', async () => {
      // clearDatabase already ran in beforeEach — no users exist
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'firstuser@example.com',
          password: 'password123',
          displayName: 'First User',
        })
        .expect(201);

      expect(res.body.data.user.role).toBe('admin');
    });

    it('second user without invite token is rejected', async () => {
      // Register first user (admin)
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'first@example.com', password: 'password123', displayName: 'First' });

      // Second user without invite → rejected
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'uninvited@example.com',
          password: 'password123',
          displayName: 'Uninvited',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('setup-status returns isSetup correctly', async () => {
      // Register a user first so isSetup is true
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'setup@example.com', password: 'password123', displayName: 'Setup' });

      const res = await request(app.getHttpServer())
        .get('/api/auth/setup-status')
        .expect(200);

      expect(res.body.data.isSetup).toBe(true);
    });
  });
});
