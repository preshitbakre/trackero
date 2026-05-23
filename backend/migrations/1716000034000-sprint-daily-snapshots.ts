import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 — sprint_daily_snapshots.
 *
 * Each active sprint gets one row per day, written by a cron at 00:05 UTC.
 * Burndown becomes reproducible — playing scope-change deltas against a
 * mutating work_items table was always racy; reading static snapshots is not.
 *
 * Unique (sprint_id, snapshot_date) is the cron idempotency key — re-running
 * the cron on the same day no-ops via ON CONFLICT DO NOTHING.
 *
 * item_counts_by_status carries a per-status count map so the chart can
 * render WIP / blocked / done bands without joining back to work_items.
 */
export class SprintDailySnapshots1716000034000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sprint_daily_snapshots (
        id BIGSERIAL PRIMARY KEY,
        sprint_id INTEGER NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        snapshot_date DATE NOT NULL,
        total_points INTEGER NOT NULL DEFAULT 0,
        completed_points INTEGER NOT NULL DEFAULT 0,
        in_progress_points INTEGER NOT NULL DEFAULT 0,
        scope_added_points INTEGER NOT NULL DEFAULT 0,
        scope_removed_points INTEGER NOT NULL DEFAULT 0,
        item_counts_by_status JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sprint_daily_snapshots_sprint_date"
      ON sprint_daily_snapshots (sprint_id, snapshot_date)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sprint_daily_snapshots_sprint_date"
      ON sprint_daily_snapshots (sprint_id, snapshot_date DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sprint_daily_snapshots`);
  }
}
