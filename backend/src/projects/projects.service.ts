import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectStatus } from './entities/project-status.entity';
import { Label } from './entities/label.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

const DEFAULT_STATUSES = [
  { name: 'Backlog', category: 'backlog' as const, sortOrder: 0, isDefault: true, color: '#6B7280' },
  { name: 'Todo', category: 'todo' as const, sortOrder: 1, isDefault: false, color: '#3B82F6' },
  { name: 'In Progress', category: 'in_progress' as const, sortOrder: 2, isDefault: false, color: '#F59E0B' },
  { name: 'In Review', category: 'in_review' as const, sortOrder: 3, isDefault: false, color: '#8B5CF6' },
  { name: 'Done', category: 'done' as const, sortOrder: 4, isDefault: false, color: '#22C55E' },
  { name: 'Cancelled', category: 'cancelled' as const, sortOrder: 5, isDefault: false, color: '#EF4444' },
];

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectStatus)
    private readonly statusRepo: Repository<ProjectStatus>,
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,
  ) {}

  async create(dto: CreateProjectDto, userId: number) {
    const existing = await this.projectRepo.findOne({ where: { prefix: dto.prefix } });
    if (existing) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    const project = this.projectRepo.create({
      name: dto.name,
      prefix: dto.prefix,
      description: dto.description || null,
      leadId: dto.leadId || null,
    });
    const saved = await this.projectRepo.save(project);

    // Create default statuses
    const statuses = DEFAULT_STATUSES.map((s) =>
      this.statusRepo.create({ ...s, projectId: saved.id }),
    );
    await this.statusRepo.save(statuses);

    // Add creator as project_manager
    const member = this.memberRepo.create({
      projectId: saved.id,
      userId,
      role: 'project_manager',
      addedBy: userId,
    });
    await this.memberRepo.save(member);

    const list = await this.listProjects(userId, 'admin', 1, 20);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listProjects(userId: number, role: string, page: number = 1, limit: number = 20) {
    const qb = this.projectRepo.createQueryBuilder('p')
      .leftJoin('p.lead', 'lead')
      .addSelect(['lead.id', 'lead.displayName', 'lead.avatarUrl']);

    if (role !== 'admin') {
      qb.innerJoin('p.members', 'pm', 'pm.userId = :userId', { userId });
    }

    qb.orderBy('p.createdAt', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const data = await qb.getMany();

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['lead'],
    });
    if (!project) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return project;
  }

  async update(id: number, dto: UpdateProjectDto, userId: number, role: string) {
    const project = await this.findOne(id);

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.leadId !== undefined) project.leadId = dto.leadId;
    if (dto.defaultSprintDuration !== undefined) project.defaultSprintDuration = dto.defaultSprintDuration;

    const saved = await this.projectRepo.save(project);
    const list = await this.listProjects(userId, role, 1, 20);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async remove(id: number, userId: number, role: string) {
    const project = await this.findOne(id);
    await this.projectRepo.remove(project);
    const list = await this.listProjects(userId, role, 1, 20);
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  // --- Members ---

  async addMember(projectId: number, dto: AddMemberDto, addedBy: number) {
    await this.findOne(projectId);

    const existing = await this.memberRepo.findOne({
      where: { projectId, userId: dto.userId },
    });
    if (existing) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    const member = this.memberRepo.create({
      projectId,
      userId: dto.userId,
      role: dto.role,
      addedBy,
    });
    const saved = await this.memberRepo.save(member);

    const list = await this.listMembers(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listMembers(projectId: number) {
    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return new PaginatedResponse(members, members.length, 1, members.length || 1);
  }

  async removeMember(projectId: number, userId: number) {
    const member = await this.memberRepo.findOne({ where: { projectId, userId } });
    if (!member) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.memberRepo.remove(member);
    const list = await this.listMembers(projectId);
    return PaginatedMutationResponse.forPaginated(null, list);
  }

  // --- Statuses ---

  async listStatuses(projectId: number) {
    return this.statusRepo.find({
      where: { projectId },
      order: { sortOrder: 'ASC' },
    });
  }

  async createStatus(projectId: number, dto: CreateStatusDto) {
    await this.findOne(projectId);

    const maxOrder = await this.statusRepo
      .createQueryBuilder('s')
      .where('s.projectId = :projectId', { projectId })
      .select('MAX(s.sortOrder)', 'max')
      .getRawOne();

    const status = this.statusRepo.create({
      projectId,
      name: dto.name,
      category: dto.category,
      color: dto.color,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    });
    return this.statusRepo.save(status);
  }

  async deleteStatus(projectId: number, statusId: number) {
    const status = await this.statusRepo.findOne({ where: { id: statusId, projectId } });
    if (!status) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check if it's the last status in required categories
    if (status.category === 'backlog' || status.category === 'done') {
      const countInCategory = await this.statusRepo.count({
        where: { projectId, category: status.category },
      });
      if (countInCategory <= 1) {
        throw new AppLogicException('STATUS_CATEGORY_REQUIRED', HttpStatus.CONFLICT);
      }
    }

    // TODO: Check if status has tasks assigned (STATUS_IN_USE) - will be enforced in Phase 5

    await this.statusRepo.remove(status);
  }

  // --- Labels ---

  async listLabels(projectId: number) {
    return this.labelRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async createLabel(projectId: number, dto: CreateLabelDto) {
    await this.findOne(projectId);

    const existing = await this.labelRepo.findOne({
      where: { projectId, name: dto.name },
    });
    if (existing) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    const label = this.labelRepo.create({
      projectId,
      name: dto.name,
      color: dto.color,
    });
    return this.labelRepo.save(label);
  }

  async updateLabel(projectId: number, labelId: number, dto: UpdateLabelDto) {
    const label = await this.labelRepo.findOne({ where: { id: labelId, projectId } });
    if (!label) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (dto.name !== undefined) label.name = dto.name;
    if (dto.color !== undefined) label.color = dto.color;
    return this.labelRepo.save(label);
  }

  async deleteLabel(projectId: number, labelId: number) {
    const label = await this.labelRepo.findOne({ where: { id: labelId, projectId } });
    if (!label) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.labelRepo.remove(label);
  }
}
