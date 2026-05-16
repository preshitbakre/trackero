import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(query: string, userId: number, userRole: string, projectId?: number) {
    if (!query || query.length < 2) {
      return { list: [], total: 0 };
    }

    let projectFilter = '';
    const params: any[] = [query];

    if (projectId) {
      params.push(projectId);
      projectFilter = `AND t.project_id = $${params.length}`;
    } else if (userRole !== 'admin') {
      // Scope to user's projects
      params.push(userId);
      projectFilter = `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $${params.length})`;
    }

    const results = await this.dataSource.query(`
      SELECT t.id, t.task_number, t.title, t.project_id as "projectId",
        ps.name as "statusName", ps.color as "statusColor",
        p.name as "projectName", p.prefix,
        ts_rank(t.search_vector, plainto_tsquery('english', $1)) as "relevanceScore"
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.search_vector @@ plainto_tsquery('english', $1)
        AND t.parent_id IS NULL
        AND p.status = 'active'
        ${projectFilter}
      ORDER BY "relevanceScore" DESC
      LIMIT 20
    `, params);

    return {
      list: results.map((r: any) => ({
        id: r.id,
        taskKey: `${r.prefix}-${r.task_number}`,
        title: r.title,
        status: { name: r.statusName, color: r.statusColor },
        projectId: r.projectId,
        projectName: r.projectName,
        relevanceScore: parseFloat(r.relevanceScore),
      })),
      total: results.length,
    };
  }
}
