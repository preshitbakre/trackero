/**
 * T0.9 regression — board cards must return itemKey shaped as
 * `${projectPrefix}-${itemNumber}` to match every other surface
 * (work-item detail, search, comments, notifications).
 *
 * The bug returned the bare integer, breaking copy-paste of card
 * references and any FE consumer that parsed itemKey expecting the
 * prefix.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAdmin, clearDatabase } from '../../setup';

describe('T0.9 — board card itemKey includes the project prefix', () => {
  let app: INestApplication;
  let adminToken: string;
  let projectId: number;
  let statusId: number;
  let inProgressStatusId: number;
  let prefix: string;

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

    prefix = 'BST';
    const proj = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Board Spec Test', prefix });
    projectId = proj.body.data.item.id;

    const statuses = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/statuses`)
      .set('Authorization', `Bearer ${adminToken}`);
    const list = statuses.body.data as Array<{ id: number; category: string }>;
    statusId = list[0].id;
    const second = list.find((s) => s.id !== statusId);
    inProgressStatusId = second?.id ?? statusId;
  });

  it('GET /board returns prefixed itemKey on every card', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: `Board card ${i}` });
    }

    const board = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(board.status).toBe(200);

    const cards = board.body.data.columns.flatMap((c: any) => c.tasks);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.itemKey).toMatch(new RegExp(`^${prefix}-\\d+$`));
    }
  });

  it('PUT /board/move returns prefixed itemKey on the response', async () => {
    const item = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Move me' });
    const itemId = item.body.data.item.id;

    const move = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/board/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemId, statusId: inProgressStatusId, sortOrder: 'n' });
    expect(move.status).toBe(200);
    expect(move.body.data.itemKey).toMatch(new RegExp(`^${prefix}-\\d+$`));
  });
});
