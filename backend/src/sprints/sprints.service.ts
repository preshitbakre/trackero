import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Sprint } from './entities/sprint.entity';
import { SprintScopeChange } from './entities/sprint-scope-change.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { CompleteSprintDto } from './dto/complete-sprint.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { rethrowAsDuplicate } from '../common/helpers/db-error.helper';
import { SprintSnapshotsService } from './sprint-snapshots.service';

interface ScopeTimelineEntry {
  id: number;
  action: 'added' | 'removed' | 'commit' | 'goal';
  user: { id: number; displayName: string; avatarUrl: string | null };
  createdAt: string;
  pointsDelta: number;
  workItem?: { id: number; itemKey: string; title: string; itemType: string };
  totalItems?: number;
  note?: string | null;
}

export interface ScopeChangesResponse {
  summary: { ptsAdded: number; ptsDropped: number; itemsAdded: number; itemsDropped: number };
  entries: ScopeTimelineEntry[];
}

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepo: Repository<Sprint>,
    @InjectRepository(SprintScopeChange)
    private readonly scopeChangeRepo: Repository<SprintScopeChange>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly snapshots: SprintSnapshotsService,
  ) {}

  private readonly logger = new Logger(SprintsService.name);

  // --- Mid-sprint scope auditing -------------------------------------------
  // Items joining/leaving an ACTIVE sprint after it started are recorded as
  // scope_changes so the Scope Changes timeline reflects them (the start-time
  // commit batch is written by start()). Both the dedicated sprint-assign
  // endpoint and the generic work-item update flow through here.

  @OnEvent('work_item.sprint_assigned')
  async onWorkItemSprintAssigned(payload: {
    item: { id?: number; storyPoints?: number | null };
    sprintId: number | null;
    previousSprintId?: number | null;
    userId?: number;
  }) {
    await this.recordMidSprintScopeChange(payload.previousSprintId ?? null, payload.sprintId ?? null, payload.item, payload.userId ?? null);
  }

  @OnEvent('work_item.updated')
  async onWorkItemUpdatedScope(payload: {
    item: { id?: number; storyPoints?: number | null };
    previous?: Record<string, { old: any; new: any }>;
    userId?: number;
  }) {
    const change = payload.previous?.sprintId;
    if (!change) return;
    await this.recordMidSprintScopeChange(change.old ?? null, change.new ?? null, payload.item, payload.userId ?? null);
  }

  @OnEvent('work_item.created')
  async onWorkItemCreatedScope(payload: { item: { id?: number; sprintId?: number | null; storyPoints?: number | null }; userId?: number }) {
    const sid = payload.item?.sprintId ?? null;
    if (!sid) return;
    await this.recordMidSprintScopeChange(null, sid, payload.item, payload.userId ?? null);
  }

  /**
   * Write 'added'/'removed' scope-change rows when an item joins or leaves an
   * ACTIVE sprint. Planning-sprint assignments are the pre-start commit and
   * are skipped (recorded by start()). Failure-isolated.
   */
  private async recordMidSprintScopeChange(
    oldSprintId: number | null,
    newSprintId: number | null,
    item: { id?: number; storyPoints?: number | null } | null,
    actorId: number | null,
  ) {
    try {
      if (oldSprintId === newSprintId) return;
      const workItemId = item?.id;
      if (!workItemId) return;
      const storyPoints = item?.storyPoints ?? null;

      const isActive = async (sprintId: number): Promise<boolean> => {
        const [s] = await this.dataSource.query(`SELECT status FROM sprints WHERE id = $1`, [sprintId]);
        return s?.status === 'active';
      };

      if (oldSprintId && (await isActive(oldSprintId))) {
        await this.scopeChangeRepo.save(
          this.scopeChangeRepo.create({ sprintId: oldSprintId, workItemId, action: 'removed', storyPoints, actorId }),
        );
      }
      if (newSprintId && (await isActive(newSprintId))) {
        await this.scopeChangeRepo.save(
          this.scopeChangeRepo.create({ sprintId: newSprintId, workItemId, action: 'added', storyPoints, actorId }),
        );
      }
    } catch (err) {
      this.logger.error(`recordMidSprintScopeChange failed: ${err}`, (err as Error)?.stack);
    }
  }

  async create(projectId: number, dto: CreateSprintDto, userId: number) {
    // Date validation — compare against server-side CURRENT_DATE so the
    // node process timezone can't disagree with the Postgres `date` columns.
    const [{ is_past: startIsPast }] = await this.dataSource.query(
      `SELECT $1::date < CURRENT_DATE AS is_past`,
      [dto.startDate],
    );
    if (startIsPast) {
      throw new AppLogicException('INVALID_DATE', HttpStatus.BAD_REQUEST);
    }
    if (dto.endDate <= dto.startDate) {
      throw new AppLogicException('INVALID_DATE', HttpStatus.BAD_REQUEST);
    }

    // Auto-increment sprint number per project
    const lastSprint = await this.sprintRepo
      .createQueryBuilder('s')
      .where('s.projectId = :projectId', { projectId })
      .orderBy('s.sprintNumber', 'DESC')
      .getOne();

    const sprintNumber = (lastSprint?.sprintNumber ?? 0) + 1;

    const sprint = this.sprintRepo.create({
      projectId,
      name: dto.name?.trim() || `Sprint ${sprintNumber}`,
      goal: dto.goal,
      startDate: dto.startDate,
      endDate: dto.endDate,
      sprintNumber,
      createdBy: userId,
    });
    // sprintNumber is computed from MAX+1 above — two concurrent create() calls
    // can read the same MAX and pick the same number. The UQ_sprint_number_project
    // unique constraint is the backstop: the loser's INSERT raises a 23505,
    // which we translate to a clean 409 DUPLICATE_ENTRY.
    let saved: Sprint;
    try {
      saved = await this.sprintRepo.save(sprint);
    } catch (error) {
      rethrowAsDuplicate(error);
    }

    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listSprints(projectId: number, page: number = 1, limit: number = 20) {
    limit = clampLimit(limit);
    const qb = this.sprintRepo.createQueryBuilder('s')
      .where('s.projectId = :projectId', { projectId })
      .orderBy('s.sprintNumber', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const sprints = await qb.getMany();

    // Batch-load computed fields: ONE grouped query keyed by sprint_id rather
    // than N per-sprint queries. Preserves taskCount/totalPoints/completedPoints
    // shape on each sprint.
    const sprintIds = sprints.map((s) => s.id);
    const statsBySprint = new Map<number, { task_count: number; total_points: number; completed_points: number }>();
    const assigneesBySprint = new Map<number, Array<{ id: number; displayName: string; avatarUrl: string | null }>>();
    const statusCountsBySprint = new Map<number, Record<string, number>>();
    const scopeDeltasBySprint = new Map<number, { added: number; removed: number }>();
    const blockedCountBySprint = new Map<number, number>();
    if (sprintIds.length > 0) {
      const rows = await this.dataSource.query(`
        SELECT
          sprint_id,
          COUNT(*)::int as task_count,
          COALESCE(SUM(story_points), 0)::int as total_points,
          COALESCE(SUM(story_points) FILTER (WHERE completed_at IS NOT NULL), 0)::int as completed_points
        FROM work_items
        WHERE sprint_id = ANY($1) AND item_type IN ('task', 'epic', 'story')
        GROUP BY sprint_id
      `, [sprintIds]);
      for (const r of rows) {
        statsBySprint.set(r.sprint_id, {
          task_count: r.task_count,
          total_points: r.total_points,
          completed_points: r.completed_points,
        });
      }

      // Distinct assignees per sprint — one batched query, grouped client-side.
      const assigneeRows = await this.dataSource.query(`
        SELECT DISTINCT wi.sprint_id, u.id, u.display_name, u.avatar_url
        FROM work_items wi
        JOIN users u ON u.id = wi.assignee_id
        WHERE wi.sprint_id = ANY($1) AND wi.assignee_id IS NOT NULL
        ORDER BY wi.sprint_id, u.display_name
      `, [sprintIds]);
      for (const r of assigneeRows) {
        const list = assigneesBySprint.get(r.sprint_id) ?? [];
        list.push({ id: r.id, displayName: r.display_name, avatarUrl: r.avatar_url });
        assigneesBySprint.set(r.sprint_id, list);
      }

      // Status counts per sprint, keyed by project_statuses.category.
      // DB enum is `backlog | in_progress | done`; we translate the DB
      // `backlog` category to the user-facing key `open` at the API
      // boundary (per docs/sprints/spec-sprints-list.md and
      // spec-sprint-detail-overview.md).
      const statusRows = await this.dataSource.query(`
        SELECT wi.sprint_id, ps.category, COUNT(*)::int AS n
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = ANY($1)
        GROUP BY wi.sprint_id, ps.category
      `, [sprintIds]);
      for (const r of statusRows) {
        if (!statusCountsBySprint.has(r.sprint_id)) {
          statusCountsBySprint.set(r.sprint_id, { open: 0, in_progress: 0, in_review: 0, done: 0 });
        }
        // DB `backlog` → API `open` (user-facing term per design specs).
        // `in_review` and `in_progress` map straight through.
        const apiKey = r.category === 'backlog' ? 'open' : r.category;
        statusCountsBySprint.get(r.sprint_id)![apiKey] = r.n;
      }

      // Scope deltas — added / removed counts from sprint_scope_changes.
      const scopeRows = await this.dataSource.query(`
        SELECT sprint_id, action, COUNT(*)::int AS n
        FROM sprint_scope_changes
        WHERE sprint_id = ANY($1)
        GROUP BY sprint_id, action
      `, [sprintIds]);
      for (const r of scopeRows) {
        const deltas = scopeDeltasBySprint.get(r.sprint_id) ?? { added: 0, removed: 0 };
        if (r.action === 'added') deltas.added = r.n;
        else if (r.action === 'removed') deltas.removed = r.n;
        scopeDeltasBySprint.set(r.sprint_id, deltas);
      }

      // Blocked items per sprint — distinct top-level work items with at
      // least one outgoing `blocks` association whose target item is not
      // in a done-category status. Mirrors the `has_open_blocker` EXISTS
      // pattern in today.service.ts (lines 211-217). Scoped to the same
      // item types the stats query uses (no bugs/subtasks).
      const blockedRows = await this.dataSource.query(`
        SELECT wi.sprint_id, COUNT(DISTINCT wi.id)::int AS n
        FROM work_items wi
        WHERE wi.sprint_id = ANY($1)
          AND wi.item_type IN ('task', 'epic', 'story')
          AND EXISTS (
            SELECT 1 FROM work_item_associations a
             JOIN work_items wi2 ON wi2.id = a.linked_item_id
             JOIN project_statuses ps2 ON ps2.id = wi2.status_id
            WHERE a.item_id = wi.id AND a.link_type = 'blocks'
              AND ps2.category != 'done'
          )
        GROUP BY wi.sprint_id
      `, [sprintIds]);
      for (const r of blockedRows) {
        blockedCountBySprint.set(r.sprint_id, r.n);
      }
    }

    // Auto-capacity per sprint — reuses computeAutoCapacity() (the average
    // of the last 3 completed sprints' completedPoints, excluding the
    // current sprint). Returns 0 when there are no prior completed sprints.
    // Computed per-sprint because the historical window excludes the
    // current sprint id.
    const capacityBySprint = new Map<number, number>();
    for (const s of sprints) {
      capacityBySprint.set(s.id, await this.computeAutoCapacity(projectId, s.id));
    }

    const data = sprints.map((sprint) => {
      const stats = statsBySprint.get(sprint.id);
      const deltas = scopeDeltasBySprint.get(sprint.id);
      const totalPoints = stats?.total_points ?? 0;
      const completedPoints = stats?.completed_points ?? 0;
      const projectedPoints = this.computeProjectedPoints(sprint, totalPoints, completedPoints);
      return {
        ...sprint,
        taskCount: stats?.task_count ?? 0,
        totalPoints,
        completedPoints,
        projectedPoints,
        assignees: assigneesBySprint.get(sprint.id) ?? [],
        statusCounts: statusCountsBySprint.get(sprint.id) ?? { open: 0, in_progress: 0, in_review: 0, done: 0 },
        scopeAdded: deltas?.added ?? 0,
        scopeDropped: deltas?.removed ?? 0,
        blockedCount: blockedCountBySprint.get(sprint.id) ?? 0,
        capacityPts: capacityBySprint.get(sprint.id) ?? 0,
      };
    });

    return new PaginatedResponse(data, total, page, limit);
  }

  /**
   * Entity finder for internal mutation callers (update, remove, etc.).
   * Returns the live `Sprint` entity so `sprintRepo.save`/`remove` see the
   * entity prototype and metadata. Throws NOT_FOUND when the sprint is
   * missing or scoped to another project.
   */
  private async findOneEntity(projectId: number, sprintId: number): Promise<Sprint> {
    const sprint = await this.sprintRepo.findOne({ where: { id: sprintId, projectId } });
    if (!sprint) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return sprint;
  }

  /**
   * statusCounts via project_statuses.category — DB `backlog` → API `open`
   * (matches the design specs in docs/sprints/spec-sprint-detail-overview.md).
   */
  private async loadStatusCounts(sprintId: number): Promise<Record<string, number>> {
    const rows = await this.dataSource.query(`
      SELECT ps.category, COUNT(*)::int AS n
      FROM work_items wi
      JOIN project_statuses ps ON ps.id = wi.status_id
      WHERE wi.sprint_id = $1
      GROUP BY ps.category
    `, [sprintId]);
    const statusCounts: Record<string, number> = { open: 0, in_progress: 0, done: 0 };
    for (const r of rows) {
      const apiKey = r.category === 'backlog' ? 'open' : r.category;
      statusCounts[apiKey] = r.n;
    }
    return statusCounts;
  }

  /**
   * typeCounts — initialize with the 5 known item types so consumers can
   * rely on a stable shape, then merge actual counts on top.
   */
  private async loadTypeCounts(sprintId: number): Promise<Record<string, number>> {
    const rows = await this.dataSource.query(`
      SELECT item_type, COUNT(*)::int AS n
      FROM work_items
      WHERE sprint_id = $1
      GROUP BY item_type
    `, [sprintId]);
    const typeCounts: Record<string, number> = { task: 0, bug: 0, story: 0, subtask: 0, epic: 0 };
    for (const r of rows) typeCounts[r.item_type] = r.n;
    return typeCounts;
  }

  /**
   * totals — item count, total points, points completed
   * (work_items.completed_at is only set on transition INTO a done-category
   * status).
   */
  private async loadTotals(sprintId: number): Promise<{ items: number; total_pts: number; done_pts: number }> {
    const [totals] = await this.dataSource.query(`
      SELECT COUNT(*)::int AS items,
             COALESCE(SUM(story_points), 0)::int AS total_pts,
             COALESCE(SUM(story_points) FILTER (WHERE completed_at IS NOT NULL), 0)::int AS done_pts
      FROM work_items
      WHERE sprint_id = $1
    `, [sprintId]);
    return totals;
  }

  /**
   * Workload per member. Lists EVERY project member (not just those with
   * assigned items) so the sidebar shows the whole team — members with no
   * work simply read 0/cap. `assigned` is split into `done` / `inProgress`
   * point sums via project_statuses.category so the bar can stack.
   * project_members has no `capacity` column today (see
   * project-member.entity.ts), so capacity is NULL — the frontend falls back
   * to a sane default.
   */
  private async loadAssignees(projectId: number, sprintId: number) {
    return this.dataSource.query(`
      SELECT u.id,
             u.display_name AS "displayName",
             u.avatar_url AS "avatarUrl",
             COALESCE(SUM(wi.story_points), 0)::int AS assigned,
             COALESCE(SUM(wi.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS done,
             COALESCE(SUM(wi.story_points) FILTER (WHERE ps.category = 'in_progress'), 0)::int AS "inProgress",
             NULL::int AS capacity
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      LEFT JOIN work_items wi
        ON wi.assignee_id = u.id AND wi.sprint_id = $2 AND wi.deleted_at IS NULL
      LEFT JOIN project_statuses ps ON ps.id = wi.status_id
      WHERE pm.project_id = $1
      GROUP BY u.id, u.display_name, u.avatar_url
      ORDER BY u.display_name
    `, [projectId, sprintId]);
  }

  /**
   * autoCapacity = average completedPoints of the last 3 completed sprints in
   * this project, EXCLUDING the current sprint (so re-opening a completed
   * sprint doesn't seed its own capacity recommendation from itself).
   * Returns 0 when there are no prior completed sprints.
   */
  private async computeAutoCapacity(projectId: number, sprintId: number): Promise<number> {
    const [auto] = await this.dataSource.query(`
      SELECT COALESCE(ROUND(AVG(t.done_pts))::int, 0) AS auto_capacity FROM (
        SELECT COALESCE(SUM(wi.story_points) FILTER (WHERE wi.completed_at IS NOT NULL), 0)::int AS done_pts
        FROM sprints s
        LEFT JOIN work_items wi ON wi.sprint_id = s.id
        WHERE s.project_id = $1 AND s.status = 'completed' AND s.id <> $2
        GROUP BY s.id
        ORDER BY MAX(s.completed_at) DESC
        LIMIT 3
      ) t
    `, [projectId, sprintId]);
    return auto.auto_capacity;
  }

  /**
   * Linear forecast of where a sprint will land in story points.
   *
   * - Not started (planning or no startDate) → totalPoints (assume all
   *   committed work is in scope).
   * - Finished (completedAt set OR endDate in the past) → completedPoints
   *   (the actual landing point).
   * - In flight → completedPoints + burnRate * daysRemaining, where
   *   burnRate = completedPoints / max(1, daysElapsed). Clamped to an
   *   integer >= completedPoints so the projection never regresses below
   *   what's already shipped.
   */
  private computeProjectedPoints(
    sprint: Sprint,
    totalPoints: number,
    completedPoints: number,
  ): number {
    if (sprint.status === 'planning' || !sprint.startDate) {
      return totalPoints;
    }
    const now = new Date();
    const endDate = sprint.endDate ? new Date(sprint.endDate) : null;
    const isOver = sprint.completedAt != null || (endDate != null && endDate.getTime() < now.getTime());
    if (isOver) {
      return completedPoints;
    }
    if (!endDate) {
      // In flight but no end date — best we can do is the current completed total.
      return completedPoints;
    }
    const startDate = new Date(sprint.startDate);
    const MS_PER_DAY = 86400000;
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / MS_PER_DAY));
    const daysTotal = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY));
    const daysRemaining = Math.max(0, daysTotal - daysElapsed);
    const burnRate = completedPoints / daysElapsed;
    const projected = Math.round(completedPoints + burnRate * daysRemaining);
    return Math.max(completedPoints, projected);
  }

  /**
   * Enriched single-sprint view for the detail page. Returns a plain object —
   * do NOT use this for entity mutations; use `findOneEntity` for that.
   * Runs the 5 enrichment queries in parallel.
   */
  async findOne(projectId: number, sprintId: number) {
    const sprint = await this.findOneEntity(projectId, sprintId);
    const [statusCounts, typeCounts, totals, assignees, autoCapacity] = await Promise.all([
      this.loadStatusCounts(sprintId),
      this.loadTypeCounts(sprintId),
      this.loadTotals(sprintId),
      this.loadAssignees(projectId, sprintId),
      this.computeAutoCapacity(projectId, sprintId),
    ]);
    // Resolve audit actors to display name + derived @handle (email local-part).
    const actorIds = [sprint.createdBy, sprint.startedBy].filter((v): v is number => v != null);
    const actors = await this.loadActors(actorIds);
    return {
      ...sprint,
      statusCounts,
      typeCounts,
      totalItems: totals.items,
      totalPoints: totals.total_pts,
      completedPoints: totals.done_pts,
      assignees,
      autoCapacity,
      createdByUser: sprint.createdBy != null ? actors.get(sprint.createdBy) ?? null : null,
      startedByUser: sprint.startedBy != null ? actors.get(sprint.startedBy) ?? null : null,
    };
  }

  /** Batch-resolve user audit actors to { id, displayName, handle }. */
  private async loadActors(ids: number[]): Promise<Map<number, { id: number; displayName: string; handle: string | null }>> {
    const map = new Map<number, { id: number; displayName: string; handle: string | null }>();
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return map;
    const rows = await this.dataSource.query(
      `SELECT id, display_name AS "displayName", email FROM users WHERE id = ANY($1)`,
      [unique],
    );
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        displayName: r.displayName,
        handle: r.email ? r.email.split('@')[0] : null,
      });
    }
    return map;
  }

  /**
   * Active sprint lookup for the sidebar footer card. When a userId is
   * given, also returns that user's own assigned/done point totals
   * (donePoints / totalPoints on the response) so the footer can render
   * a per-user progress bar instead of team-wide stats. Without userId
   * it stays the plain entity.
   */
  async findActive(projectId: number, _userId?: number): Promise<(Sprint & { donePoints?: number; totalPoints?: number }) | null> {
    const sprint = await this.sprintRepo.findOne({
      where: { projectId, status: 'active' },
    });
    if (!sprint) return null;

    // Sprint-wide points (whole team) so the sidebar footer reflects overall
    // sprint progress, not the current user's personal slice.
    const [pts] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(wi.story_points), 0)::int AS total,
         COALESCE(SUM(wi.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS done
         FROM work_items wi
         JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = $1 AND wi.deleted_at IS NULL`,
      [sprint.id],
    );
    return Object.assign(sprint, {
      donePoints: pts.done,
      totalPoints: pts.total,
    });
  }

  async update(projectId: number, sprintId: number, dto: UpdateSprintDto, userId?: number) {
    const sprint = await this.findOneEntity(projectId, sprintId);
    // Capture goal change before mutation so an active-sprint goal edit can be
    // recorded on the scope-changes timeline.
    const goalChangedWhileActive =
      sprint.status === 'active' && dto.goal !== undefined && dto.goal !== sprint.goal;

    // Only allow date changes on planning sprints
    if (sprint.status !== 'planning' && (dto.startDate !== undefined || dto.endDate !== undefined)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.BAD_REQUEST);
    }

    // carryOverPolicy and capacity are editable on planning + active sprints
    // only — completed/cancelled sprints are immutable for these fields.
    // (See docs/sprints/spec-sprint-detail-settings.md "Disabled states".)
    if (
      (dto.carryOverPolicy !== undefined || dto.capacity !== undefined) &&
      sprint.status !== 'planning' &&
      sprint.status !== 'active'
    ) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.BAD_REQUEST);
    }

    // Date validation
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const newStart = dto.startDate ?? sprint.startDate;
      const newEnd = dto.endDate ?? sprint.endDate;
      if (newStart) {
        // Server-side compare against CURRENT_DATE so timezone of the node
        // process doesn't drift from the Postgres `date` column semantics.
        const [{ is_past: startIsPast }] = await this.dataSource.query(
          `SELECT $1::date < CURRENT_DATE AS is_past`,
          [newStart],
        );
        if (startIsPast) {
          throw new AppLogicException('INVALID_DATE', HttpStatus.BAD_REQUEST);
        }
      }
      if (newStart && newEnd && newEnd <= newStart) {
        throw new AppLogicException('INVALID_DATE', HttpStatus.BAD_REQUEST);
      }
    }

    if (dto.name !== undefined) sprint.name = dto.name;
    if (dto.goal !== undefined) sprint.goal = dto.goal;
    if (dto.startDate !== undefined) sprint.startDate = dto.startDate;
    if (dto.endDate !== undefined) sprint.endDate = dto.endDate;
    if (dto.carryOverPolicy !== undefined) sprint.carryOverPolicy = dto.carryOverPolicy;
    if (dto.capacity !== undefined) sprint.capacity = dto.capacity;

    const saved = await this.sprintRepo.save(sprint);

    if (goalChangedWhileActive) {
      try {
        await this.scopeChangeRepo.save(
          this.scopeChangeRepo.create({
            sprintId,
            workItemId: null,
            action: 'goal',
            storyPoints: null,
            actorId: userId ?? null,
            note: saved.goal ?? null,
          }),
        );
      } catch (err) {
        this.logger.error(`record goal scope change failed: ${err}`, (err as Error)?.stack);
      }
    }

    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async start(projectId: number, sprintId: number, userId: number) {
    const saved = await this.dataSource.transaction(async (manager) => {
      // Re-load with a pessimistic write lock so concurrent callers serialize.
      const sprint = await manager.findOne(Sprint, {
        where: { id: sprintId, projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }

      // Re-check status inside the lock.
      if (sprint.status !== 'planning') {
        throw new AppLogicException('SPRINT_NOT_PLANNING', HttpStatus.BAD_REQUEST);
      }

      // Check no other active sprint
      const activeSprint = await manager.findOne(Sprint, {
        where: { projectId, status: 'active' },
      });
      if (activeSprint) {
        throw new AppLogicException('SPRINT_ALREADY_ACTIVE', HttpStatus.CONFLICT);
      }

      // Check sprint has tasks
      const taskCount = await manager.query(
        `SELECT COUNT(*) as count FROM work_items WHERE sprint_id = $1 AND item_type IN ('task', 'epic', 'story')`,
        [sprintId],
      );
      if (parseInt(taskCount[0].count) === 0) {
        throw new AppLogicException('SPRINT_NO_TASKS', HttpStatus.BAD_REQUEST);
      }

      // Set start/end dates if not already set. Derive both from CURRENT_DATE
      // on the database side so node-process timezone can't make them drift
      // off the `date` columns.
      if (!sprint.startDate || !sprint.endDate) {
        const project = await manager.query(
          `SELECT default_sprint_duration FROM projects WHERE id = $1`,
          [projectId],
        );
        const duration = project[0]?.default_sprint_duration || 14;
        const [dateRow] = await manager.query(
          `SELECT
             CURRENT_DATE::text AS today,
             (CURRENT_DATE + ($1::int * INTERVAL '1 day'))::date::text AS end_date`,
          [duration],
        );
        if (!sprint.startDate) sprint.startDate = dateRow.today;
        if (!sprint.endDate) sprint.endDate = dateRow.end_date;
      }

      sprint.status = 'active';
      // Record who clicked Start so the Scope Changes timeline can attribute
      // the synthesized "commit" entry to a real user. Falls back to
      // sprint.createdBy at read time if this is ever null (older sprints
      // that started before this column was populated).
      sprint.startedBy = userId;
      sprint.startedAt = new Date();
      let savedSprint: Sprint;
      try {
        savedSprint = await manager.save(Sprint, sprint);
      } catch (error: any) {
        // The pre-check above gives the fast clean path, but two concurrent
        // start() calls can both pass it (each locks only its own row). The
        // partial unique index UQ_sprint_one_active_per_project is the real
        // guard: the loser's save raises a 23505 unique violation, which we
        // translate to the same clean SPRINT_ALREADY_ACTIVE response.
        if (
          error?.code === '23505' &&
          (error?.constraint === 'UQ_sprint_one_active_per_project' ||
            String(error?.detail ?? '').includes('UQ_sprint_one_active_per_project'))
        ) {
          throw new AppLogicException('SPRINT_ALREADY_ACTIVE', HttpStatus.CONFLICT);
        }
        // Any other unique violation (or error) is unrelated — do not mask it.
        throw error;
      }

      // Record initial scope
      const tasks = await manager.query(
        `SELECT id, story_points FROM work_items WHERE sprint_id = $1`,
        [sprintId],
      );
      for (const task of tasks) {
        await manager.save(
          SprintScopeChange,
          manager.create(SprintScopeChange, {
            sprintId,
            workItemId: task.id,
            action: 'added',
            storyPoints: task.story_points,
            actorId: userId,
          }),
        );
      }

      return savedSprint;
    });

    // Emit only after the transaction commits.
    this.eventEmitter.emit('sprint.started', { sprintId, projectId, actorId: userId });

    return saved;
  }

  async completePreview(projectId: number, sprintId: number) {
    const sprint = await this.sprintRepo.findOne({
      where: { id: sprintId, projectId },
    });
    if (!sprint) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (sprint.status !== 'active') {
      throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
    }

    const incompleteItems = await this.dataSource.query(
      `SELECT t.id, t.item_number AS "itemNumber",
              p.key || '-' || t.item_number AS "itemKey",
              t.title, t.item_type AS "itemType",
              t.priority, t.story_points AS "storyPoints",
              json_build_object(
                'name', ps.name, 'color', ps.color, 'category', ps.category
              ) AS status
       FROM work_items t
       JOIN project_statuses ps ON t.status_id = ps.id
       JOIN projects p ON t.project_id = p.id
       WHERE t.sprint_id = $1 AND ps.category != 'done'
       ORDER BY t.item_number`,
      [sprintId],
    );

    const nextSprint = await this.sprintRepo.findOne({
      where: { projectId, status: 'planning' as any },
      order: { sprintNumber: 'ASC' },
    });

    return {
      carryOverPolicy: sprint.carryOverPolicy,
      incompleteItems,
      nextSprint: nextSprint ? { id: nextSprint.id, name: nextSprint.name } : null,
    };
  }

  async complete(projectId: number, sprintId: number, userId: number, dto?: CompleteSprintDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const sprint = await manager.findOne(Sprint, {
        where: { id: sprintId, projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      if (sprint.status !== 'active') {
        throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
      }

      sprint.status = 'completed';
      sprint.completedAt = new Date();
      await manager.save(Sprint, sprint);

      const incompleteTasks: { id: number }[] = await manager.query(
        `SELECT t.id FROM work_items t
         JOIN project_statuses ps ON t.status_id = ps.id
         WHERE t.sprint_id = $1 AND ps.category != 'done'`,
        [sprintId],
      );

      const movedTasks = incompleteTasks.length;

      for (const task of incompleteTasks) {
        const [taskData] = await manager.query(
          'SELECT story_points FROM work_items WHERE id = $1',
          [task.id],
        );
        await manager.save(
          SprintScopeChange,
          manager.create(SprintScopeChange, {
            sprintId,
            workItemId: task.id,
            action: 'removed',
            storyPoints: taskData?.story_points ?? null,
            actorId: userId,
          }),
        );
      }

      const nextSprint = await manager.findOne(Sprint, {
        where: { projectId, status: 'planning' as any },
        order: { sprintNumber: 'ASC' },
      });

      let movedTo = 'Backlog';
      const policy = sprint.carryOverPolicy || 'ask';

      if (movedTasks > 0) {
        if (policy === 'backlog') {
          const taskIds = incompleteTasks.map((t) => t.id);
          await manager.query(
            `UPDATE work_items SET sprint_id = NULL WHERE id = ANY($1)`,
            [taskIds],
          );
          movedTo = 'Backlog';
        } else if (policy === 'roll') {
          const taskIds = incompleteTasks.map((t) => t.id);
          if (nextSprint) {
            await manager.query(
              `UPDATE work_items SET sprint_id = $1, added_mid_sprint = false WHERE id = ANY($2)`,
              [nextSprint.id, taskIds],
            );
            movedTo = nextSprint.name;
          } else {
            await manager.query(
              `UPDATE work_items SET sprint_id = NULL WHERE id = ANY($1)`,
              [taskIds],
            );
            movedTo = 'Backlog';
          }
        } else {
          // policy === 'ask'
          const itemActions = dto?.itemActions;
          if (!itemActions) {
            throw new AppLogicException('ITEM_ACTIONS_REQUIRED', HttpStatus.BAD_REQUEST);
          }

          const incompleteIds = new Set(incompleteTasks.map((t) => t.id));
          const actionIds = new Set(Object.keys(itemActions).map(Number));

          const missing = [...incompleteIds].filter((id) => !actionIds.has(id));
          if (missing.length > 0) {
            throw new AppLogicException('MISSING_ITEM_ACTIONS', HttpStatus.BAD_REQUEST);
          }

          const extra = [...actionIds].filter((id) => !incompleteIds.has(id));
          if (extra.length > 0) {
            throw new AppLogicException('INVALID_ITEM_IDS', HttpStatus.BAD_REQUEST);
          }

          const rollIds = Object.entries(itemActions)
            .filter(([, action]) => action === 'roll')
            .map(([id]) => Number(id));
          const backlogIds = Object.entries(itemActions)
            .filter(([, action]) => action === 'backlog')
            .map(([id]) => Number(id));

          if (rollIds.length > 0 && !nextSprint) {
            throw new AppLogicException('NO_NEXT_SPRINT_FOR_ROLL', HttpStatus.BAD_REQUEST);
          }

          if (rollIds.length > 0 && nextSprint) {
            await manager.query(
              `UPDATE work_items SET sprint_id = $1, added_mid_sprint = false WHERE id = ANY($2)`,
              [nextSprint.id, rollIds],
            );
          }
          if (backlogIds.length > 0) {
            await manager.query(
              `UPDATE work_items SET sprint_id = NULL WHERE id = ANY($1)`,
              [backlogIds],
            );
          }

          movedTo = rollIds.length > 0 && backlogIds.length > 0 ? 'mixed' :
                    rollIds.length > 0 ? nextSprint!.name : 'Backlog';
        }
      }

      return { sprint, movedTasks, movedTo };
    });

    this.eventEmitter.emit('sprint.completed', { sprintId, projectId, actorId: userId });

    return result;
  }

  async cancel(projectId: number, sprintId: number, userId: number) {
    const sprint = await this.dataSource.transaction(async (manager) => {
      // Re-load with a pessimistic write lock so concurrent callers serialize.
      const sprint = await manager.findOne(Sprint, {
        where: { id: sprintId, projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }

      // Re-check status inside the lock.
      if (sprint.status !== 'planning' && sprint.status !== 'active') {
        throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
      }

      sprint.status = 'cancelled';
      await manager.save(Sprint, sprint);

      // Move ALL tasks to backlog
      await manager.query(
        `UPDATE work_items SET sprint_id = NULL WHERE sprint_id = $1`,
        [sprintId],
      );

      return sprint;
    });

    // Emit only after the transaction commits.
    this.eventEmitter.emit('sprint.cancelled', { sprintId, projectId, actorId: userId });

    return sprint;
  }

  async remove(projectId: number, sprintId: number) {
    const sprint = await this.findOneEntity(projectId, sprintId);
    // Move tasks to backlog before deleting
    await this.dataSource.query(
      `UPDATE work_items SET sprint_id = NULL WHERE sprint_id = $1`,
      [sprintId],
    );
    await this.sprintRepo.remove(sprint);
    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  /**
   * Scope-changes timeline for the Sprint Detail page (spec:
   * docs/sprints/spec-sprint-detail-scope-changes.md).
   *
   * Returns `summary` (total points/items added & dropped post-commit) plus
   * `entries[]` newest-first. A synthesized "commit" entry is appended last
   * to mark the moment the sprint was started — its pointsDelta/totalItems
   * reflect the items committed at start time.
   *
   * Important implementation note: `start()` writes an 'added'
   * sprint_scope_changes row for EVERY item that was already in the sprint
   * at start time (all in the same transaction). So the spec's "items NOT
   * in scope_changes" approach would return zero. Instead, we treat the
   * earliest batch of rows (created within a 1-second window of MIN(created_at))
   * as the commit batch; rows after that window are real post-commit timeline
   * entries.
   *
   * TODO: a proper fix would be an explicit `sprint.startedAt` column (or
   * an `is_commit_batch` flag on sprint_scope_changes), removing the need
   * for any time-based heuristic here.
   *
   * KNOWN IMPERFECTION: sprint_scope_changes has no actor_id column today.
   * We use the work item's assignee as a proxy for the actor, with the
   * sprint's createdBy as fallback when the item has no assignee. A future
   * migration will add actor_id and resolve this properly.
   */
  /**
   * Returns ALL non-deleted items in a sprint (top-level items + their
   * subtasks) as a single flat list, no pagination. Used by the Sprint
   * Overview tab where status grouping needs the full set in one shot.
   * Subtasks are included because they live under parents (subtasks
   * themselves carry sprint_id = null and attach via parent_id).
   */
  async getSprintItems(projectId: number, sprintId: number) {
    const sprint = await this.findOneEntity(projectId, sprintId);

    const rows = await this.dataSource.query(
      `WITH sprint_top AS (
         SELECT id FROM work_items
         WHERE project_id = $1 AND sprint_id = $2 AND deleted_at IS NULL
       )
       SELECT
         wi.id, wi.item_number, wi.item_type, wi.title, wi.parent_id,
         wi.story_points, wi.created_at,
         p.prefix AS project_prefix,
         ps.id AS status_id, ps.name AS status_name,
         ps.category AS status_category, ps.color AS status_color,
         u.id AS assignee_id, u.display_name AS assignee_name,
         u.avatar_url AS assignee_avatar
       FROM work_items wi
       JOIN projects p ON p.id = wi.project_id
       LEFT JOIN project_statuses ps ON ps.id = wi.status_id
       LEFT JOIN users u ON u.id = wi.assignee_id
       WHERE wi.project_id = $1
         AND wi.deleted_at IS NULL
         AND (
           wi.id IN (SELECT id FROM sprint_top)
           OR wi.parent_id IN (SELECT id FROM sprint_top)
         )
       ORDER BY wi.created_at ASC`,
      [projectId, sprint.id],
    );

    const ids: number[] = rows.map((r: any) => r.id);
    let labelsByItem: Record<number, Array<{ id: number; name: string; color: string }>> = {};
    if (ids.length > 0) {
      const labelRows = await this.dataSource.query(
        `SELECT wil.work_item_id, l.id, l.name, l.color
         FROM work_item_labels wil
         JOIN labels l ON l.id = wil.label_id
         WHERE wil.work_item_id = ANY($1)`,
        [ids],
      );
      for (const lr of labelRows) {
        if (!labelsByItem[lr.work_item_id]) labelsByItem[lr.work_item_id] = [];
        labelsByItem[lr.work_item_id].push({ id: lr.id, name: lr.name, color: lr.color });
      }
    }

    return rows.map((r: any) => ({
      id: r.id,
      itemKey: `${r.project_prefix}-${r.item_number}`,
      itemNumber: r.item_number,
      itemType: r.item_type,
      title: r.title,
      parentId: r.parent_id,
      storyPoints: r.story_points,
      status: r.status_id
        ? {
            id: r.status_id,
            name: r.status_name,
            category: r.status_category,
            color: r.status_color,
          }
        : null,
      assignee: r.assignee_id
        ? {
            id: r.assignee_id,
            displayName: r.assignee_name ?? '',
            avatarUrl: r.assignee_avatar ?? null,
          }
        : null,
      labels: labelsByItem[r.id] ?? [],
    }));
  }

  async getScopeChanges(projectId: number, sprintId: number): Promise<ScopeChangesResponse> {
    const sprint = await this.findOneEntity(projectId, sprintId);

    // Planning sprints have never been started → no commit, no entries.
    if (sprint.status === 'planning') {
      return {
        summary: { ptsAdded: 0, ptsDropped: 0, itemsAdded: 0, itemsDropped: 0 },
        entries: [],
      };
    }

    // Find the commit-batch boundary. All start-time scope_changes rows are
    // written in the same transaction so they cluster within milliseconds of
    // each other; a 1-second window separates them from any later mid-sprint
    // additions or completion-time removals while leaving no room for a real
    // mid-sprint change to be misclassified as part of the commit batch.
    // TODO: replace this heuristic with an explicit sprint.startedAt column
    // (or an is_commit_batch flag on sprint_scope_changes).
    const [boundaryRow] = await this.dataSource.query(
      `SELECT MIN(created_at) AS first_at
         FROM sprint_scope_changes
        WHERE sprint_id = $1`,
      [sprintId],
    );
    const firstAt: Date | null = boundaryRow?.first_at ?? null;

    // Commit-batch totals: SUM/COUNT of the start-time 'added' rows.
    let commitItems = 0;
    let commitPoints = 0;
    if (firstAt) {
      const [commitRow] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS items,
                COALESCE(SUM(story_points), 0)::int AS pts
           FROM sprint_scope_changes
          WHERE sprint_id = $1
            AND action = 'added'
            AND created_at < $2::timestamptz + INTERVAL '1 second'`,
        [sprintId, firstAt],
      );
      commitItems = commitRow.items;
      commitPoints = commitRow.pts;
    }

    // Post-commit scope changes (timeline entries). Join the work item for
    // its key/title/type and the assignee user for the actor proxy. We also
    // need projects.prefix to assemble itemKey.
    const rows: Array<{
      id: number;
      action: 'added' | 'removed' | 'goal';
      pointsDelta: number | null;
      createdAt: string;
      note: string | null;
      wiId: number | null;
      itemNumber: number;
      itemTitle: string;
      itemType: 'task' | 'bug' | 'story' | 'epic' | 'subtask';
      projectPrefix: string;
      actorId: number | null;
      actorName: string | null;
      actorAvatar: string | null;
    }> = firstAt
      ? await this.dataSource.query(
          `SELECT
             sc.id,
             sc.action,
             sc.story_points AS "pointsDelta",
             sc.created_at   AS "createdAt",
             sc.note         AS "note",
             wi.id           AS "wiId",
             wi.item_number  AS "itemNumber",
             wi.title        AS "itemTitle",
             wi.item_type    AS "itemType",
             p.prefix        AS "projectPrefix",
             actor.id        AS "actorId",
             actor.display_name AS "actorName",
             actor.avatar_url   AS "actorAvatar"
           FROM sprint_scope_changes sc
           JOIN sprints s ON s.id = sc.sprint_id
           JOIN projects p ON p.id = s.project_id
           LEFT JOIN work_items wi ON wi.id = sc.work_item_id
           LEFT JOIN users actor ON actor.id = COALESCE(sc.actor_id, wi.assignee_id)
          WHERE sc.sprint_id = $1
            AND sc.created_at >= $2::timestamptz + INTERVAL '1 second'
          ORDER BY sc.created_at DESC, sc.id DESC`,
          [sprintId, firstAt],
        )
      : [];

    // Pre-resolve the fallback user (sprint.createdBy) once so we don't
    // hit the DB per-row when several entries share missing assignees.
    let fallbackUser: { id: number; displayName: string; avatarUrl: string | null } | null = null;
    if (sprint.createdBy) {
      const [row] = await this.dataSource.query(
        `SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl"
           FROM users WHERE id = $1`,
        [sprint.createdBy],
      );
      fallbackUser = row ?? null;
    }

    // Summary across post-commit rows only.
    let ptsAdded = 0;
    let ptsDropped = 0;
    let itemsAdded = 0;
    let itemsDropped = 0;
    for (const r of rows) {
      const pts = r.pointsDelta ?? 0;
      if (r.action === 'added') {
        ptsAdded += pts;
        itemsAdded += 1;
      } else if (r.action === 'removed') {
        ptsDropped += pts;
        itemsDropped += 1;
      }
    }

    // Map DB rows into the spec response shape.
    const entries: ScopeTimelineEntry[] = rows.map((r) => {
      const actor =
        r.actorId !== null
          ? { id: r.actorId, displayName: r.actorName!, avatarUrl: r.actorAvatar }
          : (fallbackUser ?? { id: 0, displayName: 'Unknown', avatarUrl: null });
      if (r.action === 'goal') {
        return {
          id: r.id,
          action: r.action,
          user: actor,
          createdAt: r.createdAt,
          pointsDelta: 0,
          note: r.note,
        };
      }
      return {
        id: r.id,
        action: r.action,
        user: actor,
        createdAt: r.createdAt,
        pointsDelta: r.pointsDelta ?? 0,
        workItem: {
          id: r.wiId!,
          itemKey: `${r.projectPrefix}-${r.itemNumber}`,
          title: r.itemTitle,
          itemType: r.itemType,
        },
      };
    });

    // Synthesize the commit entry. Skip when status===planning (already
    // returned above) and when there are no scope_changes rows at all
    // (sprint was started but the scope_changes table is empty — shouldn't
    // happen in practice because start() always writes the initial batch,
    // but stay defensive).
    if (firstAt) {
      const commitUserId = sprint.startedBy ?? sprint.createdBy;
      let commitUser: { id: number; displayName: string; avatarUrl: string | null };
      if (commitUserId === sprint.createdBy && fallbackUser) {
        commitUser = fallbackUser;
      } else if (commitUserId) {
        const [row] = await this.dataSource.query(
          `SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl"
             FROM users WHERE id = $1`,
          [commitUserId],
        );
        commitUser = row ?? { id: 0, displayName: 'Unknown', avatarUrl: null };
      } else {
        commitUser = { id: 0, displayName: 'Unknown', avatarUrl: null };
      }

      entries.push({
        id: 0,
        action: 'commit',
        user: { ...commitUser },
        // Pin to the actual moment start() wrote its first scope_changes row.
        // sprint.updatedAt drifts forward on every save (goal edit, complete,
        // cancel, etc.) so it would silently change the timeline timestamp.
        createdAt: firstAt instanceof Date ? firstAt.toISOString() : String(firstAt),
        pointsDelta: commitPoints,
        totalItems: commitItems,
      });
    }

    return {
      summary: { ptsAdded, ptsDropped, itemsAdded, itemsDropped },
      entries,
    };
  }

  async getBurndown(projectId: number, sprintId: number) {
    // Phase 5 — read from sprint_daily_snapshots. The shape stays identical
    // to the previous replay-based version: { sprintName, startDate, endDate,
    // totalPoints, dataPoints: [{ date, ideal, actual, scope }] }.
    //
    // On-read fallback: SprintSnapshotsService.readSnapshots materializes
    // today's row inline if the cron hasn't run yet, so the chart's last
    // point is always current and we never serve a gap.
    const sprint = await this.findOneEntity(projectId, sprintId);

    if (!sprint.startDate || !sprint.endDate) {
      return { sprintName: sprint.name, startDate: null, endDate: null, totalPoints: 0, dataPoints: [] };
    }

    const snaps = await this.snapshots.readSnapshots(sprintId);

    // Total points = the most recent snapshot's total (already includes
    // all scope adds/removes). When there are no snapshots yet (sprint not
    // yet started or freshly active before first cron), fall back to a
    // live work_items aggregate so the chart still draws.
    let totalPoints = 0;
    if (snaps.length > 0) {
      totalPoints = snaps[snaps.length - 1].totalPoints;
    } else {
      const liveTotal = await this.dataSource.query(
        `SELECT COALESCE(SUM(COALESCE(story_points, 0)), 0)::int AS total
         FROM work_items WHERE sprint_id = $1`,
        [sprintId],
      );
      totalPoints = liveTotal[0]?.total ?? 0;
    }

    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
    );

    // Walk every day from sprint.startDate to LEAST(endDate, today), and
    // for each day pick the matching snapshot (snapshot_date == day) or
    // carry the previous one forward if missing.
    const today = new Date();
    const lastChartDate = endDate.getTime() < today.getTime() ? endDate : today;
    const dataPoints: Array<{ date: string; ideal: number; actual: number; scope: number }> = [];

    let carryTotal = totalPoints;
    let carryCompleted = 0;
    let snapIdx = 0;

    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex++) {
      const day = new Date(startDate.getTime() + dayIndex * 86400000);
      if (day.getTime() > lastChartDate.getTime() + 86400000) break;
      const dayKey = day.toISOString().slice(0, 10);

      while (snapIdx < snaps.length && snaps[snapIdx].snapshotDate <= dayKey) {
        carryTotal = snaps[snapIdx].totalPoints;
        carryCompleted = snaps[snapIdx].completedPoints;
        snapIdx++;
      }

      const scope = carryTotal;
      const ideal = totalPoints * (1 - dayIndex / totalDays);
      const actual = scope - carryCompleted;
      dataPoints.push({
        date: dayKey,
        ideal: Math.round(ideal * 10) / 10,
        actual,
        scope,
      });
    }

    return {
      sprintName: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalPoints,
      dataPoints,
    };
  }
}
