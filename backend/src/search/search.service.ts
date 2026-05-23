import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Phase 4 — sectioned search powering the rebuilt ⌘K palette.
 *
 * Returns six rails:
 *   - workItems: existing full-text search, capped at 8
 *   - projects:  trigram similarity on name (membership-scoped), capped at 4
 *   - sprints:   substring on sprint.name within user's projects, capped at 4
 *   - people:    trigram similarity on display_name + email, capped at 4
 *   - quickActions: deterministic, derived from the query
 *   - goTo:      navigation entries that prefix-match the query
 *
 * `scope=current` (default when projectId set) narrows workItems/sprints to
 * that project; `scope=instance` searches everywhere the caller can see.
 * Admins ignore membership filters across the board.
 *
 * The v=1 query param is honoured by the controller and returns the legacy
 * flat shape; this service always returns the sectioned shape.
 */

export interface SearchedWorkItem {
  id: number;
  itemType: string;
  itemKey: string;
  title: string;
  status: { name: string; color: string };
  projectId: number;
  projectName: string;
  assignee: { id: number; displayName: string } | null;
  relevanceScore: number;
}

export interface SearchedProject {
  id: number;
  name: string;
  prefix: string;
  similarity: number;
}

export interface SearchedSprint {
  id: number;
  name: string;
  sprintNumber: number;
  projectId: number;
  projectName: string;
  status: string;
}

export interface SearchedPerson {
  id: number;
  displayName: string;
  email: string;
  similarity: number;
}

export interface QuickAction {
  id: string;
  kind: 'new_bug' | 'new_task' | 'new_story' | 'new_epic';
  label: string;
  payload: { itemType: string; title: string };
}

export interface GoToEntry {
  id: string;
  label: string;
  path: string;
}

export interface SectionedSearchResponse {
  workItems: SearchedWorkItem[];
  projects: SearchedProject[];
  sprints: SearchedSprint[];
  people: SearchedPerson[];
  quickActions: QuickAction[];
  goTo: GoToEntry[];
  total: number;
}

export interface LegacySearchResponse {
  list: SearchedWorkItem[];
  total: number;
}

const GO_TO_REGISTRY: ReadonlyArray<{ keywords: string[]; label: string; path: string }> = [
  { keywords: ['board', 'kanban'], label: 'Go to current project Board', path: '/projects/:current/board' },
  { keywords: ['backlog'], label: 'Go to current project Backlog', path: '/projects/:current/backlog' },
  { keywords: ['sprints', 'sprint list'], label: 'Go to current project Sprints', path: '/projects/:current/sprints' },
  { keywords: ['epics'], label: 'Go to current project Epics', path: '/projects/:current/epics' },
  { keywords: ['stories'], label: 'Go to current project Stories', path: '/projects/:current/stories' },
  { keywords: ['charts', 'burndown', 'cumulative'], label: 'Go to current project Charts', path: '/projects/:current/charts' },
  { keywords: ['settings'], label: 'Go to current project Settings', path: '/projects/:current/settings' },
  { keywords: ['today', 'home'], label: 'Go to Today', path: '/today' },
  { keywords: ['projects', 'directory', 'browse'], label: 'Browse all projects', path: '/projects' },
  { keywords: ['profile'], label: 'Go to your Profile', path: '/profile' },
];

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  /** Legacy flat-shape search — kept for ?v=1 back-compat (one release). */
  async searchLegacy(
    query: string,
    userId: number,
    userRole: string,
    projectId?: number,
  ): Promise<LegacySearchResponse> {
    const sectioned = await this.search(query, userId, userRole, projectId, 'current');
    return { list: sectioned.workItems, total: sectioned.workItems.length };
  }

  async search(
    query: string,
    userId: number,
    userRole: string,
    projectId?: number,
    scope: 'current' | 'instance' = 'current',
  ): Promise<SectionedSearchResponse> {
    const q = (query ?? '').trim();
    if (q.length < 2) {
      return { workItems: [], projects: [], sprints: [], people: [], quickActions: [], goTo: [], total: 0 };
    }

    const useProjectScope = scope === 'current' && projectId != null;
    const isAdmin = userRole === 'admin';

    const [workItems, projects, sprints, people] = await Promise.all([
      this.searchWorkItems(q, userId, isAdmin, useProjectScope ? projectId! : undefined),
      this.searchProjects(q, userId, isAdmin),
      this.searchSprints(q, userId, isAdmin, useProjectScope ? projectId! : undefined),
      this.searchPeople(q, userId, isAdmin),
    ]);

    const quickActions = this.buildQuickActions(q);
    const goTo = this.buildGoTo(q, projectId);

    return {
      workItems,
      projects,
      sprints,
      people,
      quickActions,
      goTo,
      total: workItems.length + projects.length + sprints.length + people.length,
    };
  }

  private async searchWorkItems(
    q: string,
    userId: number,
    isAdmin: boolean,
    projectId: number | undefined,
  ): Promise<SearchedWorkItem[]> {
    const whereProject = projectId ? 'AND t.project_id = $PROJ' : '';
    const whereMembership = isAdmin
      ? ''
      : 'AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $USER)';

    let sql = `
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
        ${whereProject}
        ${whereMembership}
      ORDER BY "relevanceScore" DESC
      LIMIT 8
    `;
    const params: any[] = [q];
    if (projectId) {
      params.push(projectId);
      sql = sql.replace('$PROJ', `$${params.length}`);
    }
    if (!isAdmin) {
      params.push(userId);
      sql = sql.replace('$USER', `$${params.length}`);
    }

    const rows = await this.dataSource.query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      itemType: r.item_type,
      itemKey: `${r.prefix}-${r.item_number}`,
      title: r.title,
      status: { name: r.statusName, color: r.statusColor },
      projectId: r.projectId,
      projectName: r.projectName,
      assignee: r.assigneeId ? { id: r.assigneeId, displayName: r.assigneeDisplayName } : null,
      relevanceScore: parseFloat(r.relevanceScore),
    }));
  }

  private async searchProjects(
    q: string,
    userId: number,
    isAdmin: boolean,
  ): Promise<SearchedProject[]> {
    // Trigram similarity threshold of 0.2 — generous enough to catch
    // "back" → "Backstage" but tight enough to filter unrelated noise.
    const membership = isAdmin
      ? ''
      : 'AND p.id IN (SELECT project_id FROM project_members WHERE user_id = $2)';

    const sql = `
      SELECT p.id, p.name, p.prefix,
        GREATEST(similarity(p.name, $1), similarity(p.prefix, $1)) AS sim
      FROM projects p
      WHERE p.status = 'active'
        AND (p.name % $1 OR p.prefix % $1 OR p.name ILIKE '%' || $1 || '%')
        ${membership}
      ORDER BY sim DESC, p.name ASC
      LIMIT 4
    `;
    const params: any[] = isAdmin ? [q] : [q, userId];
    const rows = await this.dataSource.query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      similarity: parseFloat(r.sim),
    }));
  }

  private async searchSprints(
    q: string,
    userId: number,
    isAdmin: boolean,
    projectId: number | undefined,
  ): Promise<SearchedSprint[]> {
    const whereProject = projectId ? 'AND s.project_id = $PROJ' : '';
    const whereMembership = isAdmin
      ? ''
      : 'AND s.project_id IN (SELECT project_id FROM project_members WHERE user_id = $USER)';

    let sql = `
      SELECT s.id, s.name, s.sprint_number AS "sprintNumber", s.status,
        s.project_id AS "projectId", p.name AS "projectName"
      FROM sprints s
      JOIN projects p ON p.id = s.project_id
      WHERE s.name ILIKE '%' || $1 || '%'
        ${whereProject}
        ${whereMembership}
      ORDER BY s.status = 'active' DESC, s.sprint_number DESC
      LIMIT 4
    `;
    const params: any[] = [q];
    if (projectId) {
      params.push(projectId);
      sql = sql.replace('$PROJ', `$${params.length}`);
    }
    if (!isAdmin) {
      params.push(userId);
      sql = sql.replace('$USER', `$${params.length}`);
    }
    const rows = await this.dataSource.query(sql, params);
    return rows;
  }

  private async searchPeople(q: string, userId: number, isAdmin: boolean): Promise<SearchedPerson[]> {
    // Members see only people they share a project with; admins see everyone.
    const visibility = isAdmin
      ? 'TRUE'
      : `u.id IN (
           SELECT DISTINCT pm2.user_id FROM project_members pm2
           WHERE pm2.project_id IN (
             SELECT project_id FROM project_members WHERE user_id = $2
           )
         ) OR u.id = $2`;

    const sql = `
      SELECT u.id, u.display_name AS "displayName", u.email,
        GREATEST(similarity(u.display_name, $1), similarity(u.email, $1)) AS sim
      FROM users u
      WHERE (u.display_name % $1 OR u.email % $1
             OR u.display_name ILIKE '%' || $1 || '%'
             OR u.email ILIKE '%' || $1 || '%')
        AND (${visibility})
      ORDER BY sim DESC, u.display_name ASC
      LIMIT 4
    `;
    const params: any[] = isAdmin ? [q] : [q, userId];
    const rows = await this.dataSource.query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      displayName: r.displayName,
      email: r.email,
      similarity: parseFloat(r.sim),
    }));
  }

  private buildQuickActions(q: string): QuickAction[] {
    const lower = q.toLowerCase();
    const isNew = /^(new|add|create)\b/.test(lower);
    const stripped = q.replace(/^(new|add|create)\s+/i, '').trim();
    if (isNew && stripped.length > 0) {
      const typeMatch = stripped.match(/^(bug|task|story|epic)\b/i);
      const itemType = (typeMatch?.[1]?.toLowerCase() ?? 'task') as 'bug' | 'task' | 'story' | 'epic';
      const titleTail = stripped.replace(/^(bug|task|story|epic)\s*/i, '').trim() || stripped;
      return [
        {
          id: `new-${itemType}`,
          kind: `new_${itemType}` as QuickAction['kind'],
          label: `New ${itemType}: ${titleTail}`,
          payload: { itemType, title: titleTail },
        },
      ];
    }

    // Generic offer: if the query is short and looks like a topic, surface a
    // generic "New task: <query>" so users can ⌘K → type → Enter to capture.
    if (q.length >= 3 && !/^[A-Z0-9]+-\d+$/.test(q)) {
      return [
        {
          id: 'new-task',
          kind: 'new_task',
          label: `New task: ${q}`,
          payload: { itemType: 'task', title: q },
        },
      ];
    }

    return [];
  }

  private buildGoTo(q: string, projectId?: number): GoToEntry[] {
    const lower = q.toLowerCase();
    const out: GoToEntry[] = [];
    for (const entry of GO_TO_REGISTRY) {
      if (entry.keywords.some((k) => k.startsWith(lower) || lower.startsWith(k))) {
        let path = entry.path;
        if (path.includes(':current')) {
          if (!projectId) continue; // No current project — skip project-scoped goTo
          path = path.replace(':current', String(projectId));
        }
        out.push({ id: entry.path, label: entry.label, path });
      }
      if (out.length >= 4) break;
    }
    return out;
  }
}
