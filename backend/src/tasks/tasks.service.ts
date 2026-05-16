import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Task } from './entities/task.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { TaskDependency } from './entities/task-dependency.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(ChecklistItem)
    private readonly checklistRepo: Repository<ChecklistItem>,
    @InjectRepository(TaskDependency)
    private readonly depRepo: Repository<TaskDependency>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: number, dto: CreateTaskDto, userId: number) {
    // Get and increment task counter
    await this.dataSource.query(
      `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1`,
      [projectId],
    );
    const [projectRow] = await this.dataSource.query(
      `SELECT task_counter FROM projects WHERE id = $1`,
      [projectId],
    );
    const taskNumber = projectRow.task_counter;

    // Get default status
    const defaultStatus = await this.dataSource.query(
      `SELECT id FROM project_statuses WHERE project_id = $1 AND is_default = true LIMIT 1`,
      [projectId],
    );
    const statusId = defaultStatus[0]?.id;
    if (!statusId) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const task = this.taskRepo.create({
      projectId,
      taskNumber,
      title: dto.title,
      description: dto.description || null,
      type: (dto.type as Task['type']) || 'task',
      priority: (dto.priority as Task['priority']) || 'medium',
      storyPoints: dto.storyPoints ?? null,
      assigneeId: dto.assigneeId ?? null,
      epicId: dto.epicId ?? null,
      sprintId: dto.sprintId ?? null,
      dueDate: dto.dueDate ?? null,
      statusId,
      reporterId: userId,
    });

    // Check if adding to active sprint -> set addedMidSprint
    if (dto.sprintId) {
      const [sprintRow] = await this.dataSource.query(
        'SELECT status FROM sprints WHERE id = $1',
        [dto.sprintId],
      );
      if (sprintRow?.status === 'active') {
        task.addedMidSprint = true;
      }
    }

    const saved = await this.taskRepo.save(task);

    if (dto.labelIds && dto.labelIds.length > 0) {
      await this.dataSource.query(
        `INSERT INTO task_labels (task_id, label_id) SELECT $1, unnest($2::int[])`,
        [saved.id, dto.labelIds],
      );
    }

    // Create SprintScopeChange if added to active sprint
    if (dto.sprintId && task.addedMidSprint) {
      await this.dataSource.query(
        `INSERT INTO sprint_scope_changes (sprint_id, task_id, action, story_points) VALUES ($1, $2, 'added', $3)`,
        [dto.sprintId, saved.id, dto.storyPoints ?? null],
      );
    }

    this.eventEmitter.emit('task.created', { taskId: saved.id, projectId, actorId: userId });

    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listTasks(
    projectId: number,
    filters: {
      page?: number; limit?: number; search?: string;
      status?: string; priority?: string; assigneeId?: number;
      sprintId?: number; epicId?: number; type?: string;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const qb = this.taskRepo.createQueryBuilder('t')
      .where('t.projectId = :projectId', { projectId })
      .andWhere('t.parentId IS NULL'); // Don't list subtasks in main list

    if (filters.search && filters.search.length >= 2) {
      qb.andWhere(
        `t.search_vector @@ plainto_tsquery('english', :search)`,
        { search: filters.search },
      );
      qb.addOrderBy(`ts_rank(t.search_vector, plainto_tsquery('english', :search))`, 'DESC');
    }
    if (filters.status) {
      const statusIds = filters.status.split(',').map(Number);
      qb.andWhere('t.statusId IN (:...statusIds)', { statusIds });
    }
    if (filters.priority) {
      const priorities = filters.priority.split(',');
      qb.andWhere('t.priority IN (:...priorities)', { priorities });
    }
    if (filters.assigneeId) {
      qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: filters.assigneeId });
    }
    if (filters.sprintId) {
      qb.andWhere('t.sprintId = :sprintId', { sprintId: filters.sprintId });
    }
    if (filters.epicId) {
      qb.andWhere('t.epicId = :epicId', { epicId: filters.epicId });
    }
    if (filters.type) {
      qb.andWhere('t.type = :type', { type: filters.type });
    }

    qb.leftJoinAndSelect('t.status', 'status')
      .leftJoin('t.assignee', 'assignee')
      .addSelect(['assignee.id', 'assignee.displayName', 'assignee.avatarUrl'])
      .leftJoin('t.reporter', 'reporter')
      .addSelect(['reporter.id', 'reporter.displayName', 'reporter.avatarUrl'])
      .leftJoinAndSelect('t.labels', 'labels');

    qb.orderBy('t.createdAt', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const data = await qb.getMany();

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(projectId: number, taskId: number) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, projectId },
    });
    if (!task) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return task;
  }

  async update(projectId: number, taskId: number, dto: UpdateTaskDto) {
    const task = await this.findOne(projectId, taskId);

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.type !== undefined) task.type = dto.type as Task['type'];
    if (dto.priority !== undefined) task.priority = dto.priority as Task['priority'];
    if (dto.storyPoints !== undefined) task.storyPoints = dto.storyPoints;
    if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId;
    if (dto.epicId !== undefined) task.epicId = dto.epicId;
    if (dto.sprintId !== undefined) task.sprintId = dto.sprintId;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;

    const saved = await this.taskRepo.save(task);
    this.eventEmitter.emit('task.updated', { taskId: saved.id, projectId, actorId: saved.reporterId });
    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async remove(projectId: number, taskId: number, userId: number, userRole: string) {
    const task = await this.findOne(projectId, taskId);

    // RBAC: member can only delete own tasks
    if (userRole === 'member') {
      if (task.reporterId !== userId && task.assigneeId !== userId) {
        throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
      }
    }

    this.eventEmitter.emit('task.deleted', { taskId, projectId, actorId: userId });
    await this.taskRepo.remove(task);
    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  async changeStatus(projectId: number, taskId: number, statusId: number, userId?: number) {
    const task = await this.findOne(projectId, taskId);

    // Check if moving to done category
    const targetStatus = await this.dataSource.query(
      `SELECT category FROM project_statuses WHERE id = $1`, [statusId],
    );
    if (!targetStatus[0]) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (targetStatus[0].category === 'done') {
      // Check dependency blocks
      const blockers = await this.depRepo.find({
        where: { taskId, dependencyType: 'blocks' },
      });

      for (const dep of blockers) {
        const blockerTask = await this.taskRepo.findOne({ where: { id: dep.dependsOnTaskId } });
        if (blockerTask) {
          const blockerStatus = await this.dataSource.query(
            `SELECT category FROM project_statuses WHERE id = $1`, [blockerTask.statusId],
          );
          if (blockerStatus[0]?.category !== 'done') {
            throw new AppLogicException('TASK_BLOCKED', HttpStatus.CONFLICT);
          }
        }
      }

      task.completedAt = new Date();

      // Emit blocker resolved for all tasks blocked by this one
      this.eventEmitter.emit('blocker.resolved', { blockerTaskId: taskId, projectId, actorId: userId ?? 1 });
    } else {
      // Moving out of done
      const currentStatus = await this.dataSource.query(
        `SELECT category FROM project_statuses WHERE id = $1`, [task.statusId],
      );
      if (currentStatus[0]?.category === 'done') {
        task.completedAt = null;
      }
    }

    const oldStatusId = task.statusId;
    task.statusId = statusId;
    const saved = await this.taskRepo.save(task);
    this.eventEmitter.emit('task.status_changed', { taskId: saved.id, projectId, actorId: userId ?? 1, oldStatusId, newStatusId: statusId });
    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async assign(projectId: number, taskId: number, assigneeId: number | null) {
    const task = await this.findOne(projectId, taskId);
    task.assigneeId = assigneeId;
    const saved = await this.taskRepo.save(task);
    this.eventEmitter.emit('task.assigned', { taskId: saved.id, projectId, actorId: 1, assigneeId });
    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async moveTask(projectId: number, taskId: number, sprintId?: number | null, epicId?: number | null) {
    const task = await this.findOne(projectId, taskId);

    if (sprintId !== undefined) {
      // Check if adding to active sprint -> set addedMidSprint
      if (sprintId !== null) {
        const sprint = await this.dataSource.query(
          `SELECT status FROM sprints WHERE id = $1`, [sprintId]
        );
        if (sprint[0]?.status === 'active') {
          task.addedMidSprint = true;
        } else {
          task.addedMidSprint = false;
        }
      }
      task.sprintId = sprintId;
    }
    if (epicId !== undefined) {
      task.epicId = epicId;
    }

    const saved = await this.taskRepo.save(task);
    const list = await this.listTasks(projectId, {});
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async reorderTasks(projectId: number, reorders: { taskId: number; sortOrder: string }[]) {
    for (const { taskId, sortOrder } of reorders) {
      await this.taskRepo.update({ id: taskId, projectId }, { sortOrder });
    }
  }

  async getTaskDetail(projectId: number, taskId: number) {
    const task = await this.findOne(projectId, taskId);

    // Get subtasks
    const subtasks = await this.taskRepo.find({
      where: { projectId, parentId: taskId },
      order: { createdAt: 'ASC' },
    });

    // Get checklist items for subtasks
    const subtasksWithChecklist = await Promise.all(
      subtasks.map(async (st) => {
        const checklistItems = await this.checklistRepo.find({
          where: { taskId: st.id },
          order: { sortOrder: 'ASC' },
        });
        return { ...st, checklistItems };
      })
    );

    // Get dependencies
    const blockedBy = await this.depRepo.find({
      where: { taskId, dependencyType: 'blocks' },
      relations: ['dependsOnTask'],
    });
    const blocks = await this.depRepo.find({
      where: { dependsOnTaskId: taskId, dependencyType: 'blocks' },
      relations: ['task'],
    });
    const relatesTo = await this.depRepo.find({
      where: [
        { taskId, dependencyType: 'relates_to' },
        { dependsOnTaskId: taskId, dependencyType: 'relates_to' },
      ],
    });

    // Get labels
    const labels = await this.dataSource.query(
      `SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = $1`,
      [taskId],
    );

    // Get counts
    const commentCount = 0; // Will be populated in Phase 7
    const attachmentCount = 0; // Will be populated in Phase 7

    return {
      ...task,
      labels,
      subtasks: subtasksWithChecklist,
      blockedBy,
      blocks,
      relatesTo,
      subtaskCount: subtasks.length,
      commentCount,
      attachmentCount,
    };
  }

  // --- Subtasks ---

  async createSubtask(projectId: number, parentId: number, dto: CreateTaskDto, userId: number) {
    const parent = await this.findOne(projectId, parentId);

    // Cannot create subtask of subtask
    if (parent.parentId !== null) {
      throw new AppLogicException('SUBTASK_NESTING', HttpStatus.BAD_REQUEST);
    }

    // Get and increment task counter
    await this.dataSource.query(
      `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1`,
      [projectId],
    );
    const [projectRow] = await this.dataSource.query(
      `SELECT task_counter FROM projects WHERE id = $1`,
      [projectId],
    );
    const taskNumber = projectRow.task_counter;

    const defaultStatus = await this.dataSource.query(
      `SELECT id FROM project_statuses WHERE project_id = $1 AND is_default = true LIMIT 1`,
      [projectId],
    );

    const subtask = this.taskRepo.create({
      projectId,
      parentId,
      taskNumber,
      title: dto.title,
      description: dto.description || null,
      type: (dto.type as Task['type']) || 'task',
      priority: (dto.priority as Task['priority']) || 'medium',
      storyPoints: dto.storyPoints ?? null,
      statusId: defaultStatus[0].id,
      reporterId: userId,
    });
    const saved = await this.taskRepo.save(subtask);

    const list = await this.listSubtasks(projectId, parentId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listSubtasks(projectId: number, parentId: number) {
    const subtasks = await this.taskRepo.find({
      where: { projectId, parentId },
      order: { createdAt: 'ASC' },
    });
    return new PaginatedResponse(subtasks, subtasks.length, 1, subtasks.length || 1);
  }

  // --- Checklist ---

  async createChecklistItem(projectId: number, taskId: number, dto: CreateChecklistItemDto) {
    const task = await this.findOne(projectId, taskId);

    // Must be a subtask
    if (task.parentId === null) {
      throw new AppLogicException('CHECKLIST_NOT_SUBTASK', HttpStatus.BAD_REQUEST);
    }

    const maxOrder = await this.checklistRepo
      .createQueryBuilder('c')
      .where('c.taskId = :taskId', { taskId })
      .select('MAX(c.sortOrder)', 'max')
      .getRawOne();

    const item = this.checklistRepo.create({
      taskId,
      title: dto.title,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    });
    return this.checklistRepo.save(item);
  }

  async updateChecklistItem(projectId: number, taskId: number, itemId: number, dto: UpdateChecklistItemDto) {
    await this.findOne(projectId, taskId);

    const item = await this.checklistRepo.findOne({ where: { id: itemId, taskId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (dto.title !== undefined) item.title = dto.title;
    if (dto.isCompleted !== undefined) item.isCompleted = dto.isCompleted;
    return this.checklistRepo.save(item);
  }

  async deleteChecklistItem(projectId: number, taskId: number, itemId: number) {
    await this.findOne(projectId, taskId);

    const item = await this.checklistRepo.findOne({ where: { id: itemId, taskId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.checklistRepo.remove(item);
  }

  // --- Dependencies ---

  async createDependency(projectId: number, taskId: number, dto: CreateDependencyDto, userId: number) {
    await this.findOne(projectId, taskId);
    await this.findOne(projectId, dto.dependsOnTaskId);

    // Check for circular dependencies using BFS
    if (dto.dependencyType === 'blocks') {
      const hasCircular = await this.detectCircularDependency(dto.dependsOnTaskId, taskId);
      if (hasCircular) {
        throw new AppLogicException('CIRCULAR_DEPENDENCY', HttpStatus.CONFLICT);
      }
    }

    const dep = this.depRepo.create({
      taskId,
      dependsOnTaskId: dto.dependsOnTaskId,
      dependencyType: dto.dependencyType,
      createdBy: userId,
    });
    return this.depRepo.save(dep);
  }

  async deleteDependency(projectId: number, taskId: number, depId: number) {
    await this.findOne(projectId, taskId);

    const dep = await this.depRepo.findOne({ where: { id: depId, taskId } });
    if (!dep) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.depRepo.remove(dep);
  }

  private async detectCircularDependency(fromTaskId: number, targetTaskId: number): Promise<boolean> {
    // We're about to add: targetTaskId depends on fromTaskId
    // Check: does fromTaskId already (transitively) depend on targetTaskId?
    // BFS from fromTaskId, following the "depends on" chain (taskId -> dependsOnTaskId)
    const visited = new Set<number>();
    const queue: number[] = [fromTaskId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === targetTaskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Find what `current` depends on (where current is the taskId)
      const deps = await this.depRepo.find({
        where: { taskId: current, dependencyType: 'blocks' },
      });
      for (const dep of deps) {
        if (!visited.has(dep.dependsOnTaskId)) {
          queue.push(dep.dependsOnTaskId);
        }
      }
    }

    return false;
  }
}
