import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.5 — Add 15 missing indexes for FK columns + drop the duplicate
 * IDX_retro_sprint.
 *
 * Every column carrying an FK should be indexed; otherwise the
 * cascading DELETE / UPDATE from the parent table sequentially scans
 * the child. The audit identified the gaps; this migration fills them.
 *
 * Concurrency: `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY`
 * cannot run inside a transaction. We set `transaction = false` on the
 * class so each statement runs in its own implicit transaction. Every
 * CREATE uses `IF NOT EXISTS` so the migration is fully re-runnable; a
 * partially-applied run leaves a consistent intermediate state and the
 * re-run picks up where it stopped.
 *
 * IDX_attachment_work_item is not in the list because migration 12
 * already created it under that exact name.
 *
 * IDX_retro_sprint is dropped because it overlaps the FK-implied
 * REL_… index on retrospectives.sprint_id — two btrees on one column
 * doubles write cost without query benefit.
 */
export class AddMissingFkIndexes1716000028000
  implements MigrationInterface
{
  name = 'AddMissingFkIndexes1716000028000';
  // CREATE INDEX CONCURRENTLY cannot run in a transaction. TypeORM
  // honors this opt-out by running each statement outside the
  // wrapping transaction.
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const stmts: ReadonlyArray<string> = [
      // activity_logs
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_activity_logs_work_item_id" ON "activity_logs" ("work_item_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_activity_logs_user_id" ON "activity_logs" ("user_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_activity_logs_project_created" ON "activity_logs" ("project_id", "created_at" DESC)`,

      // notifications
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_project_id" ON "notifications" ("project_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_user_unread" ON "notifications" ("user_id", "read_at") WHERE "read_at" IS NULL`,

      // invitations
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_invitations_project_id" ON "invitations" ("project_id")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_invitations_invited_by" ON "invitations" ("invited_by")`,

      // projects
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_projects_default_assignee" ON "projects" ("default_assignee_id")`,

      // retrospectives, sprints, project_members
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_retro_created_by" ON "retrospectives" ("created_by")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprints_created_by" ON "sprints" ("created_by")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_members_added_by" ON "project_members" ("added_by")`,

      // sprint_scope_changes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_scope_changes_work_item" ON "sprint_scope_changes" ("work_item_id")`,

      // comments
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comments_work_item_created" ON "comments" ("work_item_id", "created_at" DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comments_author" ON "comments" ("author_id")`,

      // attachments — work_item_id already exists from migration 12;
      // only uploaded_by remains.
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attachments_uploaded_by" ON "attachments" ("uploaded_by")`,

      // Drop the duplicate retro_sprint index. The FK-implied unique
      // index on the same column survives.
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_retro_sprint"`,
    ];

    for (const sql of stmts) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const stmts: ReadonlyArray<string> = [
      // Restore the duplicate index (defensive; if PG already has the
      // FK-implied REL_…, the explicit one is harmless next to it).
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "IDX_retro_sprint" ON "retrospectives" ("sprint_id")`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_attachments_uploaded_by"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_comments_author"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_comments_work_item_created"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_sprint_scope_changes_work_item"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_project_members_added_by"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_sprints_created_by"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_retro_created_by"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_projects_default_assignee"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_invitations_invited_by"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_invitations_project_id"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_notifications_user_unread"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_notifications_project_id"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_activity_logs_project_created"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_activity_logs_user_id"`,
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_activity_logs_work_item_id"`,
    ];
    for (const sql of stmts) {
      await queryRunner.query(sql);
    }
  }
}
