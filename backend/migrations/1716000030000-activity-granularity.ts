import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 — activity granularity index.
 *
 * The granular activity writer (Phase 2 backend) writes one row per
 * changed field on `WorkItemsService.update` (priority, assignee,
 * sprint, end_date, story_points, title, status). The Today page's
 * activity rail and the per-item history view filter by both user and
 * field — composite `(user_id, field_changed)` makes that lookup an
 * index-only scan instead of a heap walk.
 *
 * No schema change beyond the index. The writer-side work (per-field
 * row emission) ships in the same phase but doesn't need DDL.
 */
export class ActivityGranularity1716000030000 implements MigrationInterface {
  name = 'ActivityGranularity1716000030000';
  // CREATE INDEX CONCURRENTLY must run outside a transaction; consistent
  // with the rest of the Phase 0 index work.
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_activity_user_field" ON "activity_logs" ("user_id", "field_changed")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_activity_user_field"`,
    );
  }
}
