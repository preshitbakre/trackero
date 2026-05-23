import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.3 — Switch FK_assoc_created_by from ON DELETE RESTRICT to
 * ON DELETE SET NULL and make work_item_associations.created_by
 * nullable.
 *
 * Background: migration 22 first added the FK with RESTRICT semantics —
 * the audit trail won by blocking user deletion. Phase 0 DECISIONS.md
 * inverts that trade-off: every user-attribution column (`created_by`,
 * `added_by`, etc.) goes ON DELETE SET NULL so the audit row survives a
 * user deletion with the attribution column nulled. The new rule is
 * consistent across user-attribution FKs added in T0.4 (`retrospectives.
 * created_by`, `sprints.created_by`, `project_members.added_by`,
 * `projects.default_assignee_id`).
 *
 * Steps:
 *   1. Drop the existing FK_assoc_created_by (RESTRICT).
 *   2. Make `created_by` nullable so the new FK has a target column it
 *      can write NULL into.
 *   3. Re-add FK_assoc_created_by with ON DELETE SET NULL ON UPDATE CASCADE.
 *
 * Idempotency: drop-if-exists + add-only-if-missing guards. The drop
 * step uses IF EXISTS; the add step uses pg_constraint lookup. The
 * ALTER COLUMN nullability change is implicitly idempotent (PG no-ops
 * if the column is already nullable).
 */
export class AssocCreatedBySetNull1716000026000
  implements MigrationInterface
{
  name = 'AssocCreatedBySetNull1716000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the RESTRICT FK if present. Migration 22 created the
    // constraint with a quoted identifier (case-preserved as
    // `FK_assoc_created_by`); the unquoted form would be lowercased to
    // `fk_assoc_created_by` and miss the existing constraint, so we
    // keep the double quotes throughout.
    await queryRunner.query(
      `ALTER TABLE "work_item_associations" DROP CONSTRAINT IF EXISTS "FK_assoc_created_by"`,
    );

    // Permit NULL on created_by so the SET NULL FK has somewhere to
    // write when the referenced user is deleted.
    await queryRunner.query(
      `ALTER TABLE "work_item_associations" ALTER COLUMN "created_by" DROP NOT NULL`,
    );

    // Re-add the FK with the new policy.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_assoc_created_by') THEN
          ALTER TABLE "work_item_associations"
            ADD CONSTRAINT "FK_assoc_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_item_associations" DROP CONSTRAINT IF EXISTS "FK_assoc_created_by"`,
    );
    // Restore NOT NULL only when no row has the column null; otherwise
    // PG would reject the ALTER. The defensive UPDATE is intentionally
    // a no-op in fresh-DB rollbacks.
    await queryRunner.query(
      `UPDATE "work_item_associations" SET "created_by" = 0 WHERE "created_by" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_item_associations" ALTER COLUMN "created_by" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "work_item_associations"
        ADD CONSTRAINT "FK_assoc_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);
  }
}
