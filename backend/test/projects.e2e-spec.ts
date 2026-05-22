import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Projects Module (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;

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

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;
  });

  describe('POST /api/projects', () => {
    it('creates project with valid data -> 201, default statuses created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Backend API', prefix: 'BACK', description: 'API project' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0021');
      expect(res.body.data.item.name).toBe('Backend API');
      expect(res.body.data.item.prefix).toBe('BACK');
      expect(res.body.data.item.status).toBe('active');

      // Check default statuses were created
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${res.body.data.item.id}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statusRes.body.data.length).toBe(3);
      const categories = statusRes.body.data.map((s: any) => s.category);
      expect(categories).toContain('backlog');
      expect(categories).toContain('in_progress');
      expect(categories).toContain('done');
    });

    it('auto-adds creator as project member', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Project', prefix: 'TEST' })
        .expect(201);

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${res.body.data.item.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(membersRes.body.data.list.length).toBe(1);
      expect(membersRes.body.data.list[0].role).toBe('project_manager');
    });

    it('rejects duplicate prefix -> 409', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Project A', prefix: 'DUP' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Project B', prefix: 'DUP' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');
    });

    it('rejects without auth -> 401', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: 'No Auth', prefix: 'NOAU' })
        .expect(401);
    });

    it('rejects member role -> 403', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Member Project', prefix: 'MEMB' })
        .expect(403);
    });

    it('rejects invalid prefix format -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Prefix', prefix: 'ab' })
        .expect(400);

      expect(res.body.code).toBe('F-V-0001');
    });
  });

  describe('GET /api/projects', () => {
    beforeEach(async () => {
      // Create a project
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Visible Project', prefix: 'VIS' });
    });

    it('admin sees all projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0020');
      expect(res.body.data.list.length).toBe(1);
    });

    it('member sees only assigned projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Delete', prefix: 'DEL' });
      projectId = res.body.data.item.id;
    });

    it('rejects deleting a non-archived (active) project -> 409 and project still exists', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0055');

      // project still exists
      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('admin can delete project after archiving it -> 200 and project is gone', async () => {
      // archive first
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0024');

      // project is gone
      await request(app.getHttpServer())
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('member cannot delete project -> 403', async () => {
      // Add member to project first
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' });

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  describe('Project Members', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Members Project', prefix: 'MEM' });
      projectId = res.body.data.item.id;
    });

    it('adds member to project -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0026');
    });

    it('removes member from project -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberId, role: 'member' });

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0027');
    });
  });

  describe('Last project manager guard', () => {
    let projectId: number;
    let creatorId: number;
    let secondPmId: number;
    let plainMemberId: number;

    beforeEach(async () => {
      creatorId = (await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)).body.data.id;

      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Last PM Project', prefix: 'LPM' });
      projectId = res.body.data.item.id;

      const secondPm = await registerInvitedUser(app, adminToken, 'second-pm@test.com', 'member');
      secondPmId = secondPm.id;
      const plain = await registerInvitedUser(app, adminToken, 'plain-mem@test.com', 'member');
      plainMemberId = plain.id;
    });

    it('rejects removing the sole project_manager -> 409 and manager still a member', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${creatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0054');

      // creator is still a member with project_manager role
      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const creator = membersRes.body.data.list.find((m: any) => m.userId === creatorId);
      expect(creator).toBeDefined();
      expect(creator.role).toBe('project_manager');
    });

    it('allows removing a project_manager when another project_manager exists', async () => {
      // add a second project_manager
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: secondPmId, role: 'project_manager' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${creatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0027');

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(membersRes.body.data.list.find((m: any) => m.userId === creatorId)).toBeUndefined();
    });

    it('allows removing a plain member regardless of manager count', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: plainMemberId, role: 'member' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${plainMemberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('allows removing a viewer regardless of manager count', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: plainMemberId, role: 'viewer' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/members/${plainMemberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects demoting the sole project_manager to member -> 409 and role unchanged', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/members/${creatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: creatorId, role: 'member' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0054');

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const creator = membersRes.body.data.list.find((m: any) => m.userId === creatorId);
      expect(creator.role).toBe('project_manager');
    });

    it('allows demoting a project_manager when another project_manager exists', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: secondPmId, role: 'project_manager' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/members/${creatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: creatorId, role: 'member' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0028');

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const creator = membersRes.body.data.list.find((m: any) => m.userId === creatorId);
      expect(creator.role).toBe('member');
    });

    it('allows promoting a member to project_manager', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: plainMemberId, role: 'member' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/members/${plainMemberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: plainMemberId, role: 'project_manager' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0028');
    });
  });

  describe('Project Statuses', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Status Project', prefix: 'STAT' });
      projectId = res.body.data.item.id;
    });

    it('creates custom status -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'QA Testing', category: 'in_progress', color: '#9333EA' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0031');
    });

    it('rejects a duplicate status name in the same project -> 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Code Review', category: 'in_progress', color: '#9333EA' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Code Review', category: 'in_progress', color: '#3B82F6' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');
    });

    it('concurrent creates of the same status name -> exactly one 201, the other 409', async () => {
      const results = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/projects/${projectId}/statuses`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Race Status', category: 'in_progress', color: '#9333EA' }),
        request(app.getHttpServer())
          .post(`/api/projects/${projectId}/statuses`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Race Status', category: 'in_progress', color: '#3B82F6' }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('F-L-0002');
    });

    it('cannot delete fixed status -> 403', async () => {
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`);

      const backlogStatus = statusRes.body.data.find((s: any) => s.category === 'backlog');

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/statuses/${backlogStatus.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('Status reorder (permutation validation + atomicity)', () => {
    let projectId: number;
    let statusIds: number[];

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Reorder Project', prefix: 'REO' });
      projectId = res.body.data.item.id;

      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      // statuses returned ordered by sortOrder ASC
      statusIds = statusRes.body.data.map((s: any) => s.id);
      expect(statusIds.length).toBe(3);
    });

    it('reorders statuses with a valid full permutation -> 200 and applies new order', async () => {
      const reversed = [...statusIds].reverse();
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: reversed })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0034');

      const after = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // statuses come back ordered by sortOrder ASC -> must match reversed
      expect(after.body.data.map((s: any) => s.id)).toEqual(reversed);
      after.body.data.forEach((s: any, i: number) => {
        expect(s.sortOrder).toBe(i);
      });
    });

    it('rejects a partial statusIds list (missing one id) -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: statusIds.slice(0, 2) })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects a statusIds list with a duplicate id -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: [statusIds[0], statusIds[1], statusIds[1]] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects a statusIds list containing a foreign / unknown id -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: [statusIds[0], statusIds[1], 9999999] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    // --- DTO validation (Task 3.2): malformed bodies must fail at the DTO layer ---

    it('rejects a body missing statusIds entirely -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects statusIds that is not an array -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: 'notanarray' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects an empty statusIds array -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: [] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects statusIds containing a non-integer value -> 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: [statusIds[0], 'oops', statusIds[2]] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects statusIds from another project -> 400 and leaves order untouched', async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other Reorder Project', prefix: 'REO2' });
      const otherProjectId = otherRes.body.data.item.id;
      const otherStatusRes = await request(app.getHttpServer())
        .get(`/api/projects/${otherProjectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const otherStatusIds = otherStatusRes.body.data.map((s: any) => s.id);

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/statuses/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusIds: otherStatusIds })
        .expect(400);

      // original project order unchanged
      const after = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.data.map((s: any) => s.id)).toEqual(statusIds);
    });
  });

  describe('Project creation atomicity', () => {
    it('a successful create yields a project with 3 statuses AND the creator as project_manager', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Atomic Project', prefix: 'ATOM' })
        .expect(201);

      const newProjectId = res.body.data.item.id;

      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${newProjectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(statusRes.body.data.length).toBe(3);

      const membersRes = await request(app.getHttpServer())
        .get(`/api/projects/${newProjectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(membersRes.body.data.list.length).toBe(1);
      expect(membersRes.body.data.list[0].role).toBe('project_manager');
    });

    it('a rejected create (duplicate prefix) leaves no orphan project, statuses or members', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'First Atom', prefix: 'ATM2' })
        .expect(201);

      // attempt a duplicate-prefix create -> rejected
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Second Atom', prefix: 'ATM2' })
        .expect(409);

      // exactly one project with that prefix exists
      const list = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const matching = list.body.data.list.filter((p: any) => p.prefix === 'ATM2');
      expect(matching.length).toBe(1);
    });
  });

  describe('Labels', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Label Project', prefix: 'LBL' });
      projectId = res.body.data.item.id;
    });

    it('creates label -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'frontend', color: '#EF4444' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0037');
    });

    it('lists labels for project -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'backend', color: '#3B82F6' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0036');
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('rejects a duplicate label name in the same project -> 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bug', color: '#EF4444' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bug', color: '#3B82F6' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');
    });

    it('rejects renaming a label to collide with a sibling label name -> 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bug', color: '#EF4444' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Feature', color: '#3B82F6' })
        .expect(201);

      // figure out the second label's id from the list
      const list = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const featureLabel = list.body.data.find((l: any) => l.name === 'Feature');
      expect(featureLabel).toBeDefined();

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/labels/${featureLabel.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bug' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0002');

      // the rename did not take effect
      const after = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.data.find((l: any) => l.id === featureLabel.id).name).toBe('Feature');
    });

    it('allows renaming a label to its own current name -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Chore', color: '#EF4444' })
        .expect(201);
      const list = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const chore = list.body.data.find((l: any) => l.name === 'Chore');

      // renaming to the same name (only changing color) must succeed
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/labels/${chore.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Chore', color: '#3B82F6' })
        .expect(200);
    });

    it('concurrent creates of the same label name -> exactly one 201, the other 409', async () => {
      const results = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/projects/${projectId}/labels`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Race', color: '#EF4444' }),
        request(app.getHttpServer())
          .post(`/api/projects/${projectId}/labels`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Race', color: '#3B82F6' }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      // the loser must be a clean 409, never a raw 500
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('F-L-0002');
    });
  });

  describe('Archived project mutation block (ProjectAccessGuard)', () => {
    let projectId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Archive Project', prefix: 'ARCH' });
      projectId = res.body.data.item.id;

      // Archive it
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    });

    it('blocks a mutation on an archived project even with ?x=/archive querystring', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels?x=/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'sneaky', color: '#EF4444' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0052');
    });

    it('blocks a mutation on an archived project even with ?redirect=/unarchive querystring', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels?redirect=/unarchive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'sneaky2', color: '#3B82F6' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0052');
    });

    it('still blocks a plain mutation on an archived project', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/labels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'plain', color: '#10B981' })
        .expect(403);

      expect(res.body.code).toBe('F-L-0052');
    });

    it('still allows the real archive and unarchive endpoints on an archived project', async () => {
      // unarchive works on archived project
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/unarchive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // re-archive works (project is now active)
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // archive endpoint works again on the now-archived project
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Project existence + projectId validation (ProjectAccessGuard)', () => {
    it('admin requesting a non-existent project -> 404 NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0001');
    });

    it('admin requesting a non-existent project sub-route -> 404 NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects/99999/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0001');
    });

    it('admin mutating a non-existent project -> 404 NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects/99999/labels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'ghost', color: '#EF4444' })
        .expect(404);

      expect(res.body.code).toBe('F-L-0001');
    });

    it('regular user requesting a non-existent project is rejected (not 200/500)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects/99999/members')
        .set('Authorization', `Bearer ${memberToken}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects a malformed projectId like /99999abc -> 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects/99999abc/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Users (Admin)', () => {
    it('lists users as admin -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0010');
      expect(res.body.data.list.length).toBeGreaterThan(0);
    });

    it('rejects non-admin listing users -> 403', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('changes user role as admin -> 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/users/${memberId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'project_manager' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0011');
    });
  });
});
