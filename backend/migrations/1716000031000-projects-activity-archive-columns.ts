import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 — projects gain two columns the directory uses:
 *   - last_activity_at: denormalised "most recent meaningful event in
 *     this project". Backfilled from max(activity_logs.created_at) for
 *     each project; bumped by app-level events going forward.
 *   - archived_at: timestamp of when the project was archived. Distinct
 *     from the existing `status` text — the timestamp is the canonical
 *     signal the app reads.
 *
 * Both columns are nullable + indexed; the archived index is partial
 * (only rows with archived_at IS NOT NULL) for the directory's
 * "Archived" tab.
 */
export class ProjectsActivityArchiveColumns1716000031000 implements MigrationInterface {
  name = 'ProjectsActivityArchiveColumns1716000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "archived_at" timestamptz
    `);

    // Backfill last_activity_at from the most recent activity_logs row
    // per project. Projects with no activity stay null; the directory
    // renders "no activity yet" for those.
    await queryRunner.query(`
      UPDATE "projects" p
         SET "last_activity_at" = sub.max_at
        FROM (
          SELECT "project_id", MAX("created_at") AS max_at
          FROM "activity_logs"
          GROUP BY "project_id"
        ) sub
       WHERE sub."project_id" = p."id"
         AND p."last_activity_at" IS NULL
    `);

    // Backfill archived_at from existing rows where status='archived';
    // updated_at is the best signal we have for when that happened.
    await queryRunner.query(`
      UPDATE "projects"
         SET "archived_at" = "updated_at"
       WHERE "status" = 'archived' AND "archived_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_last_activity_desc"
        ON "projects" ("last_activity_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_archived"
        ON "projects" ("archived_at" DESC)
        WHERE "archived_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_archived"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_last_activity_desc"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "archived_at"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "last_activity_at"`);
  }
}
