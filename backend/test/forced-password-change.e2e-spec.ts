import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

// These specs run against .env.test, which configures NO SMTP — so they
// double as the "email-absent degradation" coverage: manual invite links and
// admin-set passwords must work, and any email-only action must fail cleanly
// rather than crash.
describe('Manual invites + forced password change (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await clearDatabase(app); });

  const srv = () => app.getHttpServer();

  describe('setup-status emailEnabled', () => {
    it('reports emailEnabled=false when SMTP is not configured', async () => {
      const res = await request(srv()).get('/api/auth/setup-status').expect(200);
      expect(res.body.data.emailEnabled).toBe(false);
    });
  });

  describe('manual invite link', () => {
    it('creates an invite with a shareable link + expiry, no email sent', async () => {
      const admin = await registerAdmin(app, 'admin@test.com');
      const res = await request(srv())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: 'invitee@test.com', role: 'member' })
        .expect(201);

      const item = res.body.data.item;
      expect(item.token).toBeTruthy();
      expect(item.inviteUrl).toContain(`token=${item.token}`);
      expect(item.expiresAt).toBeTruthy();
      expect(item.emailEnabled).toBe(false);
      expect(item.emailSent).toBe(false);
    });

    it('the manual link token is accepted by registration', async () => {
      const admin = await registerAdmin(app, 'admin2@test.com');
      const res = await request(srv())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: 'viajinvite@test.com', role: 'member' })
        .expect(201);
      const token = res.body.data.item.token;

      const reg = await request(srv())
        .post('/api/auth/register')
        .send({ email: 'viajinvite@test.com', password: 'NewPass456!', displayName: 'Inv', inviteToken: token })
        .expect(201);
      expect(reg.body.data.user.role).toBe('member');
    });

    it('requesting email on invite fails cleanly when SMTP is absent', async () => {
      const admin = await registerAdmin(app, 'admin3@test.com');
      const res = await request(srv())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: 'noemail@test.com', role: 'member', sendEmail: true })
        .expect(400);
      expect(res.body.code).toBe('F-L-0012');
    });

    it('send-email endpoint fails cleanly when SMTP is absent', async () => {
      const admin = await registerAdmin(app, 'admin4@test.com');
      const inv = await request(srv())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: 'later@test.com', role: 'member' })
        .expect(201);

      const res = await request(srv())
        .post('/api/users/invitations/send-email')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ token: inv.body.data.item.token })
        .expect(400);
      expect(res.body.code).toBe('F-L-0012');
    });

    it('non-admin cannot send invite email', async () => {
      const admin = await registerAdmin(app, 'admin5@test.com');
      const member = await registerInvitedUser(app, admin.token, 'm5@test.com', 'member');
      await request(srv())
        .post('/api/users/invitations/send-email')
        .set('Authorization', `Bearer ${member.token}`)
        .send({ token: 'whatever' })
        .expect(403);
    });
  });

  describe('admin set-password + forced-change gate', () => {
    it('admin sets a temp password; user is then gated until they set a new one', async () => {
      const admin = await registerAdmin(app, 'admin6@test.com');
      const member = await registerInvitedUser(app, admin.token, 'gated@test.com', 'member', 'Original1!');

      // Admin sets a temporary password.
      await request(srv())
        .post(`/api/users/${member.id}/set-password`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ newPassword: 'TempPass123!' })
        .expect(200);

      // The old session is now invalid (tokenVersion bumped).
      await request(srv())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${member.token}`)
        .expect(401);

      // Old password no longer works; temp password logs in but is flagged.
      await request(srv())
        .post('/api/auth/login')
        .send({ email: 'gated@test.com', password: 'Original1!' })
        .expect(401);

      const login = await request(srv())
        .post('/api/auth/login')
        .send({ email: 'gated@test.com', password: 'TempPass123!' })
        .expect(200);
      expect(login.body.data.user.mustChangePassword).toBe(true);
      const gatedToken = login.body.data.accessToken;

      // A normal authenticated route is blocked with 403 F-L-0011.
      const blocked = await request(srv())
        .get('/api/projects')
        .set('Authorization', `Bearer ${gatedToken}`)
        .expect(403);
      expect(blocked.body.code).toBe('F-L-0011');

      // But /auth/me stays reachable so the client can bootstrap + redirect.
      await request(srv())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${gatedToken}`)
        .expect(200);

      // Setting a new password clears the flag and returns a fresh session.
      const setRes = await request(srv())
        .post('/api/auth/set-new-password')
        .set('Authorization', `Bearer ${gatedToken}`)
        .send({ newPassword: 'BrandNew789!' })
        .expect(200);
      expect(setRes.body.data.user.mustChangePassword).toBe(false);
      const newToken = setRes.body.data.accessToken;

      // The new session has full access again.
      await request(srv())
        .get('/api/projects')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      // The temp password is gone; the brand-new one works.
      await request(srv())
        .post('/api/auth/login')
        .send({ email: 'gated@test.com', password: 'TempPass123!' })
        .expect(401);
      await request(srv())
        .post('/api/auth/login')
        .send({ email: 'gated@test.com', password: 'BrandNew789!' })
        .expect(200);
    });

    it('set-new-password is rejected when the user is not gated', async () => {
      const admin = await registerAdmin(app, 'admin7@test.com');
      // Admin is not in a forced-change state.
      const res = await request(srv())
        .post('/api/auth/set-new-password')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ newPassword: 'BrandNew789!' })
        .expect(403);
      expect(res.body.code).toBe('F-L-0003');
    });

    it('non-admin cannot set another user password', async () => {
      const admin = await registerAdmin(app, 'admin8@test.com');
      const member = await registerInvitedUser(app, admin.token, 'm8@test.com', 'member');
      const victim = await registerInvitedUser(app, admin.token, 'v8@test.com', 'member');
      await request(srv())
        .post(`/api/users/${victim.id}/set-password`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ newPassword: 'Whatever123!' })
        .expect(403);
    });

    it('login after admin set-password reports mustChangePassword=true', async () => {
      const admin = await registerAdmin(app, 'admin9@test.com');
      const member = await registerInvitedUser(app, admin.token, 'flag@test.com', 'member');
      await request(srv())
        .post(`/api/users/${member.id}/set-password`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ newPassword: 'TempPass123!' })
        .expect(200);

      const login = await request(srv())
        .post('/api/auth/login')
        .send({ email: 'flag@test.com', password: 'TempPass123!' })
        .expect(200);
      expect(login.body.data.user.mustChangePassword).toBe(true);
    });
  });
});
