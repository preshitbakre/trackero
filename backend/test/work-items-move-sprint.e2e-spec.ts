import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('WorkItems MOVE + SPRINT (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;
  let doneStatusId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const moveItem = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const assignSprint = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}/sprint`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const assign = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  // =========================================================================
  // MOVE (subtask reparenting — only subtasks have parentId)
  // =========================================================================

  describe('move', () => {
    it('moves subtask from task A to task B → 200', async () => {
      const taskARes = await createItem({ itemType: 'task', title: 'Task A' });
      const taskAId = taskARes.body.data.item.id;
      const taskBRes = await createItem({ itemType: 'task', title: 'Task B' });
      const taskBId = taskBRes.body.data.item.id;

      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskAId });
      const subId = subRes.body.data.item.id;

      const res = await moveItem(subId, { parentId: taskBId }).expect(200);

      expect(res.body.code).toBe('S-0107');
      expect(res.body.data.item.parentId).toBe(taskBId);
    });

    it('moves subtask from task to story → 200', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'Task' });
      const taskId = taskRes.body.data.item.id;
      const storyRes = await createItem({ itemType: 'story', title: 'Story' });
      const storyId = storyRes.body.data.item.id;

      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      const res = await moveItem(subId, { parentId: storyId }).expect(200);

      expect(res.body.data.item.parentId).toBe(storyId);
    });

    it('cross-project move → 400', async () => {
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other', prefix: 'OTH' });
      const proj2Id = proj2Res.body.data.item.id;

      const otherTaskRes = await request(app.getHttpServer())
        .post(`/api/projects/${proj2Id}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Other Task' });
      const otherTaskId = otherTaskRes.body.data.item.id;

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      const res = await moveItem(subId, { parentId: otherTaskId }).expect(400);

      expect(res.body.code).toBe('F-L-0099');
    });

    it('invalid parent-child type on move → 400', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      // Try to move task under another task (task can only parent subtask, and task itself can't have parent)
      const task2Res = await createItem({ itemType: 'task', title: 'T2' });
      const task2Id = task2Res.body.data.item.id;

      const res = await moveItem(taskId, { parentId: task2Id }).expect(400);

      expect(res.body.code).toBe('F-L-0091');
    });

    it('returns 404 for non-existent item', async () => {
      await moveItem(99999, { parentId: null }).expect(404);
    });
  });

  // =========================================================================
  // SPRINT ASSIGNMENT
  // =========================================================================

  describe('assignSprint', () => {
    it('assigns task to sprint → 200', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assignSprint(taskId, { sprintId: sprint.id }).expect(200);

      expect(res.body.code).toBe('S-0108');
      expect(res.body.data.item.sprintId).toBe(sprint.id);
    });

    it('assigns subtask to sprint → 400 SUBTASK_NO_SPRINT', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      const res = await assignSprint(subId, { sprintId: sprint.id }).expect(400);

      expect(res.body.code).toBe('F-L-0094');
    });

    it('assigns epic to sprint → 200 (informational only)', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const epicRes = await createItem({ itemType: 'epic', title: 'E1' });
      const epicId = epicRes.body.data.item.id;

      const res = await assignSprint(epicId, { sprintId: sprint.id }).expect(200);

      expect(res.body.data.item.sprintId).toBe(sprint.id);
    });

    it('assigns bug to sprint → 200', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
      const bugId = bugRes.body.data.item.id;

      const res = await assignSprint(bugId, { sprintId: sprint.id }).expect(200);

      expect(res.body.data.item.sprintId).toBe(sprint.id);
    });

    it('assigns story to sprint → 200 (informational only)', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const storyRes = await createItem({ itemType: 'story', title: 'S1' });
      const storyId = storyRes.body.data.item.id;

      const res = await assignSprint(storyId, { sprintId: sprint.id }).expect(200);

      expect(res.body.data.item.sprintId).toBe(sprint.id);
    });

    it('removes task from sprint (sprintId=null)', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1', sprintId: sprint.id });
      const taskId = taskRes.body.data.item.id;

      const res = await assignSprint(taskId, { sprintId: null }).expect(200);

      expect(res.body.data.item.sprintId).toBeNull();
    });

    it('task assigned to active sprint gets addedMidSprint = true', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
         VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE, CURRENT_DATE + 14) RETURNING id`,
        [projectId, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assignSprint(taskId, { sprintId: sprint.id }).expect(200);

      expect(res.body.data.item.addedMidSprint).toBe(true);
    });

    it('task assigned to planning sprint gets addedMidSprint = false', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assignSprint(taskId, { sprintId: sprint.id }).expect(200);

      expect(res.body.data.item.addedMidSprint).toBe(false);
    });

    it('returns 404 for non-existent item', async () => {
      await assignSprint(99999, { sprintId: null }).expect(404);
    });

    // =======================================================================
    // Cross-project sprint validation (Task 2.5 — audit §4.2/§4.3)
    // =======================================================================

    it('assignSprint to a sprint from another project → 4xx', async () => {
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other', prefix: 'OTH' });
      const proj2Id = proj2Res.body.data.item.id;

      const [foreignSprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'B Sprint', 'planning', 1, $2) RETURNING id`,
        [proj2Id, adminId],
      );

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assignSprint(taskId, { sprintId: foreignSprint.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // =========================================================================
  // ASSIGNEE ASSIGNMENT (Task 2.5 — audit §4.2/§4.3)
  // =========================================================================

  describe('assign', () => {
    it('assigns task to a project member → 200', async () => {
      const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: member.id, role: 'member' });

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assign(taskId, { assigneeId: member.id }).expect(200);
      expect(res.body.data.item.assigneeId).toBe(member.id);
    });

    it('assigns to a user who is not a project member → 4xx', async () => {
      const outsider = await registerInvitedUser(app, adminToken, 'outsider@test.com', 'member');

      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assign(taskId, { assigneeId: outsider.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('clears assignee with assigneeId=null → 200', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await assign(taskId, { assigneeId: null }).expect(200);
      expect(res.body.data.item.assigneeId).toBeNull();
    });
  });
});
