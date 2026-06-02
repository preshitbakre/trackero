import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

const futureDate = (d: number) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];

describe('Velocity Chart (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let projectId: number;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await clearDatabase(app); });

  async function setupProject() {
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    const res = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'VeloTest', prefix: 'VEL' });
    projectId = res.body.data.item.id;
  }

  /**
   * Creates a sprint, adds tasks with given story point values, starts the
   * sprint, then completes it.  Returns the sprint id.
   *
   * NOTE: setupProject() must be called BEFORE this helper — it does NOT call
   * it internally so the caller can reuse the same project across helpers.
   */
  async function createAndCompleteSprint(name: string, points: number[]) {
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`, [projectId],
    );
    const doneStatusId = statuses.find((s: any) => s.category === 'done').id;

    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name, goal: 'test', startDate: futureDate(1), endDate: futureDate(15) });
    const sprintId = sprintRes.body.data.item.id;

    for (const sp of points) {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
        .send({ title: `Task ${sp}pt`, itemType: 'task', sprintId, storyPoints: sp });
      // Move task to done status via the board move endpoint
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/board/move`).set('Authorization', `Bearer ${adminToken}`)
        .send({ itemId: taskRes.body.data.item.id, statusId: doneStatusId, sortOrder: 'n' });
    }

    // Start sprint (requires at least one task)
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Complete sprint
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints/${sprintId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`);

    return sprintId;
  }

  it('velocity with one completed sprint returns data', async () => {
    await setupProject();
    await createAndCompleteSprint('Sprint 1', [3, 5, 2]);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/velocity`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].completed_points).toBe(10);
    expect(res.body.data[0].name).toBe('Sprint 1');
  });

  it('velocity excludes planning sprints', async () => {
    await setupProject();
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Planning Sprint', goal: 'test', startDate: futureDate(1), endDate: futureDate(15) });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/velocity`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.length).toBe(0);
  });
});
