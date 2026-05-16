import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from '../tasks/entities/task.entity';
import { ProjectStatus } from '../projects/entities/project-status.entity';
import { TaskDependency } from '../tasks/entities/task-dependency.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(ProjectStatus)
    private readonly statusRepo: Repository<ProjectStatus>,
    @InjectRepository(TaskDependency)
    private readonly depRepo: Repository<TaskDependency>,
    private readonly dataSource: DataSource,
  ) {}

  async getBoard(projectId: number, filters: { sprintId?: number; assigneeId?: number; priority?: string; epicId?: number }) {
    const statuses = await this.statusRepo.find({
      where: { projectId },
      order: { sortOrder: 'ASC' },
    });

    const columns = [];
    for (const status of statuses) {
      const qb = this.taskRepo.createQueryBuilder('t')
        .where('t.projectId = :projectId', { projectId })
        .andWhere('t.statusId = :statusId', { statusId: status.id })
        .andWhere('t.parentId IS NULL');

      if (filters.sprintId) {
        qb.andWhere('t.sprintId = :sprintId', { sprintId: filters.sprintId });
      }
      if (filters.assigneeId) {
        qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: filters.assigneeId });
      }
      if (filters.priority) {
        qb.andWhere('t.priority = :priority', { priority: filters.priority });
      }
      if (filters.epicId) {
        qb.andWhere('t.epicId = :epicId', { epicId: filters.epicId });
      }

      qb.leftJoin('t.assignee', 'assignee')
        .addSelect(['assignee.id', 'assignee.displayName', 'assignee.avatarUrl'])
        .leftJoinAndSelect('t.labels', 'labels');

      qb.orderBy('t.sortOrder', 'ASC');

      const tasks = await qb.getMany();
      const taskCount = tasks.length;

      // Enrich tasks with counts and blocker info
      const enrichedTasks = await Promise.all(tasks.map(async (t) => {
        const subtaskCount = await this.taskRepo.count({ where: { parentId: t.id } });
        const subtaskDoneCount = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM tasks t JOIN project_statuses ps ON t.status_id = ps.id WHERE t.parent_id = $1 AND ps.category = 'done'`,
          [t.id],
        );
        const hasBlockers = await this.depRepo.count({ where: { taskId: t.id, dependencyType: 'blocks' } }) > 0;

        return {
          id: t.id,
          taskNumber: t.taskNumber,
          title: t.title,
          type: t.type,
          priority: t.priority,
          assigneeId: t.assigneeId,
          assignee: (t as any).assignee ? { id: (t as any).assignee.id, displayName: (t as any).assignee.displayName, avatarUrl: (t as any).assignee.avatarUrl } : null,
          labels: (t as any).labels || [],
          storyPoints: t.storyPoints,
          sortOrder: t.sortOrder,
          epicId: t.epicId,
          subtaskCount,
          subtaskDoneCount: parseInt(subtaskDoneCount[0]?.count || '0'),
          hasBlockers,
        };
      }));

      columns.push({
        status: {
          id: status.id,
          name: status.name,
          category: status.category,
          color: status.color,
        },
        tasks: enrichedTasks,
        taskCount,
      });
    }

    return { columns };
  }

  async moveCard(projectId: number, taskId: number, statusId: number, sortOrder: string) {
    const task = await this.taskRepo.findOne({ where: { id: taskId, projectId } });
    if (!task) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check target status exists
    const targetStatus = await this.statusRepo.findOne({ where: { id: statusId, projectId } });
    if (!targetStatus) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check dependency blocks when moving to done
    if (targetStatus.category === 'done') {
      const blockers = await this.depRepo.find({
        where: { taskId, dependencyType: 'blocks' },
      });

      for (const dep of blockers) {
        const blockerTask = await this.taskRepo.findOne({ where: { id: dep.dependsOnTaskId } });
        if (blockerTask) {
          const blockerStatus = await this.statusRepo.findOne({ where: { id: blockerTask.statusId } });
          if (blockerStatus?.category !== 'done') {
            throw new AppLogicException('TASK_BLOCKED', HttpStatus.CONFLICT);
          }
        }
      }

      task.completedAt = new Date();
    } else {
      // Moving out of done - clear completedAt
      const currentStatus = await this.statusRepo.findOne({ where: { id: task.statusId } });
      if (currentStatus?.category === 'done') {
        task.completedAt = null;
      }
    }

    task.statusId = statusId;
    task.sortOrder = sortOrder;
    await this.taskRepo.save(task);

    // Return lightweight response
    return {
      id: task.id,
      taskNumber: task.taskNumber,
      statusId: task.statusId,
      sortOrder: task.sortOrder,
      completedAt: task.completedAt,
    };
  }
}
