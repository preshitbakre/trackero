import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('WorkItems READ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
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

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Add member
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    // Statuses
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

  const listItems = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const getItem = (id: number) =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  // =========================================================================
  // findAll — list with filters
  // =========================================================================

  describe('findAll', () => {
    it('lists all items in project', async () => {
      await createItem({ itemType: 'epic', title: 'E1' });
      await createItem({ itemType: 'story', title: 'S1' });
      await createItem({ itemType: 'task', title: 'T1' });

      const res = await listItems().expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0100');
      expect(res.body.data.list).toHaveLength(3);
      expect(res.body.data.total).toBe(3);
    });

    it('filters by itemType=epic returns only epics', async () => {
      await createItem({ itemType: 'epic', title: 'E1' });
      await createItem({ itemType: 'story', title: 'S1' });
      await createItem({ itemType: 'task', title: 'T1' });

      const res = await listItems('itemType=epic').expect(200);

      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].itemType).toBe('epic');
    });

    it('filters by multiple itemTypes (comma-separated)', async () => {
      await createItem({ itemType: 'epic', title: 'E1' });
      await createItem({ itemType: 'story', title: 'S1' });
      await createItem({ itemType: 'task', title: 'T1' });

      const res = await listItems('itemType=epic,story').expect(200);

      expect(res.body.data.list).toHaveLength(2);
    });

    it('filters by parentId=X returns children of X (subtasks)', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });
      await createItem({ itemType: 'task', title: 'T2' }); // standalone

      const res = await listItems(`parentId=${taskId}`).expect(200);

      expect(res.body.data.list).toHaveLength(2);
      res.body.data.list.forEach((item: any) => {
        expect(item.parentId).toBe(taskId);
      });
    });

    it('filters by parentId=null returns root items', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'story', title: 'S1' }); // standalone

      const res = await listItems('parentId=null').expect(200);

      // Only task and story (not the subtask under task)
      expect(res.body.data.list).toHaveLength(2);
      res.body.data.list.forEach((item: any) => {
        expect(item.parentId).toBeNull();
      });
    });

    it('filters by sprintId', async () => {
      // Create sprint
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      await createItem({ itemType: 'task', title: 'T1', sprintId: sprint.id });
      await createItem({ itemType: 'task', title: 'T2' }); // no sprint

      const res = await listItems(`sprintId=${sprint.id}`).expect(200);

      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].title).toBe('T1');
    });

    it('filters by priority', async () => {
      await createItem({ itemType: 'task', title: 'T1', priority: 'high' });
      await createItem({ itemType: 'task', title: 'T2', priority: 'low' });
      await createItem({ itemType: 'task', title: 'T3', priority: 'high' });

      const res = await listItems('priority=high').expect(200);

      expect(res.body.data.list).toHaveLength(2);
    });

    it('filters by assigneeId', async () => {
      await createItem({ itemType: 'task', title: 'T1', assigneeId: memberId });
      await createItem({ itemType: 'task', title: 'T2' });

      const res = await listItems(`assigneeId=${memberId}`).expect(200);

      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].assigneeId).toBe(memberId);
    });

    it('filters by status', async () => {
      await createItem({ itemType: 'task', title: 'T1' }); // default = backlog
      await createItem({ itemType: 'task', title: 'T2', statusId: inProgressStatusId });

      const res = await listItems(`status=${inProgressStatusId}`).expect(200);

      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].statusId).toBe(inProgressStatusId);
    });

    it('full-text search works', async () => {
      await createItem({ itemType: 'task', title: 'Fix login validation' });
      await createItem({ itemType: 'task', title: 'Add signup page' });
      await createItem({ itemType: 'task', title: 'Login redirect bug' });

      const res = await listItems('search=login').expect(200);

      expect(res.body.data.list.length).toBeGreaterThanOrEqual(2);
      res.body.data.list.forEach((item: any) => {
        expect(item.title.toLowerCase()).toContain('login');
      });
    });

    it('pagination works', async () => {
      for (let i = 1; i <= 5; i++) {
        await createItem({ itemType: 'task', title: `Task ${i}` });
      }

      const res = await listItems('page=1&limit=2').expect(200);

      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.total).toBe(5);
      expect(res.body.data.hasNext).toBe(true);

      const res2 = await listItems('page=3&limit=2').expect(200);
      expect(res2.body.data.list).toHaveLength(1);
      expect(res2.body.data.hasNext).toBe(false);
    });

    it('filters by labelId', async () => {
      const [label] = await ds.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, 'frontend', '#88A9D6') RETURNING id`,
        [projectId],
      );

      await createItem({ itemType: 'task', title: 'T1', labelIds: [label.id] });
      await createItem({ itemType: 'task', title: 'T2' });

      const res = await listItems(`labelId=${label.id}`).expect(200);

      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].title).toBe('T1');
    });

    it('list items include childCount for tasks with subtasks', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });

      const res = await listItems('itemType=task').expect(200);

      expect(res.body.data.list[0].childCount).toBe(2);
    });
  });

  // =========================================================================
  // findOne — detail with children, breadcrumb, associations
  // =========================================================================

  describe('findOne', () => {
    it('returns item detail with children (subtasks)', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });

      const res = await getItem(taskId).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0102');
      expect(res.body.data.title).toBe('T1');
      expect(res.body.data.children).toHaveLength(2);
      expect(res.body.data.children[0].itemType).toBe('subtask');
    });

    it('returns breadcrumb for subtask (task → subtask)', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      const subRes = await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      const subId = subRes.body.data.item.id;

      const res = await getItem(subId).expect(200);

      expect(res.body.data.breadcrumb).toHaveLength(2);
      expect(res.body.data.breadcrumb[0].itemType).toBe('task');
      expect(res.body.data.breadcrumb[0].title).toBe('T1');
      expect(res.body.data.breadcrumb[1].itemType).toBe('subtask');
      expect(res.body.data.breadcrumb[1].id).toBe(subId);
    });

    it('progress is null for leaf items', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await getItem(taskId).expect(200);

      expect(res.body.data.progress).toBeNull();
    });

    it('returns commentCount and attachmentCount', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      // Add comments directly
      await ds.query(
        `INSERT INTO comments (work_item_id, author_id, body) VALUES ($1, $2, 'Hello'), ($1, $2, 'World')`,
        [taskId, adminId],
      );

      const res = await getItem(taskId).expect(200);

      expect(res.body.data.commentCount).toBe(2);
      expect(res.body.data.attachmentCount).toBe(0);
    });

    it('returns 404 for non-existent item', async () => {
      await getItem(99999).expect(404);
    });

    it('returns associations with blockedBy and blocks arrays', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'T1' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'T2' });
      const t2Id = t2Res.body.data.item.id;

      // T2 blocks T1: T2 has outgoing 'blocks' to T1
      // In the association model: item_id=T2, linked_item_id=T1, link_type=blocks
      // means T2 is "blocked by" T1? No — let me re-read the code.
      // The blocker check: item_id = target item, link_type = 'blocks' → blocked by linked_item
      // createAssociation: item_id → linked_item_id with linkType
      // blockedBy: outgoing where linkType = 'blocks' → item is blocked by linkedItem
      // blocks: incoming where linkType = 'blocks' → someone else is blocked by this item
      // So to make T2 blocked by T1: create assoc on T2 with linked=T1, type=blocks
      await createAssociation(t2Id, t1Id, 'blocks');

      // Check T2 detail: blockedBy should contain T1
      const res2 = await getItem(t2Id).expect(200);
      expect(res2.body.data.associations.blockedBy).toHaveLength(1);
      expect(res2.body.data.associations.blockedBy[0].item.id).toBe(t1Id);

      // Check T1 detail: blocks should contain T2
      const res1 = await getItem(t1Id).expect(200);
      expect(res1.body.data.associations.blocks).toHaveLength(1);
      expect(res1.body.data.associations.blocks[0].item.id).toBe(t2Id);
    });
  });

  // =========================================================================
  // findChildren
  // =========================================================================

  describe('findChildren', () => {
    it('returns direct children (subtasks) only', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items/${taskId}/children`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list).toHaveLength(2);
      const titles = res.body.data.list.map((i: any) => i.title);
      expect(titles).toContain('ST1');
      expect(titles).toContain('ST2');
    });
  });
});
