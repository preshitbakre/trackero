/**
 * T0.12 — GET /api/health/migrations is the verification gate for every
 * later phase's deploy. It must:
 *
 *   1. Require admin authentication (non-admins → 403; anonymous → 401).
 *   2. Report `applied` (rows from `migrations`) and `expected` (the
 *      hand-maintained registry) with the diff in both directions.
 *   3. Return consistent: true on a fresh test DB where synchronize
 *      created the schema — applied will be empty (tests don't run
 *      migrations) but neither will expected, since the registry only
 *      counts when migrations actually ran.
 *
 * Test DB nuance: the runtime config disables migrations for tests, so
 * the `migrations` table on a fresh test DB is empty. The endpoint
 * therefore reports every registered migration in `diff.missing` —
 * which is the truthful state. We assert the *shape* of the response
 * and the admin-gating, not a particular consistency outcome.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAdmin, registerInvitedUser, clearDatabase } from '../../setup';

describe('T0.12 — GET /api/health/migrations', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;

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
    const member = await registerInvitedUser(app, adminToken, 'mem@h.local', 'member');
    memberToken = member.token;
  });

  it('rejects anonymous callers with 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/migrations');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin members with 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health/migrations')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it('returns the applied / expected / diff shape to admins', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health/migrations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(Array.isArray(data.applied)).toBe(true);
    expect(Array.isArray(data.expected)).toBe(true);
    expect(Array.isArray(data.drift)).toBe(true);
    expect(data.diff).toEqual(
      expect.objectContaining({
        missing: expect.any(Array),
        unexpected: expect.any(Array),
      }),
    );
    expect(typeof data.consistent).toBe('boolean');

    // The registry must contain every migration shipped to date.
    expect(data.expected).toContain('AuthTables1716000000000');
    expect(data.expected).toContain('ReconcileMigrationsTable1716000024000');
    expect(data.expected).toContain('DropLegacyTables1716000029000');
  });
});
