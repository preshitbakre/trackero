import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.2 — Restore the three CHECK constraints declared by migration 14
 * (`AssociationsRedesign`) and migration 12 (`HierarchyMigration`):
 *
 *   - work_item_associations.chk_link_type    — link_type ∈ canonical set
 *   - work_item_associations.chk_no_self_link — item_id <> linked_item_id
 *   - work_items.chk_item_type                — item_type ∈ canonical set
 *
 * The audit found these missing on drifted dev databases. They were
 * "applied" by synchronize at some point, then dropped during later
 * schema edits without a migration recording the loss. Re-adding them
 * is a belt-and-braces second line of defence behind the service-layer
 * validation that already rejects illegal values.
 *
 * Idempotency: pg_constraint name-existence guard before each ADD
 * CONSTRAINT. Safe to run on:
 *   - fresh DBs (constraints from 12/14 are already there → no-op)
 *   - drifted DBs where the constraints were dropped
 *
 * Pre-flight: if any existing row already violates a constraint we are
 * about to add, ALTER TABLE would fail with a generic 23514. We RAISE
 * EXCEPTION first with a row count and the violating column, so the
 * operator can see the gap and clean before re-running.
 *
 * Value sets sourced from the entity layer (not the Phase 0 ticket
 * example): work-item-association.entity.ts declares 4 link types, and
 * work-item.entity.ts declares 5 item types. The migration's CHECK
 * mirrors those exactly.
 */
export class RestoreCheckConstraints1716000025000
  implements MigrationInterface
{
  name = 'RestoreCheckConstraints1716000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Pre-flight audit ---------------------------------------------
    await queryRunner.query(`
      DO $$
      DECLARE
        bad_count integer;
      BEGIN
        SELECT count(*) INTO bad_count FROM work_item_associations
         WHERE link_type NOT IN ('belongs_to','relates_to','blocks','caused_by');
        IF bad_count > 0 THEN
          RAISE EXCEPTION 'T0.2 preflight: % rows in work_item_associations have an illegal link_type; clean before re-running', bad_count;
        END IF;

        SELECT count(*) INTO bad_count FROM work_item_associations
         WHERE item_id = linked_item_id;
        IF bad_count > 0 THEN
          RAISE EXCEPTION 'T0.2 preflight: % self-linking rows in work_item_associations; clean before re-running', bad_count;
        END IF;

        SELECT count(*) INTO bad_count FROM work_items
         WHERE item_type NOT IN ('epic','story','task','bug','subtask');
        IF bad_count > 0 THEN
          RAISE EXCEPTION 'T0.2 preflight: % rows in work_items have an illegal item_type; clean before re-running', bad_count;
        END IF;
      END $$;
    `);

    // --- Restore constraints (idempotent per constraint) --------------
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_link_type') THEN
          ALTER TABLE work_item_associations
            ADD CONSTRAINT chk_link_type
            CHECK (link_type IN ('belongs_to','relates_to','blocks','caused_by'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_no_self_link') THEN
          ALTER TABLE work_item_associations
            ADD CONSTRAINT chk_no_self_link
            CHECK (item_id <> linked_item_id);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_item_type') THEN
          ALTER TABLE work_items
            ADD CONSTRAINT chk_item_type
            CHECK (item_type IN ('epic','story','task','bug','subtask'));
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE work_items DROP CONSTRAINT IF EXISTS chk_item_type`);
    await queryRunner.query(
      `ALTER TABLE work_item_associations DROP CONSTRAINT IF EXISTS chk_no_self_link`,
    );
    await queryRunner.query(
      `ALTER TABLE work_item_associations DROP CONSTRAINT IF EXISTS chk_link_type`,
    );
  }
}
