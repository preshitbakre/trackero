import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
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

      expect(res.body.code).toBe('F-L-0056');
    });

    it('deactivates user -> 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0012');
    });
  });

  describe('Concurrency races (last-admin protection)', () => {
    // Race C — concurrent demotions/deactivations must never remove the last admin.
    it('concurrent role demotions cannot remove the last admin', async () => {
      for (let round = 0; round < 5; round++) {
        await clearDatabase(app);
        const admin = await registerAdmin(app);
        // Create two more admins so there are 3 admins total, two of which are demotable.
        const admin2 = await registerInvitedUser(app, admin.token, 'rc-a2@test.com', 'admin');
        const admin3 = await registerInvitedUser(app, admin.token, 'rc-a3@test.com', 'admin');

        // Demote admin2 first so exactly TWO admins remain (admin + admin3).
        await request(app.getHttpServer())
          .put(`/api/users/${admin2.id}/role`)
          .set('Authorization', `Bearer ${admin.token}`)
          .send({ role: 'member' })
          .expect(200);

        // Now fire two concurrent demotions of the two remaining admins.
        const results = await Promise.allSettled([
          request(app.getHttpServer())
            .put(`/api/users/${admin.id}/role`)
            .set('Authorization', `Bearer ${admin3.token}`)
            .send({ role: 'member' }),
          request(app.getHttpServer())
            .put(`/api/users/${admin3.id}/role`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ role: 'member' }),
        ]);

        const fulfilled = results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<any>).value);
        const successes = fulfilled.filter((v) => v.status === 200);
        const lastAdminFails = fulfilled.filter(
          (v) => v.status === 409 && v.body.code === 'F-L-0050',
        );

        // Exactly one demotion succeeds; the other is rejected as LAST_ADMIN.
        expect(successes.length).toBe(1);
        expect(lastAdminFails.length).toBe(1);

        // At least one active admin remains.
        const dataSource = app.get(DataSource);
        const rows = await dataSource.query(
          `SELECT count(*)::int AS c FROM users WHERE role = 'admin' AND is_active = true`,
        );
        expect(rows[0].c).toBeGreaterThanOrEqual(1);
      }
    });

    it('concurrent deactivations cannot remove the last admin', async () => {
      for (let round = 0; round < 5; round++) {
        await clearDatabase(app);
        const admin = await registerAdmin(app);
        const admin2 = await registerInvitedUser(app, admin.token, 'rd-a2@test.com', 'admin');
        const admin3 = await registerInvitedUser(app, admin.token, 'rd-a3@test.com', 'admin');

        // Deactivate admin2 first so exactly TWO active admins remain.
        await request(app.getHttpServer())
          .put(`/api/users/${admin2.id}/deactivate`)
          .set('Authorization', `Bearer ${admin.token}`)
          .expect(200);

        // Fire two concurrent deactivations of the two remaining active admins.
        const results = await Promise.allSettled([
          request(app.getHttpServer())
            .put(`/api/users/${admin.id}/deactivate`)
            .set('Authorization', `Bearer ${admin3.token}`),
          request(app.getHttpServer())
            .put(`/api/users/${admin3.id}/deactivate`)
            .set('Authorization', `Bearer ${admin.token}`),
        ]);

        const fulfilled = results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<any>).value);
        const successes = fulfilled.filter((v) => v.status === 200);
        const lastAdminFails = fulfilled.filter(
          (v) => v.status === 409 && v.body.code === 'F-L-0050',
        );

        expect(successes.length).toBe(1);
        expect(lastAdminFails.length).toBe(1);

        const dataSource = app.get(DataSource);
        const rows = await dataSource.query(
          `SELECT count(*)::int AS c FROM users WHERE role = 'admin' AND is_active = true`,
        );
        expect(rows[0].c).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Invite Flow', () => {
    it('creates invitation -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'newuser@test.com', role: 'member' })
        .expect(201);

      expect(res.body.code).toBe('S-0016');
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

    it('rejects a duplicate pending invitation for the same email -> 409', async () => {
      await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'dupe@test.com', role: 'member' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'dupe@test.com', role: 'member' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');
    });

    it('two concurrent invites for the same email -> exactly one 201, one clean 409', async () => {
      // The findOne pre-check has a TOCTOU race: two concurrent invites can both
      // pass it and both insert a pending row. The partial unique index
      // UQ_invitation_pending_email (email WHERE status='pending') is the DB
      // backstop -> loser's INSERT raises 23505 -> clean 409 DUPLICATE_ENTRY.
      for (let round = 0; round < 5; round++) {
        const email = `concurrent-${round}@test.com`;
        const results = await Promise.allSettled([
          request(app.getHttpServer())
            .post('/api/users/invite')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ email, role: 'member' }),
          request(app.getHttpServer())
            .post('/api/users/invite')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ email, role: 'member' }),
        ]);

        const statuses = results.map((r) =>
          r.status === 'fulfilled' ? r.value.status : 0,
        );

        const successes = statuses.filter((s) => s === 201);
        const conflicts = statuses.filter((s) => s === 409);

        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(1);
        // No raw 500s — the duplicate must be a clean 409 DUPLICATE_ENTRY.
        expect(statuses.filter((s) => s === 500)).toHaveLength(0);

        const conflictRes = results.find(
          (r) => r.status === 'fulfilled' && r.value.status === 409,
        );
        if (conflictRes && conflictRes.status === 'fulfilled') {
          expect(conflictRes.value.body.success).toBe(false);
          expect(conflictRes.value.body.code).toBe('F-L-0002');
        }
      }
    });

    it('re-inviting an email is allowed once the prior invitation is no longer pending', async () => {
      // The partial index only constrains status='pending' rows. Once an
      // invitation is no longer pending (accepted/expired) the same email can
      // be invited again. Flip the prior invitation directly in the DB so the
      // active-user check (which a full register() flow would trip) is out of
      // the way and the partial index is the only thing under test.
      await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'reinvite@test.com', role: 'member' })
        .expect(201);

      const dataSource = app.get(DataSource);
      await dataSource.query(
        `UPDATE invitations SET status = 'expired' WHERE email = $1`,
        ['reinvite@test.com'],
      );

      // The expired row must NOT block a fresh pending invitation for the same email.
      await request(app.getHttpServer())
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'reinvite@test.com', role: 'member' })
        .expect(201);
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
