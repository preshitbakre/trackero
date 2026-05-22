import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Board Endpoint (e2e)', () => {
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

  const getBoard = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/board${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const moveCard = (body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/board/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  describe('GET board', () => {
    it('returns columns with tasks, bugs, and subtasks only', async () => {
      // Create items of all types — board should only show tasks + bugs + subtasks
      await createItem({ itemType: 'epic', title: 'E1' });
      await createItem({ itemType: 'story', title: 'S1' });
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });
      await createItem({ itemType: 'bug', title: 'B1' });

      const res = await getBoard().expect(200);

      expect(res.body.code).toBe('S-0109');
      expect(res.body.data.columns).toBeDefined();
      expect(res.body.data.columns.length).toBeGreaterThan(0);

      // Collect all items from all columns
      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const types = allItems.map((t: any) => t.itemType);
      expect(types).not.toContain('epic');
      expect(types).not.toContain('story');
      expect(types).toContain('task');
      expect(types).toContain('subtask');
      expect(types).toContain('bug');
    });

    it('subtask cards include parentRef', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'Parent Task' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const subtask = allItems.find((t: any) => t.itemType === 'subtask');
      expect(subtask).toBeDefined();
      expect(subtask.parentRef).toBeDefined();
      expect(subtask.parentRef.title).toBe('Parent Task');
    });

    it('filters by sprintId', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'S1', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );

      await createItem({ itemType: 'task', title: 'In sprint', sprintId: sprint.id });
      await createItem({ itemType: 'task', title: 'Not in sprint' });

      const res = await getBoard(`sprintId=${sprint.id}`).expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      expect(allItems).toHaveLength(1);
      expect(allItems[0].title).toBe('In sprint');
    });

    it('includes subtaskCount and subtaskDoneCount', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'ST1', parentId: taskId, statusId: doneStatusId });
      await createItem({ itemType: 'subtask', title: 'ST2', parentId: taskId });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const task = allItems.find((t: any) => t.id === taskId);
      expect(task.subtaskCount).toBe(2);
      expect(task.subtaskDoneCount).toBe(1);
    });

    it('includes hasBlockers flag', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1 (outgoing association from T2 to T1 with type 'blocks')
      await createAssociation(t2Id, t1Id, 'blocks');

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const blocked = allItems.find((t: any) => t.id === t2Id);
      expect(blocked.hasBlockers).toBe(true);
      const blocker = allItems.find((t: any) => t.id === t1Id);
      expect(blocker.hasBlockers).toBe(false);
    });

    it('bug shows on board', async () => {
      await createItem({ itemType: 'bug', title: 'Login Crash' });

      const res = await getBoard().expect(200);

      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      const bug = allItems.find((t: any) => t.itemType === 'bug');
      expect(bug).toBeDefined();
      expect(bug.title).toBe('Login Crash');
    });

    it('enriches every card correctly across a multi-card multi-column board', async () => {
      // Epic the tasks belong to
      const epicRes = await createItem({ itemType: 'epic', title: 'Epic One', color: '#AABBCC' });
      const epicId = epicRes.body.data.item.id;

      // Task A — backlog column, 2 subtasks (1 done), belongs to epic, blocked, has comment+attachment
      const taskARes = await createItem({ itemType: 'task', title: 'Task A' });
      const taskAId = taskARes.body.data.item.id;
      const stA1Res = await createItem({
        itemType: 'subtask', title: 'A-ST1', parentId: taskAId, statusId: doneStatusId,
      });
      const stA1Id = stA1Res.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'A-ST2', parentId: taskAId });
      await createAssociation(taskAId, epicId, 'belongs_to');

      // Task B — moved to in_progress column, 1 subtask (0 done), belongs to epic, no blockers
      const taskBRes = await createItem({ itemType: 'task', title: 'Task B' });
      const taskBId = taskBRes.body.data.item.id;
      await createItem({ itemType: 'subtask', title: 'B-ST1', parentId: taskBId });
      await createAssociation(taskBId, epicId, 'belongs_to');
      await moveCard({ itemId: taskBId, statusId: inProgressStatusId, sortOrder: 'm' }).expect(200);

      // Task C — no subtasks, no epic, no blockers, no comments/attachments
      const taskCRes = await createItem({ itemType: 'task', title: 'Task C' });
      const taskCId = taskCRes.body.data.item.id;

      // Bug D — belongs to epic
      const bugDRes = await createItem({ itemType: 'bug', title: 'Bug D' });
      const bugDId = bugDRes.body.data.item.id;
      await createAssociation(bugDId, epicId, 'belongs_to');

      // Task A is blocked by Task C
      await createAssociation(taskAId, taskCId, 'blocks');

      // Comments + attachments on Task A
      await ds.query(
        `INSERT INTO comments (work_item_id, author_id, body) VALUES ($1, $2, 'c1'), ($1, $2, 'c2')`,
        [taskAId, adminId],
      );
      await ds.query(
        `INSERT INTO attachments (work_item_id, uploaded_by, original_filename, storage_key, mime_type, size_bytes)
         VALUES ($1, $2, 'f.png', 'k1', 'image/png', 10)`,
        [taskAId, adminId],
      );

      const res = await getBoard().expect(200);
      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);

      const a = allItems.find((t: any) => t.id === taskAId);
      expect(a.subtaskCount).toBe(2);
      expect(a.subtaskDoneCount).toBe(1);
      expect(a.commentCount).toBe(2);
      expect(a.attachmentCount).toBe(1);
      expect(a.hasBlockers).toBe(true);
      expect(a.epicColor).toBe('#AABBCC');
      expect(a.parentRef).toBeNull();

      const b = allItems.find((t: any) => t.id === taskBId);
      expect(b.subtaskCount).toBe(1);
      expect(b.subtaskDoneCount).toBe(0);
      expect(b.commentCount).toBe(0);
      expect(b.attachmentCount).toBe(0);
      expect(b.hasBlockers).toBe(false);
      expect(b.epicColor).toBe('#AABBCC');

      const c = allItems.find((t: any) => t.id === taskCId);
      expect(c.subtaskCount).toBe(0);
      expect(c.subtaskDoneCount).toBe(0);
      expect(c.commentCount).toBe(0);
      expect(c.attachmentCount).toBe(0);
      expect(c.hasBlockers).toBe(false);
      expect(c.epicColor).toBeNull();

      const d = allItems.find((t: any) => t.id === bugDId);
      expect(d.itemType).toBe('bug');
      expect(d.epicColor).toBe('#AABBCC');
      expect(d.hasBlockers).toBe(false);

      // Subtask cards: parentRef correct
      const stA1 = allItems.find((t: any) => t.id === stA1Id);
      expect(stA1.itemType).toBe('subtask');
      expect(stA1.parentRef).not.toBeNull();
      expect(stA1.parentRef.id).toBe(taskAId);
      expect(stA1.parentRef.title).toBe('Task A');
      expect(stA1.parentRef.itemKey).toBe(`TST-${taskARes.body.data.item.itemNumber}`);

      // Verify cards are spread across multiple columns
      const columnsWithCards = res.body.data.columns.filter((col: any) => col.tasks.length > 0);
      expect(columnsWithCards.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty columns for a board with no items', async () => {
      const res = await getBoard().expect(200);
      expect(res.body.data.columns.length).toBeGreaterThan(0);
      const allItems = res.body.data.columns.flatMap((c: any) => c.tasks);
      expect(allItems).toHaveLength(0);
      for (const col of res.body.data.columns) {
        expect(col.taskCount).toBe(0);
      }
    });
  });

  describe('PUT board/move', () => {
    it('moves a card to a new status', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await moveCard({
        itemId: taskId,
        statusId: inProgressStatusId,
        sortOrder: 'am',
      }).expect(200);

      expect(res.body.code).toBe('S-0110');
      expect(res.body.data.statusId).toBe(inProgressStatusId);
      expect(res.body.data.sortOrder).toBe('am');
    });

    it('move to done sets completedAt', async () => {
      const taskRes = await createItem({ itemType: 'task', title: 'T1' });
      const taskId = taskRes.body.data.item.id;

      const res = await moveCard({
        itemId: taskId,
        statusId: doneStatusId,
        sortOrder: 'n',
      }).expect(200);

      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('move to done blocked by association → 400', async () => {
      const t1Res = await createItem({ itemType: 'task', title: 'Blocker' });
      const t1Id = t1Res.body.data.item.id;
      const t2Res = await createItem({ itemType: 'task', title: 'Blocked' });
      const t2Id = t2Res.body.data.item.id;

      // T2 is blocked by T1
      await createAssociation(t2Id, t1Id, 'blocks');

      await moveCard({
        itemId: t2Id,
        statusId: doneStatusId,
        sortOrder: 'n',
      }).expect(400);
    });
  });

  describe('PUT items/reorder (DTO validation)', () => {
    const reorder = (body: any) =>
      request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

    it('reorders items with a well-formed body -> 200', async () => {
      const a = await createItem({ itemType: 'task', title: 'A' });
      const b = await createItem({ itemType: 'task', title: 'B' });
      const aId = a.body.data.item.id;
      const bId = b.body.data.item.id;

      await reorder({
        reorders: [
          { itemId: aId, sortOrder: 'z' },
          { itemId: bId, sortOrder: 'a' },
        ],
      }).expect(200);

      const aRow = await ds.query(`SELECT sort_order FROM work_items WHERE id = $1`, [aId]);
      const bRow = await ds.query(`SELECT sort_order FROM work_items WHERE id = $1`, [bId]);
      expect(aRow[0].sort_order).toBe('z');
      expect(bRow[0].sort_order).toBe('a');
    });

    it('rejects a body missing reorders entirely -> 400', async () => {
      const res = await reorder({}).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects reorders that is not an array -> 400', async () => {
      const res = await reorder({ reorders: 'notanarray' }).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an empty reorders array -> 400', async () => {
      const res = await reorder({ reorders: [] }).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an entry missing itemId -> 400', async () => {
      const res = await reorder({ reorders: [{ sortOrder: 'a' }] }).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an entry with a non-string sortOrder -> 400', async () => {
      // The app-wide ValidationPipe runs with enableImplicitConversion, which
      // coerces any scalar (number/boolean/object) to a string before @IsString
      // sees it. An array is the genuine non-string that @IsString rejects.
      const res = await reorder({
        reorders: [{ itemId: 1, sortOrder: ['a', 'b'] }],
      }).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an entry with sortOrder longer than 255 chars -> 400', async () => {
      const res = await reorder({
        reorders: [{ itemId: 1, sortOrder: 'x'.repeat(256) }],
      }).expect(400);
      expect(res.body.success).toBe(false);
    });
  });
});
