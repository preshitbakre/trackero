import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Phase 5 — Per-assignee sprint capacity (frame 8).
 *
 * Capacity heuristic = `(sprint days / 14) * sprintAverageVelocity` rounded.
 * sprintAverageVelocity = the average completed_points of the project's
 * last 3 *completed* sprints, falling back to 8 (default for a 2-week
 * sprint at a relaxed default load) when the project has no history yet.
 *
 * Returns per-assignee committed points (sum of assigned items in the
 * sprint), each user's computed capacity, and an isOver flag.
 *
 * The roadmap (§Phase 9) will replace the constant fallback with a
 * per-project setting; the algorithm slot stays the same.
 */

const DEFAULT_VELOCITY_PER_2_WEEKS = 8;

export interface CapacityPayload {
  totalPoints: number;
  totalCommitted: number;
  totalRemaining: number;
  perAssignee: Array<{
    userId: number;
    displayName: string;
    committed: number;
    capacity: number;
    isOver: boolean;
  }>;
}

@Injectable()
export class SprintCapacityService {
  constructor(private readonly dataSource: DataSource) {}

  async getCapacity(projectId: number, sprintId: number): Promise<CapacityPayload> {
    const sprintRows = await this.dataSource.query(
      `SELECT id, project_id, start_date, end_date
       FROM sprints
       WHERE id = $1 AND project_id = $2`,
      [sprintId, projectId],
    );
    if (sprintRows.length === 0) {
      return { totalPoints: 0, totalCommitted: 0, totalRemaining: 0, perAssignee: [] };
    }
    const sprint = sprintRows[0];

    // Sprint length in days (inclusive of end date). Fall back to 14 when
    // dates are missing (planning phase before they're set).
    const sprintDays =
      sprint.start_date && sprint.end_date
        ? Math.max(
            1,
            Math.ceil(
              (new Date(sprint.end_date).getTime() - new Date(sprint.start_date).getTime()) /
                86400000,
            ) + 1,
          )
        : 14;

    // Project velocity: average completed_points of the last 3 completed sprints.
    const velocityRows = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(COALESCE(wi.story_points, 0)), 0)::int AS done_points
      FROM sprints s
      LEFT JOIN work_items wi
        ON wi.sprint_id = s.id
       AND wi.completed_at IS NOT NULL
      WHERE s.project_id = $1
        AND s.status = 'completed'
      GROUP BY s.id, s.completed_at
      ORDER BY s.completed_at DESC NULLS LAST
      LIMIT 3
      `,
      [projectId],
    );
    const projectVelocity =
      velocityRows.length > 0
        ? Math.round(
            velocityRows.reduce((sum: number, r: any) => sum + r.done_points, 0) /
              velocityRows.length,
          )
        : DEFAULT_VELOCITY_PER_2_WEEKS;

    // Per-assignee committed sum.
    const perAssigneeRows = await this.dataSource.query(
      `
      SELECT
        wi.assignee_id AS "userId",
        u.display_name AS "displayName",
        COALESCE(SUM(COALESCE(wi.story_points, 0)), 0)::int AS committed
      FROM work_items wi
      JOIN users u ON u.id = wi.assignee_id
      WHERE wi.sprint_id = $1 AND wi.assignee_id IS NOT NULL
      GROUP BY wi.assignee_id, u.display_name
      ORDER BY committed DESC, u.display_name ASC
      `,
      [sprintId],
    );

    // Capacity slice per assignee, scaled by sprint length.
    const perAssigneeCapacity = Math.max(
      1,
      Math.round((sprintDays / 14) * projectVelocity),
    );

    const perAssignee = perAssigneeRows.map((r: any) => ({
      userId: r.userId,
      displayName: r.displayName,
      committed: r.committed,
      capacity: perAssigneeCapacity,
      isOver: r.committed > perAssigneeCapacity,
    }));

    const totalsRow = await this.dataSource.query(
      `
      SELECT
        COALESCE(SUM(COALESCE(story_points, 0)), 0)::int AS total_points,
        COALESCE(SUM(CASE WHEN ps.category = 'done'
                           THEN COALESCE(wi.story_points, 0) ELSE 0 END), 0)::int AS done_points
      FROM work_items wi
      JOIN project_statuses ps ON ps.id = wi.status_id
      WHERE wi.sprint_id = $1
      `,
      [sprintId],
    );
    const totalPoints = totalsRow[0]?.total_points ?? 0;
    const donePoints = totalsRow[0]?.done_points ?? 0;
    const totalCommitted = totalPoints;
    const totalRemaining = Math.max(0, totalPoints - donePoints);

    return { totalPoints, totalCommitted, totalRemaining, perAssignee };
  }
}
