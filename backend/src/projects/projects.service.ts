import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { clampLimit } from '../common/helpers/pagination.helper';

const DEFAULT_STATUSES = [
  { name: 'Open', category: 'backlog' as const, sortOrder: 0, isDefault: true, color: '#6D7F8E', isFixed: true },
  { name: 'In Progress', category: 'in_progress' as const, sortOrder: 1, isDefault: false, color: '#C4A882', isFixed: true },
  { name: 'Done', category: 'done' as const, sortOrder: 2, isDefault: false, color: '#558A7A', isFixed: true },
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
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateProjectDto, userId: number) {
    const existing = await this.projectRepo.findOne({ where: { prefix: dto.prefix } });
    if (existing) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    // Atomically create the project, its default statuses and the creator
    // membership — if any write fails the whole thing rolls back, so we never
    // leave a half-created project with no statuses and/or no members.
    const saved = await this.dataSource.transaction(async (manager) => {
      const project = manager.create(Project, {
        name: dto.name,
        prefix: dto.prefix,
        description: dto.description || null,
        leadId: dto.leadId || null,
      });
      const savedProject = await manager.save(Project, project);

      // Create default statuses
      const statuses = DEFAULT_STATUSES.map((s) =>
        manager.create(ProjectStatus, { ...s, projectId: savedProject.id }),
      );
      await manager.save(ProjectStatus, statuses);

      // Add creator as project_manager
      const member = manager.create(ProjectMember, {
        projectId: savedProject.id,
        userId,
        role: 'project_manager',
        addedBy: userId,
      });
      await manager.save(ProjectMember, member);

      return savedProject;
    });

    const list = await this.listProjects(userId, 'admin', 1, 20);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listProjects(userId: number, role: string, page: number = 1, limit: number = 20, filters?: { status?: string; search?: string }) {
    limit = clampLimit(limit);
    const qb = this.projectRepo.createQueryBuilder('p')
      .leftJoin('p.lead', 'lead')
      .addSelect(['lead.id', 'lead.displayName', 'lead.avatarUrl']);

    if (role !== 'admin') {
      qb.innerJoin('p.members', 'pm', 'pm.userId = :userId', { userId });
    }

    if (filters?.status) {
      qb.andWhere('p.status = :pstatus', { pstatus: filters.status });
    }
    if (filters?.search) {
      qb.andWhere('p.name ILIKE :psearch', { psearch: `%${filters.search}%` });
    }

    qb.orderBy('p.createdAt', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const entities = await qb.getMany();

    // Batch-load computed fields
    const data = await Promise.all(entities.map(async (project) => {
      const [memberCountRow] = await this.dataSource.query(
        'SELECT COUNT(*) as count FROM project_members WHERE project_id = $1',
        [project.id],
      );
      const [taskCountRow] = await this.dataSource.query(
        'SELECT COUNT(*) as count FROM work_items WHERE project_id = $1 AND item_type IN (\'task\')',
        [project.id],
      );
      return {
        ...project,
        memberCount: parseInt(memberCountRow.count),
        taskCount: parseInt(taskCountRow.count),
      };
    }));

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
    if (dto.defaultAssigneeId !== undefined) project.defaultAssigneeId = dto.defaultAssigneeId;
    if (dto.defaultSprintDuration !== undefined) project.defaultSprintDuration = dto.defaultSprintDuration;
    if (dto.estimationScale !== undefined) project.estimationScale = dto.estimationScale;

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

  async archive(id: number, userId: number, role: string) {
    const project = await this.findOne(id);
    project.status = 'archived';
    const saved = await this.projectRepo.save(project);
    const list = await this.listProjects(userId, role, 1, 20);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async unarchive(id: number, userId: number, role: string) {
    const project = await this.findOne(id);
    project.status = 'active';
    const saved = await this.projectRepo.save(project);
    const list = await this.listProjects(userId, role, 1, 20);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  // --- Members ---

  async addMember(projectId: number, dto: AddMemberDto, addedBy: number) {
    const project = await this.findOne(projectId);

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

    this.eventEmitter.emit('project.member_added', { userId: dto.userId, projectId, actorId: addedBy, projectName: project.name });

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

  async updateMemberRole(projectId: number, userId: number, role: 'project_manager' | 'member' | 'viewer') {
    const member = await this.memberRepo.findOne({ where: { projectId, userId } });
    if (!member) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    member.role = role;
    const saved = await this.memberRepo.save(member);
    const list = await this.listMembers(projectId);
    return PaginatedMutationResponse.forPaginated(saved, list);
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

  async updateStatus(projectId: number, statusId: number, dto: { name?: string; color?: string; category?: string; wipLimit?: number }) {
    const status = await this.statusRepo.findOne({ where: { id: statusId, projectId } });
    if (!status) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    // All statuses: allow name, color, wipLimit changes
    if (dto.name !== undefined) status.name = dto.name;
    if (dto.color !== undefined) status.color = dto.color;
    if (dto.wipLimit !== undefined) status.wipLimit = dto.wipLimit;
    // Category change only on non-fixed statuses
    if (!status.isFixed && dto.category !== undefined) {
      status.category = dto.category as any;
    }
    return this.statusRepo.save(status);
  }

  async reorderStatuses(projectId: number, statusIds: number[]) {
    // Validate that statusIds is an exact permutation of the project's own
    // statuses — same length, same elements, no duplicates, no foreign/unknown
    // ids. A partial or tampered list would otherwise produce a broken ordering.
    const existing = await this.statusRepo.find({
      where: { projectId },
      select: ['id'],
    });
    const validIds = new Set(existing.map((s) => s.id));
    const supplied = new Set(statusIds);

    const isPermutation =
      Array.isArray(statusIds) &&
      statusIds.length === existing.length &&
      supplied.size === statusIds.length &&
      statusIds.every((id) => validIds.has(id));

    if (!isPermutation) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }

    // Apply the sortOrder updates atomically — a mid-loop failure must not
    // leave statuses with inconsistent sortOrders.
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < statusIds.length; i++) {
        await manager.update(ProjectStatus, { id: statusIds[i], projectId }, { sortOrder: i });
      }
    });

    return this.listStatuses(projectId);
  }

  async deleteStatus(projectId: number, statusId: number) {
    const status = await this.statusRepo.findOne({ where: { id: statusId, projectId } });
    if (!status) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Fixed statuses cannot be deleted
    if (status.isFixed) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    // Check if status has tasks assigned
    const taskCount = await this.dataSource.query(
      'SELECT COUNT(*)::int as count FROM work_items WHERE status_id = $1',
      [statusId],
    );
    if (parseInt(taskCount[0].count) > 0) {
      throw new AppLogicException('STATUS_IN_USE', HttpStatus.CONFLICT);
    }

    await this.statusRepo.remove(status);
  }

  // --- Labels ---

  async listLabels(projectId: number) {
    const labels = await this.dataSource.query(`
      SELECT l.id, l.name, l.color, l.created_at AS "createdAt",
        COALESCE((SELECT COUNT(*)::int FROM work_item_labels tl WHERE tl.label_id = l.id), 0) AS "taskCount"
      FROM labels l
      WHERE l.project_id = $1
      ORDER BY l.created_at ASC
    `, [projectId]);
    return labels;
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
