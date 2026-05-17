import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TaskType } from '../projects/entities/task-type.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';

@Injectable()
export class TaskTypesService {
  constructor(
    @InjectRepository(TaskType)
    private readonly typeRepo: Repository<TaskType>,
    private readonly dataSource: DataSource,
  ) {}

  async list(projectId: number) {
    const types = await this.typeRepo.find({
      where: { projectId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return new PaginatedResponse(types, types.length, 1, types.length || 1);
  }

  async create(projectId: number, dto: CreateTaskTypeDto) {
    // Check unique name
    const existing = await this.typeRepo.findOne({
      where: { projectId, name: dto.name },
    });
    if (existing) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    // Get max sortOrder
    const maxOrder = await this.typeRepo
      .createQueryBuilder('tt')
      .where('tt.projectId = :projectId', { projectId })
      .select('MAX(tt.sortOrder)', 'max')
      .getRawOne();

    const taskType = this.typeRepo.create({
      projectId,
      name: dto.name,
      color: dto.color || '#6B7280',
      icon: dto.icon || 'circle-dot',
      isBuiltin: false,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    });
    const saved = await this.typeRepo.save(taskType);

    const list = await this.list(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async update(projectId: number, typeId: number, dto: UpdateTaskTypeDto) {
    const taskType = await this.typeRepo.findOne({
      where: { id: typeId, projectId },
    });
    if (!taskType) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check unique name if changing
    if (dto.name !== undefined && dto.name !== taskType.name) {
      const existing = await this.typeRepo.findOne({
        where: { projectId, name: dto.name },
      });
      if (existing) {
        throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
      }
    }

    if (dto.name !== undefined) taskType.name = dto.name;
    if (dto.color !== undefined) taskType.color = dto.color;
    if (dto.icon !== undefined) taskType.icon = dto.icon;

    const saved = await this.typeRepo.save(taskType);
    const list = await this.list(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async remove(projectId: number, typeId: number) {
    const taskType = await this.typeRepo.findOne({
      where: { id: typeId, projectId },
    });
    if (!taskType) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (taskType.isBuiltin) {
      throw new AppLogicException('BUILTIN_TYPE', HttpStatus.BAD_REQUEST);
    }

    // Check if any tasks use this type
    const [taskCount] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS count FROM tasks WHERE type_id = $1',
      [typeId],
    );
    if (taskCount.count > 0) {
      throw new AppLogicException('TYPE_IN_USE', HttpStatus.CONFLICT);
    }

    await this.typeRepo.remove(taskType);
    const list = await this.list(projectId);
    return PaginatedMutationResponse.forPaginated(null, list);
  }
}
