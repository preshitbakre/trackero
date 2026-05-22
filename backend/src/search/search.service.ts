import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(query: string, userId: number, userRole: string, projectId?: number) {
    if (!query || query.length < 2) {
      return { list: [], total: 0 };
    }

    let sql: string;
    let params: any[];

    if (projectId) {
      // Non-admins may only search a projectId they belong to: intersect the
      // caller-supplied projectId with their memberships so a foreign projectId
      // yields zero results. Admins keep unrestricted access to any project.
      const membershipClause =
        userRole !== 'admin'
          ? 'AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $3)'
          : '';
      sql = `
        SELECT t.id, t.item_number, t.item_type, t.title, t.project_id as "projectId",
          ps.name as "statusName", ps.color as "statusColor",
          p.name as "projectName", p.prefix,
          assignee.id as "assigneeId", assignee.display_name as "assigneeDisplayName",
          ts_rank(t.search_vector, plainto_tsquery('english', $1)) as "relevanceScore"
        FROM work_items t
        JOIN projects p ON p.id = t.project_id
        JOIN project_statuses ps ON ps.id = t.status_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE t.search_vector @@ plainto_tsquery('english', $1)
          AND t.item_type IN ('epic', 'story', 'task', 'bug', 'subtask')
          AND p.status = 'active'
          AND t.project_id = $2
          ${membershipClause}
        ORDER BY "relevanceScore" DESC
        LIMIT 20
      `;
      params = userRole !== 'admin' ? [query, projectId, userId] : [query, projectId];
    } else if (userRole !== 'admin') {
      sql = `
        SELECT t.id, t.item_number, t.item_type, t.title, t.project_id as "projectId",
          ps.name as "statusName", ps.color as "statusColor",
          p.name as "projectName", p.prefix,
          assignee.id as "assigneeId", assignee.display_name as "assigneeDisplayName",
          ts_rank(t.search_vector, plainto_tsquery('english', $1)) as "relevanceScore"
        FROM work_items t
        JOIN projects p ON p.id = t.project_id
        JOIN project_statuses ps ON ps.id = t.status_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE t.search_vector @@ plainto_tsquery('english', $1)
          AND t.item_type IN ('epic', 'story', 'task', 'bug', 'subtask')
          AND p.status = 'active'
          AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $2)
        ORDER BY "relevanceScore" DESC
        LIMIT 20
      `;
      params = [query, userId];
    } else {
      sql = `
        SELECT t.id, t.item_number, t.item_type, t.title, t.project_id as "projectId",
          ps.name as "statusName", ps.color as "statusColor",
          p.name as "projectName", p.prefix,
          assignee.id as "assigneeId", assignee.display_name as "assigneeDisplayName",
          ts_rank(t.search_vector, plainto_tsquery('english', $1)) as "relevanceScore"
        FROM work_items t
        JOIN projects p ON p.id = t.project_id
        JOIN project_statuses ps ON ps.id = t.status_id
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE t.search_vector @@ plainto_tsquery('english', $1)
          AND t.item_type IN ('epic', 'story', 'task', 'bug', 'subtask')
          AND p.status = 'active'
        ORDER BY "relevanceScore" DESC
        LIMIT 20
      `;
      params = [query];
    }

    const results = await this.dataSource.query(sql, params);

    return {
      list: results.map((r: any) => ({
        id: r.id,
        itemType: r.item_type,
        taskKey: `${r.prefix}-${r.item_number}`,
        title: r.title,
        status: { name: r.statusName, color: r.statusColor },
        projectId: r.projectId,
        projectName: r.projectName,
        assignee: r.assigneeId ? { id: r.assigneeId, displayName: r.assigneeDisplayName } : null,
        relevanceScore: parseFloat(r.relevanceScore),
      })),
      total: results.length,
    };
  }
}
