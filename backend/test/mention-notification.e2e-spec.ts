import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Mention → Notification (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let projectId: number;
  let taskId: number;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token; adminId = admin.id;
    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token; memberId = member.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'MentionTest', prefix: 'MNT' });
    projectId = projRes.body.data.item.id;

    // Add member to the project so mention resolution can find them
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    const taskRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Task', itemType: 'task' });
    taskId = taskRes.body.data.item.id;
  });

  const tick = () => new Promise((r) => setTimeout(r, 200));

  it('@mention creates notification for mentioned user', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${taskId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Hey @[Member] check this' });

    await tick();

    const mentions = await ds.query(
      `SELECT user_id FROM comment_mentions WHERE user_id = $1`, [memberId],
    );
    expect(mentions.length).toBe(1);

    const notifs = await ds.query(
      `SELECT type FROM notifications WHERE user_id = $1 AND type = 'mentioned'`, [memberId],
    );
    expect(notifs.length).toBe(1);
  });

  it('self-mention does not create notification', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${taskId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Note to @[Admin] myself' });

    await tick();

    const notifs = await ds.query(
      `SELECT id FROM notifications WHERE user_id = $1 AND type = 'mentioned'`, [adminId],
    );
    expect(notifs.length).toBe(0);
  });

  it('mention of non-existent user is ignored gracefully', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${taskId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Hey @[NonExistentUser] test' });

    expect(res.status).toBe(201);
    expect(res.body.data.item.id).toBeDefined();
  });

  it('multiple mentions in one comment', async () => {
    await registerInvitedUser(app, adminToken, 'member2@test.com', 'member');

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${taskId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: '@[Member] and @[Member] please review' });

    await tick();

    const mentions = await ds.query(
      `SELECT DISTINCT user_id FROM comment_mentions cm
       JOIN comments c ON c.id = cm.comment_id
       WHERE c.work_item_id = $1`, [taskId],
    );
    expect(mentions.length).toBeGreaterThanOrEqual(1);
  });

  it('comment without mentions creates no mention notifications', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${taskId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Just a regular comment' });

    await tick();

    const notifs = await ds.query(
      `SELECT id FROM notifications WHERE type = 'mentioned'`,
    );
    expect(notifs.length).toBe(0);
  });
});
