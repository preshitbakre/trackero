import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 — soft delete columns + indexes.
 *
 * Adds `deleted_at TIMESTAMPTZ NULL` to the four tables the user can
 * delete from. A partial unique-ish index on `(deleted_at)` is *not*
 * helpful here (we'll filter by IS NULL, not look one up), so each
 * table gets a single deleted-at index for the retention cron to scan.
 *
 * Existing rows backfill to NULL (no special handling).
 */
export class SoftDeletes1716000045000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['work_items', 'comments', 'retro_cards', 'attachments']) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_deleted_at"
         ON ${table} (deleted_at)
         WHERE deleted_at IS NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['work_items', 'comments', 'retro_cards', 'attachments']) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_deleted_at"`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS deleted_at`);
    }
  }
}
