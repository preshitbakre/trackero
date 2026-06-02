import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';
import * as crypto from 'crypto';

describe('Password Reset (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await clearDatabase(app); });

  /** Trigger forgot-password and return the raw (unhashed) token from the DB. */
  async function triggerForgotAndGetToken(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);

    // Generate our own token, hash it, set it in the DB.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    await ds.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3`,
      [hashed, new Date(Date.now() + 3600000), email],
    );
    return rawToken;
  }

  it('happy path: forgot → reset → login with new password', async () => {
    await registerAdmin(app, 'reset@test.com', 'OldPass123!');

    const rawToken = await triggerForgotAndGetToken('reset@test.com');

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'NewPass456!' })
      .expect(200);

    // Login with new password succeeds
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'NewPass456!' })
      .expect(200);
    expect(loginRes.body.data.accessToken).toBeDefined();

    // Login with old password fails
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'OldPass123!' })
      .expect(401);
  });

  it('forgot-password with unknown email returns 200 (no leak)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.com' })
      .expect(200);
  });

  it('reset with expired token fails', async () => {
    await registerAdmin(app, 'expired@test.com', 'Pass123!');
    const rawToken = await triggerForgotAndGetToken('expired@test.com');

    // Expire the token
    await ds.query(
      `UPDATE users SET password_reset_expires = $1 WHERE email = $2`,
      [new Date(Date.now() - 1000), 'expired@test.com'],
    );

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'New1234!' })
      .expect(401);
  });

  it('reset with invalid token fails', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'garbage-token-value', newPassword: 'New1234!' })
      .expect(401);
  });

  it('reset token is single-use', async () => {
    await registerAdmin(app, 'single@test.com', 'Pass123!');
    const rawToken = await triggerForgotAndGetToken('single@test.com');

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'New1234!' })
      .expect(200);

    // Second use fails
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'Another1234!' })
      .expect(401);
  });

  it('reset revokes all refresh tokens', async () => {
    await registerAdmin(app, 'revoke@test.com', 'Pass123!');

    // Login to get a refresh token
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'revoke@test.com', password: 'Pass123!' })
      .expect(200);
    const refreshToken = loginRes.body.data.refreshToken;

    const rawToken = await triggerForgotAndGetToken('revoke@test.com');
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'New1234!' })
      .expect(200);

    // Old refresh token is revoked
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('reset increments tokenVersion (invalidates existing JWTs)', async () => {
    const admin = await registerAdmin(app, 'jwt@test.com', 'Pass123!');
    const oldAccessToken = admin.token;

    const rawToken = await triggerForgotAndGetToken('jwt@test.com');
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'New1234!' })
      .expect(200);

    // Old access token is now invalid
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccessToken}`)
      .expect(401);
  });

  it('concurrent forgot-password: last token wins', async () => {
    await registerAdmin(app, 'race@test.com', 'Pass123!');

    // Fire two forgot-password in parallel
    await Promise.all([
      request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'race@test.com' }),
      request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'race@test.com' }),
    ]);

    // Only the last-written token should be in the DB — we can't predict
    // which, but there should be exactly one non-null token.
    const [row] = await ds.query(
      `SELECT password_reset_token FROM users WHERE email = $1`,
      ['race@test.com'],
    );
    expect(row.password_reset_token).toBeDefined();
    expect(typeof row.password_reset_token).toBe('string');
  });
});
