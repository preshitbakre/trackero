import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

const futureDate = (d: number) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];

describe('Backlog Sort & Bulk Sequences (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token; adminId = admin.id;

    const res = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'BacklogTest', prefix: 'BLG' });
    projectId = res.body.data.item.id;
  });

  async function createBacklogTask(priority: string, title?: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send({ title: title || `${priority} task`, itemType: 'task', priority });
    return res.body.data.item;
  }

  it('sequential move-to-sprint (simulating bulk)', async () => {
    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Target Sprint', goal: 'test', startDate: futureDate(1), endDate: futureDate(15) });
    const sprintId = sprintRes.body.data.item.id;

    const items = await Promise.all([
      createBacklogTask('high', 'T1'),
      createBacklogTask('medium', 'T2'),
      createBacklogTask('low', 'T3'),
    ]);

    for (const item of items) {
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${item.id}/sprint`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sprintId }).expect(200);
    }

    for (const item of items) {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items/${item.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.sprintId).toBe(sprintId);
    }
  });

  it('sequential soft-delete (simulating bulk)', async () => {
    const items = await Promise.all([
      createBacklogTask('high', 'D1'),
      createBacklogTask('medium', 'D2'),
      createBacklogTask('low', 'D3'),
    ]);

    for (const item of items) {
      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${item.id}`)
        .set('Authorization', `Bearer ${adminToken}`).expect(200);
    }

    for (const item of items) {
      const [row] = await ds.query(`SELECT deleted_at FROM work_items WHERE id = $1`, [item.id]);
      expect(row.deleted_at).not.toBeNull();
    }
  });

  it('sequential assign-to-me (simulating bulk)', async () => {
    const items = await Promise.all([
      createBacklogTask('high', 'A1'),
      createBacklogTask('medium', 'A2'),
      createBacklogTask('low', 'A3'),
    ]);

    for (const item of items) {
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${item.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: adminId }).expect(200);
    }

    for (const item of items) {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items/${item.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.assigneeId).toBe(adminId);
    }
  });
});
