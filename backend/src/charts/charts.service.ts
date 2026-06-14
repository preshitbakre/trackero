import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ChartsService {
  constructor(private readonly dataSource: DataSource) {}

  async getVelocity(projectId: number) {
    // Last 10 completed sprints with sum of completed task points
    const data = await this.dataSource.query(`
      SELECT s.id, s.name, s.sprint_number,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int as completed_points
      FROM sprints s
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.project_id = $1 AND s.status = 'completed'
      GROUP BY s.id, s.name, s.sprint_number
      ORDER BY s.sprint_number DESC
      LIMIT 10
    `, [projectId]);

    return data.reverse(); // Oldest first for chart display
  }

  async getCumulativeFlow(projectId: number) {
    // Derive the 30-day window from Postgres CURRENT_DATE so the node process
    // timezone can't drift the window off the `date` semantics already used
    // on the right-hand side of generate_series.
    const data = await this.dataSource.query(`
      SELECT
        d.date::text as date,
        COALESCE(SUM(CASE WHEN ps.category = 'backlog' THEN 1 ELSE 0 END), 0)::int as backlog,
        COALESCE(SUM(CASE WHEN ps.category = 'in_progress' THEN 1 ELSE 0 END), 0)::int as in_progress,
        COALESCE(SUM(CASE WHEN ps.category = 'done' THEN 1 ELSE 0 END), 0)::int as done
      FROM generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, '1 day') AS d(date)
      LEFT JOIN LATERAL (
        SELECT t.id,
          COALESCE(
            (SELECT CAST(al.new_value AS INTEGER)
             FROM activity_logs al
             WHERE al.work_item_id = t.id
               AND al.field_changed = 'status'
               AND al.created_at <= d.date + INTERVAL '1 day'
             ORDER BY al.created_at DESC LIMIT 1),
            t.status_id
          ) as effective_status_id
        FROM work_items t
        WHERE t.project_id = $1
          AND t.item_type IN ('task')
          AND t.created_at <= d.date + INTERVAL '1 day'
      ) task_on_date ON true
      LEFT JOIN project_statuses ps ON ps.id = task_on_date.effective_status_id
      GROUP BY d.date
      ORDER BY d.date
    `, [projectId]);

    return data;
  }

  async getThroughput(projectId: number) {
    // Weekly counts of tasks that transitioned INTO a done-category status,
    // over the last 12 ISO weeks. Each completed item is counted once per week.
    const data = await this.dataSource.query(`
      SELECT date_trunc('week', al.created_at)::date AS week,
             COUNT(DISTINCT al.work_item_id)::int AS count
      FROM activity_logs al
      JOIN work_items wi ON wi.id = al.work_item_id AND wi.item_type IN ('task') AND wi.project_id = $1
      JOIN project_statuses ps
        ON al.field_changed = 'status'
        AND ps.id = CASE WHEN al.new_value ~ '^[0-9]+$' THEN al.new_value::int ELSE NULL END
      WHERE al.project_id = $1
        AND al.field_changed = 'status'
        AND ps.category = 'done'
        AND al.created_at >= (CURRENT_DATE - INTERVAL '12 weeks')
      GROUP BY date_trunc('week', al.created_at)
      ORDER BY week ASC
    `, [projectId]);

    return data;
  }

  async getCycleTime(projectId: number) {
    // Weekly average cycle time (in days) of tasks that COMPLETED in the last
    // 12 ISO weeks, bucketed by the week they entered a done-category status.
    // Cycle time = (first done-category transition) - (first in_progress-category
    // transition, or the item's created_at when it never had an in_progress step).
    // All activity_logs->status_id casts are guarded against non-numeric
    // new_value rows (legacy/migrated data) to avoid `invalid input syntax for
    // integer` 500s — same hardening as getThroughput.
    const data = await this.dataSource.query(`
      WITH done_transitions AS (
        -- First done-category transition per item, in the last 12 weeks.
        SELECT al.work_item_id,
               MIN(al.created_at) AS done_time
        FROM activity_logs al
        JOIN work_items wi ON wi.id = al.work_item_id AND wi.item_type IN ('task') AND wi.project_id = $1
        JOIN project_statuses ps
          ON al.field_changed = 'status'
          AND ps.id = CASE WHEN al.new_value ~ '^[0-9]+$' THEN al.new_value::int ELSE NULL END
        WHERE al.project_id = $1
          AND al.field_changed = 'status'
          AND ps.category = 'done'
          AND al.created_at >= (CURRENT_DATE - INTERVAL '12 weeks')
        GROUP BY al.work_item_id
      ),
      start_transitions AS (
        -- First in_progress-category transition per item.
        SELECT al.work_item_id,
               MIN(al.created_at) AS in_progress_time
        FROM activity_logs al
        JOIN project_statuses ps
          ON al.field_changed = 'status'
          AND ps.id = CASE WHEN al.new_value ~ '^[0-9]+$' THEN al.new_value::int ELSE NULL END
        WHERE al.project_id = $1
          AND al.field_changed = 'status'
          AND ps.category = 'in_progress'
        GROUP BY al.work_item_id
      ),
      per_item AS (
        SELECT dt.work_item_id,
               dt.done_time,
               COALESCE(st.in_progress_time, wi.created_at) AS start_time
        FROM done_transitions dt
        JOIN work_items wi ON wi.id = dt.work_item_id
        LEFT JOIN start_transitions st ON st.work_item_id = dt.work_item_id
      )
      SELECT date_trunc('week', done_time)::date AS week,
             ROUND(AVG(EXTRACT(EPOCH FROM (done_time - start_time)) / 86400)::numeric, 2) AS "avgCycleTimeDays",
             COUNT(*)::int AS count
      FROM per_item
      GROUP BY date_trunc('week', done_time)
      ORDER BY week ASC
    `, [projectId]);

    return data.map((row: { week: string; avgCycleTimeDays: string; count: number }) => ({
      week: row.week,
      avgCycleTimeDays: Number(row.avgCycleTimeDays),
      count: row.count,
    }));
  }
}
