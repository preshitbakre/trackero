import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('WorkItems CREATE (e2e)', () => {
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

    // Add member to project
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    // Get statuses
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    inProgressStatusId = statuses.find((s: any) => s.category === 'in_progress').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any, token?: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${token || adminToken}`)
      .send(body);

  // =========================================================================
  // Happy path: create each type
  // =========================================================================

  it('creates an epic (no parent) → 201', async () => {
    const res = await createItem({
      itemType: 'epic',
      title: 'User Auth',
      priority: 'high',
      color: '#7C5CFC',
    }).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0101');
    const item = res.body.data.item;
    expect(item.itemType).toBe('epic');
    expect(item.title).toBe('User Auth');
    expect(item.priority).toBe('high');
    expect(item.color).toBe('#7C5CFC');
    expect(item.parentId).toBeNull();
    expect(item.itemNumber).toBe(1);
    expect(item.statusId).toBe(defaultStatusId);
  });

  it('creates a standalone story → 201', async () => {
    const res = await createItem({
      itemType: 'story',
      title: 'Standalone Story',
    }).expect(201);

    expect(res.body.data.item.itemType).toBe('story');
    expect(res.body.data.item.parentId).toBeNull();
  });

  it('creates a standalone task → 201', async () => {
    const res = await createItem({
      itemType: 'task',
      title: 'Fix footer typo',
    }).expect(201);

    expect(res.body.data.item.parentId).toBeNull();
    expect(res.body.data.item.itemType).toBe('task');
  });

  it('creates a subtask under task → 201', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'Task1' });
    const taskId = taskRes.body.data.item.id;

    const res = await createItem({
      itemType: 'subtask',
      title: 'Add email regex',
      parentId: taskId,
    }).expect(201);

    const item = res.body.data.item;
    expect(item.itemType).toBe('subtask');
    expect(item.parentId).toBe(taskId);
  });

  it('creates a subtask under story → 201', async () => {
    const storyRes = await createItem({ itemType: 'story', title: 'Story1' });
    const storyId = storyRes.body.data.item.id;

    const res = await createItem({
      itemType: 'subtask',
      title: 'Sub under story',
      parentId: storyId,
    }).expect(201);

    expect(res.body.data.item.parentId).toBe(storyId);
    expect(res.body.data.item.itemType).toBe('subtask');
  });

  it('creates a subtask under epic → 201', async () => {
    // Post-5.6 canonical model: an epic is a valid subtask parent
    // (parents may be task / story / epic). All non-subtask cross-type
    // linkage lives in work_item_associations.
    const epicRes = await createItem({ itemType: 'epic', title: 'Epic1' });
    const epicId = epicRes.body.data.item.id;

    const res = await createItem({
      itemType: 'subtask',
      title: 'Sub under epic',
      parentId: epicId,
    }).expect(201);

    expect(res.body.data.item.parentId).toBe(epicId);
    expect(res.body.data.item.itemType).toBe('subtask');
  });

  it('creates a bug (standalone) → 201', async () => {
    const res = await createItem({
      itemType: 'bug',
      title: 'Login crash on empty password',
      priority: 'high',
    }).expect(201);

    const item = res.body.data.item;
    expect(item.itemType).toBe('bug');
    expect(item.title).toBe('Login crash on empty password');
    expect(item.parentId).toBeNull();
    expect(item.priority).toBe('high');
  });

  // =========================================================================
  // Rejection cases
  // =========================================================================

  it('create subtask without parent → 400 SUBTASK_REQUIRES_PARENT', async () => {
    const res = await createItem({
      itemType: 'subtask',
      title: 'Orphan subtask',
    }).expect(400);

    expect(res.body.code).toBe('F-L-0090');
  });

  it('create story with parent → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const epicRes = await createItem({ itemType: 'epic', title: 'Epic1' });
    const epicId = epicRes.body.data.item.id;

    const res = await createItem({
      itemType: 'story',
      title: 'Story under epic',
      parentId: epicId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  it('create task with parent → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const storyRes = await createItem({ itemType: 'story', title: 'Story1' });
    const storyId = storyRes.body.data.item.id;

    const res = await createItem({
      itemType: 'task',
      title: 'Task under story',
      parentId: storyId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  it('create task under subtask → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'Task1' });
    const taskId = taskRes.body.data.item.id;
    const subRes = await createItem({ itemType: 'subtask', title: 'Sub1', parentId: taskId });
    const subId = subRes.body.data.item.id;

    const res = await createItem({
      itemType: 'task',
      title: 'Task under subtask',
      parentId: subId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  it('create epic with parent → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const epicRes = await createItem({ itemType: 'epic', title: 'Epic1' });
    const epicId = epicRes.body.data.item.id;

    const res = await createItem({
      itemType: 'epic',
      title: 'Nested epic',
      parentId: epicId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  it('create bug with parent → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'Task1' });
    const taskId = taskRes.body.data.item.id;

    const res = await createItem({
      itemType: 'bug',
      title: 'Bug with parent',
      parentId: taskId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0091');
  });

  // =========================================================================
  // Subtask sprint behavior
  // =========================================================================

  it('create subtask: sprintId is null regardless of input', async () => {
    // Create sprint
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    const taskRes = await createItem({
      itemType: 'task',
      title: 'Task1',
      sprintId: sprint.id,
    });
    const taskId = taskRes.body.data.item.id;

    // Try to create subtask WITH a sprintId — should be silently set to null
    const res = await createItem({
      itemType: 'subtask',
      title: 'Subtask1',
      parentId: taskId,
      sprintId: sprint.id,
    }).expect(201);

    expect(res.body.data.item.sprintId).toBeNull();
  });

  // =========================================================================
  // Item number auto-increment
  // =========================================================================

  it('itemNumber increments correctly across types', async () => {
    const e = await createItem({ itemType: 'epic', title: 'Epic' });
    expect(e.body.data.item.itemNumber).toBe(1);

    const s = await createItem({ itemType: 'story', title: 'Story' });
    expect(s.body.data.item.itemNumber).toBe(2);

    const t = await createItem({ itemType: 'task', title: 'Task' });
    expect(t.body.data.item.itemNumber).toBe(3);

    const st = await createItem({
      itemType: 'subtask',
      title: 'Subtask',
      parentId: t.body.data.item.id,
    });
    expect(st.body.data.item.itemNumber).toBe(4);

    const b = await createItem({ itemType: 'bug', title: 'Bug' });
    expect(b.body.data.item.itemNumber).toBe(5);
  });

  // =========================================================================
  // addedMidSprint for tasks added to active sprint
  // =========================================================================

  it('task added to active sprint gets addedMidSprint = true', async () => {
    // Create active sprint
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by, start_date, end_date)
       VALUES ($1, 'Sprint 1', 'active', 1, $2, CURRENT_DATE, CURRENT_DATE + 14) RETURNING id`,
      [projectId, adminId],
    );

    const res = await createItem({
      itemType: 'task',
      title: 'Mid-sprint task',
      sprintId: sprint.id,
    }).expect(201);

    expect(res.body.data.item.addedMidSprint).toBe(true);
  });

  it('task added to planning sprint gets addedMidSprint = false', async () => {
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );

    const res = await createItem({
      itemType: 'task',
      title: 'Pre-sprint task',
      sprintId: sprint.id,
    }).expect(201);

    expect(res.body.data.item.addedMidSprint).toBe(false);
  });

  // =========================================================================
  // Default status
  // =========================================================================

  it('item gets default project status when statusId not provided', async () => {
    const res = await createItem({ itemType: 'task', title: 'Task' }).expect(201);
    expect(res.body.data.item.statusId).toBe(defaultStatusId);
  });

  it('item uses provided statusId', async () => {
    const res = await createItem({
      itemType: 'task',
      title: 'Task in progress',
      statusId: inProgressStatusId,
    }).expect(201);
    expect(res.body.data.item.statusId).toBe(inProgressStatusId);
  });

  // =========================================================================
  // Cross-project parent validation
  // =========================================================================

  it('create item with parent in different project → 400', async () => {
    // Create second project
    const proj2Res = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other', prefix: 'OTH' });
    const proj2Id = proj2Res.body.data.item.id;

    // Create task in project 2
    const taskRes = await request(app.getHttpServer())
      .post(`/api/projects/${proj2Id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Other Task' });
    const otherTaskId = taskRes.body.data.item.id;

    // Try to create subtask in project 1 with parent from project 2
    const res = await createItem({
      itemType: 'subtask',
      title: 'Cross project subtask',
      parentId: otherTaskId,
    }).expect(400);

    expect(res.body.code).toBe('F-L-0099');
  });

  // =========================================================================
  // Labels
  // =========================================================================

  it('creates item with labels', async () => {
    // Create labels
    const [label1] = await ds.query(
      `INSERT INTO labels (project_id, name, color) VALUES ($1, 'frontend', '#88A9D6') RETURNING id`,
      [projectId],
    );
    const [label2] = await ds.query(
      `INSERT INTO labels (project_id, name, color) VALUES ($1, 'urgent', '#E05252') RETURNING id`,
      [projectId],
    );

    const res = await createItem({
      itemType: 'task',
      title: 'Labeled task',
      labelIds: [label1.id, label2.id],
    }).expect(201);

    expect(res.body.data.item.labels).toHaveLength(2);
  });

  // =========================================================================
  // Cross-project reference validation (Task 2.5 — audit §4.2/§4.3)
  // =========================================================================

  describe('cross-project reference validation', () => {
    let proj2Id: number;
    let proj2StatusId: number;

    beforeEach(async () => {
      // Second project owned by the SAME admin — caller HAS access to both,
      // the point is the work item lives in project A but the referenced
      // id is from project B.
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other', prefix: 'OTH' });
      proj2Id = proj2Res.body.data.item.id;

      const proj2Statuses = await ds.query(
        `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
        [proj2Id],
      );
      proj2StatusId = proj2Statuses.find((s: any) => s.category === 'in_progress').id;
    });

    it('create with statusId from another project → 4xx', async () => {
      const res = await createItem({
        itemType: 'task',
        title: 'Foreign status',
        statusId: proj2StatusId,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('create with sprintId from another project → 4xx', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'B Sprint', 'planning', 1, $2) RETURNING id`,
        [proj2Id, adminId],
      );

      const res = await createItem({
        itemType: 'task',
        title: 'Foreign sprint',
        sprintId: sprint.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('create with labelId from another project → 4xx', async () => {
      const [label] = await ds.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, 'b-label', '#88A9D6') RETURNING id`,
        [proj2Id],
      );

      const res = await createItem({
        itemType: 'task',
        title: 'Foreign label',
        labelIds: [label.id],
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('create with assigneeId who is not a project member → 4xx', async () => {
      // memberId is a member of project A but NOT project B.
      // Register an outsider who is in NO project.
      const outsider = await registerInvitedUser(app, adminToken, 'outsider@test.com', 'member');

      const res = await createItem({
        itemType: 'task',
        title: 'Foreign assignee',
        assigneeId: outsider.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('create with same-project status/sprint/label/assignee → 201', async () => {
      const [sprint] = await ds.query(
        `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
         VALUES ($1, 'A Sprint', 'planning', 1, $2) RETURNING id`,
        [projectId, adminId],
      );
      const [label] = await ds.query(
        `INSERT INTO labels (project_id, name, color) VALUES ($1, 'a-label', '#88A9D6') RETURNING id`,
        [projectId],
      );

      const res = await createItem({
        itemType: 'task',
        title: 'Valid refs',
        statusId: inProgressStatusId,
        sprintId: sprint.id,
        labelIds: [label.id],
        assigneeId: memberId,
      }).expect(201);

      expect(res.body.data.item.statusId).toBe(inProgressStatusId);
      expect(res.body.data.item.sprintId).toBe(sprint.id);
      expect(res.body.data.item.labels).toHaveLength(1);
      expect(res.body.data.item.assigneeId).toBe(memberId);
    });
  });

  // =========================================================================
  // Reporter is set to creating user
  // =========================================================================

  it('reporter is set to the creating user', async () => {
    const res = await createItem(
      { itemType: 'task', title: 'Member task' },
      memberToken,
    ).expect(201);

    expect(res.body.data.item.reporterId).toBe(memberId);
  });

  // =========================================================================
  // Concurrent creation — item numbers must be unique (D-C3)
  // =========================================================================

  it('assigns unique consecutive itemNumbers under concurrent creation', async () => {
    const N = 10;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        createItem({ itemType: 'task', title: `Concurrent ${i}` }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses
      .map((r) => r.body.data.item.itemNumber)
      .sort((a: number, b: number) => a - b);
    expect(new Set(numbers).size).toBe(N);
    expect(numbers[N - 1] - numbers[0]).toBe(N - 1);
  });

  // =========================================================================
  // Transactional create — a post-counter failure must not leak the counter (D-C4)
  // =========================================================================

  it('failed create with invalid linkedItemId does not leak item_counter', async () => {
    // First valid item — itemNumber 1
    const first = await createItem({ itemType: 'task', title: 'First' }).expect(201);
    expect(first.body.data.item.itemNumber).toBe(1);

    // Attempt a create that fails AFTER the counter increment: createAssociation
    // runs after the UPDATE projects SET item_counter, and a non-existent
    // linkedItemId makes it throw NOT_FOUND. Without a transaction this leaks
    // the consumed item number.
    const failed = await createItem({
      itemType: 'task',
      title: 'Doomed',
      linkedItemId: 999999,
      linkType: 'relates_to',
    });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(failed.status).toBeLessThan(500);

    // Next valid item must be contiguous with the first — the failed create
    // must NOT have burned itemNumber 2.
    const second = await createItem({ itemType: 'task', title: 'Second' }).expect(201);
    expect(second.body.data.item.itemNumber).toBe(2);
  });
});
