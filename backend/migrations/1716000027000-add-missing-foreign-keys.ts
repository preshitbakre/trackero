import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.4 — Add the eight foreign keys the audit found missing.
 *
 * Cascade policy follows Phase 0 DECISIONS.md:
 *   - User-attribution columns → ON DELETE SET NULL (audit row survives
 *     user deletion with attribution column nulled).
 *   - Project-owned data and work-item-attached data → ON DELETE CASCADE
 *     (deleting the parent removes the dependent rows).
 *
 * Three of the eight columns are currently declared NOT NULL in the
 * codebase but need a SET NULL FK target:
 *   - retrospectives.created_by
 *   - sprints.created_by
 * They are altered to nullable first. project_members.added_by and
 * projects.default_assignee_id are already nullable.
 *
 * Pre-flight: for every column the migration is about to constrain, we
 * count dangling references and resolve them according to the policy
 * (set to NULL for SET NULL FKs; DELETE the row for CASCADE FKs). This
 * is the only way the subsequent ADD CONSTRAINT can succeed on a DB
 * with legacy garbage. The counts go to RAISE NOTICE so the operator
 * sees the cleanup.
 *
 * Idempotency: each FK addition is wrapped in a
 * `DO $$ IF NOT EXISTS ... END $$` guard so the migration is safe to
 * re-run. FK #8 (sprint_scope_changes.work_item_id) was already added
 * by migration 12; the guard makes the relevant ADD a no-op there.
 *
 * Identifier case: constraint names are quoted everywhere because the
 * existing codebase uses quoted (case-preserved) names. Without quotes
 * Postgres folds identifiers to lowercase and the IF EXISTS / IF NOT
 * EXISTS checks against pg_constraint miss the existing constraint.
 */
export class AddMissingForeignKeys1716000027000
  implements MigrationInterface
{
  name = 'AddMissingForeignKeys1716000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Pre-flight ---------------------------------------------------

    // SET NULL columns: null out the dangling references.
    await queryRunner.query(`
      DO $$
      DECLARE bad integer;
      BEGIN
        SELECT count(*) INTO bad
          FROM projects p
          LEFT JOIN users u ON u.id = p.default_assignee_id
         WHERE p.default_assignee_id IS NOT NULL AND u.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: nulling % dangling projects.default_assignee_id', bad;
          UPDATE projects SET default_assignee_id = NULL
           WHERE default_assignee_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = projects.default_assignee_id);
        END IF;

        SELECT count(*) INTO bad
          FROM project_members m
          LEFT JOIN users u ON u.id = m.added_by
         WHERE m.added_by IS NOT NULL AND u.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: nulling % dangling project_members.added_by', bad;
          UPDATE project_members SET added_by = NULL
           WHERE added_by IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = project_members.added_by);
        END IF;
      END $$;
    `);

    // retrospectives.created_by + sprints.created_by — currently NOT NULL.
    // Make them nullable before the SET NULL FK and the dangling cleanup.
    await queryRunner.query(
      `ALTER TABLE "retrospectives" ALTER COLUMN "created_by" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sprints" ALTER COLUMN "created_by" DROP NOT NULL`,
    );

    await queryRunner.query(`
      DO $$
      DECLARE bad integer;
      BEGIN
        SELECT count(*) INTO bad FROM retrospectives r
          LEFT JOIN users u ON u.id = r.created_by
         WHERE r.created_by IS NOT NULL AND u.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: nulling % dangling retrospectives.created_by', bad;
          UPDATE retrospectives SET created_by = NULL
           WHERE created_by IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = retrospectives.created_by);
        END IF;

        SELECT count(*) INTO bad FROM sprints s
          LEFT JOIN users u ON u.id = s.created_by
         WHERE s.created_by IS NOT NULL AND u.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: nulling % dangling sprints.created_by', bad;
          UPDATE sprints SET created_by = NULL
           WHERE created_by IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = sprints.created_by);
        END IF;
      END $$;
    `);

    // CASCADE columns: delete the orphaned dependent rows.
    await queryRunner.query(`
      DO $$
      DECLARE bad integer;
      BEGIN
        SELECT count(*) INTO bad
          FROM activity_logs a
          LEFT JOIN work_items w ON w.id = a.work_item_id
         WHERE a.work_item_id IS NOT NULL AND w.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: deleting % orphaned activity_logs rows (work_item_id)', bad;
          DELETE FROM activity_logs
           WHERE work_item_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM work_items w WHERE w.id = activity_logs.work_item_id);
        END IF;

        SELECT count(*) INTO bad
          FROM notifications n
          LEFT JOIN projects p ON p.id = n.project_id
         WHERE n.project_id IS NOT NULL AND p.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: deleting % orphaned notifications rows (project_id)', bad;
          DELETE FROM notifications
           WHERE project_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = notifications.project_id);
        END IF;

        SELECT count(*) INTO bad
          FROM invitations i
          LEFT JOIN projects p ON p.id = i.project_id
         WHERE i.project_id IS NOT NULL AND p.id IS NULL;
        IF bad > 0 THEN
          RAISE NOTICE 'T0.4: deleting % orphaned invitations rows (project_id)', bad;
          DELETE FROM invitations
           WHERE project_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = invitations.project_id);
        END IF;
      END $$;
    `);

    // --- Add FKs ------------------------------------------------------

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_activity_work_item') THEN
          ALTER TABLE "activity_logs"
            ADD CONSTRAINT "FK_activity_work_item"
            FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_notif_project') THEN
          ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_notif_project"
            FOREIGN KEY ("project_id") REFERENCES "projects" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invitation_project') THEN
          ALTER TABLE "invitations"
            ADD CONSTRAINT "FK_invitation_project"
            FOREIGN KEY ("project_id") REFERENCES "projects" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_project_default_assignee') THEN
          ALTER TABLE "projects"
            ADD CONSTRAINT "FK_project_default_assignee"
            FOREIGN KEY ("default_assignee_id") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_retro_created_by') THEN
          ALTER TABLE "retrospectives"
            ADD CONSTRAINT "FK_retro_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_sprint_created_by') THEN
          ALTER TABLE "sprints"
            ADD CONSTRAINT "FK_sprint_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_project_member_added_by') THEN
          ALTER TABLE "project_members"
            ADD CONSTRAINT "FK_project_member_added_by"
            FOREIGN KEY ("added_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // sprint_scope_changes.work_item_id was already added by migration
    // 12 (FK_scope_work_item, CASCADE). The guard keeps this a no-op
    // there while still ensuring the FK exists on any drifted DB.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_scope_work_item') THEN
          ALTER TABLE "sprint_scope_changes"
            ADD CONSTRAINT "FK_scope_work_item"
            FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the 7 FKs introduced by this migration. FK_scope_work_item
    // is left in place because it pre-dates 027 (migration 12).
    const drops = [
      ['activity_logs', 'FK_activity_work_item'],
      ['notifications', 'FK_notif_project'],
      ['invitations', 'FK_invitation_project'],
      ['projects', 'FK_project_default_assignee'],
      ['retrospectives', 'FK_retro_created_by'],
      ['sprints', 'FK_sprint_created_by'],
      ['project_members', 'FK_project_member_added_by'],
    ];
    for (const [table, name] of drops) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    }

    // Restore NOT NULL on the columns this migration relaxed. Same
    // caveat as the T0.3 rollback — if the column already contains
    // null values, set them to 0 first so the ALTER doesn't reject.
    await queryRunner.query(
      `UPDATE "retrospectives" SET "created_by" = 0 WHERE "created_by" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "retrospectives" ALTER COLUMN "created_by" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "sprints" SET "created_by" = 0 WHERE "created_by" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sprints" ALTER COLUMN "created_by" SET NOT NULL`,
    );
  }
}
