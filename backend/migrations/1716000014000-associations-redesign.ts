import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssociationsRedesign1716000014000 implements MigrationInterface {
  name = 'AssociationsRedesign1716000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================================================================
    // STEP 1: Create work_item_associations table
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "work_item_associations" (
        "id" SERIAL PRIMARY KEY,
        "item_id" INT NOT NULL,
        "linked_item_id" INT NOT NULL,
        "link_type" VARCHAR(20) NOT NULL,
        "created_by" INT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT "chk_link_type"
          CHECK ("link_type" IN ('belongs_to', 'relates_to', 'blocks', 'caused_by')),
        CONSTRAINT "UQ_association"
          UNIQUE ("item_id", "linked_item_id", "link_type"),
        CONSTRAINT "chk_no_self_link"
          CHECK ("item_id" != "linked_item_id"),

        CONSTRAINT "FK_assoc_item" FOREIGN KEY ("item_id")
          REFERENCES "work_items" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_assoc_linked" FOREIGN KEY ("linked_item_id")
          REFERENCES "work_items" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_assoc_item" ON "work_item_associations" ("item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_assoc_linked" ON "work_item_associations" ("linked_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_assoc_type" ON "work_item_associations" ("link_type")`);

    // ===================================================================
    // STEP 2: Migrate non-subtask parentId → belongs_to associations
    // ===================================================================
    await queryRunner.query(`
      INSERT INTO "work_item_associations" ("item_id", "linked_item_id", "link_type", "created_by", "created_at")
      SELECT wi.id, wi.parent_id, 'belongs_to', wi.reporter_id, wi.created_at
      FROM "work_items" wi
      WHERE wi.parent_id IS NOT NULL
        AND wi.item_type != 'subtask'
    `);

    // ===================================================================
    // STEP 3: Migrate work_item_dependencies → associations
    // ===================================================================
    await queryRunner.query(`
      INSERT INTO "work_item_associations" ("item_id", "linked_item_id", "link_type", "created_by", "created_at")
      SELECT wid.work_item_id, wid.depends_on_id, wid.dependency_type, wid.created_by, wid.created_at
      FROM "work_item_dependencies" wid
    `);

    // ===================================================================
    // STEP 4: Clear parentId for non-subtasks
    // ===================================================================
    await queryRunner.query(`
      UPDATE "work_items"
      SET parent_id = NULL
      WHERE item_type != 'subtask'
        AND parent_id IS NOT NULL
    `);

    // ===================================================================
    // STEP 5: Update item_type constraint to include 'bug'
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "chk_item_type"`);
    await queryRunner.query(`
      ALTER TABLE "work_items"
      ADD CONSTRAINT "chk_item_type"
      CHECK ("item_type" IN ('epic', 'story', 'task', 'bug', 'subtask'))
    `);

    // ===================================================================
    // STEP 6: Drop task_type_id column and its FK
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "FK_wi_task_type"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "task_type_id"`);

    // ===================================================================
    // STEP 7: Drop old tables
    // ===================================================================
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_dependencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_types"`);

    // ===================================================================
    // STEP 8: Verification
    // ===================================================================
    const result = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM "work_items"
      WHERE item_type != 'subtask'
        AND parent_id IS NOT NULL
    `);
    const count = parseInt(result[0].cnt, 10);
    if (count !== 0) {
      throw new Error(
        `Verification failed: found ${count} non-subtask work_items with parent_id set (expected 0)`
      );
    }

    console.log('=== ASSOCIATIONS REDESIGN MIGRATION COMPLETE ===');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ===================================================================
    // REVERSE STEP 7: Recreate task_types table
    // ===================================================================
    await queryRunner.query(`
      CREATE TABLE "task_types" (
        "id" SERIAL PRIMARY KEY,
        "project_id" INT NOT NULL,
        "name" VARCHAR(50) NOT NULL,
        "icon" VARCHAR(50),
        "color" VARCHAR(7) NOT NULL DEFAULT '#6B7280',
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_task_type_project" FOREIGN KEY ("project_id")
          REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);

    // Recreate work_item_dependencies table
    await queryRunner.query(`
      CREATE TABLE "work_item_dependencies" (
        "id" SERIAL PRIMARY KEY,
        "work_item_id" INT NOT NULL,
        "depends_on_id" INT NOT NULL,
        "dependency_type" VARCHAR(20) NOT NULL DEFAULT 'blocks',
        "created_by" INT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_wi_dependency" UNIQUE ("work_item_id", "depends_on_id"),
        CONSTRAINT "FK_wid_work_item" FOREIGN KEY ("work_item_id")
          REFERENCES "work_items" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wid_depends_on" FOREIGN KEY ("depends_on_id")
          REFERENCES "work_items" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wid_item" ON "work_item_dependencies" ("work_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_wid_depends" ON "work_item_dependencies" ("depends_on_id")`);

    // ===================================================================
    // REVERSE STEP 6: Re-add task_type_id column
    // ===================================================================
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN "task_type_id" INT`);
    await queryRunner.query(`
      ALTER TABLE "work_items"
      ADD CONSTRAINT "FK_wi_task_type" FOREIGN KEY ("task_type_id")
        REFERENCES "task_types" ("id") ON DELETE SET NULL
    `);

    // ===================================================================
    // REVERSE STEP 5: Restore old item_type constraint (without 'bug')
    // ===================================================================
    // First convert any 'bug' items back to 'task' so the constraint can be applied
    await queryRunner.query(`UPDATE "work_items" SET item_type = 'task' WHERE item_type = 'bug'`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "chk_item_type"`);
    await queryRunner.query(`
      ALTER TABLE "work_items"
      ADD CONSTRAINT "chk_item_type"
      CHECK ("item_type" IN ('epic', 'story', 'task', 'subtask'))
    `);

    // ===================================================================
    // REVERSE STEP 4: Restore parentId for non-subtasks from belongs_to associations
    // ===================================================================
    await queryRunner.query(`
      UPDATE "work_items" wi
      SET parent_id = assoc.linked_item_id
      FROM "work_item_associations" assoc
      WHERE assoc.item_id = wi.id
        AND assoc.link_type = 'belongs_to'
        AND wi.item_type != 'subtask'
    `);

    // ===================================================================
    // REVERSE STEP 3: Restore work_item_dependencies from associations
    // ===================================================================
    await queryRunner.query(`
      INSERT INTO "work_item_dependencies" ("work_item_id", "depends_on_id", "dependency_type", "created_by", "created_at")
      SELECT assoc.item_id, assoc.linked_item_id, assoc.link_type, assoc.created_by, assoc.created_at
      FROM "work_item_associations" assoc
      WHERE assoc.link_type IN ('blocks', 'relates_to')
    `);

    // ===================================================================
    // REVERSE STEP 1: Drop work_item_associations table
    // ===================================================================
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_associations"`);
  }
}
