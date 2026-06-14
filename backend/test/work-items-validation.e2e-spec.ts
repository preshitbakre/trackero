import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';
import { WorkItemsService } from '../src/work-items/work-items.service';
import { WorkItem } from '../src/work-items/entities/work-item.entity';

describe('WorkItems Validation (e2e)', () => {
  let app: INestApplication;
  let service: WorkItemsService;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;
  let defaultStatusId: number;
  let doneStatusId: number;

  beforeAll(async () => {
    app = await createTestApp();
    service = app.get(WorkItemsService);
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

    // Create project via raw SQL (faster than HTTP for setup)
    const [proj] = await ds.query(
      `INSERT INTO projects (name, prefix, lead_id, item_counter) VALUES ('Test', 'TST', $1, 0) RETURNING id`,
      [adminId],
    );
    projectId = proj.id;

    // Add admin as project member
    await ds.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [projectId, adminId],
    );

    // Create default statuses
    const statuses = await ds.query(`
      INSERT INTO project_statuses (project_id, name, category, color, sort_order, is_default)
      VALUES
        ($1, 'Backlog', 'backlog', '#7E7770', 0, true),
        ($1, 'In Progress', 'in_progress', '#D6B588', 1, false),
        ($1, 'Done', 'done', '#88D68E', 2, false)
      RETURNING id, category
    `, [projectId]);
    defaultStatusId = statuses.find((s: any) => s.category === 'backlog').id;
    doneStatusId = statuses.find((s: any) => s.category === 'done').id;
  });

  // Helper: insert a work item directly for test setup, returns camelCase WorkItem
  async function insertItem(overrides: Partial<WorkItem> & { itemType: string; title: string }): Promise<WorkItem> {
    // Increment counter
    await ds.query(`UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1`, [projectId]);
    const [{ item_counter }] = await ds.query(`SELECT item_counter FROM projects WHERE id = $1`, [projectId]);

    const [row] = await ds.query(`
      INSERT INTO work_items (project_id, item_type, parent_id, item_number, title, description, status_id, priority, sprint_id, story_points, assignee_id, reporter_id, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, project_id AS "projectId", item_type AS "itemType", parent_id AS "parentId",
                item_number AS "itemNumber", title, description,
                status_id AS "statusId", priority, sprint_id AS "sprintId",
                story_points AS "storyPoints", assignee_id AS "assigneeId",
                reporter_id AS "reporterId", sort_order AS "sortOrder",
                completed_at AS "completedAt", added_mid_sprint AS "addedMidSprint",
                created_at AS "createdAt", updated_at AS "updatedAt"
    `, [
      projectId,
      overrides.itemType,
      overrides.parentId ?? null,
      item_counter,
      overrides.title,
      overrides.description ?? null,
      overrides.statusId ?? defaultStatusId,
      overrides.priority ?? 'medium',
      overrides.sprintId ?? null,
      overrides.storyPoints ?? null,
      overrides.assigneeId ?? null,
      overrides.reporterId ?? adminId,
      overrides.sortOrder ?? 'n',
    ]);
    return row as WorkItem;
  }

  // =========================================================================
  // validateParentChildType — new rules: only subtask can have parent
  // =========================================================================
  describe('validateParentChildType', () => {
    // Parent: null (standalone) — all types except subtask are allowed
    it('null → epic: ALLOW', async () => {
      await expect(service.validateParentChildType('epic', null)).resolves.toBeUndefined();
    });
    it('null → story: ALLOW', async () => {
      await expect(service.validateParentChildType('story', null)).resolves.toBeUndefined();
    });
    it('null → task: ALLOW', async () => {
      await expect(service.validateParentChildType('task', null)).resolves.toBeUndefined();
    });
    it('null → bug: ALLOW', async () => {
      await expect(service.validateParentChildType('bug', null)).resolves.toBeUndefined();
    });
    it('null → subtask: REJECT (subtask requires parent)', async () => {
      await expect(service.validateParentChildType('subtask', null)).rejects.toThrow();
    });

    // Parent: task — only subtask allowed
    it('task → subtask: ALLOW', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateParentChildType('subtask', task)).resolves.toBeUndefined();
    });
    it('task → task: REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateParentChildType('task', task)).rejects.toThrow();
    });
    it('task → story: REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateParentChildType('story', task)).rejects.toThrow();
    });
    it('task → epic: REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateParentChildType('epic', task)).rejects.toThrow();
    });

    // Parent: story — only subtask allowed
    it('story → subtask: ALLOW', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateParentChildType('subtask', story)).resolves.toBeUndefined();
    });
    it('story → epic: REJECT', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateParentChildType('epic', story)).rejects.toThrow();
    });
    it('story → story: REJECT', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateParentChildType('story', story)).rejects.toThrow();
    });
    it('story → task: REJECT', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateParentChildType('task', story)).rejects.toThrow();
    });

    // Parent: epic — only subtask allowed under the post-5.6 model.
    // Cross-type linkage (epic→story, epic→task, epic→bug) now lives in
    // work_item_associations with link_type='belongs_to'; the parent_id
    // chain is reserved for subtask attachment only.
    it('epic → subtask: ALLOW', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateParentChildType('subtask', epic)).resolves.toBeUndefined();
    });
    it('epic → story: REJECT', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateParentChildType('story', epic)).rejects.toThrow();
    });
    it('epic → task: REJECT', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateParentChildType('task', epic)).rejects.toThrow();
    });
    it('epic → epic: REJECT', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateParentChildType('epic', epic)).rejects.toThrow();
    });

    // Parent: subtask (always rejects — leaf node)
    it('subtask → anything: REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      await expect(service.validateParentChildType('subtask', subtask)).rejects.toThrow();
      await expect(service.validateParentChildType('task', subtask)).rejects.toThrow();
    });

    // Bug: cannot have parent
    it('bug with parent: REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateParentChildType('bug', task)).rejects.toThrow();
    });
  });

  // =========================================================================
  // validateDepth — depth 1-2 allowed (subtask under task/story), depth 3+ rejected
  // =========================================================================
  describe('validateDepth', () => {
    it('depth 1 (no parent) → ALLOW', async () => {
      await expect(service.validateDepth(null)).resolves.toBeUndefined();
    });

    it('depth 2 (task → subtask) → ALLOW', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateDepth(task.id)).resolves.toBeUndefined();
    });

    it('depth 2 (story → subtask) → ALLOW', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateDepth(story.id)).resolves.toBeUndefined();
    });

    it('depth 2 (epic → subtask) → ALLOW', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateDepth(epic.id)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // validateCircularReference
  // =========================================================================
  describe('validateCircularReference', () => {
    it('self-reference → REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateCircularReference(task.id, task.id)).rejects.toThrow();
    });

    it('no cycle → ALLOW', async () => {
      const task1 = await insertItem({ itemType: 'task', title: 'T1' });
      const task2 = await insertItem({ itemType: 'task', title: 'T2' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task1.id });
      // Move subtask to task2 — no cycle
      await expect(service.validateCircularReference(subtask.id, task2.id)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // validateDeletion — per deletion rules table
  // =========================================================================
  describe('validateDeletion', () => {
    it('task with subtasks → REJECT', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      await expect(service.validateDeletion(task)).rejects.toThrow();
    });

    it('task with no children → ALLOW', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      await expect(service.validateDeletion(task)).resolves.toBeUndefined();
    });

    it('story with direct subtasks → REJECT', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await insertItem({ itemType: 'subtask', title: 'ST1', parentId: story.id });
      await expect(service.validateDeletion(story)).rejects.toThrow();
    });

    it('story with no children → ALLOW', async () => {
      const story = await insertItem({ itemType: 'story', title: 'S1' });
      await expect(service.validateDeletion(story)).resolves.toBeUndefined();
    });

    it('epic with no children → ALLOW', async () => {
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await expect(service.validateDeletion(epic)).resolves.toBeUndefined();
    });

    it('epic with direct subtask children → REJECT', async () => {
      // Post-5.6: epics, like stories and tasks, are valid subtask parents.
      // Deleting an epic that still has subtask children is rejected so the
      // "every subtask has a parent" invariant holds.
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      await insertItem({ itemType: 'subtask', title: 'ST1', parentId: epic.id });
      await expect(service.validateDeletion(epic)).rejects.toThrow();
    });

    it('subtask → ALLOW (leaf node, always deletable)', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      await expect(service.validateDeletion(subtask)).resolves.toBeUndefined();
    });

    it('bug → ALLOW (standalone, always deletable)', async () => {
      const bug = await insertItem({ itemType: 'bug', title: 'B1' });
      await expect(service.validateDeletion(bug)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // validateReparenting
  // =========================================================================
  describe('validateReparenting', () => {
    it('subtask move to new task → ALLOW', async () => {
      const task1 = await insertItem({ itemType: 'task', title: 'T1' });
      const task2 = await insertItem({ itemType: 'task', title: 'T2' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task1.id });
      await expect(service.validateReparenting(subtask, task2)).resolves.toBeUndefined();
    });

    it('subtask move to epic parent → ALLOW (post-5.6: epic is a valid subtask parent)', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      const epic = await insertItem({ itemType: 'epic', title: 'E1' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      await expect(service.validateReparenting(subtask, epic)).resolves.toBeUndefined();
    });

    it('detach subtask (parent=null) → validateReparenting allows, but validateParentChildType rejects', async () => {
      const task = await insertItem({ itemType: 'task', title: 'T1' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      // validateReparenting alone allows detach (returns early for null parent)
      await expect(service.validateReparenting(subtask, null)).resolves.toBeUndefined();
      // But validateParentChildType rejects subtask with null parent
      await expect(service.validateParentChildType('subtask', null)).rejects.toThrow();
    });

    it('cross-project reparenting → REJECT', async () => {
      // Create second project
      const [proj2] = await ds.query(
        `INSERT INTO projects (name, prefix, lead_id, item_counter) VALUES ('Other', 'OTH', $1, 0) RETURNING id`,
        [adminId],
      );
      await ds.query(
        `INSERT INTO project_statuses (project_id, name, category, color, sort_order, is_default)
         VALUES ($1, 'Backlog', 'backlog', '#7E7770', 0, true)`,
        [proj2.id],
      );
      const [otherStatus] = await ds.query(
        `SELECT id FROM project_statuses WHERE project_id = $1 LIMIT 1`,
        [proj2.id],
      );
      // Insert task in other project
      await ds.query(`UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1`, [proj2.id]);
      const [{ item_counter }] = await ds.query(`SELECT item_counter FROM projects WHERE id = $1`, [proj2.id]);
      const [otherTask] = await ds.query(`
        INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id)
        VALUES ($1, 'task', $2, 'Other Task', $3, $4) RETURNING *
      `, [proj2.id, item_counter, otherStatus.id, adminId]);

      const task = await insertItem({ itemType: 'task', title: 'T1' });
      const subtask = await insertItem({ itemType: 'subtask', title: 'ST1', parentId: task.id });
      await expect(service.validateReparenting(subtask, otherTask as WorkItem)).rejects.toThrow();
    });
  });
});
