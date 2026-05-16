import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Epic } from './entities/epic.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';

@Injectable()
export class EpicsService {
  constructor(
    @InjectRepository(Epic)
    private readonly epicRepo: Repository<Epic>,
    private readonly dataSource: DataSource,
  ) {}

  async create(projectId: number, dto: CreateEpicDto, userId: number) {
    const epic = this.epicRepo.create({
      projectId,
      title: dto.title,
      description: dto.description || null,
      priority: (dto.priority as Epic['priority']) || 'medium',
      color: dto.color || '#6366F1',
      startDate: dto.startDate || null,
      targetDate: dto.targetDate || null,
      createdBy: userId,
    });
    const saved = await this.epicRepo.save(epic);
    const list = await this.listEpics(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listEpics(projectId: number, page: number = 1, limit: number = 20) {
    const qb = this.epicRepo.createQueryBuilder('e')
      .where('e.projectId = :projectId', { projectId })
      .orderBy('e.sortOrder', 'ASC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const epics = await qb.getMany();

    const data = await Promise.all(epics.map(async (epic) => {
      const stats = await this.dataSource.query(`
        SELECT
          COUNT(*)::int as total_tasks,
          COUNT(*) FILTER (WHERE ps.category = 'done')::int as completed_tasks,
          COALESCE(SUM(t.story_points), 0)::int as total_points,
          COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int as completed_points
        FROM tasks t
        JOIN project_statuses ps ON t.status_id = ps.id
        WHERE t.epic_id = $1 AND t.parent_id IS NULL
      `, [epic.id]);

      const totalTasks = parseInt(stats[0].total_tasks);
      const completedTasks = parseInt(stats[0].completed_tasks);

      return {
        ...epic,
        totalTasks,
        completedTasks,
        totalPoints: parseInt(stats[0].total_points),
        completedPoints: parseInt(stats[0].completed_points),
        progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      };
    }));

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(projectId: number, epicId: number) {
    const epic = await this.epicRepo.findOne({ where: { id: epicId, projectId } });
    if (!epic) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return epic;
  }

  async update(projectId: number, epicId: number, dto: UpdateEpicDto) {
    const epic = await this.findOne(projectId, epicId);
    if (dto.title !== undefined) epic.title = dto.title;
    if (dto.description !== undefined) epic.description = dto.description;
    if (dto.status !== undefined) epic.status = dto.status as Epic['status'];
    if (dto.priority !== undefined) epic.priority = dto.priority as Epic['priority'];
    if (dto.color !== undefined) epic.color = dto.color;
    if (dto.startDate !== undefined) epic.startDate = dto.startDate;
    if (dto.targetDate !== undefined) epic.targetDate = dto.targetDate;

    const saved = await this.epicRepo.save(epic);
    const list = await this.listEpics(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async remove(projectId: number, epicId: number) {
    const epic = await this.findOne(projectId, epicId);
    await this.epicRepo.remove(epic);
    const list = await this.listEpics(projectId);
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  async reorderEpics(projectId: number, reorders: { epicId: number; sortOrder: string }[]) {
    for (const { epicId, sortOrder } of reorders) {
      await this.epicRepo.update({ id: epicId, projectId }, { sortOrder });
    }
  }
}
