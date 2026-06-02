import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Project Settings Update (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let pmToken: string;
  let pmId: number;
  let projectId: number;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    const pm = await registerInvitedUser(app, adminToken, 'pm@test.com', 'project_manager');
    pmToken = pm.token;
    pmId = pm.id;

    const res = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SettingsTest', prefix: 'SET' });
    projectId = res.body.data.item.id;

    // Add PM and member to the project so ProjectAccessGuard lets them through
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: pmId, role: 'project_manager' });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`).set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: member.id, role: 'member' });
  });

  it('admin updates project name', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed Project' }).expect(200);

    // GET /api/projects/:id returns the plain entity at res.body.data (not .item)
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.name).toBe('Renamed Project');
  });

  it('admin updates project description', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'New description text' }).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.description).toBe('New description text');
  });

  it('admin updates defaultSprintDuration', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ defaultSprintDuration: 21 }).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.defaultSprintDuration).toBe(21);
  });

  it('admin updates estimationScale', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ estimationScale: 'fibonacci' }).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.estimationScale).toBe('fibonacci');
  });

  it('member cannot update project settings', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Hacked' }).expect(403);
  });

  it('PM can update project settings', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${pmToken}`)
      .send({ name: 'PM Updated' }).expect(200);
  });

  it('update archived project is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/archive`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Should Fail' });
    expect([400, 403, 409]).toContain(res.status);
  });
});
