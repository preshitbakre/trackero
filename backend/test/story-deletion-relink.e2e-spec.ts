import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

/**
 * Story Deletion Re-linking (e2e)
 *
 * In this codebase the hierarchy for non-subtask items is stored in
 * `work_item_associations` (link_type = 'belongs_to'), NOT in the
 * `work_items.parent_id` column.  `parent_id` is only populated for
 * subtasks; tasks/stories/epics/bugs always have parent_id = NULL.
 *
 * Consequently, "re-linking" a task when its parent story is deleted
 * means re-pointing the task's `belongs_to` association from the story
 * to the story's parent epic (or removing the association when the story
 * has no parent epic).
 *
 * The backend performs a plain soft-delete on the story; re-linking is a
 * frontend concern (see memory/project_deletion_behavior.md).  These
 * tests verify the observable backend contract:
 *
 *  1. Soft-delete works — `deleted_at` is set on the story row.
 *  2. A task's `belongs_to` association to the deleted story persists in
 *     the DB (the row is not removed; it just becomes invisible in list
 *     queries that filter `deleted_at IS NULL`).
 *  3. Restore clears `deleted_at` on the story row without disturbing the
 *     task's association.
 *  4. Creating a task or story with `parentId` pointing at a non-subtask
 *     parent is rejected — only subtasks may use parent_id.
 */

describe('Story Deletion Re-linking (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let projectId: number;

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

    const res = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'RelinkTest', prefix: 'RLK' });
    projectId = res.body.data.item.id;
  });

  async function createItem(type: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `${type} item`, itemType: type, ...overrides });
    return res.body.data.item;
  }

  async function linkBelongsTo(itemId: number, parentId: number) {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId: parentId, linkType: 'belongs_to' })
      .expect(201);
  }

  // =========================================================================
  // Core model constraint: only subtasks may use parentId
  // =========================================================================

  it('creating a task with parentId → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const story = await createItem('story');

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'task item', itemType: 'task', parentId: story.id });

    expect(res.status).toBe(400);
    // INVALID_PARENT_CHILD_TYPE — only subtasks may have a parent row
    expect(res.body.code).toBe('F-L-0091');
  });

  it('creating a story with parentId (epic as parent) → 400 INVALID_PARENT_CHILD_TYPE', async () => {
    const epic = await createItem('epic');

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'story item', itemType: 'story', parentId: epic.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('F-L-0091');
  });

  // =========================================================================
  // Soft-delete story: story row gets deleted_at set
  // =========================================================================

  it('soft-delete story sets deleted_at on story row', async () => {
    const story = await createItem('story');

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${story.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const [row] = await ds.query(
      `SELECT deleted_at FROM work_items WHERE id = $1`,
      [story.id],
    );
    expect(row.deleted_at).not.toBeNull();
  });

  // =========================================================================
  // Task's belongs_to association persists after story soft-delete
  // =========================================================================

  it('task belongs_to association to deleted story persists in DB', async () => {
    const story = await createItem('story');
    const task = await createItem('task');
    await linkBelongsTo(task.id, story.id);

    // Verify association exists before deletion
    const [assocBefore] = await ds.query(
      `SELECT id FROM work_item_associations
       WHERE item_id = $1 AND linked_item_id = $2 AND link_type = 'belongs_to'`,
      [task.id, story.id],
    );
    expect(assocBefore).toBeDefined();

    // Soft-delete the story
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${story.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Association row still present in DB (soft delete doesn't purge associations)
    const [assocAfter] = await ds.query(
      `SELECT id FROM work_item_associations
       WHERE item_id = $1 AND linked_item_id = $2 AND link_type = 'belongs_to'`,
      [task.id, story.id],
    );
    expect(assocAfter).toBeDefined();

    // Task's own parent_id column is null (tasks never use parent_id)
    const [taskRow] = await ds.query(
      `SELECT parent_id FROM work_items WHERE id = $1`,
      [task.id],
    );
    expect(taskRow.parent_id).toBeNull();
  });

  // =========================================================================
  // Delete childless story succeeds cleanly
  // =========================================================================

  it('delete childless story succeeds cleanly', async () => {
    const story = await createItem('story');

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${story.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const [row] = await ds.query(
      `SELECT deleted_at FROM work_items WHERE id = $1`,
      [story.id],
    );
    expect(row.deleted_at).not.toBeNull();
  });

  // =========================================================================
  // Story with epic parent: task's belongs_to association is preserved
  // =========================================================================

  it('task belongs_to story; delete story — association preserved in DB', async () => {
    const epic = await createItem('epic');
    const story = await createItem('story');
    await linkBelongsTo(story.id, epic.id);
    const task = await createItem('task');
    await linkBelongsTo(task.id, story.id);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${story.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Task association still points to story in the DB
    const [assocRow] = await ds.query(
      `SELECT linked_item_id FROM work_item_associations
       WHERE item_id = $1 AND link_type = 'belongs_to'`,
      [task.id],
    );
    expect(assocRow).toBeDefined();
    // The linked_item_id is still the story (soft-delete leaves the row intact)
    expect(assocRow.linked_item_id).toBe(story.id);
  });

  // =========================================================================
  // Restore soft-deleted story: deleted_at cleared, associations untouched
  // =========================================================================

  it('restore soft-deleted story clears deleted_at without disrupting task associations', async () => {
    const story = await createItem('story');
    const task = await createItem('task');
    await linkBelongsTo(task.id, story.id);

    // Soft-delete
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/items/${story.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Restore
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${story.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Story is live again
    const [storyRow] = await ds.query(
      `SELECT deleted_at FROM work_items WHERE id = $1`,
      [story.id],
    );
    expect(storyRow.deleted_at).toBeNull();

    // Task's belongs_to association is still intact
    const [assocRow] = await ds.query(
      `SELECT id FROM work_item_associations
       WHERE item_id = $1 AND linked_item_id = $2 AND link_type = 'belongs_to'`,
      [task.id, story.id],
    );
    expect(assocRow).toBeDefined();
  });
});
