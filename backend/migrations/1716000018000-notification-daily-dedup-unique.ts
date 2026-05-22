import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDailyDedupUnique1716000018000 implements MigrationInterface {
  name = 'NotificationDailyDedupUnique1716000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique expression index: enforce at most one cron-generated
    // notification per (user, type, reference) per calendar day.
    //
    // The daily notifications cron (NotificationsCron.handleDailyNotifications)
    // creates sprint_ending / task_due_soon / task_overdue rows. Its old dedup
    // was findOne-then-save — a check-then-act race: two overlapping runs (or
    // two horizontally-scaled instances) could both miss the existing row and
    // both insert. This index is the DB backstop; the cron now does
    // INSERT ... ON CONFLICT DO NOTHING so the loser is silently skipped.
    //
    // The WHERE clause is essential: it scopes the constraint to ONLY the three
    // cron notification types. Event-driven notifications (task_assigned,
    // comment_added, etc.) legitimately produce same-day duplicates for the
    // same (user, type, reference_id) — e.g. assign -> unassign -> reassign a
    // task, or multiple comments on the same work item in one day — and must
    // NOT be blocked. The (created_at AT TIME ZONE 'UTC')::date expression —
    // which synchronize cannot build — pins the day boundary to UTC: the bare
    // created_at::date cast is only STABLE (it depends on the session TimeZone)
    // and Postgres rejects STABLE functions in an index expression. This index
    // also lives in app.module.ts onModuleInit DDL to keep the e2e test DB
    // (built by synchronize) consistent with prod.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notif_daily_dedup"
      ON "notifications" ("user_id", "type", "reference_id", (("created_at" AT TIME ZONE 'UTC')::date))
      WHERE "type" IN ('sprint_ending', 'task_due_soon', 'task_overdue')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_notif_daily_dedup"`);
  }
}
