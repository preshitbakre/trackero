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
      LEFT JOIN tasks t ON t.sprint_id = s.id AND t.parent_id IS NULL
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.project_id = $1 AND s.status = 'completed'
      GROUP BY s.id, s.name, s.sprint_number
      ORDER BY s.sprint_number DESC
      LIMIT 10
    `, [projectId]);

    return data.reverse(); // Oldest first for chart display
  }

  async getCumulativeFlow(projectId: number) {
    // Tasks by status category over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const data = await this.dataSource.query(`
      SELECT
        d::date as date,
        (SELECT COUNT(*) FROM tasks t JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.project_id = $1 AND t.parent_id IS NULL AND ps.category = 'backlog' AND t.created_at <= d + interval '1 day')::int as backlog,
        (SELECT COUNT(*) FROM tasks t JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.project_id = $1 AND t.parent_id IS NULL AND ps.category = 'todo' AND t.created_at <= d + interval '1 day')::int as todo,
        (SELECT COUNT(*) FROM tasks t JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.project_id = $1 AND t.parent_id IS NULL AND ps.category = 'in_progress' AND t.created_at <= d + interval '1 day')::int as in_progress,
        (SELECT COUNT(*) FROM tasks t JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.project_id = $1 AND t.parent_id IS NULL AND ps.category = 'in_review' AND t.created_at <= d + interval '1 day')::int as in_review,
        (SELECT COUNT(*) FROM tasks t JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.project_id = $1 AND t.parent_id IS NULL AND ps.category = 'done' AND t.created_at <= d + interval '1 day')::int as done
      FROM generate_series($2::date, CURRENT_DATE, '1 day') d
    `, [projectId, thirtyDaysAgo.toISOString().split('T')[0]]);

    return data;
  }
}
