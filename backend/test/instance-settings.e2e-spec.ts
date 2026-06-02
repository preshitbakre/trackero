import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Instance Settings (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
  });

  it('admin can read instance settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('admin can update instance settings', async () => {
    await request(app.getHttpServer())
      .put('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'appName', value: 'MyTrackero' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.appName).toBe('MyTrackero');
  });

  it('non-admin cannot update instance settings', async () => {
    await request(app.getHttpServer())
      .put('/api/instance-settings')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ key: 'appName', value: 'Hacked' })
      .expect(403);
  });

  it('update with empty key is rejected', async () => {
    await request(app.getHttpServer())
      .put('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: '', value: 'test' })
      .expect(400);
  });

  it('update is idempotent', async () => {
    const payload = { key: 'theme', value: 'dark' };

    await request(app.getHttpServer())
      .put('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload).expect(200);

    await request(app.getHttpServer())
      .put('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload).expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/instance-settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.theme).toBe('dark');
  });
});
