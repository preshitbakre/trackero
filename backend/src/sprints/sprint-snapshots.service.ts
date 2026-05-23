import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Phase 5 — Snapshot writer + reader for sprint burndown.
 *
 * Writes one `sprint_daily_snapshots` row per active sprint per day. Reads
 * power burndown so the chart is reproducible (replaying scope_changes
 * against a mutating work_items table was always racy).
 *
 * @Cron at 00:05 UTC daily, guarded by pg_try_advisory_lock(991003) so
 * only one instance writes if the app is horizontally scaled.
 *
 * On-read fallback: if today's snapshot is missing (cron skipped or this
 * is the first request after activation), materializeSnapshot is invoked
 * inline so the burndown never returns a 500 or a gap.
 */
@Injectable()
export class SprintSnapshotsService {
  private readonly logger = new Logger(SprintSnapshotsService.name);
  private static readonly LOCK_KEY = 991003;

  constructor(private readonly dataSource: DataSource) {}

  @Cron('5 0 * * *', { name: 'sprint-daily-snapshots' })
  async runDaily(): Promise<void> {
    const lockRow = await this.dataSource.query(
      `SELECT pg_try_advisory_lock($1) AS got`,
      [SprintSnapshotsService.LOCK_KEY],
    );
    if (!lockRow?.[0]?.got) {
      this.logger.debug('Another instance holds the snapshot lock; skipping.');
      return;
    }
    try {
      const activeSprints = await this.dataSource.query(
        `SELECT id FROM sprints WHERE status = 'active'`,
      );
      for (const row of activeSprints) {
        await this.materializeSnapshot(row.id);
      }
      this.logger.log(`Wrote snapshots for ${activeSprints.length} active sprints.`);
    } catch (err) {
      this.logger.error(`Snapshot cron failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      await this.dataSource.query(`SELECT pg_advisory_unlock($1)`, [SprintSnapshotsService.LOCK_KEY]);
    }
  }

  /**
   * Compute today's snapshot for a single sprint and upsert it. Idempotent:
   * re-running on the same UTC date is a no-op via the UQ constraint.
   * Date column is anchored to UTC so the cron's idea of "today" lines up
   * regardless of the DB session timezone.
   */
  async materializeSnapshot(sprintId: number): Promise<void> {
    // Aggregate the current state of the sprint into one upsert. The
    // computation lives in the SQL so we never read+write across a
    // transaction boundary that a parallel mutation could slip through.
    await this.dataSource.query(
      `
      WITH totals AS (
        SELECT
          COALESCE(SUM(COALESCE(wi.story_points, 0)), 0)::int AS total_points,
          COALESCE(SUM(CASE WHEN ps.category = 'done'
                            THEN COALESCE(wi.story_points, 0) ELSE 0 END), 0)::int AS completed_points,
          COALESCE(SUM(CASE WHEN ps.category = 'in_progress'
                            THEN COALESCE(wi.story_points, 0) ELSE 0 END), 0)::int AS in_progress_points
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = $1
      ),
      counts AS (
        SELECT COALESCE(
          jsonb_object_agg(ps.name, c.cnt) FILTER (WHERE ps.name IS NOT NULL),
          '{}'::jsonb
        ) AS item_counts_by_status
        FROM (
          SELECT status_id, COUNT(*)::int AS cnt
          FROM work_items
          WHERE sprint_id = $1
          GROUP BY status_id
        ) c
        JOIN project_statuses ps ON ps.id = c.status_id
      ),
      scope AS (
        SELECT
          COALESCE(SUM(CASE WHEN action = 'added'   THEN COALESCE(story_points, 0) ELSE 0 END), 0)::int AS added,
          COALESCE(SUM(CASE WHEN action = 'removed' THEN COALESCE(story_points, 0) ELSE 0 END), 0)::int AS removed
        FROM sprint_scope_changes
        WHERE sprint_id = $1
          AND created_at >= ((CURRENT_DATE AT TIME ZONE 'UTC')::date)
          AND created_at <  ((CURRENT_DATE AT TIME ZONE 'UTC')::date + INTERVAL '1 day')
      )
      INSERT INTO sprint_daily_snapshots (
        sprint_id, snapshot_date,
        total_points, completed_points, in_progress_points,
        scope_added_points, scope_removed_points,
        item_counts_by_status
      )
      SELECT
        $1,
        (CURRENT_DATE AT TIME ZONE 'UTC')::date,
        totals.total_points,
        totals.completed_points,
        totals.in_progress_points,
        scope.added,
        scope.removed,
        counts.item_counts_by_status
      FROM totals, counts, scope
      ON CONFLICT (sprint_id, snapshot_date) DO UPDATE SET
        total_points = EXCLUDED.total_points,
        completed_points = EXCLUDED.completed_points,
        in_progress_points = EXCLUDED.in_progress_points,
        scope_added_points = EXCLUDED.scope_added_points,
        scope_removed_points = EXCLUDED.scope_removed_points,
        item_counts_by_status = EXCLUDED.item_counts_by_status
      `,
      [sprintId],
    );
  }

  /**
   * Read snapshots for a sprint. If today's row is missing, materialize
   * it inline so the chart's last point is always current.
   */
  async readSnapshots(sprintId: number): Promise<
    Array<{
      snapshotDate: string;
      totalPoints: number;
      completedPoints: number;
      inProgressPoints: number;
      scopeAddedPoints: number;
      scopeRemovedPoints: number;
    }>
  > {
    const todays = await this.dataSource.query(
      `SELECT 1 FROM sprint_daily_snapshots
       WHERE sprint_id = $1
         AND snapshot_date = (CURRENT_DATE AT TIME ZONE 'UTC')::date
       LIMIT 1`,
      [sprintId],
    );
    if (todays.length === 0) {
      await this.materializeSnapshot(sprintId);
    }

    const rows = await this.dataSource.query(
      `SELECT
         snapshot_date::text AS "snapshotDate",
         total_points AS "totalPoints",
         completed_points AS "completedPoints",
         in_progress_points AS "inProgressPoints",
         scope_added_points AS "scopeAddedPoints",
         scope_removed_points AS "scopeRemovedPoints"
       FROM sprint_daily_snapshots
       WHERE sprint_id = $1
       ORDER BY snapshot_date ASC`,
      [sprintId],
    );
    return rows;
  }
}
