import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

async function registerStrongAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: 'admin@test.com', password: 'Password1!', displayName: 'Admin' });
  return { token: res.body.data.accessToken, id: res.body.data.user.id };
}

const pastDate = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];

describe('Epics (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: number;
  let projectId: number;
  let backlogStatusId: number;
  let doneStatusId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const createItem = async (body: any) => {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set(auth())
      .send(body);
    return res.body.data.item;
  };

  const linkBelongsTo = (childId: number, epicId: number) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${childId}/associations`)
      .set(auth())
      .send({ linkedItemId: epicId, linkType: 'belongs_to' });

  const setStatus = (itemId: number, statusId: number) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${itemId}`)
      .set(auth())
      .send({ statusId })
      .expect(200);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerStrongAdmin(app);
    token = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set(auth())
      .send({ name: 'Epics Project', prefix: 'EPP' });
    projectId = projRes.body.data.item.id;

    const ds = app.get(DataSource);
    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    backlogStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  it('lists epics with enriched fields and defaults epic_state to draft', async () => {
    await createItem({ itemType: 'epic', title: 'My Epic', assigneeId: adminId });
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics`)
      .set(auth())
      .expect(200);
    const epic = res.body.data.list[0];
    expect(epic.epicState).toBe('draft');
    expect(epic.displayState).toBe('draft');
    expect(epic.lead.id).toBe(adminId);
    expect(epic.archived).toBe(false);
  });

  it('derives displayState=blocked and exposes blockedBy when an open blocker links to the epic', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Blocked Epic' });
    const blocker = await createItem({ itemType: 'task', title: 'External dep' });
    // blocker BLOCKS epic
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${blocker.id}/associations`)
      .set(auth())
      .send({ linkedItemId: epic.id, linkType: 'blocks' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics`)
      .set(auth())
      .expect(200);
    const got = res.body.data.list.find((e: any) => e.id === epic.id);
    expect(got.displayState).toBe('blocked');
    expect(got.blockedBy).not.toBeNull();
    expect(got.blockedBy.title).toBe('External dep');
  });

  it('derives displayState=at_risk for an in-flight, past-target epic with incomplete work', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Risky Epic' });
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/epics/${epic.id}`)
      .set(auth())
      .send({ epicState: 'in_flight', endDate: pastDate(2) })
      .expect(200);
    const story = await createItem({ itemType: 'story', title: 'Open story' });
    await linkBelongsTo(story.id, epic.id);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics`)
      .set(auth());
    const got = res.body.data.list.find((e: any) => e.id === epic.id);
    expect(got.displayState).toBe('at_risk');
  });

  it('returns a summary stat strip', async () => {
    const e1 = await createItem({ itemType: 'epic', title: 'In flight' });
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/epics/${e1.id}`)
      .set(auth())
      .send({ epicState: 'in_flight' });
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/summary`)
      .set(auth())
      .expect(200);
    expect(res.body.data.totalEpics).toBe(1);
    expect(res.body.data.inFlight).toBe(1);
    expect(res.body.data.childrenDone).toEqual({ completed: 0, total: 0 });
  });

  it('returns a detail aggregate with stats, contributors, byType and acrossSprints', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Detail Epic', assigneeId: adminId });
    const story = await createItem({ itemType: 'story', title: 'A story', assigneeId: adminId, storyPoints: 5 });
    await linkBelongsTo(story.id, epic.id);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/${epic.id}`)
      .set(auth())
      .expect(200);
    const d = res.body.data;
    expect(d.lead.handle).toBe('admin');
    expect(d.stats.totalPoints).toBe(5);
    expect(d.contributors.count).toBe(1);
    expect(d.byType).toEqual([{ type: 'story', count: 1 }]);
    expect(d.acrossSprints).toBeDefined();
  });

  it('groups children by status', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Children Epic' });
    const s1 = await createItem({ itemType: 'story', title: 'Done story', storyPoints: 3 });
    const s2 = await createItem({ itemType: 'story', title: 'Open story', storyPoints: 2 });
    await linkBelongsTo(s1.id, epic.id);
    await linkBelongsTo(s2.id, epic.id);
    await setStatus(s1.id, doneStatusId);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/${epic.id}/children?groupBy=status`)
      .set(auth())
      .expect(200);
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.totalPoints).toBe(5);
    const doneGroup = res.body.data.groups.find((g: any) => g.key === 'done');
    expect(doneGroup.count).toBe(1);
  });

  it('ship guard: 409 with open children, success when all done, then reopen', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Ship Epic' });
    const story = await createItem({ itemType: 'story', title: 'Child' });
    await linkBelongsTo(story.id, epic.id);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/epics/${epic.id}/ship`)
      .set(auth())
      .expect(409);

    await setStatus(story.id, doneStatusId);
    const shipped = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/epics/${epic.id}/ship`)
      .set(auth())
      .expect(201);
    expect(shipped.body.data.epicState).toBe('shipped');

    const reopened = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/epics/${epic.id}/reopen`)
      .set(auth())
      .expect(201);
    expect(reopened.body.data.epicState).toBe('in_flight');
  });

  it('archive hides from default list, included with includeArchived', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Archive Epic' });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/epics/${epic.id}/archive`)
      .set(auth())
      .expect(201);

    const def = await request(app.getHttpServer()).get(`/api/projects/${projectId}/epics`).set(auth());
    expect(def.body.data.list.find((e: any) => e.id === epic.id)).toBeUndefined();

    const incl = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics?includeArchived=true`)
      .set(auth());
    const got = incl.body.data.list.find((e: any) => e.id === epic.id);
    expect(got.displayState).toBe('archived');
  });

  it('detach-children removes belongs_to links and nulls sprint', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Detach Epic' });
    const sprintRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/sprints`)
      .set(auth())
      .send({
        name: 'S1',
        goal: 'Sprint goal',
        startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        endDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      });
    const sprintId = sprintRes.body.data.item.id;
    const story = await createItem({ itemType: 'story', title: 'Child', sprintId });
    await linkBelongsTo(story.id, epic.id);

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/epics/${epic.id}/detach-children`)
      .set(auth())
      .expect(201);
    expect(res.body.data.detached).toBe(1);

    const ds = app.get(DataSource);
    const [row] = await ds.query(`SELECT sprint_id FROM work_items WHERE id = $1`, [story.id]);
    expect(row.sprint_id).toBeNull();
    const assoc = await ds.query(
      `SELECT * FROM work_item_associations WHERE linked_item_id = $1 AND link_type = 'belongs_to'`,
      [epic.id],
    );
    expect(assoc.length).toBe(0);
  });

  it('includes subtasks (parentId-linked) in the descendant rollups', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Subtask Epic' });
    const story = await createItem({ itemType: 'story', title: 'Parent story', storyPoints: 3 });
    await linkBelongsTo(story.id, epic.id);
    // A subtask hangs off the story via parentId (not belongs_to).
    await createItem({ itemType: 'subtask', title: 'A subtask', parentId: story.id });

    const detail = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/${epic.id}`)
      .set(auth())
      .expect(200);
    const subtaskType = detail.body.data.byType.find((t: any) => t.type === 'subtask');
    expect(subtaskType?.count).toBe(1);

    const children = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/${epic.id}/children?groupBy=status`)
      .set(auth())
      .expect(200);
    expect(children.body.data.totalItems).toBe(2); // story + subtask
  });

  it('recent feed includes child-item activity across the subtree', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'Recent Epic' });
    const story = await createItem({ itemType: 'story', title: 'Child story' });
    await linkBelongsTo(story.id, epic.id);
    // Move the child to done — produces a child status activity row.
    await setStatus(story.id, doneStatusId);

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/epics/${epic.id}/recent`)
      .set(auth())
      .expect(200);
    const rows = res.body.data;
    // At least one row references a child item (not the epic itself).
    expect(rows.some((r: any) => r.isEpic === false && r.itemKey)).toBe(true);
  });

  it('rejects setting epicState=shipped via the update endpoint', async () => {
    const epic = await createItem({ itemType: 'epic', title: 'No direct ship' });
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/epics/${epic.id}`)
      .set(auth())
      .send({ epicState: 'shipped' })
      .expect(400);
  });
});
