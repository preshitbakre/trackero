import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sprint } from './entities/sprint.entity';
import { SprintScopeChange } from './entities/sprint-scope-change.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { rethrowAsDuplicate } from '../common/helpers/db-error.helper';
import { SprintSnapshotsService } from './sprint-snapshots.service';

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
      const statusRows = await this.dataSource.query(`
        SELECT wi.sprint_id, ps.category, COUNT(*)::int AS n
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = ANY($1)
        GROUP BY wi.sprint_id, ps.category
      `, [sprintIds]);
      for (const r of statusRows) {
        const counts = statusCountsBySprint.get(r.sprint_id) ?? {};
        counts[r.category] = r.n;
        statusCountsBySprint.set(r.sprint_id, counts);
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
    }

    // Default the six status-category buckets the SprintsPage spec expects.
    // We pre-seed all six at 0 then merge whatever the DB actually returned —
    // so frontend code can render every bucket without null-guards, and
    // any extra DB categories (e.g. legacy 'backlog') still surface as-is.
    const defaultStatusCounts = (): Record<string, number> => ({
      open: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
      blocked: 0,
      cancelled: 0,
    });

    const data = sprints.map((sprint) => {
      const stats = statsBySprint.get(sprint.id);
      const deltas = scopeDeltasBySprint.get(sprint.id);
      const statusCounts = { ...defaultStatusCounts(), ...(statusCountsBySprint.get(sprint.id) ?? {}) };
      return {
        ...sprint,
        taskCount: stats?.task_count ?? 0,
        totalPoints: stats?.total_points ?? 0,
        completedPoints: stats?.completed_points ?? 0,
        assignees: assigneesBySprint.get(sprint.id) ?? [],
        statusCounts,
        scopeAdded: deltas?.added ?? 0,
        scopeDropped: deltas?.removed ?? 0,
      };
    });

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(projectId: number, sprintId: number) {
    const sprint = await this.sprintRepo.findOne({ where: { id: sprintId, projectId } });
    if (!sprint) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return sprint;
  }

  /**
   * Active sprint lookup for the sidebar footer card. When a userId is
   * given, also returns that user's own assigned/done point totals
   * (donePoints / totalPoints on the response) so the footer can render
   * a per-user progress bar instead of team-wide stats. Without userId
   * it stays the plain entity.
   */
  async findActive(projectId: number, userId?: number): Promise<(Sprint & { donePoints?: number; totalPoints?: number }) | null> {
    const sprint = await this.sprintRepo.findOne({
      where: { projectId, status: 'active' },
    });
    if (!sprint || userId === undefined) return sprint;

    const [pts] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(wi.story_points), 0)::int AS total,
         COALESCE(SUM(CASE WHEN ps.category = 'done' THEN wi.story_points ELSE 0 END), 0)::int AS done
         FROM work_items wi
         JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.sprint_id = $1 AND wi.assignee_id = $2`,
      [sprint.id, userId],
    );
    return Object.assign(sprint, {
      donePoints: pts.done,
      totalPoints: pts.total,
    });
  }

  async update(projectId: number, sprintId: number, dto: UpdateSprintDto) {
    const sprint = await this.findOne(projectId, sprintId);

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
          }),
        );
      }

      return savedSprint;
    });

    // Emit only after the transaction commits.
    this.eventEmitter.emit('sprint.started', { sprintId, projectId, actorId: userId });

    return saved;
  }

  async complete(projectId: number, sprintId: number, userId: number) {
    const result = await this.dataSource.transaction(async (manager) => {
      // Re-load with a pessimistic write lock so concurrent callers serialize.
      const sprint = await manager.findOne(Sprint, {
        where: { id: sprintId, projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }

      // Re-check status inside the lock.
      if (sprint.status !== 'active') {
        throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
      }

      sprint.status = 'completed';
      sprint.completedAt = new Date();
      await manager.save(Sprint, sprint);

      // Find incomplete tasks (status category NOT done)
      const incompleteTasks = await manager.query(
        `SELECT t.id FROM work_items t
         JOIN project_statuses ps ON t.status_id = ps.id
         WHERE t.sprint_id = $1 AND ps.category != 'done'`,
        [sprintId],
      );

      let movedTo = 'Backlog';
      const movedTasks = incompleteTasks.length;

      // Create SprintScopeChange 'removed' records for tasks leaving this sprint
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
          }),
        );
      }

      if (movedTasks > 0) {
        // Find next planning sprint
        const nextSprint = await manager.findOne(Sprint, {
          where: { projectId, status: 'planning' },
          order: { sprintNumber: 'ASC' },
        });

        if (nextSprint) {
          movedTo = nextSprint.name;
          const taskIds = incompleteTasks.map((t: any) => t.id);
          await manager.query(
            `UPDATE work_items SET sprint_id = $1, added_mid_sprint = false WHERE id = ANY($2)`,
            [nextSprint.id, taskIds],
          );
        } else {
          // Move to backlog
          const taskIds = incompleteTasks.map((t: any) => t.id);
          await manager.query(
            `UPDATE work_items SET sprint_id = NULL WHERE id = ANY($1)`,
            [taskIds],
          );
        }
      }

      return { sprint, movedTasks, movedTo };
    });

    // Emit only after the transaction commits.
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
    const sprint = await this.findOne(projectId, sprintId);
    // Move tasks to backlog before deleting
    await this.dataSource.query(
      `UPDATE work_items SET sprint_id = NULL WHERE sprint_id = $1`,
      [sprintId],
    );
    await this.sprintRepo.remove(sprint);
    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  async getBurndown(projectId: number, sprintId: number) {
    // Phase 5 — read from sprint_daily_snapshots. The shape stays identical
    // to the previous replay-based version: { sprintName, startDate, endDate,
    // totalPoints, dataPoints: [{ date, ideal, actual, scope }] }.
    //
    // On-read fallback: SprintSnapshotsService.readSnapshots materializes
    // today's row inline if the cron hasn't run yet, so the chart's last
    // point is always current and we never serve a gap.
    const sprint = await this.findOne(projectId, sprintId);

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
