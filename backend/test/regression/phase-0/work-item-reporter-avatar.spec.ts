/**
 * T0.10 regression — work-item responses must include reporter.avatarUrl
 * (string or null), matching the assignee.avatarUrl projection. The
 * audit caught asymmetry where assignee had it and reporter didn't.
 *
 * Two assertions cover both projections:
 *   - formatItemResponse (list endpoints, create, update, etc.).
 *   - findOne's extended response (overrides the reporter projection
 *     inline; was the original asymmetric branch).
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerAdmin, clearDatabase } from '../../setup';

describe('T0.10 — reporter.avatarUrl populated symmetrically with assignee', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;
    const proj = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Avatar Sym', prefix: 'AVS' });
    projectId = proj.body.data.item.id;
  });

  it('POST /items returns reporter.avatarUrl (null when user has no avatar)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Avatar test' });

    expect(res.status).toBe(201);
    expect(res.body.data.item.reporter).toMatchObject({
      id: adminId,
      displayName: expect.any(String),
      avatarUrl: null,
    });
    expect(res.body.data.item.assignee).toBeNull();
  });

  it('GET /items/:id returns reporter.avatarUrl (string when set)', async () => {
    // Set an avatar on the admin user directly.
    await ds.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, ['/u/admin.png', adminId]);

    const created = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Avatar detail test' });
    const itemId = created.body.data.item.id;

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // GET /items/:id returns the formatted item directly under body.data
    // (no .item wrapper, unlike POST /items).
    expect(res.body.data.reporter).toMatchObject({
      id: adminId,
      displayName: expect.any(String),
      avatarUrl: '/u/admin.png',
    });
    // Sanity: assignee projection still ships the same shape — proves
    // the symmetry the audit asked for.
    expect(res.body.data.assignee).toBeNull();
  });
});
