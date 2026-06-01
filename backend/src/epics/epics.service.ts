import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkItem } from '../work-items/entities/work-item.entity';
import { EpicMilestone } from './entities/epic-milestone.entity';
import { WorkItemsService } from '../work-items/work-items.service';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';

export type EpicDisplayState =
  | 'draft'
  | 'planning'
  | 'in_flight'
  | 'shipped'
  | 'blocked'
  | 'at_risk'
  | 'archived';

interface DescendantStats {
  progress: {
    totalItems: number;
    completedItems: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
  };
  childBreakdown: { stories: number; tasks: number; subtasks: number; bugs: number };
  childStatusBreakdown: { done: number; wip: number; open: number };
}

const EMPTY_STATS: DescendantStats = {
  progress: { totalItems: 0, completedItems: 0, totalPoints: 0, completedPoints: 0, progressPercent: 0 },
  childBreakdown: { stories: 0, tasks: 0, subtasks: 0, bugs: 0 },
  childStatusBreakdown: { done: 0, wip: 0, open: 0 },
};

@Injectable()
export class EpicsService {
  constructor(
    @InjectRepository(WorkItem)
    private readonly workItemRepo: Repository<WorkItem>,
    @InjectRepository(EpicMilestone)
    private readonly milestoneRepo: Repository<EpicMilestone>,
    private readonly dataSource: DataSource,
    private readonly workItemsService: WorkItemsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Load an epic in this project or throw NOT_FOUND. */
  private async requireEpic(projectId: number, epicId: number): Promise<WorkItem> {
    const epic = await this.workItemRepo.findOne({
      where: { id: epicId, projectId, itemType: 'epic' as any },
    });
    if (!epic || epic.deletedAt) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Epic not found');
    }
    return epic;
  }

  // ===========================================================================
  // Derivation helpers (pure — covered via e2e)
  // ===========================================================================

  /**
   * At risk = an in-flight epic with a target date that is past or within 7
   * days AND still has incomplete work.
   */
  isAtRisk(
    epic: { epicState: string; endDate: string | null },
    progressPercent: number,
    today: Date = new Date(),
  ): boolean {
    if (epic.epicState !== 'in_flight' || !epic.endDate) return false;
    if (progressPercent >= 100) return false;
    const end = new Date(epic.endDate);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 7);
    return end < today || end <= soon;
  }

  /** Resolve the pill value. Order: archived → blocked → at_risk → epic_state. */
  deriveDisplayState(
    epic: { epicState: string; endDate: string | null; archivedAt: Date | null },
    ctx: { hasOpenBlocker: boolean; progressPercent: number; today?: Date },
  ): EpicDisplayState {
    if (epic.archivedAt) return 'archived';
    if (ctx.hasOpenBlocker) return 'blocked';
    if (this.isAtRisk(epic, ctx.progressPercent, ctx.today)) return 'at_risk';
    return epic.epicState as EpicDisplayState;
  }

  /** @handle derived from the email local-part. */
  handleFor(email: string | null | undefined): string {
    return (email ?? '').split('@')[0] || '';
  }

  // ===========================================================================
  // Shared queries
  // ===========================================================================

  private async getProjectPrefix(projectId: number): Promise<string> {
    const [row] = await this.dataSource.query(`SELECT prefix FROM projects WHERE id = $1`, [projectId]);
    return row?.prefix ?? '';
  }

  /**
   * Recursive belongs_to descendant rollup for a batch of root ids. Ported from
   * WorkItemsService.computeDescendantStatsBatch so the Epics surface owns its
   * own read path (the source method is private + that file is volatile).
   */
  private async computeDescendantStatsBatch(rootIds: number[]): Promise<Map<number, DescendantStats>> {
    const map = new Map<number, DescendantStats>();
    if (rootIds.length === 0) return map;

    const rows = await this.dataSource.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT a.linked_item_id AS root_id, a.item_id AS id, wi.item_type, wi.status_id, wi.story_points, 1 AS depth
        FROM work_item_associations a
        JOIN work_items wi ON wi.id = a.item_id
        WHERE a.linked_item_id = ANY($1) AND a.link_type = 'belongs_to' AND wi.deleted_at IS NULL
        UNION ALL
        SELECT d.root_id, a2.item_id, wi2.item_type, wi2.status_id, wi2.story_points, d.depth + 1
        FROM work_item_associations a2
        JOIN work_items wi2 ON wi2.id = a2.item_id
        JOIN descendants d ON a2.linked_item_id = d.id
        WHERE a2.link_type = 'belongs_to' AND wi2.deleted_at IS NULL AND d.depth < 4
      )
      SELECT
        d.root_id AS root_id,
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE ps.category = 'done')::int AS completed_items,
        COALESCE(SUM(d.story_points), 0)::int AS total_points,
        COALESCE(SUM(d.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COUNT(*) FILTER (WHERE d.item_type = 'story')::int AS story_count,
        COUNT(*) FILTER (WHERE d.item_type = 'task')::int AS task_count,
        COUNT(*) FILTER (WHERE d.item_type = 'subtask')::int AS subtask_count,
        COUNT(*) FILTER (WHERE d.item_type = 'bug')::int AS bug_count,
        COUNT(*) FILTER (WHERE ps.category IN ('in_progress', 'in_review'))::int AS wip_count,
        COUNT(*) FILTER (WHERE ps.category = 'backlog')::int AS open_count
      FROM descendants d
      JOIN project_statuses ps ON ps.id = d.status_id
      GROUP BY d.root_id
    `,
      [rootIds],
    );

    for (const row of rows) {
      const totalItems = Number(row.total_items);
      const completedItems = Number(row.completed_items);
      map.set(Number(row.root_id), {
        progress: {
          totalItems,
          completedItems,
          totalPoints: Number(row.total_points),
          completedPoints: Number(row.completed_points),
          progressPercent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        },
        childBreakdown: {
          stories: Number(row.story_count),
          tasks: Number(row.task_count),
          subtasks: Number(row.subtask_count),
          bugs: Number(row.bug_count),
        },
        childStatusBreakdown: { done: completedItems, wip: Number(row.wip_count), open: Number(row.open_count) },
      });
    }
    return map;
  }

  /**
   * For a batch of epic ids, find the first OPEN blocker per epic — a
   * `blocks` association pointing AT the epic whose source item is not done.
   * Returns Map<epicId, { key, title, since }>.
   */
  private async findOpenBlockersBatch(
    epicIds: number[],
    prefix: string,
  ): Promise<Map<number, { key: string; title: string; since: Date; owner: string | null }>> {
    const map = new Map<number, { key: string; title: string; since: Date; owner: string | null }>();
    if (epicIds.length === 0) return map;

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT ON (a.linked_item_id)
        a.linked_item_id AS epic_id,
        src.item_number AS item_number,
        src.title AS title,
        a.created_at AS since,
        owner.email AS owner_email
      FROM work_item_associations a
      JOIN work_items src ON src.id = a.item_id
      JOIN project_statuses ps ON ps.id = src.status_id
      LEFT JOIN users owner ON owner.id = src.assignee_id
      WHERE a.linked_item_id = ANY($1)
        AND a.link_type = 'blocks'
        AND src.deleted_at IS NULL
        AND ps.category <> 'done'
      ORDER BY a.linked_item_id, a.created_at ASC
    `,
      [epicIds],
    );

    for (const row of rows) {
      map.set(Number(row.epic_id), {
        key: `${prefix}-${row.item_number}`,
        title: row.title,
        since: row.since,
        owner: row.owner_email ? this.handleFor(row.owner_email) : null,
      });
    }
    return map;
  }

  // ===========================================================================
  // Read: enriched list
  // ===========================================================================

  async listEpics(
    projectId: number,
    opts: { page?: number; limit?: number; status?: string; state?: string; includeArchived?: boolean },
  ) {
    const page = Math.max(1, opts.page || 1);
    const limit = clampLimit(opts.limit);
    const prefix = await this.getProjectPrefix(projectId);
    const today = new Date();

    const qb = this.workItemRepo
      .createQueryBuilder('wi')
      .leftJoinAndSelect('wi.status', 'status')
      .leftJoinAndSelect('wi.assignee', 'assignee')
      .leftJoinAndSelect('wi.sprint', 'sprint')
      .leftJoinAndSelect('wi.labels', 'labels')
      .where('wi.projectId = :projectId', { projectId })
      .andWhere("wi.itemType = 'epic'")
      .andWhere('wi.deletedAt IS NULL');

    if (!opts.includeArchived) {
      qb.andWhere('wi.archivedAt IS NULL');
    }
    if (opts.status) {
      const statusIds = opts.status.split(',').map((s) => parseInt(s.trim(), 10));
      qb.andWhere('wi.statusId IN (:...statusIds)', { statusIds });
    }

    qb.orderBy('wi.sortOrder', 'ASC').addOrderBy('wi.createdAt', 'DESC');

    const epics = await qb.getMany();
    const statsMap = await this.computeDescendantStatsBatch(epics.map((e) => e.id));
    const blockerMap = await this.findOpenBlockersBatch(epics.map((e) => e.id), prefix);

    let list = epics.map((epic) => {
      const stats = statsMap.get(epic.id) ?? EMPTY_STATS;
      const blocker = blockerMap.get(epic.id) ?? null;
      const displayState = this.deriveDisplayState(epic, {
        hasOpenBlocker: !!blocker,
        progressPercent: stats.progress.progressPercent,
        today,
      });
      const assignee = epic.assignee as any;
      return {
        id: epic.id,
        itemKey: `${prefix}-${epic.itemNumber}`,
        itemType: epic.itemType,
        title: epic.title,
        description: epic.description,
        priority: epic.priority,
        status: epic.status
          ? { id: epic.status.id, name: epic.status.name, category: (epic.status as any).category, color: (epic.status as any).color }
          : null,
        assignee: assignee ? { id: assignee.id, displayName: assignee.displayName, avatarUrl: assignee.avatarUrl } : null,
        sprint: epic.sprint ? { id: epic.sprint.id, name: epic.sprint.name } : null,
        startDate: epic.startDate,
        endDate: epic.endDate,
        storyPoints: epic.storyPoints,
        progress: stats.progress,
        childBreakdown: stats.childBreakdown,
        labels: (epic.labels || []).map((l) => ({ id: l.id, name: l.name, color: (l as any).color })),
        createdAt: epic.createdAt,
        epicState: epic.epicState,
        displayState,
        lead: assignee ? { id: assignee.id, displayName: assignee.displayName, avatarUrl: assignee.avatarUrl } : null,
        blockedBy: blocker ? { key: blocker.key, title: blocker.title, since: blocker.since } : null,
        archived: !!epic.archivedAt,
      };
    });

    if (opts.state) {
      const states = opts.state.split(',').map((s) => s.trim());
      list = list.filter((e) => states.includes(e.displayState));
    }

    const total = list.length;
    const paged = list.slice((page - 1) * limit, (page - 1) * limit + limit);
    return new PaginatedResponse(paged, total, page, limit).toEnvelopeData();
  }

  // ===========================================================================
  // Read: summary stat strip
  // ===========================================================================

  async getSummary(projectId: number) {
    const prefix = await this.getProjectPrefix(projectId);
    const today = new Date();

    const epics = await this.workItemRepo.find({
      where: { projectId, itemType: 'epic' as any },
    });
    const active = epics.filter((e) => !e.archivedAt && !e.deletedAt);

    const statsMap = await this.computeDescendantStatsBatch(active.map((e) => e.id));
    const blockerMap = await this.findOpenBlockersBatch(active.map((e) => e.id), prefix);

    let totalChildren = 0;
    let doneChildren = 0;
    let inFlight = 0;
    let blocked = 0;
    let atRisk = 0;
    const targets: { date: string; epicKey: string }[] = [];

    for (const epic of active) {
      const stats = statsMap.get(epic.id) ?? EMPTY_STATS;
      totalChildren += stats.progress.totalItems;
      doneChildren += stats.progress.completedItems;
      const blocker = blockerMap.get(epic.id) ?? null;
      const displayState = this.deriveDisplayState(epic, {
        hasOpenBlocker: !!blocker,
        progressPercent: stats.progress.progressPercent,
        today,
      });
      if (displayState === 'in_flight') inFlight += 1;
      if (displayState === 'blocked') blocked += 1;
      if (displayState === 'at_risk') atRisk += 1;
      if (epic.epicState !== 'shipped' && epic.endDate) {
        targets.push({ date: epic.endDate, epicKey: `${prefix}-${epic.itemNumber}` });
      }
    }

    const todayStr = today.toISOString().slice(0, 10);
    const futureTargets = targets.filter((t) => t.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalEpics: active.length,
      inFlight,
      needsAttention: blocked + atRisk,
      blocked,
      atRisk,
      childrenDone: { completed: doneChildren, total: totalChildren },
      nextTarget: futureTargets[0] ?? null,
    };
  }

  // ===========================================================================
  // Descendant rows (shared by detail + children)
  // ===========================================================================

  /**
   * All belongs_to descendants of an epic (depth ≤ 4) with display fields.
   * Labels are attached in a second query. Returns flat rows.
   */
  private async getDescendantRows(epicId: number, prefix: string): Promise<any[]> {
    const rows = await this.dataSource.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT a.item_id AS id, 1 AS depth
        FROM work_item_associations a
        JOIN work_items wi ON wi.id = a.item_id
        WHERE a.linked_item_id = $1 AND a.link_type = 'belongs_to' AND wi.deleted_at IS NULL
        UNION ALL
        SELECT a2.item_id, d.depth + 1
        FROM work_item_associations a2
        JOIN work_items wi2 ON wi2.id = a2.item_id
        JOIN descendants d ON a2.linked_item_id = d.id
        WHERE a2.link_type = 'belongs_to' AND wi2.deleted_at IS NULL AND d.depth < 4
      )
      SELECT
        wi.id, wi.item_number AS "itemNumber", wi.item_type AS "itemType", wi.title,
        wi.priority, wi.story_points AS "storyPoints", wi.sprint_id AS "sprintId",
        ps.id AS "statusId", ps.name AS "statusName", ps.category AS "statusCategory", ps.color AS "statusColor",
        u.id AS "assigneeId", u.display_name AS "assigneeName", u.avatar_url AS "assigneeAvatar",
        d.depth
      FROM descendants d
      JOIN work_items wi ON wi.id = d.id
      JOIN project_statuses ps ON ps.id = wi.status_id
      LEFT JOIN users u ON u.id = wi.assignee_id
      ORDER BY d.depth ASC, wi.sort_order ASC
    `,
      [epicId],
    );

    const ids = rows.map((r: any) => r.id);
    const labelMap = new Map<number, { id: number; name: string; color: string }[]>();
    if (ids.length > 0) {
      const labelRows = await this.dataSource.query(
        `
        SELECT wil.work_item_id AS "itemId", l.id, l.name, l.color
        FROM work_item_labels wil
        JOIN labels l ON l.id = wil.label_id
        WHERE wil.work_item_id = ANY($1)
      `,
        [ids],
      );
      for (const lr of labelRows) {
        if (!labelMap.has(lr.itemId)) labelMap.set(lr.itemId, []);
        labelMap.get(lr.itemId)!.push({ id: lr.id, name: lr.name, color: lr.color });
      }
    }

    return rows.map((r: any) => ({
      id: r.id,
      itemKey: `${prefix}-${r.itemNumber}`,
      itemType: r.itemType,
      title: r.title,
      priority: r.priority,
      storyPoints: r.storyPoints,
      sprintId: r.sprintId,
      status: { id: r.statusId, name: r.statusName, category: r.statusCategory, color: r.statusColor },
      assignee: r.assigneeId
        ? { id: r.assigneeId, displayName: r.assigneeName, avatarUrl: r.assigneeAvatar }
        : null,
      labels: labelMap.get(r.id) ?? [],
      depth: Number(r.depth),
    }));
  }

  // ===========================================================================
  // Read: detail aggregate
  // ===========================================================================

  async getEpicDetail(projectId: number, epicId: number) {
    const prefix = await this.getProjectPrefix(projectId);
    const today = new Date();

    const epic = await this.workItemRepo.findOne({
      where: { id: epicId, projectId, itemType: 'epic' as any },
      relations: ['status', 'assignee', 'labels'],
    });
    if (!epic) return null;

    const statsMap = await this.computeDescendantStatsBatch([epicId]);
    const stats = statsMap.get(epicId) ?? EMPTY_STATS;
    const blockerMap = await this.findOpenBlockersBatch([epicId], prefix);
    const blocker = blockerMap.get(epicId) ?? null;
    const displayState = this.deriveDisplayState(epic, {
      hasOpenBlocker: !!blocker,
      progressPercent: stats.progress.progressPercent,
      today,
    });

    const descendants = await this.getDescendantRows(epicId, prefix);

    // Contributors — distinct descendant assignees.
    const contributorMap = new Map<number, { id: number; displayName: string; avatarUrl: string | null }>();
    for (const d of descendants) {
      if (d.assignee && !contributorMap.has(d.assignee.id)) contributorMap.set(d.assignee.id, d.assignee);
    }
    const contributors = Array.from(contributorMap.values());

    // By type — descendant counts grouped by item_type (ordered).
    const typeOrder = ['story', 'task', 'bug', 'subtask'];
    const typeCounts = new Map<string, number>();
    for (const d of descendants) typeCounts.set(d.itemType, (typeCounts.get(d.itemType) ?? 0) + 1);
    const byType = typeOrder
      .filter((t) => typeCounts.has(t))
      .map((t) => ({ type: t, count: typeCounts.get(t)! }));

    // Across sprints — project sprints spanning the epic's descendant sprints.
    const acrossSprints = await this.buildAcrossSprints(projectId, descendants, epic.endDate, today);

    // Forecast — velocity-based projection of when this epic finishes.
    const forecast = await this.buildForecast(
      projectId,
      stats.progress.completedPoints,
      stats.progress.totalPoints,
      descendants,
      epic.endDate,
    );

    // blockedBy note/owner — latest risk milestone body + blocker source assignee.
    let blockedBy: any = null;
    if (blocker) {
      const [riskRow] = await this.milestoneRepo.query(
        `SELECT body FROM epic_milestones WHERE epic_id = $1 AND kind = 'risk' ORDER BY occurred_on DESC LIMIT 1`,
        [epicId],
      );
      blockedBy = {
        key: blocker.key,
        title: blocker.title,
        since: blocker.since,
        note: riskRow?.body ?? blocker.title,
        owner: blocker.owner,
      };
    }

    // Audit — creator (reporter) + timestamps.
    const [creator] = epic.reporterId
      ? await this.dataSource.query(`SELECT display_name AS "displayName", email FROM users WHERE id = $1`, [epic.reporterId])
      : [null];

    const assignee = epic.assignee as any;
    return {
      id: epic.id,
      itemKey: `${prefix}-${epic.itemNumber}`,
      title: epic.title,
      description: epic.description,
      priority: epic.priority,
      epicState: epic.epicState,
      displayState,
      startDate: epic.startDate,
      endDate: epic.endDate,
      status: epic.status
        ? { id: epic.status.id, name: epic.status.name, category: (epic.status as any).category, color: (epic.status as any).color }
        : null,
      stats: {
        itemsDone: stats.childStatusBreakdown.done,
        inProgress: stats.childStatusBreakdown.wip,
        open: stats.childStatusBreakdown.open,
        completedPoints: stats.progress.completedPoints,
        totalPoints: stats.progress.totalPoints,
      },
      lead: assignee
        ? { id: assignee.id, displayName: assignee.displayName, avatarUrl: assignee.avatarUrl, handle: this.handleFor(assignee.email) }
        : null,
      contributors: { count: contributors.length, users: contributors.slice(0, 8) },
      byType,
      labels: (epic.labels || []).map((l) => ({ id: l.id, name: l.name, color: (l as any).color })),
      blockedBy,
      acrossSprints,
      forecast,
      audit: {
        createdOn: epic.createdAt,
        createdBy: creator ? { displayName: creator.displayName, handle: this.handleFor(creator.email) } : null,
        lastEditedAt: epic.updatedAt,
      },
    };
  }

  private async buildAcrossSprints(projectId: number, descendants: any[], endDate: string | null, today: Date) {
    const sprints: any[] = await this.dataSource.query(
      `SELECT id, name, sprint_number AS "sprintNumber", status, start_date AS "startDate", end_date AS "endDate"
       FROM sprints WHERE project_id = $1 ORDER BY sprint_number ASC`,
      [projectId],
    );
    if (sprints.length === 0) {
      return { fromKey: null, toKey: null, count: 0, target: endDate, sprints: [], stories: [], todayIndex: -1 };
    }

    // Per-sprint rollup of descendant statuses (kept for tooltips + the
    // hover summary on each sprint pill).
    const rollups = new Map<number, { done: number; inProg: number; review: number; open: number }>();
    for (const d of descendants) {
      if (!d.sprintId) continue;
      if (!rollups.has(d.sprintId)) rollups.set(d.sprintId, { done: 0, inProg: 0, review: 0, open: 0 });
      const r = rollups.get(d.sprintId)!;
      const cat = d.status.category;
      if (cat === 'done') r.done += 1;
      else if (cat === 'in_progress') r.inProg += 1;
      else if (cat === 'in_review') r.review += 1;
      else r.open += 1;
    }

    // Span = from first sprint with descendants to last with descendants.
    const withWork = sprints.filter((s) => rollups.has(s.id));
    let span = sprints;
    if (withWork.length > 0) {
      const firstNum = withWork[0].sprintNumber;
      const lastNum = withWork[withWork.length - 1].sprintNumber;
      span = sprints.filter((s) => s.sprintNumber >= firstNum && s.sprintNumber <= lastNum);
    }

    const spanSprints = span.map((s) => ({
      id: s.id,
      key: `S-${s.sprintNumber}`,
      name: s.name,
      startDate: s.startDate,
      status: s.status,
      rollup: rollups.get(s.id) ?? { done: 0, inProg: 0, review: 0, open: 0 },
    }));

    // Index lookup so individual stories can resolve their sprintIndex
    // along the span (0..count-1). Descendants outside the span — or with
    // no sprint — are dropped from the dot layer.
    const sprintIndexById = new Map<number, number>();
    spanSprints.forEach((s, i) => sprintIndexById.set(s.id, i));

    const stories = descendants
      .filter((d) => d.sprintId && sprintIndexById.has(d.sprintId))
      .map((d) => {
        const cat = d.status.category;
        const status: 'done' | 'inProg' | 'review' | 'open' =
          cat === 'done' ? 'done' :
          cat === 'in_progress' ? 'inProg' :
          cat === 'in_review' ? 'review' :
          'open';
        return {
          id: d.id,
          itemKey: d.itemKey,
          title: d.title,
          sprintIndex: sprintIndexById.get(d.sprintId)!,
          status,
        };
      });

    let todayIndex = spanSprints.findIndex((s) => s.status === 'active');
    if (todayIndex === -1) {
      const todayStr = today.toISOString().slice(0, 10);
      todayIndex = spanSprints.findIndex((s) => s.startDate && s.startDate >= todayStr);
    }

    return {
      fromKey: spanSprints[0]?.key ?? null,
      toKey: spanSprints[spanSprints.length - 1]?.key ?? null,
      count: spanSprints.length,
      target: endDate,
      sprints: spanSprints,
      stories,
      todayIndex,
    };
  }

  private async buildForecast(
    projectId: number,
    completedPoints: number,
    totalPoints: number,
    descendants: any[],
    endDate: string | null,
  ) {
    if (totalPoints === 0) return null;

    const sprints: any[] = await this.dataSource.query(
      `SELECT id, sprint_number AS "sprintNumber", status, start_date AS "startDate", end_date AS "endDate"
       FROM sprints WHERE project_id = $1 ORDER BY sprint_number ASC`,
      [projectId],
    );
    if (sprints.length === 0) return null;

    const completedSprints = sprints.filter((s) => s.status === 'completed');
    const activeSprint = sprints.find((s) => s.status === 'active');
    if (!activeSprint && completedSprints.length === 0) return null;

    const ptsWip = descendants
      .filter((d) => d.status?.category === 'in_progress' || d.status?.category === 'in_review')
      .reduce((sum, d) => sum + (d.storyPoints ?? 0), 0);

    // Velocity = avg completed points over last 3 completed sprints
    const recentCompleted = completedSprints.slice(-3);
    let velocity = 0;
    if (recentCompleted.length > 0) {
      const sprintIds = recentCompleted.map((s) => s.id);
      const [velRow] = await this.dataSource.query(
        `SELECT COALESCE(SUM(story_points) FILTER (WHERE completed_at IS NOT NULL), 0)::int AS pts
         FROM work_items
         WHERE sprint_id = ANY($1) AND deleted_at IS NULL`,
        [sprintIds],
      );
      velocity = Math.round((velRow?.pts ?? 0) / recentCompleted.length);
    }
    if (velocity <= 0) return null;

    const currentNum = activeSprint?.sprintNumber ?? (completedSprints[completedSprints.length - 1]?.sprintNumber ?? 0);
    const remaining = totalPoints - completedPoints;
    const sprintsNeeded = Math.ceil(remaining / velocity);
    const finishNum = currentNum + sprintsNeeded;
    const finishSprint = `S-${finishNum}`;

    // Target sprint = the sprint whose date range contains the endDate
    let targetSprint: string | null = null;
    let target: string | null = null;
    if (endDate) {
      target = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const targetS = sprints.find((s) => s.startDate && s.endDate && s.startDate <= endDate && s.endDate >= endDate);
      if (targetS) {
        targetSprint = `S-${targetS.sprintNumber}`;
      } else {
        // Estimate: find the sprint closest to/after the endDate
        const afterTarget = sprints.find((s) => s.startDate && s.startDate >= endDate);
        if (afterTarget) {
          targetSprint = `S-${afterTarget.sprintNumber}`;
        } else {
          // endDate is past all sprints — estimate by extrapolating sprint length
          const lastSprint = sprints[sprints.length - 1];
          if (lastSprint.startDate && lastSprint.endDate) {
            const sprintLen = new Date(lastSprint.endDate).getTime() - new Date(lastSprint.startDate).getTime();
            if (sprintLen > 0) {
              const diff = new Date(endDate).getTime() - new Date(lastSprint.endDate).getTime();
              const extra = Math.ceil(diff / sprintLen);
              targetSprint = `S-${lastSprint.sprintNumber + extra}`;
            }
          }
        }
      }
    }

    let verdict: 'on_track' | 'ahead' | 'at_risk' | 'behind' = 'on_track';
    if (targetSprint) {
      const targetNum = parseInt(targetSprint.replace('S-', ''), 10);
      const diff = targetNum - finishNum;
      if (diff >= 2) verdict = 'ahead';
      else if (diff >= 0) verdict = 'on_track';
      else if (diff >= -1) verdict = 'at_risk';
      else verdict = 'behind';
    }

    return {
      ptsDone: completedPoints,
      ptsWip,
      ptsTotal: totalPoints,
      velocity,
      finishSprint,
      targetSprint: targetSprint ?? finishSprint,
      target: target ?? '',
      verdict,
    };
  }

  // ===========================================================================
  // Read: recent activity across the epic subtree
  // ===========================================================================

  /**
   * Recent activity for the epic AND its belongs_to descendants, so the rail
   * surfaces child events ("BST-108 · changed sprint") not just the epic's own.
   */
  async getRecent(projectId: number, epicId: number, limit = 8) {
    const prefix = await this.getProjectPrefix(projectId);
    const idRows = await this.dataSource.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT a.item_id AS id, 1 AS depth FROM work_item_associations a
        JOIN work_items wi ON wi.id = a.item_id
        WHERE a.linked_item_id = $1 AND a.link_type = 'belongs_to' AND wi.deleted_at IS NULL
        UNION ALL
        SELECT a2.item_id, d.depth + 1 FROM work_item_associations a2
        JOIN work_items wi2 ON wi2.id = a2.item_id
        JOIN descendants d ON a2.linked_item_id = d.id
        WHERE a2.link_type = 'belongs_to' AND wi2.deleted_at IS NULL AND d.depth < 4
      )
      SELECT id FROM descendants
    `,
      [epicId],
    );
    const ids = [epicId, ...idRows.map((r: any) => Number(r.id))];

    const rows = await this.dataSource.query(
      `
      SELECT al.id, al.action, al.field_changed AS "fieldChanged", al.old_value AS "oldValue",
             al.new_value AS "newValue", al.created_at AS "createdAt", al.work_item_id AS "workItemId",
             wi.item_number AS "itemNumber",
             u.id AS "userId", u.display_name AS "userName", u.avatar_url AS "userAvatar"
      FROM activity_logs al
      LEFT JOIN work_items wi ON wi.id = al.work_item_id
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.project_id = $1 AND al.work_item_id = ANY($2)
      ORDER BY al.created_at DESC
      LIMIT $3
    `,
      [projectId, ids, limit],
    );

    return rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      fieldChanged: r.fieldChanged,
      oldValue: r.oldValue,
      newValue: r.newValue,
      createdAt: r.createdAt,
      itemKey: r.itemNumber != null ? `${prefix}-${r.itemNumber}` : null,
      isEpic: Number(r.workItemId) === epicId,
      user: r.userId ? { id: r.userId, displayName: r.userName, avatarUrl: r.userAvatar } : null,
    }));
  }

  // ===========================================================================
  // Read: grouped children
  // ===========================================================================

  async getEpicChildren(projectId: number, epicId: number, groupBy: 'status' | 'sprint') {
    const prefix = await this.getProjectPrefix(projectId);
    const rows = await this.getDescendantRows(epicId, prefix);
    const totalItems = rows.length;
    const totalPoints = rows.reduce((sum, r) => sum + (r.storyPoints || 0), 0);

    let groups: any[];
    if (groupBy === 'sprint') {
      const sprints: any[] = await this.dataSource.query(
        `SELECT id, name, sprint_number AS "sprintNumber" FROM sprints WHERE project_id = $1 ORDER BY sprint_number ASC`,
        [projectId],
      );
      const sprintName = new Map<number, string>(sprints.map((s) => [s.id, s.name]));
      const bucket = new Map<number | null, any[]>();
      for (const r of rows) {
        const key = r.sprintId ?? null;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(r);
      }
      const orderedKeys = sprints.map((s) => s.id).filter((id) => bucket.has(id));
      if (bucket.has(null)) orderedKeys.push(null as any);
      groups = orderedKeys.map((key) => {
        const items = bucket.get(key) ?? [];
        return {
          key: key === null ? 'backlog' : `sprint-${key}`,
          label: key === null ? 'Backlog' : sprintName.get(key) ?? `Sprint ${key}`,
          count: items.length,
          points: items.reduce((s, i) => s + (i.storyPoints || 0), 0),
          items,
        };
      });
    } else {
      // group by status category
      const order: { key: string; label: string; match: (c: string) => boolean }[] = [
        { key: 'in_progress', label: 'In progress', match: (c) => c === 'in_progress' },
        { key: 'in_review', label: 'In review', match: (c) => c === 'in_review' },
        { key: 'open', label: 'Open', match: (c) => c === 'backlog' },
        { key: 'done', label: 'Done', match: (c) => c === 'done' },
      ];
      groups = order
        .map((g) => {
          const items = rows.filter((r) => g.match(r.status.category));
          return { key: g.key, label: g.label, count: items.length, points: items.reduce((s, i) => s + (i.storyPoints || 0), 0), items };
        })
        .filter((g) => g.count > 0);
    }

    return { totalItems, totalPoints, groups };
  }

  // ===========================================================================
  // Milestones CRUD
  // ===========================================================================

  async listMilestones(projectId: number, epicId: number) {
    const epic = await this.requireEpic(projectId, epicId);
    const rows = await this.milestoneRepo
      .createQueryBuilder('m')
      .leftJoin('m.author', 'author')
      .addSelect(['author.id', 'author.displayName', 'author.avatarUrl'])
      .where('m.epicId = :epicId', { epicId })
      .orderBy('m.occurredOn', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .getMany();

    const milestones = rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      occurredOn: m.occurredOn,
      author: (m as any).author
        ? { id: (m as any).author.id, displayName: (m as any).author.displayName, avatarUrl: (m as any).author.avatarUrl }
        : null,
      synthesized: false,
    }));

    // Append a synthesized target row from the epic's end_date when there is
    // no curated target milestone.
    const hasTarget = milestones.some((m) => m.kind === 'target');
    if (!hasTarget && epic.endDate) {
      milestones.push({
        id: -1,
        kind: 'target',
        body: 'Target ship date.',
        occurredOn: epic.endDate,
        author: null,
        synthesized: true,
      } as any);
    }
    return milestones;
  }

  async createMilestone(projectId: number, epicId: number, userId: number, dto: CreateMilestoneDto) {
    await this.requireEpic(projectId, epicId);
    const saved = await this.milestoneRepo.save(
      this.milestoneRepo.create({
        projectId,
        epicId,
        authorId: userId,
        kind: dto.kind,
        body: dto.body,
        occurredOn: dto.occurredOn,
      }),
    );
    return { id: saved.id };
  }

  async updateMilestone(projectId: number, epicId: number, milestoneId: number, dto: UpdateMilestoneDto) {
    await this.requireEpic(projectId, epicId);
    const m = await this.milestoneRepo.findOne({ where: { id: milestoneId, epicId, projectId } });
    if (!m) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Milestone not found');
    if (dto.kind !== undefined) m.kind = dto.kind;
    if (dto.body !== undefined) m.body = dto.body;
    if (dto.occurredOn !== undefined) m.occurredOn = dto.occurredOn;
    await this.milestoneRepo.save(m);
    return { id: m.id };
  }

  async deleteMilestone(projectId: number, epicId: number, milestoneId: number) {
    await this.requireEpic(projectId, epicId);
    const res = await this.milestoneRepo.delete({ id: milestoneId, epicId, projectId });
    if (!res.affected) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Milestone not found');
    return { id: milestoneId };
  }

  // ===========================================================================
  // Operations
  // ===========================================================================

  private emitUpdated(item: WorkItem, userId: number, projectId: number, changes: any) {
    this.eventEmitter.emit('work_item.updated', { item, userId, projectId, changes, previous: {} });
  }

  /** Mark shipped — requires every descendant to be done. */
  async shipEpic(projectId: number, epicId: number, userId: number) {
    const epic = await this.requireEpic(projectId, epicId);
    const openRows = await this.dataSource.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT a.item_id AS id, 1 AS depth FROM work_item_associations a
        JOIN work_items wi ON wi.id = a.item_id
        WHERE a.linked_item_id = $1 AND a.link_type = 'belongs_to' AND wi.deleted_at IS NULL
        UNION ALL
        SELECT a2.item_id, d.depth + 1 FROM work_item_associations a2
        JOIN work_items wi2 ON wi2.id = a2.item_id
        JOIN descendants d ON a2.linked_item_id = d.id
        WHERE a2.link_type = 'belongs_to' AND wi2.deleted_at IS NULL AND d.depth < 4
      )
      SELECT wi.item_number AS "itemNumber", wi.title
      FROM descendants d JOIN work_items wi ON wi.id = d.id
      JOIN project_statuses ps ON ps.id = wi.status_id
      WHERE ps.category <> 'done'
    `,
      [epicId],
    );
    if (openRows.length > 0) {
      const prefix = await this.getProjectPrefix(projectId);
      const offenders = openRows.map((r: any) => `${prefix}-${r.itemNumber}`);
      throw new AppLogicException(
        'EPIC_HAS_OPEN_CHILDREN',
        HttpStatus.CONFLICT,
        `These children must be Done or moved out first: ${offenders.join(', ')}`,
      );
    }
    epic.epicState = 'shipped';
    epic.completedAt = new Date();
    const saved = await this.workItemRepo.save(epic);
    this.emitUpdated(saved, userId, projectId, { epicState: 'shipped' });
    return { id: epicId, epicState: 'shipped' };
  }

  async reopenEpic(projectId: number, epicId: number, userId: number) {
    const epic = await this.requireEpic(projectId, epicId);
    epic.epicState = 'in_flight';
    epic.completedAt = null;
    const saved = await this.workItemRepo.save(epic);
    this.emitUpdated(saved, userId, projectId, { epicState: 'in_flight' });
    return { id: epicId, epicState: 'in_flight' };
  }

  async archiveEpic(projectId: number, epicId: number, userId: number) {
    const epic = await this.requireEpic(projectId, epicId);
    epic.archivedAt = new Date();
    const saved = await this.workItemRepo.save(epic);
    this.emitUpdated(saved, userId, projectId, { archived: true });
    return { id: epicId, archived: true };
  }

  async unarchiveEpic(projectId: number, epicId: number, userId: number) {
    const epic = await this.requireEpic(projectId, epicId);
    epic.archivedAt = null;
    const saved = await this.workItemRepo.save(epic);
    this.emitUpdated(saved, userId, projectId, { archived: false });
    return { id: epicId, archived: false };
  }

  /** Detach all direct children — remove belongs_to links + null their sprint. */
  async detachChildren(projectId: number, epicId: number, userId: number) {
    await this.requireEpic(projectId, epicId);
    return this.dataSource.transaction(async (manager) => {
      const childRows = await manager.query(
        `SELECT item_id AS id FROM work_item_associations WHERE linked_item_id = $1 AND link_type = 'belongs_to'`,
        [epicId],
      );
      const childIds: number[] = childRows.map((r: any) => r.id);
      await manager.query(
        `DELETE FROM work_item_associations WHERE linked_item_id = $1 AND link_type = 'belongs_to'`,
        [epicId],
      );
      if (childIds.length > 0) {
        await manager.query(`UPDATE work_items SET sprint_id = NULL WHERE id = ANY($1)`, [childIds]);
        for (const id of childIds) {
          const child = await manager.findOne(WorkItem, { where: { id } });
          if (child) this.emitUpdated(child, userId, projectId, { sprintId: null });
        }
      }
      return { detached: childIds.length };
    });
  }

  // ===========================================================================
  // Update (color / state / dates / title / brief)
  // ===========================================================================

  async updateEpic(projectId: number, epicId: number, userId: number, dto: UpdateEpicDto) {
    const epic = await this.requireEpic(projectId, epicId);
    if (dto.title !== undefined) epic.title = dto.title;
    if (dto.description !== undefined) epic.description = dto.description;
    if (dto.epicState !== undefined) epic.epicState = dto.epicState;
    if (dto.startDate !== undefined) epic.startDate = dto.startDate;
    if (dto.endDate !== undefined) epic.endDate = dto.endDate;

    const effectiveStart = epic.startDate;
    const effectiveEnd = epic.endDate;
    if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
      throw new AppLogicException('INVALID_DATE', HttpStatus.BAD_REQUEST, 'Start date cannot be after target date');
    }

    const saved = await this.workItemRepo.save(epic);
    this.emitUpdated(saved, userId, projectId, dto);
    return { id: epicId };
  }
}
