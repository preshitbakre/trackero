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

describe('Sprints UpdateSprintDto carryOverPolicy + capacity (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
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

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sprint Update Project', prefix: 'SUP' });
    projectId = projRes.body.data.item.id;
  });

  async function createPlanningSprint() {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sprint 1',
        goal: 'Initial sprint',
        startDate: futureDate(1),
        endDate: futureDate(15),
      })
      .expect(201);
    return res.body.data.item.id as number;
  }

  it('PUT accepts carryOverPolicy and capacity and persists them', async () => {
    const sprintId = await createPlanningSprint();

    const updateRes = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll', capacity: 40 })
      .expect(200);

    expect(updateRes.body.data.item.carryOverPolicy).toBe('roll');
    expect(updateRes.body.data.item.capacity).toBe(40);

    const ds = app.get(DataSource);
    const row = await ds.query(
      `SELECT carry_over_policy, capacity FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(row[0].carry_over_policy).toBe('roll');
    expect(row[0].capacity).toBe(40);
  });

  it('PUT accepts capacity: null to clear the override', async () => {
    const sprintId = await createPlanningSprint();

    // First set a value...
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 25 })
      .expect(200);

    // ...then clear it with null.
    const clearRes = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: null })
      .expect(200);

    expect(clearRes.body.data.item.capacity).toBeNull();

    const ds = app.get(DataSource);
    const row = await ds.query(
      `SELECT capacity FROM sprints WHERE id = $1`,
      [sprintId],
    );
    expect(row[0].capacity).toBeNull();
  });

  it('PUT rejects carryOverPolicy: "bogus" with 400', async () => {
    const sprintId = await createPlanningSprint();

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'bogus' })
      .expect(400);
  });

  it('PUT rejects capacity: 0 with 400 (Min(1))', async () => {
    const sprintId = await createPlanningSprint();

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 0 })
      .expect(400);
  });

  it('PUT rejects carryOverPolicy/capacity changes on a completed sprint with 400', async () => {
    const sprintId = await createPlanningSprint();

    // Force the sprint into 'completed' state via raw SQL — the test only
    // needs the status guard to trip; we don't need a real complete flow here.
    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'completed' WHERE id = $1`, [sprintId]);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll' })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 30 })
      .expect(400);
  });

  it('PUT rejects carryOverPolicy/capacity changes on a cancelled sprint with 400', async () => {
    const sprintId = await createPlanningSprint();

    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'cancelled' WHERE id = $1`, [sprintId]);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'backlog' })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 10 })
      .expect(400);
  });

  it('PUT allows carryOverPolicy and capacity changes on an active sprint', async () => {
    const sprintId = await createPlanningSprint();

    // Flip the sprint to 'active' directly — start() requires tasks and we
    // don't need that wiring just to test the editable-on-active rule.
    const ds = app.get(DataSource);
    await ds.query(`UPDATE sprints SET status = 'active' WHERE id = $1`, [sprintId]);

    const res = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/sprints/${sprintId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ carryOverPolicy: 'roll', capacity: 50 })
      .expect(200);

    expect(res.body.data.item.carryOverPolicy).toBe('roll');
    expect(res.body.data.item.capacity).toBe(50);
  });
});
