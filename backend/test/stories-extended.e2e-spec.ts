import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase } from './setup';

describe('Stories Extended — criteria, stats, workflow, release notes (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let adminId: number;
  const adminEmail = 'admin@test.com';
  let projectId: number;
  let backlogStatusId: number;
  let inProgressStatusId: number;
  let inReviewStatusId: number;
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
    // setup.ts registerAdmin uses a weak password that fails IsStrongPassword;
    // register inline with a strong one (mirrors sprints.e2e-spec).
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password: 'Password1!', displayName: 'Admin' });
    token = reg.body.data.accessToken;
    adminId = reg.body.data.user.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    const statuses = await ds.query(
      `SELECT id, category FROM project_statuses WHERE project_id = $1 ORDER BY sort_order`,
      [projectId],
    );
    backlogStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    inProgressStatusId = statuses.find((s: any) => s.category === 'in_progress').id;
    inReviewStatusId = statuses.find((s: any) => s.category === 'in_review')?.id ?? inProgressStatusId;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const createStory = async (body: any = {}) => {
    const res = await createItem({ itemType: 'story', title: 'A story', ...body });
    return res.body.data.item.id as number;
  };

  const criteriaUrl = (storyId: number) =>
    `/api/projects/${projectId}/items/${storyId}/acceptance-criteria`;

  // ---- Task 1.1 / 1.2: acceptance criteria ----

  it('creates and lists structured and plain acceptance criteria', async () => {
    const storyId = await createStory();

    const structured = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'a sprint with attendees', whenText: 'I click Export', thenText: 'I get a PDF' });
    expect(structured.status).toBe(201);
    expect(structured.body.code).toBe('S-0062');
    expect(structured.body.data.structured).toBe(true);

    const plain = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'PDF zones break onto separate pages' });
    expect(plain.status).toBe(201);
    expect(plain.body.data.structured).toBe(false);
    expect(plain.body.data.whenText).toBeNull();
    expect(plain.body.data.thenText).toBeNull();

    const list = await request(app.getHttpServer())
      .get(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.list).toHaveLength(2);
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.met).toBe(0);
  });

  it('rejects a structured criterion missing one of when/then', async () => {
    const storyId = await createStory();
    const res = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g', whenText: 'w' }); // missing thenText
    expect(res.status).toBe(400);
  });

  it('toggling isMet records verifier and clears on un-toggle', async () => {
    const storyId = await createStory();
    const created = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g', whenText: 'w', thenText: 't' });
    const cid = created.body.data.id;

    const on = await request(app.getHttpServer())
      .patch(`${criteriaUrl(storyId)}/${cid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isMet: true });
    expect(on.body.data.isMet).toBe(true);
    expect(on.body.data.verifier).not.toBeNull();
    expect(on.body.data.verifier.handle).toBe('admin');

    const off = await request(app.getHttpServer())
      .patch(`${criteriaUrl(storyId)}/${cid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isMet: false });
    expect(off.body.data.isMet).toBe(false);
    expect(off.body.data.verifier).toBeNull();
    expect(off.body.data.verifiedAt).toBeNull();
  });

  it('links a criterion to an item and exposes its status', async () => {
    const storyId = await createStory();
    const taskRes = await createItem({ itemType: 'task', title: 'Render PDF', statusId: inReviewStatusId });
    const taskId = taskRes.body.data.item.id;

    const created = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g', linkedItemId: taskId });
    expect(created.body.data.linkedItem).not.toBeNull();
    expect(created.body.data.linkedItem.id).toBe(taskId);
    expect(created.body.data.linkedItem.itemKey).toMatch(/^TST-/);
  });

  it('rejects linkedItemId from another project', async () => {
    const storyId = await createStory();
    // second project + item
    const proj2 = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Other', prefix: 'OTH' });
    const p2 = proj2.body.data.item.id;
    const foreign = await request(app.getHttpServer())
      .post(`/api/projects/${p2}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'task', title: 'foreign' });
    const foreignId = foreign.body.data.item.id;

    const res = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g', linkedItemId: foreignId });
    expect(res.status).toBe(400);
  });

  it('deletes a criterion', async () => {
    const storyId = await createStory();
    const created = await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g' });
    const cid = created.body.data.id;
    const del = await request(app.getHttpServer())
      .delete(`${criteriaUrl(storyId)}/${cid}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const list = await request(app.getHttpServer())
      .get(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.list).toHaveLength(0);
  });

  // ---- Task 2.1: stats ----

  it('returns story stats grouped by category', async () => {
    await createStory({ statusId: backlogStatusId, storyPoints: 3 });
    await createStory({ statusId: inProgressStatusId, storyPoints: 5 });
    await createStory({ statusId: doneStatusId, storyPoints: 8 });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/stories/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe('S-0060');
    expect(res.body.data).toMatchObject({
      total: 3,
      open: 1,
      inFlight: 1,
      done: 1,
      totalPoints: 16,
      completedPoints: 8,
    });
  });

  // ---- Task 2.2: workflow + release notes ----

  it('approve moves a story to done and records approver; reopen reverses it', async () => {
    const storyId = await createStory({ statusId: inReviewStatusId });

    const approve = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approve.body.code).toBe('S-0066');
    expect(approve.body.data.status.category).toBe('done');
    expect(approve.body.data.approvedBy).toBe(adminId);
    expect(approve.body.data.approver.handle).toBe('admin');

    const reopen = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(reopen.body.data.status.category).toBe('in_progress');
    expect(reopen.body.data.approvedAt).toBeNull();
    expect(reopen.body.data.approvedBy).toBeNull();
  });

  it('upserts and fetches release notes', async () => {
    const storyId = await createStory({ statusId: doneStatusId });
    const put = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${storyId}/release-notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Shipped PDF export', publish: true });
    expect(put.body.code).toBe('S-0068');
    expect(put.body.data.publishedAt).toBeTruthy();

    const get = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${storyId}/release-notes`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.body.data.body).toBe('Shipped PDF export');
  });

  // ---- Task 2.3 / 2.4: findOne enrichment + handle + estimatedAt ----

  it('story detail includes userStory, criteria, bugCount, childStatusBreakdown, epic, handle', async () => {
    const epicId = (await createItem({ itemType: 'epic', title: 'Epic' })).body.data.item.id;
    const storyId = await createStory({ userStory: 'As a *user*, I can export' });
    // story belongs_to epic
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/associations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ linkedItemId: epicId, linkType: 'belongs_to' });
    // a task + a bug belong_to the story
    const taskId = (await createItem({ itemType: 'task', title: 'T', statusId: doneStatusId })).body.data.item.id;
    const bugId = (await createItem({ itemType: 'bug', title: 'B', statusId: inProgressStatusId })).body.data.item.id;
    for (const childId of [taskId, bugId]) {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${childId}/associations`)
        .set('Authorization', `Bearer ${token}`)
        .send({ linkedItemId: storyId, linkType: 'belongs_to' });
    }
    // a criterion
    await request(app.getHttpServer())
      .post(criteriaUrl(storyId))
      .set('Authorization', `Bearer ${token}`)
      .send({ givenText: 'g', whenText: 'w', thenText: 't' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${storyId}`)
      .set('Authorization', `Bearer ${token}`);
    const d = res.body.data;
    expect(d.userStory).toBe('As a *user*, I can export');
    expect(d.acceptanceCriteria.total).toBe(1);
    expect(d.bugCount).toBe(1);
    expect(d.childStatusBreakdown).toMatchObject({ done: 1, wip: 1, open: 0 });
    // progress must reflect belongs_to descendants (task + bug), not just parentId children
    expect(d.progress).not.toBeNull();
    expect(d.progress.totalItems).toBe(2);
    expect(d.progress.completedItems).toBe(1);
    expect(d.epic).toMatchObject({ id: epicId });
    expect(d.reporter.handle).toBe('admin');
  });

  it('stamps estimatedAt the first time story points are set', async () => {
    const storyId = await createStory(); // no points
    const before = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${storyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(before.body.data.estimatedAt).toBeNull();

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${storyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ storyPoints: 5 });

    const after = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${storyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.data.estimatedAt).toBeTruthy();
  });

  it('stamps estimatedAt at creation when points are provided', async () => {
    const id = await createStory({ storyPoints: 8 });
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.estimatedAt).toBeTruthy();
  });

  it('approve is rejected when the story has an unresolved blocker', async () => {
    const storyId = await createStory({ statusId: inReviewStatusId });
    const blockerId = (await createItem({ itemType: 'task', title: 'Blocker', statusId: backlogStatusId })).body.data.item.id;
    // story blocks association → story is blocked by blockerId
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/associations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ linkedItemId: blockerId, linkType: 'blocks' });

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);

    // Resolve the blocker → approve now succeeds.
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${blockerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statusId: doneStatusId });
    const ok = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.body.data.status.category).toBe('done');
  });

  it('reorders acceptance criteria', async () => {
    const storyId = await createStory();
    const a = (await request(app.getHttpServer()).post(criteriaUrl(storyId)).set('Authorization', `Bearer ${token}`).send({ givenText: 'A' })).body.data.id;
    const b = (await request(app.getHttpServer()).post(criteriaUrl(storyId)).set('Authorization', `Bearer ${token}`).send({ givenText: 'B' })).body.data.id;
    const c = (await request(app.getHttpServer()).post(criteriaUrl(storyId)).set('Authorization', `Bearer ${token}`).send({ givenText: 'C' })).body.data.id;

    const res = await request(app.getHttpServer())
      .put(`${criteriaUrl(storyId)}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: [c, a, b] });
    expect(res.body.code).toBe('S-0065');
    expect(res.body.data.list.map((x: any) => x.givenText)).toEqual(['C', 'A', 'B']);
  });

  it('listStories exposes epicId/epicKey/epicTitle and bugCount', async () => {
    const epicId = (await createItem({ itemType: 'epic', title: 'Parent epic' })).body.data.item.id;
    const storyId = await createStory();
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${storyId}/associations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ linkedItemId: epicId, linkType: 'belongs_to' });

    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/stories`)
      .set('Authorization', `Bearer ${token}`);
    const story = res.body.data.list.find((s: any) => s.id === storyId);
    expect(story.epicId).toBe(epicId);
    expect(story.epicTitle).toBe('Parent epic');
    expect(story.epicKey).toMatch(/^TST-/);
    expect(typeof story.bugCount).toBe('number');
  });
});
