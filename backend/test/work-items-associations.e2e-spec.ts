import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

describe('Associations (e2e)', () => {
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

  const createAssociation = (itemId: number, body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const deleteAssociation = (itemId: number, assocId: number) =>
    request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${itemId}/associations/${assocId}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const listAssociations = (itemId: number) =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`);

  const updateItem = (id: number, body: any) =>
    request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  // =========================================================================
  // CREATE associations
  // =========================================================================

  it('create belongs_to association (task → story) → 201', async () => {
    const storyRes = await createItem({ itemType: 'story', title: 'S1' });
    const storyId = storyRes.body.data.item.id;
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;

    const res = await createAssociation(taskId, {
      linkedItemId: storyId,
      linkType: 'belongs_to',
    }).expect(201);

    expect(res.body.code).toBe('S-0135');
    expect(res.body.data.itemId).toBe(taskId);
    expect(res.body.data.linkedItemId).toBe(storyId);
    expect(res.body.data.linkType).toBe('belongs_to');
  });

  it('create relates_to association → 201', async () => {
    const t1Res = await createItem({ itemType: 'task', title: 'T1' });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'T2' });
    const t2Id = t2Res.body.data.item.id;

    const res = await createAssociation(t1Id, {
      linkedItemId: t2Id,
      linkType: 'relates_to',
    }).expect(201);

    expect(res.body.data.linkType).toBe('relates_to');
  });

  it('create blocks association → 201', async () => {
    const t1Res = await createItem({ itemType: 'task', title: 'T1' });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'Blocker' });
    const t2Id = t2Res.body.data.item.id;

    // T1 is blocked by T2
    const res = await createAssociation(t1Id, {
      linkedItemId: t2Id,
      linkType: 'blocks',
    }).expect(201);

    expect(res.body.data.linkType).toBe('blocks');
  });

  it('create caused_by association (bug → task) → 201', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;
    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    const res = await createAssociation(bugId, {
      linkedItemId: taskId,
      linkType: 'caused_by',
    }).expect(201);

    expect(res.body.data.linkType).toBe('caused_by');
  });

  // =========================================================================
  // REJECTION cases
  // =========================================================================

  it('self-link rejected → 400', async () => {
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;

    const res = await createAssociation(taskId, {
      linkedItemId: taskId,
      linkType: 'relates_to',
    }).expect(400);

    expect(res.body.code).toBe('F-L-0097');
  });

  it('circular blocks rejected → 409', async () => {
    const t1Res = await createItem({ itemType: 'task', title: 'T1' });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'T2' });
    const t2Id = t2Res.body.data.item.id;

    // T1 blocks T2 (T1 is blocked by T2)
    await createAssociation(t1Id, {
      linkedItemId: t2Id,
      linkType: 'blocks',
    }).expect(201);

    // Now try T2 blocks T1 (T2 is blocked by T1) → circular
    const res = await createAssociation(t2Id, {
      linkedItemId: t1Id,
      linkType: 'blocks',
    }).expect(409);

    expect(res.body.code).toBe('F-L-0031');
  });

  // =========================================================================
  // LIST associations
  // =========================================================================

  it('list associations returns correct grouping', async () => {
    const epicRes = await createItem({ itemType: 'epic', title: 'E1' });
    const epicId = epicRes.body.data.item.id;
    const storyRes = await createItem({ itemType: 'story', title: 'S1' });
    const storyId = storyRes.body.data.item.id;
    const taskRes = await createItem({ itemType: 'task', title: 'T1' });
    const taskId = taskRes.body.data.item.id;
    const bugRes = await createItem({ itemType: 'bug', title: 'B1' });
    const bugId = bugRes.body.data.item.id;

    // Task belongs_to story
    await createAssociation(taskId, { linkedItemId: storyId, linkType: 'belongs_to' });
    // Task relates_to epic
    await createAssociation(taskId, { linkedItemId: epicId, linkType: 'relates_to' });
    // Task is blocked by bug
    await createAssociation(taskId, { linkedItemId: bugId, linkType: 'blocks' });

    const res = await listAssociations(taskId).expect(200);

    expect(res.body.code).toBe('S-0137');
    const data = res.body.data;
    expect(data.belongsTo).toHaveLength(1);
    expect(data.belongsTo[0].item.id).toBe(storyId);
    expect(data.relatesTo).toHaveLength(1);
    expect(data.relatesTo[0].item.id).toBe(epicId);
    expect(data.blockedBy).toHaveLength(1);
    expect(data.blockedBy[0].item.id).toBe(bugId);
  });

  // =========================================================================
  // DELETE association
  // =========================================================================

  it('delete association → 200', async () => {
    const t1Res = await createItem({ itemType: 'task', title: 'T1' });
    const t1Id = t1Res.body.data.item.id;
    const t2Res = await createItem({ itemType: 'task', title: 'T2' });
    const t2Id = t2Res.body.data.item.id;

    const assocRes = await createAssociation(t1Id, {
      linkedItemId: t2Id,
      linkType: 'relates_to',
    }).expect(201);
    const assocId = assocRes.body.data.id;

    await deleteAssociation(t1Id, assocId).expect(200);

    // Verify it's gone
    const listRes = await listAssociations(t1Id).expect(200);
    expect(listRes.body.data.relatesTo).toHaveLength(0);
  });

  // =========================================================================
  // BLOCKER behavior
  // =========================================================================

  it('blocker prevents done status change', async () => {
    const blockerRes = await createItem({ itemType: 'task', title: 'Blocker' });
    const blockerId = blockerRes.body.data.item.id;
    const blockedRes = await createItem({ itemType: 'task', title: 'Blocked' });
    const blockedId = blockedRes.body.data.item.id;

    // Blocked is blocked by Blocker
    await createAssociation(blockedId, {
      linkedItemId: blockerId,
      linkType: 'blocks',
    }).expect(201);

    // Try to mark Blocked as done → should fail
    const upd = await updateItem(blockedId, { statusId: doneStatusId }).expect(400);
    expect(upd.body.code).toBe('F-L-0101');
  });

  it('blocker resolved allows done status change', async () => {
    const blockerRes = await createItem({ itemType: 'task', title: 'Blocker', statusId: doneStatusId });
    const blockerId = blockerRes.body.data.item.id;
    const blockedRes = await createItem({ itemType: 'task', title: 'Blocked' });
    const blockedId = blockedRes.body.data.item.id;

    // Blocked is blocked by Blocker (already done)
    await createAssociation(blockedId, {
      linkedItemId: blockerId,
      linkType: 'blocks',
    }).expect(201);

    // Mark Blocked as done → should succeed since blocker is done
    const upd = await updateItem(blockedId, { statusId: doneStatusId }).expect(200);
    expect(upd.body.data.item.completedAt).not.toBeNull();
  });
});
