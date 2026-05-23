import { MigrationInterface, QueryRunner } from 'typeorm';

export class HierarchyMigration1716000012000 implements MigrationInterface {
  name = 'HierarchyMigration1716000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================================================================
    // STEP 0: Ensure task_types table exists
    // -------------------------------------------------------------------
    // No earlier migration creates `task_types`, but the work_items table
    // below references it via FK_wi_task_type. On a clean DB run that
    // breaks. Migration 14 later drops both the FK column and this table,
    // so this only needs to exist long enough for migrations 12 -> 14 to
    // succeed. IF NOT EXISTS keeps this idempotent for older dev DBs that
    // already had task_types created via synchronize.
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_types" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(50),
        "color" VARCHAR(7),
        "is_builtin" BOOLEAN DEFAULT false,
        "project_id" INT,
        "created_at" TIMESTAMPTZ DEFAULT now(),
        "updated_at" TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ===================================================================
    // STEP 1: Create work_items table
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "work_items" (
        "id" SERIAL PRIMARY KEY,
        "project_id" INT NOT NULL,
        "item_type" VARCHAR(10) NOT NULL,
        "parent_id" INT,
        "task_type_id" INT,
        "item_number" INT NOT NULL,
        "title" VARCHAR(500) NOT NULL,
        "description" TEXT,
        "status_id" INT NOT NULL,
        "priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
        "sprint_id" INT,
        "story_points" INT,
        "assignee_id" INT,
        "reporter_id" INT NOT NULL,
        "sort_order" VARCHAR(255) NOT NULL DEFAULT 'n',
        "due_date" DATE,
        "start_date" DATE,
        "target_date" DATE,
        "color" VARCHAR(7) NOT NULL DEFAULT '#7C5CFC',
        "completed_at" TIMESTAMPTZ,
        "added_mid_sprint" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT "chk_item_type" CHECK ("item_type" IN ('epic', 'story', 'task', 'subtask')),
        CONSTRAINT "chk_priority" CHECK ("priority" IN ('urgent', 'high', 'medium', 'low', 'none')),

        CONSTRAINT "FK_wi_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wi_parent" FOREIGN KEY ("parent_id") REFERENCES "work_items" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_wi_sprint" FOREIGN KEY ("sprint_id") REFERENCES "sprints" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_wi_status" FOREIGN KEY ("status_id") REFERENCES "project_statuses" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_wi_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_wi_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_wi_task_type" FOREIGN KEY ("task_type_id") REFERENCES "task_types" ("id") ON DELETE SET NULL
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wi_project_number" ON "work_items" ("project_id", "item_number")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_project" ON "work_items" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_parent" ON "work_items" ("parent_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_sprint" ON "work_items" ("sprint_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_item_type" ON "work_items" ("item_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_assignee" ON "work_items" ("assignee_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_status" ON "work_items" ("status_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wi_project_type" ON "work_items" ("project_id", "item_type")`);

    // ===================================================================
    // STEP 2: Create work_item_labels join table
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "work_item_labels" (
        "work_item_id" INT NOT NULL,
        "label_id" INT NOT NULL,
        PRIMARY KEY ("work_item_id", "label_id"),
        CONSTRAINT "FK_wil_work_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wil_label" FOREIGN KEY ("label_id") REFERENCES "labels" ("id") ON DELETE CASCADE
      )
    `);

    // ===================================================================
    // STEP 3: Create work_item_dependencies table
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "work_item_dependencies" (
        "id" SERIAL PRIMARY KEY,
        "work_item_id" INT NOT NULL,
        "depends_on_id" INT NOT NULL,
        "dependency_type" VARCHAR(20) NOT NULL DEFAULT 'blocks',
        "created_by" INT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_wi_dependency" UNIQUE ("work_item_id", "depends_on_id"),
        CONSTRAINT "FK_wid_work_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wid_depends_on" FOREIGN KEY ("depends_on_id") REFERENCES "work_items" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wid_item" ON "work_item_dependencies" ("work_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wid_depends" ON "work_item_dependencies" ("depends_on_id")`);

    // ===================================================================
    // STEP 4: Create temporary ID mapping tables
    // ===================================================================
    await queryRunner.query(`CREATE TEMP TABLE "epic_id_map" ("old_id" INT NOT NULL, "new_id" INT NOT NULL)`);
    await queryRunner.query(`CREATE TEMP TABLE "task_id_map" ("old_id" INT NOT NULL, "new_id" INT NOT NULL)`);

    // ===================================================================
    // STEP 5: Migrate epics → work_items (itemType = 'epic')
    // ===================================================================
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_item_id INT;
        current_counter INT;
        mapped_status_id INT;
      BEGIN
        FOR r IN SELECT * FROM epics ORDER BY project_id, id LOOP

          -- Get current highest item_number for this project
          -- Check both work_items (already migrated) and tasks (not yet migrated)
          SELECT GREATEST(
            COALESCE((SELECT MAX(item_number) FROM work_items WHERE project_id = r.project_id), 0),
            COALESCE((SELECT MAX(task_number) FROM tasks WHERE project_id = r.project_id), 0)
          ) INTO current_counter;

          current_counter := current_counter + 1;

          -- Map epic string status to project_status ID
          -- open → backlog, in_progress → in_progress, done → done
          SELECT id INTO mapped_status_id
          FROM project_statuses
          WHERE project_id = r.project_id
            AND category = CASE
              WHEN r.status = 'done' THEN 'done'
              WHEN r.status = 'in_progress' THEN 'in_progress'
              ELSE 'backlog'
            END
          ORDER BY sort_order
          LIMIT 1;

          -- Fallback: if no matching status found, use the default status
          IF mapped_status_id IS NULL THEN
            SELECT id INTO mapped_status_id
            FROM project_statuses
            WHERE project_id = r.project_id AND is_default = true
            LIMIT 1;
          END IF;

          -- Final fallback: use any status for this project
          IF mapped_status_id IS NULL THEN
            SELECT id INTO mapped_status_id
            FROM project_statuses
            WHERE project_id = r.project_id
            ORDER BY sort_order
            LIMIT 1;
          END IF;

          INSERT INTO work_items (
            project_id, item_type, parent_id, task_type_id, item_number,
            title, description, status_id, priority, sprint_id, story_points,
            assignee_id, reporter_id, sort_order, due_date, start_date, target_date,
            color, completed_at, added_mid_sprint, created_at, updated_at
          ) VALUES (
            r.project_id,
            'epic',
            NULL,                -- epics have no parent
            NULL,                -- no task type for epics
            current_counter,
            r.title,
            r.description,
            mapped_status_id,
            r.priority,
            NULL,                -- epics don't have meaningful sprint in old schema
            NULL,                -- epic points come from children
            NULL,                -- old epics don't have assignee
            r.created_by,        -- reporter = creator
            r.sort_order,
            NULL,                -- old epics don't have due_date
            r.start_date,
            r.target_date,
            r.color,
            CASE WHEN r.status = 'done' THEN NOW() ELSE NULL END,
            false,
            r.created_at,
            r.updated_at
          ) RETURNING id INTO new_item_id;

          -- Track mapping
          INSERT INTO epic_id_map VALUES (r.id, new_item_id);

          -- Update project counter
          UPDATE projects SET task_counter = current_counter WHERE id = r.project_id;

        END LOOP;
      END $$
    `);

    // ===================================================================
    // STEP 6: Migrate tasks (non-subtasks) → work_items (itemType = 'task')
    // Tasks with parent_id IS NULL are top-level tasks.
    // ===================================================================
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_item_id INT;
        mapped_epic_id INT;
      BEGIN
        FOR r IN SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY project_id, task_number LOOP

          -- Map old epic_id to new work_items id
          mapped_epic_id := NULL;
          IF r.epic_id IS NOT NULL THEN
            SELECT new_id INTO mapped_epic_id FROM epic_id_map WHERE old_id = r.epic_id;
          END IF;

          INSERT INTO work_items (
            project_id, item_type, parent_id, task_type_id, item_number,
            title, description, status_id, priority, sprint_id, story_points,
            assignee_id, reporter_id, sort_order, due_date, start_date, target_date,
            color, completed_at, added_mid_sprint, created_at, updated_at
          ) VALUES (
            r.project_id,
            'task',
            mapped_epic_id,       -- parent is the epic (if any)
            r.type_id,            -- task type FK (Bug, Task, etc.)
            r.task_number,        -- keep existing task number
            r.title,
            r.description,
            r.status_id,
            r.priority,
            r.sprint_id,
            r.story_points,
            r.assignee_id,
            r.reporter_id,
            r.sort_order,
            r.due_date,
            r.start_date,
            NULL,                 -- target_date (tasks don't have this)
            '#D6B588',            -- task color (amber)
            r.completed_at,
            r.added_mid_sprint,
            r.created_at,
            r.updated_at
          ) RETURNING id INTO new_item_id;

          INSERT INTO task_id_map VALUES (r.id, new_item_id);

        END LOOP;
      END $$
    `);

    // ===================================================================
    // STEP 7: Migrate subtasks → work_items (itemType = 'subtask')
    // Tasks with parent_id IS NOT NULL are subtasks.
    // ===================================================================
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_item_id INT;
        new_parent_id INT;
      BEGIN
        FOR r IN SELECT * FROM tasks WHERE parent_id IS NOT NULL ORDER BY project_id, task_number LOOP

          -- Map old parent_id (task) to new work_items id
          SELECT new_id INTO new_parent_id FROM task_id_map WHERE old_id = r.parent_id;

          INSERT INTO work_items (
            project_id, item_type, parent_id, task_type_id, item_number,
            title, description, status_id, priority, sprint_id, story_points,
            assignee_id, reporter_id, sort_order, due_date, start_date, target_date,
            color, completed_at, added_mid_sprint, created_at, updated_at
          ) VALUES (
            r.project_id,
            'subtask',
            new_parent_id,
            NULL,                 -- subtasks don't have task type
            r.task_number,        -- keep existing task number
            r.title,
            r.description,
            r.status_id,
            r.priority,
            NULL,                 -- subtasks NEVER have sprint_id
            r.story_points,
            r.assignee_id,
            r.reporter_id,
            r.sort_order,
            r.due_date,
            r.start_date,
            NULL,
            '#A8A19A',            -- subtask color (gray)
            r.completed_at,
            false,                -- subtasks don't track addedMidSprint
            r.created_at,
            r.updated_at
          ) RETURNING id INTO new_item_id;

          INSERT INTO task_id_map VALUES (r.id, new_item_id);

        END LOOP;
      END $$
    `);

    // ===================================================================
    // STEP 8: Migrate task_labels → work_item_labels
    // ===================================================================
    await queryRunner.query(`
      INSERT INTO work_item_labels (work_item_id, label_id)
      SELECT tm.new_id, tl.label_id
      FROM task_labels tl
      JOIN task_id_map tm ON tm.old_id = tl.task_id
    `);

    // ===================================================================
    // STEP 9: Migrate task_dependencies → work_item_dependencies
    // ===================================================================
    await queryRunner.query(`
      INSERT INTO work_item_dependencies (work_item_id, depends_on_id, dependency_type, created_by, created_at)
      SELECT tm1.new_id, tm2.new_id, td.dependency_type, td.created_by, td.created_at
      FROM task_dependencies td
      JOIN task_id_map tm1 ON tm1.old_id = td.task_id
      JOIN task_id_map tm2 ON tm2.old_id = td.depends_on_task_id
    `);

    // ===================================================================
    // STEP 10: Update comments — add work_item_id, populate from mapping
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "comments" ADD COLUMN "work_item_id" INT`);
    await queryRunner.query(`
      UPDATE comments
      SET work_item_id = tm.new_id
      FROM task_id_map tm
      WHERE comments.task_id = tm.old_id
    `);
    await queryRunner.query(`ALTER TABLE "comments" ALTER COLUMN "work_item_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD CONSTRAINT "FK_comment_work_item" FOREIGN KEY ("work_item_id")
      REFERENCES "work_items" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_comment_work_item" ON "comments" ("work_item_id")`);

    // ===================================================================
    // STEP 11: Update attachments — add work_item_id, populate from mapping
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "attachments" ADD COLUMN "work_item_id" INT`);
    await queryRunner.query(`
      UPDATE attachments
      SET work_item_id = tm.new_id
      FROM task_id_map tm
      WHERE attachments.task_id = tm.old_id
    `);
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "work_item_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "attachments"
      ADD CONSTRAINT "FK_attachment_work_item" FOREIGN KEY ("work_item_id")
      REFERENCES "work_items" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attachment_work_item" ON "attachments" ("work_item_id")`);

    // ===================================================================
    // STEP 12: Update activity_logs — add work_item_id, populate from mapping
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "activity_logs" ADD COLUMN "work_item_id" INT`);
    await queryRunner.query(`
      UPDATE activity_logs
      SET work_item_id = tm.new_id
      FROM task_id_map tm
      WHERE activity_logs.task_id = tm.old_id
    `);
    // work_item_id is nullable (same as old task_id), so no SET NOT NULL
    await queryRunner.query(`
      ALTER TABLE "activity_logs"
      ADD CONSTRAINT "FK_activity_work_item" FOREIGN KEY ("work_item_id")
      REFERENCES "work_items" ("id") ON DELETE CASCADE
    `);

    // ===================================================================
    // STEP 13: Update sprint_scope_changes — add work_item_id, populate
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" ADD COLUMN "work_item_id" INT`);
    await queryRunner.query(`
      UPDATE sprint_scope_changes
      SET work_item_id = tm.new_id
      FROM task_id_map tm
      WHERE sprint_scope_changes.task_id = tm.old_id
    `);
    // Some scope changes may reference tasks that no longer exist; handle gracefully
    // Set NOT NULL only after populating (rows with NULL work_item_id will be orphaned)
    await queryRunner.query(`DELETE FROM "sprint_scope_changes" WHERE "work_item_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" ALTER COLUMN "work_item_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "sprint_scope_changes"
      ADD CONSTRAINT "FK_scope_work_item" FOREIGN KEY ("work_item_id")
      REFERENCES "work_items" ("id") ON DELETE CASCADE
    `);

    // ===================================================================
    // STEP 14: Update checklist_items — add work_item_id, populate
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "checklist_items" ADD COLUMN "work_item_id" INT`);
    await queryRunner.query(`
      UPDATE checklist_items
      SET work_item_id = tm.new_id
      FROM task_id_map tm
      WHERE checklist_items.task_id = tm.old_id
    `);
    await queryRunner.query(`ALTER TABLE "checklist_items" ALTER COLUMN "work_item_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "checklist_items"
      ADD CONSTRAINT "FK_checklist_work_item" FOREIGN KEY ("work_item_id")
      REFERENCES "work_items" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_checklist_work_item" ON "checklist_items" ("work_item_id")`);

    // ===================================================================
    // STEP 15: Update notifications — reference_type 'task' → 'work_item',
    //          map reference_id using task_id_map
    // ===================================================================
    await queryRunner.query(`
      UPDATE notifications
      SET reference_id = tm.new_id,
          reference_type = 'work_item'
      FROM task_id_map tm
      WHERE notifications.reference_type = 'task'
        AND notifications.reference_id = tm.old_id
    `);
    // Handle notifications referencing tasks that don't exist in the map
    // (orphaned references) — update the type but leave the id as-is
    await queryRunner.query(`
      UPDATE notifications
      SET reference_type = 'work_item'
      WHERE reference_type = 'task'
    `);

    // ===================================================================
    // STEP 16: Rename projects.task_counter → item_counter
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "projects" RENAME COLUMN "task_counter" TO "item_counter"`);

    // Update item_counter to the max item_number per project
    await queryRunner.query(`
      UPDATE projects p
      SET item_counter = COALESCE(
        (SELECT MAX(item_number) FROM work_items WHERE project_id = p.id),
        0
      )
    `);

    // ===================================================================
    // STEP 17: Add full-text search vector + GIN index
    // ===================================================================
    await queryRunner.query(`
      ALTER TABLE "work_items" ADD COLUMN "search_vector" tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wi_search" ON "work_items" USING gin("search_vector")`);

    // ===================================================================
    // STEP 18: Verification queries (log counts for debugging)
    // ===================================================================
    const epicCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM epics`);
    const taskCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM tasks`);
    const wiCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM work_items`);
    const orphanSubtasks = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE item_type = 'subtask' AND parent_id IS NULL`
    );
    const epicWithParent = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE item_type = 'epic' AND parent_id IS NOT NULL`
    );

    console.log('=== HIERARCHY MIGRATION VERIFICATION ===');
    console.log(`Old epics: ${epicCount[0].cnt}`);
    console.log(`Old tasks: ${taskCount[0].cnt}`);
    console.log(`New work_items: ${wiCount[0].cnt}`);
    console.log(`Expected: ${parseInt(epicCount[0].cnt) + parseInt(taskCount[0].cnt)}`);
    console.log(`Orphan subtasks (must be 0): ${orphanSubtasks[0].cnt}`);
    console.log(`Epics with parent (must be 0): ${epicWithParent[0].cnt}`);

    const total = parseInt(epicCount[0].cnt) + parseInt(taskCount[0].cnt);
    if (parseInt(wiCount[0].cnt) !== total) {
      throw new Error(
        `Migration count mismatch! Expected ${total} work_items, got ${wiCount[0].cnt}`
      );
    }
    if (parseInt(orphanSubtasks[0].cnt) !== 0) {
      throw new Error(`Found ${orphanSubtasks[0].cnt} orphan subtasks after migration!`);
    }
    if (parseInt(epicWithParent[0].cnt) !== 0) {
      throw new Error(`Found ${epicWithParent[0].cnt} epics with parent_id set!`);
    }

    // ===================================================================
    // STEP 19: Drop old columns from updated tables
    // ===================================================================

    // Drop old indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_comment_task"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachment_task"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activity_task"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checklist_task"`);

    // Drop old FK constraints before dropping columns
    // Comments
    await queryRunner.query(`
      ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "FK_comment_task"
    `);
    await queryRunner.query(`
      ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "FK_comments_task_id"
    `);
    // Attachments
    await queryRunner.query(`
      ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachment_task"
    `);
    await queryRunner.query(`
      ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachments_task_id"
    `);
    // Activity logs
    await queryRunner.query(`
      ALTER TABLE "activity_logs" DROP CONSTRAINT IF EXISTS "FK_activity_task"
    `);
    await queryRunner.query(`
      ALTER TABLE "activity_logs" DROP CONSTRAINT IF EXISTS "FK_activity_logs_task_id"
    `);
    // Sprint scope changes
    await queryRunner.query(`
      ALTER TABLE "sprint_scope_changes" DROP CONSTRAINT IF EXISTS "FK_scope_task"
    `);
    await queryRunner.query(`
      ALTER TABLE "sprint_scope_changes" DROP CONSTRAINT IF EXISTS "FK_sprint_scope_changes_task_id"
    `);
    // Checklist items
    await queryRunner.query(`
      ALTER TABLE "checklist_items" DROP CONSTRAINT IF EXISTS "FK_checklist_task"
    `);
    await queryRunner.query(`
      ALTER TABLE "checklist_items" DROP CONSTRAINT IF EXISTS "FK_checklist_items_task_id"
    `);

    // Now drop old columns
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "task_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "task_id"`);
    await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "task_id"`);
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" DROP COLUMN "task_id"`);
    await queryRunner.query(`ALTER TABLE "checklist_items" DROP COLUMN "task_id"`);

    // ===================================================================
    // STEP 20: Drop old tables (order matters for FK dependencies)
    // ===================================================================
    await queryRunner.query(`DROP TABLE IF EXISTS "task_labels"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_dependencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "epics"`);

    // ===================================================================
    // STEP 21: Drop temp tables
    // ===================================================================
    await queryRunner.query(`DROP TABLE IF EXISTS "epic_id_map"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_id_map"`);

    console.log('=== HIERARCHY MIGRATION COMPLETE ===');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ===================================================================
    // REVERSE MIGRATION: Recreate old tables and restore data
    // ===================================================================

    // STEP 1: Recreate epics table
    await queryRunner.query(`
      CREATE TABLE "epics" (
        "id" SERIAL PRIMARY KEY,
        "project_id" INT NOT NULL,
        "title" VARCHAR(500) NOT NULL,
        "description" TEXT,
        "status" VARCHAR(20) NOT NULL DEFAULT 'open',
        "priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
        "color" VARCHAR(7) NOT NULL DEFAULT '#6366F1',
        "start_date" DATE,
        "target_date" DATE,
        "sort_order" VARCHAR(255) NOT NULL DEFAULT 'n',
        "created_by" INT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_epic_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_epic_creator" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_epic_project" ON "epics" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_epic_status" ON "epics" ("status")`);

    // STEP 2: Recreate tasks table
    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" SERIAL PRIMARY KEY,
        "project_id" INT NOT NULL,
        "sprint_id" INT,
        "epic_id" INT,
        "parent_id" INT,
        "status_id" INT NOT NULL,
        "task_number" INT NOT NULL,
        "title" VARCHAR(500) NOT NULL,
        "description" TEXT,
        "type" VARCHAR(10) NOT NULL DEFAULT 'task',
        "type_id" INT,
        "priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
        "story_points" INT,
        "assignee_id" INT,
        "reporter_id" INT NOT NULL,
        "sort_order" VARCHAR(255) NOT NULL DEFAULT 'n',
        "due_date" DATE,
        "start_date" DATE,
        "completed_at" TIMESTAMPTZ,
        "status_changed_at" TIMESTAMPTZ,
        "added_mid_sprint" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_task_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_status" FOREIGN KEY ("status_id") REFERENCES "project_statuses" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_task_type" FOREIGN KEY ("type_id") REFERENCES "task_types" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_task_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_task_project" ON "tasks" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_task_sprint" ON "tasks" ("sprint_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_task_status" ON "tasks" ("status_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_task_project_number" ON "tasks" ("project_id", "task_number")`);

    // STEP 3: Create temp mapping tables for reverse migration
    await queryRunner.query(`CREATE TEMP TABLE "reverse_epic_map" ("wi_id" INT NOT NULL, "epic_id" INT NOT NULL)`);
    await queryRunner.query(`CREATE TEMP TABLE "reverse_task_map" ("wi_id" INT NOT NULL, "task_id" INT NOT NULL)`);

    // STEP 4: Reverse-migrate epics (work_items with item_type = 'epic')
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_epic_id INT;
        mapped_status VARCHAR(20);
      BEGIN
        FOR r IN SELECT wi.*, ps.category
                 FROM work_items wi
                 JOIN project_statuses ps ON ps.id = wi.status_id
                 WHERE wi.item_type = 'epic'
                 ORDER BY wi.id
        LOOP
          -- Map status category back to epic status string
          mapped_status := CASE
            WHEN r.category = 'done' THEN 'done'
            WHEN r.category = 'in_progress' THEN 'in_progress'
            ELSE 'open'
          END;

          INSERT INTO epics (
            project_id, title, description, status, priority, color,
            start_date, target_date, sort_order, created_by, created_at, updated_at
          ) VALUES (
            r.project_id, r.title, r.description, mapped_status, r.priority, r.color,
            r.start_date, r.target_date, r.sort_order, r.reporter_id, r.created_at, r.updated_at
          ) RETURNING id INTO new_epic_id;

          INSERT INTO reverse_epic_map VALUES (r.id, new_epic_id);
        END LOOP;
      END $$
    `);

    // STEP 5: Reverse-migrate tasks (work_items with item_type = 'task')
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_task_id INT;
        mapped_epic_id INT;
      BEGIN
        FOR r IN SELECT * FROM work_items WHERE item_type = 'task' ORDER BY id LOOP
          mapped_epic_id := NULL;
          IF r.parent_id IS NOT NULL THEN
            SELECT epic_id INTO mapped_epic_id FROM reverse_epic_map WHERE wi_id = r.parent_id;
          END IF;

          INSERT INTO tasks (
            project_id, sprint_id, epic_id, parent_id, status_id, task_number,
            title, description, type, type_id, priority, story_points,
            assignee_id, reporter_id, sort_order, due_date, start_date,
            completed_at, added_mid_sprint, created_at, updated_at
          ) VALUES (
            r.project_id, r.sprint_id, mapped_epic_id, NULL, r.status_id, r.item_number,
            r.title, r.description, 'task', r.task_type_id, r.priority, r.story_points,
            r.assignee_id, r.reporter_id, r.sort_order, r.due_date, r.start_date,
            r.completed_at, r.added_mid_sprint, r.created_at, r.updated_at
          ) RETURNING id INTO new_task_id;

          INSERT INTO reverse_task_map VALUES (r.id, new_task_id);
        END LOOP;
      END $$
    `);

    // STEP 6: Reverse-migrate subtasks (work_items with item_type = 'subtask')
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        new_task_id INT;
        mapped_parent_id INT;
      BEGIN
        FOR r IN SELECT * FROM work_items WHERE item_type = 'subtask' ORDER BY id LOOP
          mapped_parent_id := NULL;
          IF r.parent_id IS NOT NULL THEN
            SELECT task_id INTO mapped_parent_id FROM reverse_task_map WHERE wi_id = r.parent_id;
          END IF;

          INSERT INTO tasks (
            project_id, sprint_id, epic_id, parent_id, status_id, task_number,
            title, description, type, type_id, priority, story_points,
            assignee_id, reporter_id, sort_order, due_date, start_date,
            completed_at, added_mid_sprint, created_at, updated_at
          ) VALUES (
            r.project_id, r.sprint_id, NULL, mapped_parent_id, r.status_id, r.item_number,
            r.title, r.description, 'subtask', NULL, r.priority, r.story_points,
            r.assignee_id, r.reporter_id, r.sort_order, r.due_date, r.start_date,
            r.completed_at, r.added_mid_sprint, r.created_at, r.updated_at
          ) RETURNING id INTO new_task_id;

          INSERT INTO reverse_task_map VALUES (r.id, new_task_id);
        END LOOP;
      END $$
    `);

    // STEP 7: Recreate task_labels and migrate back
    await queryRunner.query(`
      CREATE TABLE "task_labels" (
        "task_id" INT NOT NULL,
        "label_id" INT NOT NULL,
        PRIMARY KEY ("task_id", "label_id"),
        CONSTRAINT "FK_tl_task" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tl_label" FOREIGN KEY ("label_id") REFERENCES "labels" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO task_labels (task_id, label_id)
      SELECT rtm.task_id, wil.label_id
      FROM work_item_labels wil
      JOIN reverse_task_map rtm ON rtm.wi_id = wil.work_item_id
    `);

    // STEP 8: Recreate task_dependencies and migrate back
    await queryRunner.query(`
      CREATE TABLE "task_dependencies" (
        "id" SERIAL PRIMARY KEY,
        "task_id" INT NOT NULL,
        "depends_on_task_id" INT NOT NULL,
        "dependency_type" VARCHAR(20) NOT NULL DEFAULT 'blocks',
        "created_by" INT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_dependency" UNIQUE ("task_id", "depends_on_task_id"),
        CONSTRAINT "FK_dep_task" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dep_depends_on" FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_dep_task" ON "task_dependencies" ("task_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_dep_depends_on" ON "task_dependencies" ("depends_on_task_id")`);
    await queryRunner.query(`
      INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, created_by, created_at)
      SELECT rtm1.task_id, rtm2.task_id, wid.dependency_type, wid.created_by, wid.created_at
      FROM work_item_dependencies wid
      JOIN reverse_task_map rtm1 ON rtm1.wi_id = wid.work_item_id
      JOIN reverse_task_map rtm2 ON rtm2.wi_id = wid.depends_on_id
    `);

    // STEP 9: Re-add task_id columns to dependent tables and populate

    // Comments
    await queryRunner.query(`ALTER TABLE "comments" ADD COLUMN "task_id" INT`);
    await queryRunner.query(`
      UPDATE comments SET task_id = rtm.task_id
      FROM reverse_task_map rtm
      WHERE comments.work_item_id = rtm.wi_id
    `);
    await queryRunner.query(`ALTER TABLE "comments" ALTER COLUMN "task_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "comments" ADD CONSTRAINT "FK_comment_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_comment_task" ON "comments" ("task_id")`);

    // Attachments
    await queryRunner.query(`ALTER TABLE "attachments" ADD COLUMN "task_id" INT`);
    await queryRunner.query(`
      UPDATE attachments SET task_id = rtm.task_id
      FROM reverse_task_map rtm
      WHERE attachments.work_item_id = rtm.wi_id
    `);
    await queryRunner.query(`ALTER TABLE "attachments" ALTER COLUMN "task_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachment_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attachment_task" ON "attachments" ("task_id")`);

    // Activity logs
    await queryRunner.query(`ALTER TABLE "activity_logs" ADD COLUMN "task_id" INT`);
    await queryRunner.query(`
      UPDATE activity_logs SET task_id = rtm.task_id
      FROM reverse_task_map rtm
      WHERE activity_logs.work_item_id = rtm.wi_id
    `);
    await queryRunner.query(`
      ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_activity_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_activity_task" ON "activity_logs" ("task_id")`);

    // Sprint scope changes
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" ADD COLUMN "task_id" INT`);
    await queryRunner.query(`
      UPDATE sprint_scope_changes SET task_id = rtm.task_id
      FROM reverse_task_map rtm
      WHERE sprint_scope_changes.work_item_id = rtm.wi_id
    `);
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" ALTER COLUMN "task_id" SET NOT NULL`);

    // Checklist items
    await queryRunner.query(`ALTER TABLE "checklist_items" ADD COLUMN "task_id" INT`);
    await queryRunner.query(`
      UPDATE checklist_items SET task_id = rtm.task_id
      FROM reverse_task_map rtm
      WHERE checklist_items.work_item_id = rtm.wi_id
    `);
    await queryRunner.query(`ALTER TABLE "checklist_items" ALTER COLUMN "task_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "checklist_items" ADD CONSTRAINT "FK_checklist_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_checklist_task" ON "checklist_items" ("task_id")`);

    // STEP 10: Reverse notification reference_type
    await queryRunner.query(`
      UPDATE notifications SET reference_type = 'task' WHERE reference_type = 'work_item'
    `);

    // STEP 11: Drop work_item_id columns from dependent tables
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_comment_work_item"`);
    await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "FK_comment_work_item"`);
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "work_item_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachment_work_item"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachment_work_item"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "work_item_id"`);

    await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT IF EXISTS "FK_activity_work_item"`);
    await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "work_item_id"`);

    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" DROP CONSTRAINT IF EXISTS "FK_scope_work_item"`);
    await queryRunner.query(`ALTER TABLE "sprint_scope_changes" DROP COLUMN "work_item_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checklist_work_item"`);
    await queryRunner.query(`ALTER TABLE "checklist_items" DROP CONSTRAINT IF EXISTS "FK_checklist_work_item"`);
    await queryRunner.query(`ALTER TABLE "checklist_items" DROP COLUMN "work_item_id"`);

    // STEP 12: Rename item_counter back to task_counter
    await queryRunner.query(`ALTER TABLE "projects" RENAME COLUMN "item_counter" TO "task_counter"`);

    // STEP 13: Drop new tables
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_dependencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_labels"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_items"`);

    // STEP 14: Clean up temp tables
    await queryRunner.query(`DROP TABLE IF EXISTS "reverse_epic_map"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reverse_task_map"`);

    // Add sprint FK to tasks (was added via earlier migration)
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_sprint"
      FOREIGN KEY ("sprint_id") REFERENCES "sprints" ("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_epic"
      FOREIGN KEY ("epic_id") REFERENCES "epics" ("id") ON DELETE SET NULL
    `);

    // STEP 15: Drop task_types table (created in STEP 0 of up()). Migration
    // 14's down() recreates task_types as part of reversing its drop, so
    // when migrations are rolled back 14 -> 13 -> 12, the table exists and
    // belongs to this migration's responsibility to remove.
    await queryRunner.query(`DROP TABLE IF EXISTS "task_types"`);
  }
}
