import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';

export type ProjectStatusKind =
  | 'archived'
  | 'planning'
  | 'no_sprint'
  | 'ends_today'
  | 'ends_in_days'
  | 'idle'
  | 'on_track';

export interface DirectoryProjectCard {
  id: number;
  name: string;
  prefix: string;
  memberCount: number;
  role: 'admin' | 'project_manager' | 'member' | 'viewer' | null;
  activeSprint: { id: number; name: string; sprintNumber: number; totalPoints: number; completedPoints: number } | null;
  status: ProjectStatusKind;
  statusMeta: { daysRemaining?: number; idleDays?: number };
  lastActivityAt: string | null;
  archivedAt: string | null;
  isPinned: boolean;
}

export interface DirectoryPayload {
  counts: { active: number; planning: number; archived: number; all: number };
  projects: DirectoryProjectCard[];
}

/**
 * Phase 3 — directory aggregator + pin/visit CRUD.
 *
 * The status field is inferred per project from the sprint state +
 * archive flag + last_activity_at. The Phase 5 burndown work later
 * tightens `at_risk` once snapshot data is reliable.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly dataSource: DataSource) {}

  // ---- directory listing -----------------------------------------------

  async list(
    userId: number,
    globalRole: string,
    opts: { filter?: string; search?: string; mineOnly?: boolean },
  ): Promise<DirectoryPayload> {
    const isAdmin = globalRole === 'admin';
    const showAll = isAdmin && !opts.mineOnly;

    // Single-pass query joining projects + active sprint + counts + role + pinning.
    const rows = await this.dataSource.query(
      `WITH
         user_membership AS (
           SELECT project_id, role FROM project_members WHERE user_id = $1
         ),
         visible AS (
           SELECT p.id FROM projects p
           ${showAll ? '' : 'JOIN user_membership um ON um.project_id = p.id'}
         ),
         member_counts AS (
           SELECT project_id, count(*)::int AS c
             FROM project_members
            GROUP BY project_id
         ),
         active_sprint AS (
           SELECT DISTINCT ON (project_id) project_id, id, name, sprint_number, start_date, end_date
             FROM sprints
            WHERE status = 'active'
            ORDER BY project_id, id DESC
         ),
         planning_sprint AS (
           SELECT DISTINCT ON (project_id) project_id, id
             FROM sprints
            WHERE status = 'planning'
            ORDER BY project_id, id DESC
         ),
         sprint_points AS (
           SELECT wi.sprint_id,
                  coalesce(sum(wi.story_points), 0)::int AS total,
                  coalesce(sum(CASE WHEN ps.category = 'done' THEN wi.story_points ELSE 0 END), 0)::int AS done
             FROM work_items wi
             JOIN project_statuses ps ON ps.id = wi.status_id
            WHERE wi.sprint_id IS NOT NULL
            GROUP BY wi.sprint_id
         ),
         pinned AS (
           SELECT project_id FROM pinned_projects WHERE user_id = $1
         )
       SELECT p.id, p.name, p.prefix,
              p.last_activity_at, p.archived_at, p.status AS db_status,
              coalesce(mc.c, 0) AS member_count,
              um.role AS user_role,
              acs.id AS active_sprint_id, acs.name AS active_sprint_name,
              acs.sprint_number AS active_sprint_number,
              acs.start_date AS active_sprint_start, acs.end_date AS active_sprint_end,
              coalesce(sp.total, 0) AS sprint_total_points,
              coalesce(sp.done, 0) AS sprint_done_points,
              pls.id AS planning_sprint_id,
              (pn.project_id IS NOT NULL) AS is_pinned
         FROM projects p
         JOIN visible v ON v.id = p.id
         LEFT JOIN user_membership um ON um.project_id = p.id
         LEFT JOIN member_counts mc ON mc.project_id = p.id
         LEFT JOIN active_sprint acs ON acs.project_id = p.id
         LEFT JOIN planning_sprint pls ON pls.project_id = p.id
         LEFT JOIN sprint_points sp ON sp.sprint_id = acs.id
         LEFT JOIN pinned pn ON pn.project_id = p.id
        ORDER BY (pn.project_id IS NOT NULL) DESC,
                 p.last_activity_at DESC NULLS LAST,
                 p.id DESC`,
      [userId],
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cards: DirectoryProjectCard[] = rows.map((r: any) => {
      const archivedAt: string | null = r.archived_at ?? null;
      let status: ProjectStatusKind = 'on_track';
      const statusMeta: DirectoryProjectCard['statusMeta'] = {};

      if (archivedAt) {
        status = 'archived';
      } else if (r.active_sprint_id) {
        const end = r.active_sprint_end ? new Date(r.active_sprint_end) : null;
        if (end) {
          const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
          if (days <= 0) status = 'ends_today';
          else if (days <= 5) {
            status = 'ends_in_days';
            statusMeta.daysRemaining = days;
          }
        }
      } else if (r.planning_sprint_id) {
        status = 'planning';
      } else {
        status = 'no_sprint';
      }

      if (!archivedAt && r.last_activity_at) {
        const idleDays = Math.floor(
          (Date.now() - new Date(r.last_activity_at).getTime()) / 86_400_000,
        );
        if (idleDays > 14 && status === 'no_sprint') {
          status = 'idle';
          statusMeta.idleDays = idleDays;
        }
      }

      return {
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        memberCount: r.member_count,
        role: r.user_role ?? (isAdmin ? null : null),
        activeSprint: r.active_sprint_id
          ? {
              id: r.active_sprint_id,
              name: r.active_sprint_name,
              sprintNumber: r.active_sprint_number,
              totalPoints: r.sprint_total_points,
              completedPoints: r.sprint_done_points,
            }
          : null,
        status,
        statusMeta,
        lastActivityAt: r.last_activity_at,
        archivedAt,
        isPinned: r.is_pinned,
      };
    });

    const filtered = this.applyFilter(cards, opts.filter, opts.search);
    const counts = {
      active: cards.filter((c) => c.status !== 'archived' && c.status !== 'planning').length,
      planning: cards.filter((c) => c.status === 'planning').length,
      archived: cards.filter((c) => c.status === 'archived').length,
      all: cards.length,
    };
    return { counts, projects: filtered };
  }

  private applyFilter(
    cards: DirectoryProjectCard[],
    filter: string | undefined,
    search: string | undefined,
  ): DirectoryProjectCard[] {
    let out = cards;
    if (filter === 'active') {
      out = out.filter((c) => c.status !== 'archived' && c.status !== 'planning');
    } else if (filter === 'planning') {
      out = out.filter((c) => c.status === 'planning');
    } else if (filter === 'archived') {
      out = out.filter((c) => c.status === 'archived');
    }
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(
        (c) => c.name.toLowerCase().includes(q) || c.prefix.toLowerCase().includes(q),
      );
    }
    return out;
  }

  // ---- pinning ---------------------------------------------------------

  async listPinned(userId: number): Promise<number[]> {
    const rows = await this.dataSource.query(
      `SELECT project_id FROM pinned_projects WHERE user_id = $1 ORDER BY pinned_at DESC`,
      [userId],
    );
    return rows.map((r: { project_id: number }) => r.project_id);
  }

  async pin(userId: number, projectId: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO pinned_projects (user_id, project_id) VALUES ($1, $2)
       ON CONFLICT (user_id, project_id) DO NOTHING`,
      [userId, projectId],
    );
  }

  async unpin(userId: number, projectId: number): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM pinned_projects WHERE user_id = $1 AND project_id = $2`,
      [userId, projectId],
    );
  }

  // ---- visit tracking --------------------------------------------------

  async recordVisit(userId: number, projectId: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO project_visits (user_id, project_id, visited_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id, project_id) DO UPDATE SET visited_at = now()`,
      [userId, projectId],
    );
  }

  async recentForSidebar(
    userId: number,
    limit = 8,
  ): Promise<
    Array<{
      id: number;
      name: string;
      prefix: string;
      isPinned: boolean;
      role: string | null;
      activeSprint: { id: number; name: string; status: string; pointsDone: number; pointsTotal: number } | null;
      lastActivityAt: string | null;
    }>
  > {
    // One query joins project + membership role + pinned flag + the
    // single 'active' sprint (if any) + that sprint's points totals.
    // The switcher dropdown turns this into the design's sublines
    // ("BST · Sprint 27 · 14/38 pts", "OPS · No active sprint", etc.)
    // and the VIEWER badge for read-only memberships.
    const rows = await this.dataSource.query(
      `SELECT
         p.id, p.name, p.prefix,
         p.last_activity_at AS "lastActivityAt",
         pm.role,
         (pn.project_id IS NOT NULL) AS is_pinned,
         s.id           AS sprint_id,
         s.name         AS sprint_name,
         s.status       AS sprint_status,
         COALESCE(SUM(wi.story_points), 0)::int AS sprint_total,
         COALESCE(SUM(CASE WHEN ps.category = 'done' THEN wi.story_points ELSE 0 END), 0)::int AS sprint_done,
         MAX(pv.visited_at) AS last_visit
         FROM project_visits pv
         JOIN projects p ON p.id = pv.project_id
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = pv.user_id
         LEFT JOIN pinned_projects pn ON pn.user_id = pv.user_id AND pn.project_id = pv.project_id
         LEFT JOIN sprints s ON s.project_id = p.id AND s.status = 'active'
         LEFT JOIN work_items wi ON wi.sprint_id = s.id
         LEFT JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE pv.user_id = $1
        GROUP BY p.id, p.name, p.prefix, p.last_activity_at,
                 pm.role, pn.project_id,
                 s.id, s.name, s.status
        ORDER BY MAX(pv.visited_at) DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      isPinned: r.is_pinned,
      role: r.role ?? null,
      lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null,
      activeSprint: r.sprint_id
        ? {
            id: r.sprint_id,
            name: r.sprint_name,
            status: r.sprint_status,
            pointsDone: r.sprint_done,
            pointsTotal: r.sprint_total,
          }
        : null,
    }));
  }

  // ---- last_activity_at bump -------------------------------------------

  /**
   * Bumps projects.last_activity_at on every meaningful event. The
   * UPDATE debounces to once per 5 seconds per project so a hot
   * project doesn't thrash. Wrapped in try/catch so a missed bump
   * never blocks the originating event.
   */
  private async bumpLastActivity(projectId: number): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE projects
           SET last_activity_at = now()
         WHERE id = $1
           AND (last_activity_at IS NULL OR last_activity_at < now() - interval '5 seconds')`,
        [projectId],
      );
    } catch {
      // Ignore — directory just reads slightly stale last-activity.
    }
  }

  @OnEvent('work_item.created')
  onWorkItemCreated(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }

  @OnEvent('work_item.updated')
  onWorkItemUpdated(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }

  @OnEvent('comment.added')
  onCommentAdded(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }

  @OnEvent('board.moved')
  onBoardMoved(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }

  @OnEvent('sprint.started')
  onSprintStarted(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }

  @OnEvent('sprint.completed')
  onSprintCompleted(payload: { projectId: number }) {
    void this.bumpLastActivity(payload.projectId);
  }
}
