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
}
