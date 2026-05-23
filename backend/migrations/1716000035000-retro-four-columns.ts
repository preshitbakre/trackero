import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 — retro 4 columns + lifecycle + facilitator.
 *
 * - `retrospectives.facilitator_id` (nullable FK SET NULL) — who runs the
 *   meeting; backfilled from `created_by`.
 * - `retrospectives.opened_at` — when the retro became writable;
 *   backfilled from `created_at`.
 * - `retrospectives.closed_at` — when edits get locked; null while open.
 * - `retrospectives.authors_revealed_at` — null = anonymous, set = names
 *   visible.
 * - `retro_cards.updated_at` — for "last touched" + Phase 6 reveal flow;
 *   backfilled from `created_at`.
 *
 * The 4th column `lucky_breaks` rides on the existing `column varchar(20)`
 * with no DDL change — the union is widened in app code only. Historical
 * rows continue to hold `went_well | to_improve | action_items`; new
 * `kept | dropped | lucky_breaks | next` values are equivalent at the
 * storage layer (kept ↔ went_well, dropped ↔ to_improve, next ↔
 * action_items). UI maps both sides for one release of back-compat.
 */
export class RetroFourColumns1716000035000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE retrospectives
      ADD COLUMN IF NOT EXISTS facilitator_id INT
        REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE retrospectives
      ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE retrospectives
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE retrospectives
      ADD COLUMN IF NOT EXISTS authors_revealed_at TIMESTAMPTZ
    `);

    // Idempotent backfills.
    await queryRunner.query(`
      UPDATE retrospectives
      SET facilitator_id = created_by
      WHERE facilitator_id IS NULL AND created_by IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE retrospectives
      SET opened_at = created_at
      WHERE opened_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE retro_cards
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
    await queryRunner.query(`
      UPDATE retro_cards
      SET updated_at = created_at
      WHERE updated_at < created_at OR updated_at IS NULL
    `);

    // Index the facilitator FK so "retros I run" queries are fast.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retro_facilitator"
      ON retrospectives (facilitator_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retro_facilitator"`);
    await queryRunner.query(`ALTER TABLE retro_cards DROP COLUMN IF EXISTS updated_at`);
    await queryRunner.query(`ALTER TABLE retrospectives DROP COLUMN IF EXISTS authors_revealed_at`);
    await queryRunner.query(`ALTER TABLE retrospectives DROP COLUMN IF EXISTS closed_at`);
    await queryRunner.query(`ALTER TABLE retrospectives DROP COLUMN IF EXISTS opened_at`);
    await queryRunner.query(`ALTER TABLE retrospectives DROP COLUMN IF EXISTS facilitator_id`);
  }
}
