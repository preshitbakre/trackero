import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Stories List Endpoint (e2e)', () => {
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

  const createAssociation = (itemId: number, linkedItemId: number, linkType: string) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType });

  const listStories = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/stories${query ? '?' + query : ''}`)
      .set('Authorization', `Bearer ${adminToken}`);

  it('returns empty list when no stories exist', async () => {
    const res = await listStories().expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('S-0109');
    expect(res.body.data.list).toHaveLength(0);
  });

  it('returns stories with progress and childBreakdown via associations', async () => {
    // Story with tasks linked via belongs_to associations
    const storyRes = await createItem({ itemType: 'story', title: 'Login Flow' });
    const storyId = storyRes.body.data.item.id;

    const t1Res = await createItem({ itemType: 'task', title: 'T1', statusId: doneStatusId, storyPoints: 3 });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'T2', storyPoints: 5 });
    const t2Id = t2Res.body.data.item.id;

    // Tasks belong_to the story
    await createAssociation(t1Id, storyId, 'belongs_to');
    await createAssociation(t2Id, storyId, 'belongs_to');

    // Subtask under T1 (via parentId — subtasks still use parentId)
    await createItem({ itemType: 'subtask', title: 'ST1', parentId: t1Id, statusId: doneStatusId, storyPoints: 1 });

    const res = await listStories().expect(200);

    expect(res.body.data.list).toHaveLength(1);
    const story = res.body.data.list[0];
    expect(story.itemType).toBe('story');
    expect(story.title).toBe('Login Flow');

    // Descendants via associations: T1(done), T2(backlog) = 2 total, 1 done
    // Note: subtask is a child of T1 via parentId, not via association — it may not appear in belongs_to CTE
    // The CTE only follows belongs_to associations, so subtask won't be counted unless
    // it also has a belongs_to to T1. Let's check what the CTE returns.
    // Actually the CTE does: belongs_to from storyId -> gets T1, T2
    // Then recursively: belongs_to from T1 -> nothing (subtask has parentId, not association)
    // So descendants = T1 + T2 = 2 items
    expect(story.progress.totalItems).toBe(2);
    expect(story.progress.completedItems).toBe(1);
    expect(story.progress.progressPercent).toBe(50);
    expect(story.progress.totalPoints).toBe(8);
    expect(story.progress.completedPoints).toBe(3);

    expect(story.childBreakdown.tasks).toBe(2);
  });

  it('does not return non-story items', async () => {
    await createItem({ itemType: 'epic', title: 'E1' });
    await createItem({ itemType: 'story', title: 'S1' });
    await createItem({ itemType: 'task', title: 'T1' });

    const res = await listStories().expect(200);

    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.list[0].itemType).toBe('story');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await createItem({ itemType: 'story', title: `Story ${i}` });
    }

    const res = await listStories('page=1&limit=2').expect(200);

    expect(res.body.data.list).toHaveLength(2);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.hasNext).toBe(true);
  });

  it('computes per-story descendant stats correctly across a multi-story page', async () => {
    // Three stories in a single page, each with different descendant composition:
    //   S1: 2 done tasks (totalItems=2, completedItems=2 -> 100%)
    //   S2: 1 done task + 1 backlog task (totalItems=2, completedItems=1 -> 50%)
    //   S3: no descendants (zeros)
    const s1Res = await createItem({ itemType: 'story', title: 'S1' });
    const s1Id = s1Res.body.data.item.id;
    const s2Res = await createItem({ itemType: 'story', title: 'S2' });
    const s2Id = s2Res.body.data.item.id;
    const s3Res = await createItem({ itemType: 'story', title: 'S3' });
    const s3Id = s3Res.body.data.item.id;

    // S1: 2 done tasks
    const s1T1Res = await createItem({ itemType: 'task', title: 'S1-T1', statusId: doneStatusId, storyPoints: 3 });
    const s1T1Id = s1T1Res.body.data.item.id;
    const s1T2Res = await createItem({ itemType: 'task', title: 'S1-T2', statusId: doneStatusId, storyPoints: 5 });
    const s1T2Id = s1T2Res.body.data.item.id;
    await createAssociation(s1T1Id, s1Id, 'belongs_to');
    await createAssociation(s1T2Id, s1Id, 'belongs_to');

    // S2: 1 done + 1 backlog
    const s2T1Res = await createItem({ itemType: 'task', title: 'S2-T1', statusId: doneStatusId, storyPoints: 2 });
    const s2T1Id = s2T1Res.body.data.item.id;
    const s2T2Res = await createItem({ itemType: 'task', title: 'S2-T2', storyPoints: 6 });
    const s2T2Id = s2T2Res.body.data.item.id;
    await createAssociation(s2T1Id, s2Id, 'belongs_to');
    await createAssociation(s2T2Id, s2Id, 'belongs_to');

    // S3: no descendants

    const res = await listStories().expect(200);
    expect(res.body.data.list).toHaveLength(3);

    const byId: Record<number, any> = {};
    for (const s of res.body.data.list) byId[s.id] = s;

    // S1: 2 tasks, both done
    expect(byId[s1Id].progress.totalItems).toBe(2);
    expect(byId[s1Id].progress.completedItems).toBe(2);
    expect(byId[s1Id].progress.progressPercent).toBe(100);
    expect(byId[s1Id].progress.totalPoints).toBe(8);
    expect(byId[s1Id].progress.completedPoints).toBe(8);
    expect(byId[s1Id].childBreakdown.tasks).toBe(2);
    expect(byId[s1Id].childBreakdown.stories).toBe(0);

    // S2: 2 tasks, 1 done
    expect(byId[s2Id].progress.totalItems).toBe(2);
    expect(byId[s2Id].progress.completedItems).toBe(1);
    expect(byId[s2Id].progress.progressPercent).toBe(50);
    expect(byId[s2Id].progress.totalPoints).toBe(8);
    expect(byId[s2Id].progress.completedPoints).toBe(2);
    expect(byId[s2Id].childBreakdown.tasks).toBe(2);

    // S3: empty
    expect(byId[s3Id].progress.totalItems).toBe(0);
    expect(byId[s3Id].progress.completedItems).toBe(0);
    expect(byId[s3Id].progress.progressPercent).toBe(0);
    expect(byId[s3Id].progress.totalPoints).toBe(0);
    expect(byId[s3Id].progress.completedPoints).toBe(0);
    expect(byId[s3Id].childBreakdown.tasks).toBe(0);
    expect(byId[s3Id].childBreakdown.subtasks).toBe(0);
    expect(byId[s3Id].childBreakdown.bugs).toBe(0);
  });

  it('story with no associations has zero progress', async () => {
    await createItem({ itemType: 'story', title: 'Empty' });

    const res = await listStories().expect(200);
    const story = res.body.data.list[0];

    expect(story.progress.totalItems).toBe(0);
    expect(story.progress.progressPercent).toBe(0);
    expect(story.childBreakdown.tasks).toBe(0);
    expect(story.childBreakdown.subtasks).toBe(0);
  });
});
