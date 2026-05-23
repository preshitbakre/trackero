import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('WorkItems UPDATE + DELETE (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;
  let inProgressStatusId: number;
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
    inProgressStatusId = statuses.find((s: any) => s.category === 'in_progress').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const updateItem = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const deleteItem = (id: number) =>
    request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  // =========================================================================
  // UPDATE
  // =========================================================================

  describe('update', () => {
    it('updates title → 200', async () => {
      const res = await createItem({ itemType: 'task', title: 'Old title' });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, { title: 'New title' }).expect(200);

      expect(upd.body.success).toBe(true);
      expect(upd.body.code).toBe('S-0103');
      expect(upd.body.data.item.title).toBe('New title');
    });

    it('updates priority and description', async () => {
      const res = await createItem({ itemType: 'task', title: 'T1' });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, {
        priority: 'urgent',
        description: 'Important task',
      }).expect(200);

      expect(upd.body.data.item.priority).toBe('urgent');
      expect(upd.body.data.item.description).toBe('Important task');
    });

    it('rejects itemType change → 400 (forbidden field)', async () => {
      const res = await createItem({ itemType: 'task', title: 'T1' });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, { itemType: 'epic' }).expect(400);

      // itemType is not in UpdateWorkItemDto, so forbidNonWhitelisted rejects it
      expect(upd.body.code).toBe('F-V-0001');
    });

    it('rejects sprintId change on subtask → 400 SUBTASK_NO_SPRINT', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      const upd = await updateItem(subId, { sprintId: sprint.id }).expect(400);

      expect(upd.body.code).toBe('F-L-0094');
    });

    it('status change to done sets completedAt', async () => {
      const res = await createItem({ itemType: 'task', title: 'T1' });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, { statusId: doneStatusId }).expect(200);

      expect(upd.body.data.item.completedAt).not.toBeNull();
    });

    it('status change from done clears completedAt', async () => {
      const res = await createItem({ itemType: 'task', title: 'T1', statusId: doneStatusId });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, { statusId: defaultStatusId }).expect(200);

      expect(upd.body.data.item.completedAt).toBeNull();
    });

    it('status change to done checks association blockers', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1 — create association: T2 blocks T1 (outgoing from T2)
      await createAssociation(t2Id, t1Id, 'blocks');

      // Try to mark T2 as done while T1 is still in backlog
      const upd = await updateItem(t2Id, { statusId: doneStatusId }).expect(400);

      expect(upd.body.code).toBe('F-L-0101');
    });

    it('status change to done allowed when blocker is already done', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker', statusId: doneStatusId });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1
      await createAssociation(t2Id, t1Id, 'blocks');

      const upd = await updateItem(t2Id, { statusId: doneStatusId }).expect(200);

      expect(upd.body.data.item.completedAt).not.toBeNull();
    });

    it('updates labels', async () => {
      const [label1] = await ds.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, 'fe', '#88A9D6') RETURNING id`,
        [projectId],
      );
      const [label2] = await ds.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, 'be', '#D6B588') RETURNING id`,
        [projectId],
      );

      const res = await createItem({ itemType: 'task', title: 'T1', labelIds: [label1.id] });
      const id = res.body.data.item.id;

      const upd = await updateItem(id, { labelIds: [label2.id] }).expect(200);

      expect(upd.body.data.item.labels).toHaveLength(1);
      expect(upd.body.data.item.labels[0].id).toBe(label2.id);
    });

    it('returns 404 for non-existent item', async () => {
      await updateItem(99999, { title: 'X' }).expect(404);
    });

    // =======================================================================
    // Cross-project reference validation (Task 2.5 — audit §4.2/§4.3)
    // =======================================================================

    describe('cross-project reference validation', () => {
      let proj2Id: number;

      beforeEach(async () => {
        const proj2Res = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Other', prefix: 'OTH' });
        proj2Id = proj2Res.body.data.item.id;
      });

      it('update with sprintId from another project → 4xx', async () => {
        const [sprint] = await ds.query(
          `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
           VALUES ($1, 'B Sprint', 'planning', 1, $2) RETURNING id`,
          [proj2Id, adminId],
        );
        const res = await createItem({ itemType: 'task', title: 'T1' });
        const id = res.body.data.item.id;

        const upd = await updateItem(id, { sprintId: sprint.id });
        expect(upd.status).toBeGreaterThanOrEqual(400);
        expect(upd.status).toBeLessThan(500);
      });

      it('update with labelId from another project → 4xx', async () => {
        const [label] = await ds.query(
          `INSERT INTO labels (project_id, name, color) VALUES ($1, 'b-label', '#88A9D6') RETURNING id`,
          [proj2Id],
        );
        const res = await createItem({ itemType: 'task', title: 'T1' });
        const id = res.body.data.item.id;

        const upd = await updateItem(id, { labelIds: [label.id] });
        expect(upd.status).toBeGreaterThanOrEqual(400);
        expect(upd.status).toBeLessThan(500);
      });

      it('update with assigneeId who is not a project member → 4xx', async () => {
        const outsider = await registerInvitedUser(app, adminToken, 'outsider@test.com', 'member');
        const res = await createItem({ itemType: 'task', title: 'T1' });
        const id = res.body.data.item.id;

        const upd = await updateItem(id, { assigneeId: outsider.id });
        expect(upd.status).toBeGreaterThanOrEqual(400);
        expect(upd.status).toBeLessThan(500);
      });

      it('update with same-project sprint/label → 200', async () => {
        const [sprint] = await ds.query(
          `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
           VALUES ($1, 'A Sprint', 'planning', 1, $2) RETURNING id`,
          [projectId, adminId],
        );
        const [label] = await ds.query(
          `INSERT INTO labels (project_id, name, color) VALUES ($1, 'a-label', '#88A9D6') RETURNING id`,
          [projectId],
        );
        const res = await createItem({ itemType: 'task', title: 'T1' });
        const id = res.body.data.item.id;

        const upd = await updateItem(id, {
          sprintId: sprint.id,
          labelIds: [label.id],
        }).expect(200);

        expect(upd.body.data.item.sprintId).toBe(sprint.id);
        expect(upd.body.data.item.labels).toHaveLength(1);
      });
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================

  describe('delete', () => {
    it('deletes task with subtasks → 400 TASK_HAS_SUBTASKS', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });

      const res = await deleteItem(taskId).expect(400);

      expect(res.body.code).toBe('F-L-0096');
    });

    it('deletes subtask → 200', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      await deleteItem(subId).expect(200);

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [subId]);
      expect(check).toBeUndefined();
    });

    it('deletes task with no children → 200', async () => {
      const res = await createItem({ itemType: 'task', title: 'T1' });
      const id = res.body.data.item.id;

      await deleteItem(id).expect(200);

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [id]);
      expect(check).toBeUndefined();
    });

    it('deletes epic → 200', async () => {
      const res = await createItem({ itemType: 'epic', title: 'E1' });
      const id = res.body.data.item.id;

      const del = await deleteItem(id).expect(200);
      expect(del.body.code).toBe('S-0104');

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [id]);
      expect(check).toBeUndefined();
    });

    it('deletes epic with direct subtask children → 400 (post-5.6: subtasks block parent deletion)', async () => {
      // Post-5.6: an epic can be a subtask's parent. Deleting an epic that
      // still has direct subtask children is rejected — symmetric with story
      // and task — so the invariant "every subtask has a valid parent" holds.
      const epicRes = await createItem({ itemType: 'epic', title: 'E1' });
      const epicId = epicRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: epicId });

      const res = await deleteItem(epicId).expect(400);
      expect(res.body.code).toBe('F-L-0095');
    });

    it('deletes epic with subtask children, after subtasks deleted → 200', async () => {
      // Delete order: subtasks first, then epic.
      const epicRes = await createItem({ itemType: 'epic', title: 'E1' });
      const epicId = epicRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: epicId });
      const subId = subRes.body.data.item.id;

      await deleteItem(subId).expect(200);
      await deleteItem(epicId).expect(200);

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [epicId]);
      expect(check).toBeUndefined();
    });

    it('deletes bug → 200', async () => {
      const res = await createItem({ itemType: 'bug', title: 'B1' });
      const id = res.body.data.item.id;

      await deleteItem(id).expect(200);

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [id]);
      expect(check).toBeUndefined();
    });

    it('deletes story with direct subtasks → 400 STORY_HAS_DIRECT_SUBTASKS', async () => {
      const storyRes = await createItem({ itemType: 'story', title: 'S1' });
      const storyId = storyRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: storyId });

      const res = await deleteItem(storyId).expect(400);

      expect(res.body.code).toBe('F-L-0095');
    });

    it('deletes story with no children → 200', async () => {
      const storyRes = await createItem({ itemType: 'story', title: 'S1' });
      const storyId = storyRes.body.data.item.id;

      await deleteItem(storyId).expect(200);

      const [check] = await ds.query(`SELECT id FROM work_items WHERE id = $1`, [storyId]);
      expect(check).toBeUndefined();
    });

    it('returns 404 for non-existent item', async () => {
      await deleteItem(99999).expect(404);
    });
  });
});
