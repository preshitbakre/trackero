import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

// Register an admin with a password that satisfies IsStrongPassword
// (8–20 chars, upper + lower + digit + special). The shared helper in
// setup.ts uses 'password123' which fails that regex after the DTO
// validation tightened in commit e2fccba, so we register inline here.
async function registerStrongAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: 'admin@test.com', password: 'Password1!', displayName: 'Admin' });
  return { token: res.body.data.accessToken, id: res.body.data.user.id };
}

/** A date `daysFromNow` days ahead of today, as YYYY-MM-DD — sprints reject past start dates. */
const futureDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];

describe('Sprints entity columns (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerStrongAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint Cols Project', prefix: 'SCP' });
    projectId = projRes.body.data.item.id;
  });

  it('persists carry_over_policy, capacity, started_by columns on sprints table', async () => {
    // Create a sprint via the existing endpoint.
    const createRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sprint A',
        goal: 'Verify new sprint columns persist',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    const sprintId = createRes.body.data.item.id;

    const ds = app.get(DataSource);

    // Default carry_over_policy should be 'ask' on a freshly created sprint.
    const defaults = await ds.query(
      `SELECT carry_over_policy, capacity, started_by FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].carry_over_policy).toBe('ask');
    expect(defaults[0].capacity).toBeNull();
    expect(defaults[0].started_by).toBeNull();

    // Update the new columns via raw SQL.
    await ds.query(
      `UPDATE sprints
         SET carry_over_policy = $1,
             capacity = $2,
             started_by = $3
       WHERE id = $4`,
      ['roll', 42, adminId, sprintId],
    );

    // Select them back and assert they persist.
    const updated = await ds.query(
      `SELECT carry_over_policy, capacity, started_by FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].carry_over_policy).toBe('roll');
    expect(updated[0].capacity).toBe(42);
    expect(updated[0].started_by).toBe(adminId);

    // Round-trip the other allowed policy values too.
    for (const policy of ['backlog', 'ask']) {
      await ds.query(
        `UPDATE sprints SET carry_over_policy = $1 WHERE id = $2`,
        [policy, sprintId],
      );
      const row = await ds.query(
        `SELECT carry_over_policy FROM sprints WHERE id = $1`,
        [sprintId],
      );
      expect(row[0].carry_over_policy).toBe(policy);
    }
  });
});
