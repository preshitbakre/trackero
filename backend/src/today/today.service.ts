import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PresenceService } from '../presence/presence.service';

interface UserRef {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
}

export interface TodayPayload {
  greeting: {
    name: string;
    partOfDay: 'morning' | 'afternoon' | 'evening';
    localDate: string;
    localTime: string;
  };
  summary: {
    reviewCardCount: number;
    blockingBugCount: number;
    blockingBugItemKey: string | null;
    pointsDone: number | null;
    pointsTotal: number | null;
    pace: 'ahead' | 'on pace' | 'behind' | null;
  };
  triage: Array<{
    id: number;
    itemKey: string;
    itemType: string;
    title: string;
    points: number | null;
    lastTouchedAt: string;
    assignee: UserRef | null;
    priorityTier: 'p0' | 'p1' | 'p2' | 'p3';
    reasonChips: string[];
  }>;
  reviewing: Array<{
    id: number;
    itemKey: string;
    title: string;
    reviewerOf: 'reporter' | 'watcher';
    author: UserRef;
    lastTouchedAt: string;
  }>;
  dueSoon: Array<{
    id: number;
    itemKey: string;
    title: string;
    dueAt: string;
    dueInDays: number;
    sprintId: number | null;
  }>;
  dueSoonTotalAssigned: number;
  currentSprint: {
    id: number;
    projectId: number;
    projectName: string;
    name: string;
    goal: string | null;
    dayOf: number;
    length: number;
    pointsDone: number;
    pointsTotal: number;
    pointsInProgress: number;
    pointsBlocked: number;
    pointsAwaitingReview: number;
    endDate: string;
    burndown: Array<{ day: string; completed: number; ideal: number; scope: number }>;
  } | null;
  presence: {
    count: number;
    users: Array<{
      id: number;
      displayName: string;
      avatarUrl: string | null;
      initials: string;
      activity: 'editing' | 'viewing' | 'commenting' | 'idle';
      location: { itemId: number | null; itemKey: string | null; page: string };
      lastSeenAt: string;
    }>;
  };
  activity: Array<{
    id: number;
    ts: string;
    actor: UserRef;
    verb: string;
    item: { id: number; itemKey: string; title: string } | null;
    prep: string;
    sentence: string;
  }>;
}

const HOUR_BUCKETS = (hour: number): TodayPayload['greeting']['partOfDay'] =>
  hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

const initialsFor = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/);
  if (!parts.length || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
};

/**
 * Today aggregator (Phase 2). One endpoint, server-side composition.
 *
 * Section services live inline because the responses are small SQL
 * queries; folding them into private methods keeps the module tight
 * for v1. Phase 5 swaps the live burndown computation for snapshot
 * reads; Phase 7 tightens reviewing once `reviewer_id` ships; Phase
 * 3 adds the pinned-project signal currently absent from the
 * single-active-sprint fallback.
 */
@Injectable()
export class TodayService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presence: PresenceService,
  ) {}

  async getToday(
    userId: number,
    opts: { projectId?: number; timezone?: string },
  ): Promise<TodayPayload> {
    const [user] = await this.dataSource.query(
      `SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl" FROM users WHERE id = $1`,
      [userId],
    );
    const firstName = (user?.displayName ?? '').split(/\s+/)[0] || 'there';

    const tz = opts.timezone || 'UTC';
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const greeting: TodayPayload['greeting'] = {
      name: firstName,
      partOfDay: HOUR_BUCKETS(local.getHours()),
      localDate: local.toISOString().slice(0, 10),
      localTime: local.toTimeString().slice(0, 5),
    };

    const memberProjectIds = await this.userProjects(userId, opts.projectId);
    if (memberProjectIds.length === 0) {
      return {
        greeting,
        summary: { reviewCardCount: 0, blockingBugCount: 0, blockingBugItemKey: null, pointsDone: null, pointsTotal: null, pace: null },
        triage: [],
        reviewing: [],
        dueSoon: [],
        dueSoonTotalAssigned: 0,
        currentSprint: null,
        presence: { count: 0, users: [] },
        activity: [],
      };
    }

    const [triage, reviewing, dueSoon, dueSoonTotal, currentSprint, activity] = await Promise.all([
      this.triageTop3(userId, memberProjectIds),
      this.reviewingFor(userId, memberProjectIds),
      this.dueSoonFor(userId, memberProjectIds),
      this.dueSoonTotal(userId, memberProjectIds),
      this.currentSprintFor(memberProjectIds, opts.projectId),
      this.activityFeed(memberProjectIds),
    ]);

    const blockingBug = triage.find((t: TodayPayload['triage'][number]) =>
      t.priorityTier === 'p0' && t.itemType === 'bug',
    ) ?? null;
    const summary = this.summaryFor(reviewing.length, blockingBug, currentSprint);
    const presence = opts.projectId
      ? this.snapshotPresence(opts.projectId)
      : { count: 0, users: [] };

    return {
      greeting,
      summary,
      triage,
      reviewing,
      dueSoon,
      dueSoonTotalAssigned: dueSoonTotal,
      currentSprint,
      presence,
      activity,
    };
  }

  // ---- section helpers -------------------------------------------------

  private async userProjects(userId: number, scopeProjectId?: number): Promise<number[]> {
    if (scopeProjectId) return [scopeProjectId];
    const rows = await this.dataSource.query(
      `SELECT project_id AS id FROM project_members WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r: { id: number }) => r.id);
  }

  private async triageTop3(userId: number, projectIds: number[]) {
    if (projectIds.length === 0) return [];
    // Single SQL union with priority-tier ordering. The ranker:
    //   p0: bugs assigned to user with high/urgent priority, not done
    //        + items with an outgoing `blocks` association where the target is open
    //   p1: items assigned to user with end_date <= today + 2d (not done)
    //   p2: items in_progress assigned to user (not done)
    //   p3: anything else assigned to user (not done)
    const rows = await this.dataSource.query(
      `WITH assigned AS (
         SELECT wi.id, wi.item_number, wi.item_type, wi.title, wi.story_points,
                wi.assignee_id, wi.priority, wi.end_date, wi.updated_at,
                wi.project_id, p.prefix,
                ps.category AS status_category,
                EXISTS (
                  SELECT 1 FROM work_item_associations a
                   JOIN work_items wi2 ON wi2.id = a.linked_item_id
                   JOIN project_statuses ps2 ON ps2.id = wi2.status_id
                  WHERE a.item_id = wi.id AND a.link_type = 'blocks'
                    AND ps2.category != 'done'
                ) AS has_open_blocker,
                u.display_name AS assignee_name, u.avatar_url AS assignee_avatar
         FROM work_items wi
         JOIN projects p ON p.id = wi.project_id
         JOIN project_statuses ps ON ps.id = wi.status_id
         LEFT JOIN users u ON u.id = wi.assignee_id
         WHERE wi.assignee_id = $1
           AND wi.project_id = ANY($2::int[])
           AND ps.category != 'done'
       )
       SELECT *, CASE
         WHEN item_type = 'bug' AND priority IN ('high','urgent') THEN 'p0'
         WHEN has_open_blocker THEN 'p0'
         WHEN end_date IS NOT NULL AND end_date <= (CURRENT_DATE + INTERVAL '2 days') THEN 'p1'
         WHEN status_category = 'in_progress' THEN 'p2'
         ELSE 'p3'
       END AS tier
       FROM assigned
       ORDER BY CASE
         WHEN item_type = 'bug' AND priority IN ('high','urgent') THEN 0
         WHEN has_open_blocker THEN 1
         WHEN end_date IS NOT NULL AND end_date <= (CURRENT_DATE + INTERVAL '2 days') THEN 2
         WHEN status_category = 'in_progress' THEN 3
         ELSE 4
       END, updated_at DESC
       LIMIT 3`,
      [userId, projectIds],
    );
    return rows.map((r: any) => ({
      id: r.id,
      itemKey: `${r.prefix}-${r.item_number}`,
      itemType: r.item_type,
      title: r.title,
      points: r.story_points ?? null,
      lastTouchedAt: r.updated_at,
      assignee: r.assignee_id
        ? {
            id: r.assignee_id,
            displayName: r.assignee_name ?? '',
            avatarUrl: r.assignee_avatar ?? null,
            initials: initialsFor(r.assignee_name ?? ''),
          }
        : null,
      priorityTier: r.tier as 'p0' | 'p1' | 'p2' | 'p3',
      reasonChips: this.reasonsFor(r),
    }));
  }

  private reasonsFor(row: any): string[] {
    const chips: string[] = [];
    if (row.item_type === 'bug') chips.push('bug');
    if (row.has_open_blocker) chips.push('blocking work');
    if (row.priority === 'urgent') chips.push('urgent');
    else if (row.priority === 'high') chips.push('high priority');
    if (row.end_date) {
      const due = new Date(row.end_date);
      const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      if (days <= 0) chips.push('overdue');
      else if (days <= 2) chips.push(`due in ${days}d`);
    }
    if (row.status_category === 'in_progress') chips.push('in progress');
    return chips;
  }

  private async reviewingFor(userId: number, projectIds: number[]) {
    // Back-compat (pre-Phase 7): the caller is "reviewing" an item if
    // they're the reporter or watcher and the item is in an in_review-
    // category status. Phase 7 adds a dedicated reviewer_id column +
    // tightens this query to filter on it.
    const rows = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.updated_at,
              p.prefix, u.id AS author_id, u.display_name AS author_name,
              u.avatar_url AS author_avatar
         FROM work_items wi
         JOIN projects p ON p.id = wi.project_id
         JOIN project_statuses ps ON ps.id = wi.status_id
         LEFT JOIN users u ON u.id = wi.reporter_id
        WHERE wi.project_id = ANY($1::int[])
          AND ps.category = 'in_review'
          AND wi.reporter_id = $2
          AND (wi.assignee_id IS NULL OR wi.assignee_id != $2)
        ORDER BY wi.updated_at DESC
        LIMIT 5`,
      [projectIds, userId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      itemKey: `${r.prefix}-${r.item_number}`,
      title: r.title,
      reviewerOf: 'reporter' as const,
      author: {
        id: r.author_id,
        displayName: r.author_name ?? '',
        avatarUrl: r.author_avatar ?? null,
        initials: initialsFor(r.author_name ?? ''),
      },
      lastTouchedAt: r.updated_at,
    }));
  }

  private async dueSoonFor(userId: number, projectIds: number[]) {
    const rows = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.end_date, wi.sprint_id, p.prefix
         FROM work_items wi
         JOIN projects p ON p.id = wi.project_id
         JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.assignee_id = $1
          AND wi.project_id = ANY($2::int[])
          AND ps.category != 'done'
          AND wi.end_date IS NOT NULL
          AND wi.end_date <= (CURRENT_DATE + INTERVAL '7 days')
        ORDER BY wi.end_date ASC
        LIMIT 5`,
      [userId, projectIds],
    );
    return rows.map((r: any) => {
      const due = new Date(r.end_date);
      const dueInDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      return {
        id: r.id,
        itemKey: `${r.prefix}-${r.item_number}`,
        title: r.title,
        dueAt: r.end_date,
        dueInDays,
        sprintId: r.sprint_id ?? null,
      };
    });
  }

  private async dueSoonTotal(userId: number, projectIds: number[]): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int AS c
         FROM work_items wi
         JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.assignee_id = $1
          AND wi.project_id = ANY($2::int[])
          AND ps.category != 'done'`,
      [userId, projectIds],
    );
    return row?.c ?? 0;
  }

  private async currentSprintFor(
    projectIds: number[],
    scopeProjectId?: number,
  ): Promise<TodayPayload['currentSprint']> {
    // Without a pinned-project signal (Phase 3) we either honor the
    // explicit ?projectId or fall back to "single active sprint
    // across everything the caller can see". Multiple active sprints
    // → null (the UI shows a 'pick a sprint' placeholder).
    const where = scopeProjectId
      ? 's.project_id = $1'
      : 's.project_id = ANY($1::int[])';
    const param = scopeProjectId ? [scopeProjectId] : [projectIds];
    const rows = await this.dataSource.query(
      `SELECT s.id, s.project_id, s.name, s.goal, s.start_date, s.end_date,
              p.name AS project_name
         FROM sprints s
         JOIN projects p ON p.id = s.project_id
        WHERE ${where} AND s.status = 'active'
        ORDER BY s.id DESC
        LIMIT 2`,
      param,
    );
    if (rows.length !== 1) return null;
    const sprint = rows[0];
    const sprintId = sprint.id;
    // Live point totals for the rail. Phase 5 swaps to snapshot reads.
    const [pts] = await this.dataSource.query(
      `SELECT
         coalesce(sum(wi.story_points), 0)::int AS total,
         coalesce(sum(CASE WHEN ps.category = 'done' THEN wi.story_points ELSE 0 END), 0)::int AS done,
         coalesce(sum(CASE WHEN ps.category = 'in_progress' THEN wi.story_points ELSE 0 END), 0)::int AS in_progress
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = $1`,
      [sprintId],
    );
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const lengthDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
    const dayOf = Math.max(0, Math.min(lengthDays, Math.ceil((Date.now() - start.getTime()) / 86_400_000)));

    // Burndown — Phase 5 snapshot read. Each row is one day's
    // total_points/completed_points pair; `ideal` is the straight-line
    // descent from total → 0 across the sprint's length, so the sparkline
    // has both an "as planned" and an "actual" track to compare.
    const snapshots = await this.dataSource.query(
      `SELECT snapshot_date::text AS day, total_points AS scope, completed_points AS completed
         FROM sprint_daily_snapshots
        WHERE sprint_id = $1
        ORDER BY snapshot_date ASC`,
      [sprintId],
    );
    const burndown = snapshots.map((row: { day: string; scope: number; completed: number }, i: number) => ({
      day: row.day,
      scope: row.scope,
      completed: row.completed,
      ideal: Math.max(0, Math.round(row.scope * (1 - (i / Math.max(1, lengthDays - 1))))),
    }));

    return {
      id: sprint.id,
      projectId: sprint.project_id,
      projectName: sprint.project_name,
      name: sprint.name,
      goal: sprint.goal ?? null,
      dayOf,
      length: lengthDays,
      pointsDone: pts.done,
      pointsTotal: pts.total,
      pointsInProgress: pts.in_progress,
      pointsBlocked: 0,
      pointsAwaitingReview: 0,
      endDate: sprint.end_date,
      burndown,
    };
  }

  private async activityFeed(projectIds: number[]) {
    if (projectIds.length === 0) return [];
    const rows = await this.dataSource.query(
      `SELECT a.id, a.created_at AS ts, a.action, a.field_changed,
              a.old_value, a.new_value,
              u.id AS actor_id, u.display_name AS actor_name, u.avatar_url AS actor_avatar,
              wi.id AS item_id, wi.item_number, wi.title, p.prefix
         FROM activity_logs a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN work_items wi ON wi.id = a.work_item_id
         LEFT JOIN projects p ON p.id = wi.project_id
        WHERE a.project_id = ANY($1::int[])
        ORDER BY a.created_at DESC
        LIMIT 10`,
      [projectIds],
    );
    return rows.map((r: any) => {
      const actor = {
        id: r.actor_id,
        displayName: r.actor_name ?? '',
        avatarUrl: r.actor_avatar ?? null,
        initials: initialsFor(r.actor_name ?? ''),
      };
      const item = r.item_id
        ? { id: r.item_id, itemKey: `${r.prefix}-${r.item_number}`, title: r.title }
        : null;
      const { verb, prep, sentence } = this.renderActivity(r, item);
      return { id: r.id, ts: r.ts, actor, verb, item, prep, sentence };
    });
  }

  private renderActivity(
    row: any,
    item: { itemKey: string } | null,
  ): { verb: string; prep: string; sentence: string } {
    const key = item?.itemKey ?? '';
    if (row.action === 'created') return { verb: 'created', prep: '', sentence: `created ${key}` };
    if (row.action === 'deleted') return { verb: 'deleted', prep: '', sentence: `deleted ${key}` };
    if (row.action === 'comment_added') return { verb: 'commented on', prep: 'on', sentence: `commented on ${key}` };
    if (row.action === 'sprint_started') return { verb: 'started', prep: '', sentence: 'started a sprint' };
    if (row.action === 'sprint_completed') return { verb: 'completed', prep: '', sentence: 'completed a sprint' };
    if (row.action === 'sprint_cancelled') return { verb: 'cancelled', prep: '', sentence: 'cancelled a sprint' };
    if (row.action === 'updated' && row.field_changed) {
      const field = row.field_changed;
      switch (field) {
        case 'status':
          return { verb: 'moved', prep: 'to', sentence: `moved ${key}` };
        case 'priority':
          return { verb: 'changed priority of', prep: 'to', sentence: `set ${key} priority to ${row.new_value}` };
        case 'assignee':
          return { verb: 'reassigned', prep: '', sentence: `reassigned ${key}` };
        case 'story_points':
          return { verb: 'estimated', prep: 'at', sentence: `estimated ${key} at ${row.new_value} pts` };
        case 'end_date':
          return { verb: 'updated due date for', prep: '', sentence: `set ${key} due ${row.new_value}` };
        case 'sprint':
          return { verb: 'moved sprint of', prep: '', sentence: `moved ${key} between sprints` };
        case 'title':
          return { verb: 'renamed', prep: 'to', sentence: `renamed ${key}` };
        default:
          return { verb: 'updated', prep: '', sentence: `updated ${key} (${field})` };
      }
    }
    return { verb: 'updated', prep: '', sentence: `updated ${key}` };
  }

  private snapshotPresence(projectId: number): TodayPayload['presence'] {
    const entries = this.presence.getProjectPresence(projectId);
    // The Today right rail caps at 5 users, sorted recency-first.
    const top = entries.slice(0, 5);
    return {
      count: entries.length,
      users: top.map((e) => ({
        id: e.userId,
        displayName: '',
        avatarUrl: null,
        initials: '?',
        activity: (e.context?.action as any) ?? 'idle',
        location: {
          itemId: e.context?.workItemId ?? null,
          itemKey: null,
          page: e.context?.route ?? 'other',
        },
        lastSeenAt: e.lastSeenAt,
      })),
    };
  }

  private summaryFor(
    reviewCount: number,
    blockingBug: TodayPayload['triage'][number] | null,
    sprint: TodayPayload['currentSprint'],
  ): TodayPayload['summary'] {
    let pace: 'ahead' | 'on pace' | 'behind' | null = null;
    if (sprint) {
      const expected = sprint.length > 0 ? (sprint.pointsTotal * sprint.dayOf) / sprint.length : 0;
      const actual = sprint.pointsDone;
      const delta = expected > 0 ? actual - expected : 0;
      pace = delta >= sprint.pointsTotal * 0.1
        ? 'ahead'
        : delta <= -sprint.pointsTotal * 0.1
        ? 'behind'
        : 'on pace';
    }
    return {
      reviewCardCount: reviewCount,
      blockingBugCount: blockingBug ? 1 : 0,
      blockingBugItemKey: blockingBug?.itemKey ?? null,
      pointsDone: sprint?.pointsDone ?? null,
      pointsTotal: sprint?.pointsTotal ?? null,
      pace,
    };
  }
}
