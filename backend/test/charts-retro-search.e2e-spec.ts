import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Charts, Retro, Search (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let projectId: number;

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
    adminId = admin.id;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Charts Project', prefix: 'CRT' });
    projectId = projRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  describe('Velocity', () => {
    it('returns velocity data for completed sprints -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/velocity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0180');
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Cumulative Flow', () => {
    it('returns cumulative flow data -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/cumulative-flow`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0181');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Retrospectives', () => {
    let sprintId: number;

    beforeEach(async () => {
      const sprintRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', startDate: '2026-05-18', endDate: '2026-06-01' });
      sprintId = sprintRes.body.data.item.id;
    });

    it('creates retrospective -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0190');
      expect(res.body.data.sprintId).toBe(sprintId);
    });

    it('one retro per sprint enforced -> 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.code).toBe('F-L-0053');
    });

    it('gets retro with cards -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0191');
      expect(res.body.data.cards).toBeDefined();
    });

    it('adds card to retro -> 201', async () => {
      const retroRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);
      const retroId = retroRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ column: 'went_well', content: 'Great teamwork' })
        .expect(201);

      expect(res.body.code).toBe('S-0192');
      expect(res.body.data.content).toBe('Great teamwork');
      expect(res.body.data.column).toBe('went_well');
    });

    it('vote toggles and enforces one per user per card', async () => {
      const retroRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);
      const retroId = retroRes.body.data.id;

      const cardRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ column: 'went_well', content: 'Vote test' });
      const cardId = cardRes.body.data.id;

      // Vote (add)
      const voteRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(voteRes.body.code).toBe('S-0195');
      expect(voteRes.body.data.votes).toBe(1);

      // Vote again (toggle off)
      const unvoteRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(unvoteRes.body.data.votes).toBe(0);
    });
  });

  describe('Search', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Fix authentication bug in login' });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Add user profile page' });
    });

    it('searches tasks by query -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0200');
      expect(res.body.data.list.length).toBe(1);
      expect(res.body.data.list[0].title).toContain('authentication');
    });

    it('returns empty for query < 2 chars', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search?q=a')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });

    it('scopes search to user projects (member sees only their projects)', async () => {
      // Create another project member is NOT in
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Secret Project', prefix: 'SEC' });
      const proj2Id = proj2Res.body.data.item.id;

      await request(app.getHttpServer())
        .post(`/api/projects/${proj2Id}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Secret authentication task' });

      // Member searches — should NOT see secret project tasks
      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      // Member is only in CRT project, not SEC
      const taskProjects = res.body.data.list.map((t: any) => t.projectId);
      expect(taskProjects.every((pid: number) => pid === projectId)).toBe(true);
    });

    it('filters by projectId when provided', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/search?q=profile&projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(1);
    });

    it('excludes archived project tasks', async () => {
      // Archive the project
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });
  });
});
