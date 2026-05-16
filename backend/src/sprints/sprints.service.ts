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
      startDate: dto.startDate || null,
      endDate: dto.endDate || null,
      sprintNumber,
      createdBy: userId,
    });
    const saved = await this.sprintRepo.save(sprint);

    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listSprints(projectId: number, page: number = 1, limit: number = 20) {
    const qb = this.sprintRepo.createQueryBuilder('s')
      .where('s.projectId = :projectId', { projectId })
      .orderBy('s.sprintNumber', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const sprints = await qb.getMany();

    const data = await Promise.all(sprints.map(async (sprint) => {
      const stats = await this.dataSource.query(`
        SELECT
          COUNT(*)::int as task_count,
          COALESCE(SUM(story_points), 0)::int as total_points,
          COALESCE(SUM(story_points) FILTER (WHERE completed_at IS NOT NULL), 0)::int as completed_points
        FROM tasks
        WHERE sprint_id = $1 AND parent_id IS NULL
      `, [sprint.id]);

      return {
        ...sprint,
        taskCount: parseInt(stats[0].task_count),
        totalPoints: parseInt(stats[0].total_points),
        completedPoints: parseInt(stats[0].completed_points),
      };
    }));

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
    if (dto.name !== undefined) sprint.name = dto.name;
    if (dto.goal !== undefined) sprint.goal = dto.goal;
    if (dto.startDate !== undefined) sprint.startDate = dto.startDate;
    if (dto.endDate !== undefined) sprint.endDate = dto.endDate;

    const saved = await this.sprintRepo.save(sprint);
    const list = await this.listSprints(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async start(projectId: number, sprintId: number, userId: number) {
    const sprint = await this.findOne(projectId, sprintId);

    if (sprint.status !== 'planning') {
      throw new AppLogicException('SPRINT_NOT_PLANNING', HttpStatus.BAD_REQUEST);
    }

    // Check no other active sprint
    const activeSprint = await this.sprintRepo.findOne({
      where: { projectId, status: 'active' },
    });
    if (activeSprint) {
      throw new AppLogicException('SPRINT_ALREADY_ACTIVE', HttpStatus.CONFLICT);
    }

    // Check sprint has tasks
    const taskCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM tasks WHERE sprint_id = $1`,
      [sprintId],
    );
    if (parseInt(taskCount[0].count) === 0) {
      throw new AppLogicException('SPRINT_NO_TASKS', HttpStatus.BAD_REQUEST);
    }

    // Set start/end dates if not already set
    const today = new Date().toISOString().split('T')[0];
    if (!sprint.startDate) sprint.startDate = today;
    if (!sprint.endDate) {
      const project = await this.dataSource.query(
        `SELECT default_sprint_duration FROM projects WHERE id = $1`,
        [projectId],
      );
      const duration = project[0]?.default_sprint_duration || 14;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);
      sprint.endDate = endDate.toISOString().split('T')[0];
    }

    sprint.status = 'active';
    const saved = await this.sprintRepo.save(sprint);

    this.eventEmitter.emit('sprint.started', { sprintId, projectId, actorId: userId });

    // Record initial scope
    const tasks = await this.dataSource.query(
      `SELECT id, story_points FROM tasks WHERE sprint_id = $1`,
      [sprintId],
    );
    for (const task of tasks) {
      await this.scopeChangeRepo.save(
        this.scopeChangeRepo.create({
          sprintId,
          taskId: task.id,
          action: 'added',
          storyPoints: task.story_points,
        }),
      );
    }

    return saved;
  }

  async complete(projectId: number, sprintId: number, userId: number) {
    const sprint = await this.findOne(projectId, sprintId);

    if (sprint.status !== 'active') {
      throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
    }

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    await this.sprintRepo.save(sprint);

    this.eventEmitter.emit('sprint.completed', { sprintId, projectId, actorId: userId });

    // Find incomplete tasks (status category NOT done/cancelled)
    const incompleteTasks = await this.dataSource.query(
      `SELECT t.id FROM tasks t
       JOIN project_statuses ps ON t.status_id = ps.id
       WHERE t.sprint_id = $1 AND ps.category NOT IN ('done', 'cancelled')`,
      [sprintId],
    );

    let movedTo = 'Backlog';
    let movedTasks = incompleteTasks.length;

    // Create SprintScopeChange 'removed' records for tasks leaving this sprint
    for (const task of incompleteTasks) {
      const [taskData] = await this.dataSource.query(
        'SELECT story_points FROM tasks WHERE id = $1',
        [task.id],
      );
      await this.scopeChangeRepo.save(
        this.scopeChangeRepo.create({
          sprintId,
          taskId: task.id,
          action: 'removed',
          storyPoints: taskData?.story_points ?? null,
        }),
      );
    }

    if (movedTasks > 0) {
      // Find next planning sprint
      const nextSprint = await this.sprintRepo.findOne({
        where: { projectId, status: 'planning' },
        order: { sprintNumber: 'ASC' },
      });

      if (nextSprint) {
        movedTo = nextSprint.name;
        const taskIds = incompleteTasks.map((t: any) => t.id);
        await this.dataSource.query(
          `UPDATE tasks SET sprint_id = $1, added_mid_sprint = false WHERE id = ANY($2)`,
          [nextSprint.id, taskIds],
        );
      } else {
        // Move to backlog
        const taskIds = incompleteTasks.map((t: any) => t.id);
        await this.dataSource.query(
          `UPDATE tasks SET sprint_id = NULL WHERE id = ANY($1)`,
          [taskIds],
        );
      }
    }

    return { sprint, movedTasks, movedTo };
  }

  async cancel(projectId: number, sprintId: number, userId: number) {
    const sprint = await this.findOne(projectId, sprintId);

    if (sprint.status !== 'planning' && sprint.status !== 'active') {
      throw new AppLogicException('SPRINT_NOT_ACTIVE', HttpStatus.BAD_REQUEST);
    }

    sprint.status = 'cancelled';
    await this.sprintRepo.save(sprint);

    this.eventEmitter.emit('sprint.cancelled', { sprintId, projectId, actorId: userId });

    // Move ALL tasks to backlog
    await this.dataSource.query(
      `UPDATE tasks SET sprint_id = NULL WHERE sprint_id = $1`,
      [sprintId],
    );

    return sprint;
  }

  async remove(projectId: number, sprintId: number) {
    const sprint = await this.findOne(projectId, sprintId);
    // Move tasks to backlog before deleting
    await this.dataSource.query(
      `UPDATE tasks SET sprint_id = NULL WHERE sprint_id = $1`,
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
      `SELECT COALESCE(SUM(story_points), 0) as total FROM tasks WHERE sprint_id = $1`,
      [sprintId],
    );
    const totalPoints = parseInt(totalPointsResult[0].total);

    // Calculate daily data points
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const today = new Date();
    const effectiveEnd = today < endDate ? today : endDate;
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const dataPoints = [];
    const current = new Date(startDate);
    let dayIndex = 0;

    while (current <= effectiveEnd) {
      const dateStr = current.toISOString().split('T')[0];
      const ideal = totalPoints * (1 - dayIndex / totalDays);

      // Get scope changes up to this date
      const scopeResult = await this.dataSource.query(
        `SELECT COALESCE(SUM(CASE WHEN action = 'added' THEN COALESCE(story_points, 0) ELSE -COALESCE(story_points, 0) END), 0) as scope_delta
         FROM sprint_scope_changes WHERE sprint_id = $1 AND created_at <= $2::date + interval '1 day'`,
        [sprintId, dateStr],
      );
      const scope = totalPoints + parseInt(scopeResult[0].scope_delta || '0');

      // Get completed points by this date
      const completedResult = await this.dataSource.query(
        `SELECT COALESCE(SUM(story_points), 0) as completed FROM tasks
         WHERE sprint_id = $1 AND completed_at IS NOT NULL AND completed_at <= $2::date + interval '1 day'`,
        [sprintId, dateStr],
      );
      const actual = scope - parseInt(completedResult[0].completed || '0');

      dataPoints.push({ date: dateStr, ideal: Math.round(ideal * 10) / 10, actual, scope });

      current.setDate(current.getDate() + 1);
      dayIndex++;
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
