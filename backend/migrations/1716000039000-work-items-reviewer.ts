import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — explicit `reviewer_id` on work_items.
 *
 * The Today rail's "Reviewing for" section currently falls back to the
 * reporter; this column makes the reviewer a first-class field. SET NULL
 * on user delete because the work item should survive the reviewer
 * leaving the org.
 */
export class WorkItemsReviewer1716000039000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE work_items
      ADD COLUMN IF NOT EXISTS reviewer_id INT
        REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wi_reviewer"
      ON work_items (reviewer_id) WHERE reviewer_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wi_reviewer"`);
    await queryRunner.query(`ALTER TABLE work_items DROP COLUMN IF EXISTS reviewer_id`);
  }
}
