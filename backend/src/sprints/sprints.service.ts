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

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepo: Repository<Sprint>,
    @InjectRepository(SprintScopeChange)
    private readonly scopeChangeRepo: Repository<SprintScopeChange>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
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
      name: dto.name,
      goal: dto.goal || null,
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
    }

    const data = sprints.map((sprint) => {
      const s = statsBySprint.get(sprint.id);
      return {
        ...sprint,
        taskCount: s?.task_count ?? 0,
        totalPoints: s?.total_points ?? 0,
        completedPoints: s?.completed_points ?? 0,
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

  async update(projectId: number, sprintId: number, dto: UpdateSprintDto) {
    const sprint = await this.findOne(projectId, sprintId);

    // Only allow date changes on planning sprints
    if (sprint.status !== 'planning' && (dto.startDate !== undefined || dto.endDate !== undefined)) {
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
    const sprint = await this.findOne(projectId, sprintId);

    if (!sprint.startDate || !sprint.endDate) {
      return { sprintName: sprint.name, startDate: null, endDate: null, totalPoints: 0, dataPoints: [] };
    }

    const totalPointsResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(story_points), 0) as total FROM work_items WHERE sprint_id = $1`,
      [sprintId],
    );
    const totalPoints = parseInt(totalPointsResult[0].total);

    // Compute the date window server-side so the node process timezone can't
    // disagree with the Postgres `date` columns:
    //   - start: sprint.startDate
    //   - end:   LEAST(sprint.endDate, CURRENT_DATE)   (don't project past today)
    //   - totalDays: spans full sprint (start..endDate) for ideal-line slope
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Replace the per-day JS loop with a single grouped Postgres query that
    // uses generate_series to produce one row per day and joins/aggregates
    // scope_delta and completed points server-side. Output shape per data
    // point is identical: { date, ideal, actual, scope }.
    const rows = await this.dataSource.query(
      `SELECT
         d.day::date::text AS date,
         COALESCE((
           SELECT SUM(CASE WHEN action = 'added' THEN COALESCE(story_points, 0) ELSE -COALESCE(story_points, 0) END)
           FROM sprint_scope_changes
           WHERE sprint_id = $1 AND created_at <= d.day + interval '1 day'
         ), 0)::int AS scope_delta,
         COALESCE((
           SELECT SUM(story_points)
           FROM work_items
           WHERE sprint_id = $1 AND completed_at IS NOT NULL AND completed_at <= d.day + interval '1 day'
         ), 0)::int AS completed
       FROM generate_series($2::date, LEAST($3::date, CURRENT_DATE), '1 day') AS d(day)
       ORDER BY d.day`,
      [sprintId, sprint.startDate, sprint.endDate],
    );

    const dataPoints = rows.map((r: any, dayIndex: number) => {
      const scope = totalPoints + r.scope_delta;
      const ideal = totalPoints * (1 - dayIndex / totalDays);
      const actual = scope - r.completed;
      return { date: r.date, ideal: Math.round(ideal * 10) / 10, actual, scope };
    });

    return {
      sprintName: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalPoints,
      dataPoints,
    };
  }
}
