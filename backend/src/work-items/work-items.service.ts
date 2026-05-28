import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkItem } from './entities/work-item.entity';
import { WorkItemAssociation } from './entities/work-item-association.entity';
import { AcceptanceCriterion } from './entities/acceptance-criterion.entity';
import { ReleaseNote } from './entities/release-note.entity';
import {
  CreateAcceptanceCriterionDto,
  UpdateAcceptanceCriterionDto,
} from './dto/acceptance-criterion.dto';
import { UpsertReleaseNoteDto } from './dto/release-note.dto';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { MoveWorkItemDto } from './dto/move-work-item.dto';
import { QueryWorkItemsDto } from './dto/query-work-items.dto';
import { AssignSprintDto } from './dto/assign-sprint.dto';
import { AssignWorkItemDto } from './dto/assign-work-item.dto';
import { clampLimit } from '../common/helpers/pagination.helper';

@Injectable()
export class WorkItemsService {
  constructor(
    @InjectRepository(WorkItem)
    private readonly workItemRepo: Repository<WorkItem>,
    @InjectRepository(WorkItemAssociation)
    private readonly assocRepo: Repository<WorkItemAssociation>,
    @InjectRepository(AcceptanceCriterion)
    private readonly criterionRepo: Repository<AcceptanceCriterion>,
    @InjectRepository(ReleaseNote)
    private readonly releaseNoteRepo: Repository<ReleaseNote>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // =========================================================================
  // SERIALIZATION HELPERS
  // =========================================================================

  /**
   * Serialize a user with a derived `@handle` (email local-part). Users have
   * no handle column; this keeps the derivation identical everywhere a user
   * is exposed in story responses (assignee/reporter/verifier/watchers).
   */
  private formatUser(u: any | null | undefined) {
    if (!u) return null;
    const email: string | undefined = u.email;
    return {
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl ?? null,
      handle: email ? email.split('@')[0] : null,
    };
  }

  private formatCriterion(c: AcceptanceCriterion, projectPrefix?: string) {
    const structured = c.whenText != null && c.thenText != null;
    return {
      id: c.id,
      givenText: c.givenText,
      whenText: c.whenText,
      thenText: c.thenText,
      structured,
      isMet: c.isMet,
      verifiedAt: c.verifiedAt,
      verifier: c.verifier ? this.formatUser(c.verifier) : null,
      linkedItem: c.linkedItem
        ? {
            id: c.linkedItem.id,
            itemKey: projectPrefix ? `${projectPrefix}-${c.linkedItem.itemNumber}` : `${c.linkedItem.itemNumber}`,
            itemType: c.linkedItem.itemType,
            title: c.linkedItem.title,
            statusName: (c.linkedItem as any).status?.name ?? null,
            statusCategory: (c.linkedItem as any).status?.category ?? null,
          }
        : null,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  // =========================================================================
  // PUBLIC API METHODS (implemented in Steps 2C–2F)
  // =========================================================================

  async create(projectId: number, dto: CreateWorkItemDto, userId: number) {
    const itemType = dto.itemType;

    // Load parent if provided
    let parent: WorkItem | null = null;
    if (dto.parentId) {
      parent = await this.workItemRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Parent item not found');
      }
      // Cross-project check
      if (parent.projectId !== projectId) {
        throw new AppLogicException('CROSS_PROJECT_NOT_ALLOWED', HttpStatus.BAD_REQUEST);
      }
    }

    // Validate parent-child type combination
    await this.validateParentChildType(itemType, parent);

    // Validate depth
    await this.validateDepth(dto.parentId ?? null);

    // Wrap the whole mutation in a transaction (D-C4) — the item-counter
    // increment, the work_item INSERT, label INSERTs and the association
    // INSERT must all commit together or roll back together. Otherwise a
    // mid-way failure permanently consumes the project's item counter.
    const { result, response } = await this.dataSource.transaction(async (manager) => {
      // Validate every cross-referenced id belongs to this project BEFORE the
      // counter increment — a throw here rolls the whole transaction back so
      // the project's item counter is not consumed (Task 2.5, audit §4.2/§4.3).
      if (dto.statusId) {
        await this.validateStatusInProject(dto.statusId, projectId, manager);
      }
      if (dto.sprintId && itemType !== 'subtask') {
        await this.validateSprintInProject(dto.sprintId, projectId, manager);
      }
      if (dto.labelIds && dto.labelIds.length > 0) {
        await this.validateLabelsInProject(dto.labelIds, projectId, manager);
      }
      if (dto.assigneeId) {
        await this.validateAssigneeInProject(dto.assigneeId, projectId, manager);
      }

      // Atomically increment project.itemCounter and read the new value in a
      // single statement — a separate UPDATE then SELECT races under concurrent
      // creation and produces duplicate itemNumbers (D-C3). TypeORM's query()
      // returns [rows, affectedCount] for UPDATE...RETURNING, so unwrap defensively.
      const counterResult = await manager.query(
        `UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter, prefix`,
        [projectId],
      );
      const counterRows = Array.isArray(counterResult[0]) ? counterResult[0] : counterResult;
      const projectRow = counterRows[0];
      const itemNumber = projectRow.item_counter;
      const projectPrefix: string = projectRow.prefix;

      // Resolve statusId — use provided or project default
      let statusId = dto.statusId ?? null;
      if (!statusId) {
        const [defaultStatus] = await manager.query(
          `SELECT id FROM project_statuses WHERE project_id = $1 AND is_default = true LIMIT 1`,
          [projectId],
        );
        statusId = defaultStatus?.id;
        if (!statusId) {
          throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'No default status found');
        }
      }

      // Subtasks: sprintId is ALWAYS null
      let sprintId: number | null = null;
      if (itemType !== 'subtask') {
        sprintId = dto.sprintId ?? null;
      }

      // Detect addedMidSprint for tasks added to an active sprint
      let addedMidSprint = false;
      if (itemType === 'task' && sprintId) {
        const [sprint] = await manager.query(
          `SELECT status FROM sprints WHERE id = $1`,
          [sprintId],
        );
        if (sprint && sprint.status === 'active') {
          addedMidSprint = true;
        }
      }

      // Create the work item
      const workItem = manager.create(WorkItem, {
        projectId,
        itemType,
        parentId: dto.parentId ?? null,
        itemNumber,
        title: dto.title,
        description: dto.description ?? null,
        userStory: dto.userStory ?? null,
        statusId,
        priority: (dto.priority as WorkItem['priority']) || 'medium',
        sprintId,
        storyPoints: dto.storyPoints ?? null,
        estimatedAt: dto.storyPoints != null ? new Date() : null,
        assigneeId: dto.assigneeId ?? null,
        reporterId: userId,
        sortOrder: 'n',
        endDate: dto.endDate ?? null,
        startDate: dto.startDate ?? null,
        addedMidSprint,
      });

      const saved = await manager.save(WorkItem, workItem);

      // Handle labels
      if (dto.labelIds && dto.labelIds.length > 0) {
        for (const labelId of dto.labelIds) {
          await manager.query(
            `INSERT INTO work_item_labels (work_item_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [saved.id, labelId],
          );
        }
      }

      // Create association if provided — must run inside the transaction, so
      // do it before the final relations reload.
      if (dto.linkedItemId && dto.linkType) {
        await this.createAssociation(projectId, saved.id, dto.linkedItemId, dto.linkType, userId, manager);
      }

      if (itemType === 'subtask' && dto.parentId) {
        await this.createAssociation(projectId, saved.id, dto.parentId, 'belongs_to', userId, manager);
      }

      // Reload with relations for response
      const result = await manager.findOne(WorkItem, {
        where: { id: saved.id },
        relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
      });

      // Build response shape matching API spec
      const childCount = await manager.query(
        `SELECT COUNT(*) as cnt FROM work_items WHERE parent_id = $1`,
        [saved.id],
      );

      const response = this.formatItemResponse(result!, parseInt(childCount[0].cnt), projectPrefix);

      return { result, response };
    });

    // Emit domain event only after the transaction commits.
    this.eventEmitter.emit('work_item.created', {
      item: result,
      userId,
      projectId,
    });

    return { item: response };
  }

  /**
   * Formats a WorkItem entity into the API response shape.
   */
  private formatItemResponse(item: WorkItem, childCount = 0, projectPrefix?: string) {
    return {
      id: item.id,
      itemKey: projectPrefix ? `${projectPrefix}-${item.itemNumber}` : null as string | null,
      itemType: item.itemType,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status ? {
        id: item.status.id,
        name: item.status.name,
        category: (item.status as any).category,
        color: (item.status as any).color,
      } : null,
      parentId: item.parentId,
      statusId: item.statusId,
      sprint: item.sprint ? {
        id: item.sprint.id,
        name: item.sprint.name,
      } : null,
      sprintId: item.sprintId,
      assignee: item.assignee ? {
        id: item.assignee.id,
        displayName: (item.assignee as any).displayName,
        avatarUrl: (item.assignee as any).avatarUrl,
      } : null,
      assigneeId: item.assigneeId,
      reporter: item.reporter ? {
        id: item.reporter.id,
        displayName: (item.reporter as any).displayName,
        avatarUrl: (item.reporter as any).avatarUrl ?? null,
      } : null,
      reporterId: item.reporterId,
      reviewerId: item.reviewerId,
      storyPoints: item.storyPoints,
      endDate: item.endDate,
      startDate: item.startDate,
      labels: (item.labels || []).map((l) => ({
        id: l.id,
        name: l.name,
        color: (l as any).color,
      })),
      sortOrder: item.sortOrder,
      addedMidSprint: item.addedMidSprint,
      completedAt: item.completedAt,
      itemNumber: item.itemNumber,
      childCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async findAll(projectId: number, query: QueryWorkItemsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = clampLimit(query.limit);

    const qb = this.workItemRepo.createQueryBuilder('wi')
      .leftJoinAndSelect('wi.status', 'status')
      .leftJoinAndSelect('wi.assignee', 'assignee')
      .leftJoinAndSelect('wi.sprint', 'sprint')
      .leftJoinAndSelect('wi.labels', 'labels')
      .where('wi.projectId = :projectId', { projectId })
      // Phase 10 — soft-deleted rows are filtered out by default.
      .andWhere('wi.deletedAt IS NULL');

    // Filter: itemType (comma-separated)
    if (query.itemType) {
      const types = query.itemType.split(',').map(t => t.trim());
      qb.andWhere('wi.itemType IN (:...types)', { types });
    }

    // Filter: parentId (number or 'null' for root items)
    if (query.parentId !== undefined) {
      if (query.parentId === 'null') {
        qb.andWhere('wi.parentId IS NULL');
      } else {
        qb.andWhere('wi.parentId = :parentId', { parentId: parseInt(query.parentId) });
      }
    }

    // Filter: status (comma-separated IDs)
    if (query.status) {
      const statusIds = query.status.split(',').map(s => parseInt(s.trim()));
      qb.andWhere('wi.statusId IN (:...statusIds)', { statusIds });
    }

    // Filter: priority (comma-separated)
    if (query.priority) {
      const priorities = query.priority.split(',').map(p => p.trim());
      qb.andWhere('wi.priority IN (:...priorities)', { priorities });
    }

    // Filter: assigneeId
    if (query.assigneeId) {
      qb.andWhere('wi.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
    }

    // Filter: sprintId
    if (query.sprintId) {
      qb.andWhere('wi.sprintId = :sprintId', { sprintId: query.sprintId });
    }

    // Filter: labelId
    if (query.labelId) {
      qb.andWhere((qb2) => {
        const subQuery = qb2.subQuery()
          .select('wil.work_item_id')
          .from('work_item_labels', 'wil')
          .where('wil.label_id = :labelId')
          .getQuery();
        return `wi.id IN ${subQuery}`;
      }).setParameter('labelId', query.labelId);
    }

    // Filter: full-text search + item number / item key
    if (query.search) {
      const term = query.search.trim();
      const numMatch = term.match(/^#?(\d+)$/) || term.match(/^[A-Za-z]+-(\d+)$/);
      if (numMatch) {
        qb.andWhere(`wi.item_number = :itemNum`, { itemNum: parseInt(numMatch[1], 10) });
      } else {
        qb.andWhere(
          `(wi.search_vector @@ plainto_tsquery('english', :search) OR wi.title ILIKE :titleLike)`,
          { search: term, titleLike: `%${term}%` },
        );
      }
    }

    // Sorting — subtasks always sort oldest-first within their parent group;
    // all other item types respect the caller's requested sort.
    const sortColumn = query.sort || 'createdAt';
    const sortOrder = query.order || 'DESC';
    const sortMap: Record<string, string> = {
      createdAt: 'wi.createdAt',
      updatedAt: 'wi.updatedAt',
      priority: 'wi.priority',
      endDate: 'wi.endDate',
      sortOrder: 'wi.sortOrder',
    };
    const sortField = sortMap[sortColumn] || 'wi.createdAt';
    qb.orderBy(sortField, sortOrder as 'ASC' | 'DESC');

    const [rawItems, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Stable sort: subtasks ordered oldest-first within their parent group
    const items = rawItems;
    items.sort((a, b) => {
      if (a.itemType === 'subtask' && b.itemType === 'subtask' && a.parentId === b.parentId) {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return 0;
    });

    // Get child counts for all items in batch
    const itemIds = items.map(i => i.id);
    let childCounts: Record<number, number> = {};
    if (itemIds.length > 0) {
      const counts = await this.dataSource.query(
        `SELECT parent_id, COUNT(*) as cnt FROM work_items WHERE parent_id = ANY($1) GROUP BY parent_id`,
        [itemIds],
      );
      for (const row of counts) {
        childCounts[row.parent_id] = parseInt(row.cnt);
      }
    }

    // Get project prefix for itemKey
    const [projectRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = projectRow?.prefix;

    const list = items.map(item => this.formatItemResponse(item, childCounts[item.id] || 0, projectPrefix));
    const paginated = new PaginatedResponse(list, total, page, limit);
    return paginated.toEnvelopeData();
  }

  async findOne(projectId: number, id: number) {
    const item = await this.workItemRepo.findOne({
      where: { id, projectId },
      relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
    });

    if (!item || item.deletedAt) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Get project prefix for itemKey
    const [projectRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = projectRow?.prefix;

    // Children (direct only) — oldest first
    const children = await this.workItemRepo.find({
      where: { parentId: id, deletedAt: IsNull() },
      relations: ['status', 'assignee'],
      order: { createdAt: 'ASC' },
    });

    const childrenFormatted = children.map(c => ({
      id: c.id,
      itemKey: projectPrefix ? `${projectPrefix}-${c.itemNumber}` : `${c.itemNumber}`,
      itemNumber: c.itemNumber,
      itemType: c.itemType,
      title: c.title,
      status: c.status ? { id: c.status.id, name: c.status.name, category: (c.status as any).category, color: (c.status as any).color } : null,
      priority: c.priority,
      assignee: c.assignee ? { id: c.assignee.id, displayName: (c.assignee as any).displayName, avatarUrl: (c.assignee as any).avatarUrl } : null,
      storyPoints: c.storyPoints,
      completedAt: c.completedAt,
    }));

    // Breadcrumb (walk up ancestors to root, then reverse)
    const breadcrumb: any[] = [];
    let current: WorkItem | null = item;
    const visited = new Set<number>();
    while (current) {
      visited.add(current.id);
      breadcrumb.unshift({
        id: current.id,
        itemKey: projectPrefix ? `${projectPrefix}-${current.itemNumber}` : `${current.itemNumber}`,
        itemType: current.itemType,
        title: current.title,
      });
      if (current.parentId && !visited.has(current.parentId)) {
        current = await this.workItemRepo.findOne({ where: { id: current.parentId } });
      } else {
        current = null;
      }
    }

    // Associations
    const associations = await this.listAssociations(projectId, id);

    // Progress (recursive CTE for epics/stories)
    let progress: any = null;
    const hasChildren = children.length > 0;
    if (hasChildren && (item.itemType === 'epic' || item.itemType === 'story')) {
      const progressResult = await this.dataSource.query(`
        WITH RECURSIVE descendants AS (
          SELECT a.item_id AS id, wi.status_id, wi.story_points, 1 as depth
          FROM work_item_associations a
          JOIN work_items wi ON wi.id = a.item_id
          WHERE a.linked_item_id = $1 AND a.link_type = 'belongs_to'
          UNION ALL
          SELECT a2.item_id, wi2.status_id, wi2.story_points, d.depth + 1
          FROM work_item_associations a2
          JOIN work_items wi2 ON wi2.id = a2.item_id
          JOIN descendants d ON a2.linked_item_id = d.id
          WHERE a2.link_type = 'belongs_to' AND d.depth < 4
        )
        SELECT
          COUNT(*) as total_items,
          COUNT(*) FILTER (WHERE ps.category = 'done') as completed_items,
          COALESCE(SUM(d.story_points), 0) as total_points,
          COALESCE(SUM(d.story_points) FILTER (WHERE ps.category = 'done'), 0) as completed_points
        FROM descendants d
        JOIN project_statuses ps ON ps.id = d.status_id
      `, [id]);

      const pr = progressResult[0];
      const totalItems = parseInt(pr.total_items);
      const completedItems = parseInt(pr.completed_items);
      progress = {
        totalItems,
        completedItems,
        totalPoints: parseInt(pr.total_points),
        completedPoints: parseInt(pr.completed_points),
        progressPercent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      };
    }

    // Comment and attachment counts
    const [commentRow] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM comments WHERE work_item_id = $1`,
      [id],
    );
    const [attachmentRow] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM attachments WHERE work_item_id = $1`,
      [id],
    );

    // Descendant breakdown (bugs + done/wip/open) via belongs_to tree.
    const statsMap = await this.computeDescendantStatsBatch([id]);
    const stats = statsMap.get(id);
    const bugCount = stats?.childBreakdown.bugs ?? 0;
    const childStatusBreakdown = stats?.childStatusBreakdown ?? { done: 0, wip: 0, open: 0 };

    // Parent epic (the belongs_to association whose linked item is an epic).
    const [epicRow] = await this.dataSource.query(
      `SELECT e.id, e.item_number, e.title
       FROM work_item_associations a
       JOIN work_items e ON e.id = a.linked_item_id
       WHERE a.item_id = $1 AND a.link_type = 'belongs_to' AND e.item_type = 'epic' AND e.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    const epic = epicRow
      ? {
          id: epicRow.id,
          itemKey: projectPrefix ? `${projectPrefix}-${epicRow.item_number}` : `${epicRow.item_number}`,
          title: epicRow.title,
        }
      : null;

    // Approver (if approved).
    let approver: ReturnType<WorkItemsService['formatUser']> = null;
    if (item.approvedBy) {
      const [approverUser] = await this.dataSource.query(
        `SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl", email FROM users WHERE id = $1`,
        [item.approvedBy],
      );
      approver = this.formatUser(approverUser);
    }

    // Acceptance criteria (full list + met/total summary).
    const acceptanceCriteria = await this.listAcceptanceCriteria(projectId, id);

    const baseResponse = this.formatItemResponse(item, children.length, projectPrefix);
    return {
      ...baseResponse,
      description: item.description,
      userStory: item.userStory,
      assignee: this.formatUser(item.assignee),
      reporter: this.formatUser(item.reporter),
      children: childrenFormatted,
      breadcrumb,
      associations,
      progress,
      bugCount,
      childStatusBreakdown,
      epic,
      acceptanceCriteria,
      estimatedAt: item.estimatedAt,
      approvedBy: item.approvedBy,
      approvedAt: item.approvedAt,
      approver,
      commentCount: parseInt(commentRow.cnt),
      attachmentCount: parseInt(attachmentRow.cnt),
    };
  }

  async findChildren(projectId: number, id: number, page?: number, limit?: number) {
    const p = Math.max(1, page || 1);
    const l = clampLimit(limit);

    // Verify parent exists in this project
    const parent = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!parent) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const [children, total] = await this.workItemRepo.findAndCount({
      where: { parentId: id, deletedAt: IsNull() },
      relations: ['status', 'assignee', 'labels'],
      order: { sortOrder: 'ASC' },
      skip: (p - 1) * l,
      take: l,
    });

    // Child counts for each child
    const childIds = children.map(c => c.id);
    let childCounts: Record<number, number> = {};
    if (childIds.length > 0) {
      const counts = await this.dataSource.query(
        `SELECT parent_id, COUNT(*) as cnt FROM work_items WHERE parent_id = ANY($1) GROUP BY parent_id`,
        [childIds],
      );
      for (const row of counts) {
        childCounts[row.parent_id] = parseInt(row.cnt);
      }
    }

    // Get project prefix for itemKey
    const [prefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = prefixRow?.prefix;

    const list = children.map(c => this.formatItemResponse(c, childCounts[c.id] || 0, projectPrefix));
    const paginated = new PaginatedResponse(list, total, p, l);
    return paginated.toEnvelopeData();
  }

  async update(projectId: number, id: number, dto: UpdateWorkItemDto, userId: number) {
    const item = await this.workItemRepo.findOne({
      where: { id, projectId },
    });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Reject sprintId change on subtask
    if (item.itemType === 'subtask' && dto.sprintId !== undefined) {
      throw new AppLogicException('SUBTASK_NO_SPRINT', HttpStatus.BAD_REQUEST);
    }

    // Validate cross-referenced ids belong to this project (Task 2.5,
    // audit §4.2/§4.3). statusId is validated separately below — null clears
    // the field and is always allowed.
    if (dto.sprintId) {
      await this.validateSprintInProject(dto.sprintId, projectId);
    }
    if (dto.labelIds && dto.labelIds.length > 0) {
      await this.validateLabelsInProject(dto.labelIds, projectId);
    }
    if (dto.assigneeId) {
      await this.validateAssigneeInProject(dto.assigneeId, projectId);
    }

    // Phase 2 — snapshot every field the activity rail wants granular
    // history for, BEFORE any mutation. The emitted `previous` map only
    // contains fields that actually changed so the listener can write
    // exactly one row per change without a no-op shuffle.
    const before = {
      statusId: item.statusId,
      title: item.title,
      priority: item.priority,
      storyPoints: item.storyPoints,
      assigneeId: item.assigneeId,
      sprintId: item.sprintId,
      startDate: item.startDate,
      endDate: item.endDate,
      reviewerId: item.reviewerId,
    };
    const previousStatusId = item.statusId;
    let statusChanged = false;

    // Handle status change
    if (dto.statusId !== undefined && dto.statusId !== item.statusId) {
      // Load new status to check category
      const [newStatus] = await this.dataSource.query(
        `SELECT id, category FROM project_statuses WHERE id = $1 AND project_id = $2`,
        [dto.statusId, projectId],
      );
      if (!newStatus) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.BAD_REQUEST, 'Status not found');
      }

      // If changing to 'done' category, check association blockers
      if (newStatus.category === 'done') {
        await this.assertNoOpenBlockers(id);
      }

      // Set or clear completedAt
      const [oldStatus] = await this.dataSource.query(
        `SELECT category FROM project_statuses WHERE id = $1`,
        [item.statusId],
      );
      if (newStatus.category === 'done' && oldStatus?.category !== 'done') {
        item.completedAt = new Date();
      } else if (newStatus.category !== 'done' && oldStatus?.category === 'done') {
        item.completedAt = null;
      }

      item.statusId = dto.statusId;
      statusChanged = true;
    }

    // Apply simple field updates
    if (dto.title !== undefined) item.title = dto.title;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.userStory !== undefined) item.userStory = dto.userStory;
    if (dto.priority !== undefined) item.priority = dto.priority as WorkItem['priority'];
    if (dto.storyPoints !== undefined) {
      // Stamp estimatedAt the first time points go from unset → set.
      if (item.storyPoints == null && dto.storyPoints != null && item.estimatedAt == null) {
        item.estimatedAt = new Date();
      }
      item.storyPoints = dto.storyPoints;
    }
    if (dto.assigneeId !== undefined) item.assigneeId = dto.assigneeId;
    if ((dto as any).reviewerId !== undefined) item.reviewerId = (dto as any).reviewerId;
    if (dto.endDate !== undefined) item.endDate = dto.endDate;
    if (dto.startDate !== undefined) item.startDate = dto.startDate;
    // Sprint — only for non-subtasks (subtask rejection handled above)
    if (dto.sprintId !== undefined && item.itemType !== 'subtask') {
      item.sprintId = dto.sprintId;
    }

    await this.workItemRepo.save(item);

    // Handle labels if provided
    if (dto.labelIds !== undefined) {
      // Remove existing labels
      await this.dataSource.query(
        `DELETE FROM work_item_labels WHERE work_item_id = $1`,
        [id],
      );
      // Add new labels
      for (const labelId of dto.labelIds) {
        await this.dataSource.query(
          `INSERT INTO work_item_labels (work_item_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, labelId],
        );
      }
    }

    // Reload with relations
    const result = await this.workItemRepo.findOne({
      where: { id },
      relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
    });

    const [childCount] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE parent_id = $1`,
      [id],
    );

    // Get project prefix for itemKey
    const [prefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = prefixRow?.prefix;

    const response = this.formatItemResponse(result!, parseInt(childCount.cnt), projectPrefix);

    // Phase 2 — build a `previous` map containing every field that
    // actually changed, with both old + new value. The activity
    // listener writes one row per change so the rail can render
    // "Alice raised priority to high" instead of "Alice updated BST-142".
    type FieldChanges = Partial<Record<keyof typeof before, { old: any; new: any }>>;
    const previous: FieldChanges = {};
    if (statusChanged) {
      previous.statusId = { old: previousStatusId, new: result!.statusId };
    }
    if (dto.title !== undefined && dto.title !== before.title) {
      previous.title = { old: before.title, new: result!.title };
    }
    if (dto.priority !== undefined && dto.priority !== before.priority) {
      previous.priority = { old: before.priority, new: result!.priority };
    }
    if (dto.storyPoints !== undefined && dto.storyPoints !== before.storyPoints) {
      previous.storyPoints = { old: before.storyPoints, new: result!.storyPoints };
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== before.assigneeId) {
      previous.assigneeId = { old: before.assigneeId, new: result!.assigneeId };
    }
    if (dto.sprintId !== undefined && dto.sprintId !== before.sprintId && item.itemType !== 'subtask') {
      previous.sprintId = { old: before.sprintId, new: result!.sprintId };
    }
    if (dto.startDate !== undefined && dto.startDate !== before.startDate) {
      previous.startDate = { old: before.startDate, new: result!.startDate };
    }
    if (dto.endDate !== undefined && dto.endDate !== before.endDate) {
      previous.endDate = { old: before.endDate, new: result!.endDate };
    }
    if ((dto as any).reviewerId !== undefined && (dto as any).reviewerId !== before.reviewerId) {
      previous.reviewerId = { old: before.reviewerId, new: result!.reviewerId };
    }

    this.eventEmitter.emit('work_item.updated', {
      item: result,
      userId,
      projectId,
      changes: dto,
      // Granular field changes (Phase 2). Empty object when the update
      // touched no tracked field; the listener treats that as a no-op
      // beyond the generic 'updated' row.
      previous,
    });

    return { item: response };
  }

  async remove(projectId: number, id: number, userId: number, hard = false) {
    const item = await this.workItemRepo.findOne({
      where: { id, projectId },
    });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    await this.validateDeletion(item);

    if (hard) {
      // Admin escape hatch — hard delete bypasses the soft-delete grace.
      await this.workItemRepo.remove(item);
    } else {
      // Phase 10 — soft delete by default. RetentionCron picks up rows
      // past the configured grace window (default 7 days) and hard-deletes
      // them. `deleted_at IS NOT NULL` rows are filtered out of every list.
      item.deletedAt = new Date();
      await this.workItemRepo.save(item);
    }

    this.eventEmitter.emit('work_item.deleted', {
      itemId: id,
      itemType: item.itemType,
      userId,
      projectId,
      soft: !hard,
    });

    return { item: null };
  }

  /**
   * Phase 10 — restore a soft-deleted item within the grace window.
   * Clears `deleted_at`; throws NOT_FOUND if the row is already hard-gone.
   */
  async restore(projectId: number, id: number, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (!item.deletedAt) {
      // Idempotent — already restored.
      return { item: this.formatItemResponse(item) };
    }
    item.deletedAt = null;
    await this.workItemRepo.save(item);
    this.eventEmitter.emit('work_item.restored', {
      itemId: id,
      itemType: item.itemType,
      userId,
      projectId,
    });
    return { item: this.formatItemResponse(item) };
  }

  async move(projectId: number, id: number, dto: MoveWorkItemDto, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const newParentId = dto.parentId ?? null;

    // Load new parent if provided
    let newParent: WorkItem | null = null;
    if (newParentId !== null) {
      newParent = await this.workItemRepo.findOne({ where: { id: newParentId } });
      if (!newParent) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Parent item not found');
      }
    }

    // Validate reparenting (cross-project, circular, depth, type, task-with-subtasks)
    await this.validateReparenting(item, newParent);

    // Perform the move
    item.parentId = newParentId;
    await this.workItemRepo.save(item);

    // Reload with relations
    const result = await this.workItemRepo.findOne({
      where: { id },
      relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
    });

    const [childCount] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE parent_id = $1`,
      [id],
    );

    // Get project prefix for itemKey
    const [movePrefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const moveProjectPrefix: string = movePrefixRow?.prefix;

    const response = this.formatItemResponse(result!, parseInt(childCount.cnt), moveProjectPrefix);

    this.eventEmitter.emit('work_item.moved', {
      item: result,
      oldParentId: item.parentId,
      newParentId,
      userId,
      projectId,
    });

    return { item: response };
  }

  async assignSprint(projectId: number, id: number, dto: AssignSprintDto, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Subtasks cannot be assigned to sprint
    if (item.itemType === 'subtask') {
      throw new AppLogicException('SUBTASK_NO_SPRINT', HttpStatus.BAD_REQUEST);
    }

    const sprintId = dto.sprintId ?? null;

    // Validate the sprint belongs to this project (Task 2.5, audit §4.2/§4.3).
    // null clears the field and is always allowed.
    if (sprintId !== null) {
      await this.validateSprintInProject(sprintId, projectId);
    }

    // Track addedMidSprint for tasks assigned to active sprint
    if (item.itemType === 'task' && sprintId !== null) {
      const [sprint] = await this.dataSource.query(
        `SELECT status FROM sprints WHERE id = $1 AND project_id = $2`,
        [sprintId, projectId],
      );
      if (sprint && sprint.status === 'active') {
        item.addedMidSprint = true;
      } else {
        item.addedMidSprint = false;
      }
    }

    item.sprintId = sprintId;
    await this.workItemRepo.save(item);

    // Reload with relations
    const result = await this.workItemRepo.findOne({
      where: { id },
      relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
    });

    const [childCount] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE parent_id = $1`,
      [id],
    );

    // Get project prefix for itemKey
    const [sprintPrefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const sprintProjectPrefix: string = sprintPrefixRow?.prefix;

    const response = this.formatItemResponse(result!, parseInt(childCount.cnt), sprintProjectPrefix);

    this.eventEmitter.emit('work_item.sprint_assigned', {
      item: result,
      sprintId,
      userId,
      projectId,
    });

    return { item: response };
  }

  async assign(projectId: number, id: number, dto: AssignWorkItemDto, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const assigneeId = dto.assigneeId ?? null;

    // Validate the assignee is a member of this project (Task 2.5,
    // audit §4.2/§4.3). null clears the field and is always allowed.
    if (assigneeId !== null) {
      await this.validateAssigneeInProject(assigneeId, projectId);
    }

    item.assigneeId = assigneeId;
    await this.workItemRepo.save(item);

    // Reload with relations
    const result = await this.workItemRepo.findOne({
      where: { id },
      relations: ['status', 'assignee', 'reporter', 'labels', 'sprint'],
    });

    const [childCount] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM work_items WHERE parent_id = $1`,
      [id],
    );

    const [prefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = prefixRow?.prefix;

    const response = this.formatItemResponse(result!, parseInt(childCount.cnt), projectPrefix);

    this.eventEmitter.emit('work_item.assigned', {
      itemId: id,
      projectId,
      actorId: userId,
      assigneeId,
    });
    this.eventEmitter.emit('work_item.updated', {
      item: result,
      userId,
      projectId,
      changes: { assigneeId },
    });

    return { item: response };
  }

  async reorderItems(projectId: number, reorders: { itemId: number; sortOrder: string }[]) {
    for (const { itemId, sortOrder } of reorders) {
      await this.workItemRepo.update({ id: itemId, projectId }, { sortOrder });
    }
  }

  // =========================================================================
  // CHECKLIST METHODS
  // =========================================================================

  async createChecklistItem(projectId: number, workItemId: number, title: string) {
    const item = await this.workItemRepo.findOne({ where: { id: workItemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    // HIERARCHY-RULES §8: checklist items only attach to tasks or subtasks.
    // Reject epic/story/bug with F-L-0033 CHECKLIST_NOT_SUBTASK.
    if (item.itemType !== 'task' && item.itemType !== 'subtask') {
      throw new AppLogicException('CHECKLIST_NOT_SUBTASK', HttpStatus.BAD_REQUEST);
    }

    const maxOrder = await this.dataSource.query(
      `SELECT COALESCE(MAX(sort_order), -1) as max FROM checklist_items WHERE work_item_id = $1`,
      [workItemId],
    );

    const [created] = await this.dataSource.query(
      `INSERT INTO checklist_items (work_item_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [workItemId, title, (maxOrder[0]?.max ?? -1) + 1],
    );
    return created;
  }

  async updateChecklistItem(projectId: number, workItemId: number, itemId: number, dto: { title?: string; isCompleted?: boolean }) {
    const item = await this.workItemRepo.findOne({ where: { id: workItemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (dto.title !== undefined) { sets.push(`title = $${paramIdx++}`); params.push(dto.title); }
    if (dto.isCompleted !== undefined) { sets.push(`is_completed = $${paramIdx++}`); params.push(dto.isCompleted); }

    if (sets.length === 0) return;

    params.push(itemId, workItemId);
    await this.dataSource.query(
      `UPDATE checklist_items SET ${sets.join(', ')} WHERE id = $${paramIdx++} AND work_item_id = $${paramIdx}`,
      params,
    );

    const [updated] = await this.dataSource.query(`SELECT * FROM checklist_items WHERE id = $1`, [itemId]);
    return updated;
  }

  async deleteChecklistItem(projectId: number, workItemId: number, itemId: number) {
    const item = await this.workItemRepo.findOne({ where: { id: workItemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    await this.dataSource.query(
      `DELETE FROM checklist_items WHERE id = $1 AND work_item_id = $2`,
      [itemId, workItemId],
    );
  }

  // =========================================================================
  // ASSOCIATION METHODS
  // =========================================================================

  async createAssociation(
    projectId: number,
    itemId: number,
    linkedItemId: number,
    linkType: string,
    userId: number,
    manager?: EntityManager,
  ) {
    // When invoked inside a transaction (e.g. from create()), route reads and
    // the association INSERT through the transaction's EntityManager so the
    // whole operation commits or rolls back atomically.
    const workItemRepo = manager ? manager.getRepository(WorkItem) : this.workItemRepo;
    const assocRepo = manager ? manager.getRepository(WorkItemAssociation) : this.assocRepo;

    const item = await workItemRepo.findOne({ where: { id: itemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const linked = await workItemRepo.findOne({ where: { id: linkedItemId, projectId } });
    if (!linked) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    if (itemId === linkedItemId) {
      throw new AppLogicException('CIRCULAR_REFERENCE', HttpStatus.BAD_REQUEST, 'Cannot link an item to itself');
    }

    // Circular blocks check
    if (linkType === 'blocks') {
      // Check: would this create a circular blocking chain?
      const visited = new Set<number>();
      const queue = [linkedItemId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === itemId) {
          throw new AppLogicException('CIRCULAR_DEPENDENCY', HttpStatus.CONFLICT);
        }
        if (visited.has(current)) continue;
        visited.add(current);
        const deps = await assocRepo.find({ where: { itemId: current, linkType: 'blocks' } });
        for (const dep of deps) {
          if (!visited.has(dep.linkedItemId)) queue.push(dep.linkedItemId);
        }
      }
    }

    const assoc = assocRepo.create({
      itemId,
      linkedItemId,
      linkType: linkType as any,
      createdBy: userId,
    });
    return assocRepo.save(assoc);
  }

  async deleteAssociation(projectId: number, itemId: number, assocId: number) {
    const item = await this.workItemRepo.findOne({ where: { id: itemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const assoc = await this.assocRepo.findOne({ where: { id: assocId, itemId } });
    if (!assoc) {
      // Also check incoming (for bidirectional like relates_to)
      const incoming = await this.assocRepo.findOne({ where: { id: assocId, linkedItemId: itemId } });
      if (!incoming) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      await this.assocRepo.remove(incoming);
      return;
    }
    await this.assocRepo.remove(assoc);
  }

  async listAssociations(projectId: number, itemId: number) {
    const item = await this.workItemRepo.findOne({ where: { id: itemId, projectId } });
    if (!item) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const [proj] = await this.dataSource.query('SELECT prefix FROM projects WHERE id = $1', [projectId]);
    const prefix = proj?.prefix || '';

    const assocRelations = ['linkedItem', 'linkedItem.status', 'linkedItem.assignee', 'linkedItem.labels'];
    const assocRelationsIncoming = ['item', 'item.status', 'item.assignee', 'item.labels'];

    const outgoing = await this.assocRepo.find({
      where: { itemId },
      relations: assocRelations,
    });

    const incoming = await this.assocRepo.find({
      where: { linkedItemId: itemId },
      relations: assocRelationsIncoming,
    });

    const fmt = (wi: any) => ({
      id: wi.id,
      itemKey: prefix ? `${prefix}-${wi.itemNumber}` : `${wi.itemNumber}`,
      itemNumber: wi.itemNumber,
      itemType: wi.itemType,
      title: wi.title,
      priority: wi.priority,
      storyPoints: wi.storyPoints ?? null,
      sprintId: wi.sprintId ?? null,
      assignee: wi.assignee ? { id: wi.assignee.id, displayName: wi.assignee.displayName } : null,
      completedAt: wi.completedAt ?? null,
      labels: (wi.labels || []).map((l: any) => ({ id: l.id, name: l.name, color: l.color })),
      status: wi.status ? { id: wi.status.id, name: wi.status.name, category: (wi.status as any).category, color: (wi.status as any).color } : null,
    });

    return {
      belongsTo: outgoing.filter(a => a.linkType === 'belongs_to').map(a => ({ id: a.id, item: fmt(a.linkedItem) })),
      contains: incoming.filter(a => a.linkType === 'belongs_to').map(a => ({ id: a.id, item: fmt(a.item) })),
      relatesTo: [
        ...outgoing.filter(a => a.linkType === 'relates_to').map(a => ({ id: a.id, item: fmt(a.linkedItem) })),
        ...incoming.filter(a => a.linkType === 'relates_to').map(a => ({ id: a.id, item: fmt(a.item) })),
      ],
      blocks: incoming.filter(a => a.linkType === 'blocks').map(a => ({ id: a.id, item: fmt(a.item) })),
      blockedBy: outgoing.filter(a => a.linkType === 'blocks').map(a => ({ id: a.id, item: fmt(a.linkedItem) })),
      causedBy: outgoing.filter(a => a.linkType === 'caused_by').map(a => ({ id: a.id, item: fmt(a.linkedItem) })),
      causes: incoming.filter(a => a.linkType === 'caused_by').map(a => ({ id: a.id, item: fmt(a.item) })),
    };
  }

  // =========================================================================
  // HIERARCHY VIEW METHODS
  // =========================================================================

  async listEpics(projectId: number, opts: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, opts.page || 1);
    const limit = clampLimit(opts.limit);

    // T0.9 — fetch the project prefix so itemKey matches the canonical
    // `${prefix}-${itemNumber}` shape every other endpoint emits.
    const [prefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = prefixRow?.prefix ?? '';

    const qb = this.workItemRepo.createQueryBuilder('wi')
      .leftJoinAndSelect('wi.status', 'status')
      .leftJoinAndSelect('wi.assignee', 'assignee')
      .leftJoinAndSelect('wi.sprint', 'sprint')
      .leftJoinAndSelect('wi.labels', 'labels')
      .where('wi.projectId = :projectId', { projectId })
      .andWhere("wi.itemType = 'epic'");

    if (opts.status) {
      const statusIds = opts.status.split(',').map(s => parseInt(s.trim()));
      qb.andWhere('wi.statusId IN (:...statusIds)', { statusIds });
    }

    qb.orderBy('wi.sortOrder', 'ASC').addOrderBy('wi.createdAt', 'DESC');

    const [epics, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Batch compute progress + childBreakdown using a single multi-root recursive CTE
    const statsMap = await this.computeDescendantStatsBatch(epics.map((e) => e.id));
    const emptyStats = {
      progress: { totalItems: 0, completedItems: 0, totalPoints: 0, completedPoints: 0, progressPercent: 0 },
      childBreakdown: { stories: 0, tasks: 0, subtasks: 0, bugs: 0 },
    };

    const list = epics.map((epic) => {
      const { progress, childBreakdown } = statsMap.get(epic.id) ?? emptyStats;

      return {
        id: epic.id,
        itemKey: `${projectPrefix}-${epic.itemNumber}`,
        itemType: epic.itemType,
        title: epic.title,
        description: epic.description,
        priority: epic.priority,
        status: epic.status ? {
          id: epic.status.id,
          name: epic.status.name,
          category: (epic.status as any).category,
          color: (epic.status as any).color,
        } : null,
        assignee: epic.assignee ? {
          id: epic.assignee.id,
          displayName: (epic.assignee as any).displayName,
          avatarUrl: (epic.assignee as any).avatarUrl,
        } : null,
        sprint: epic.sprint ? {
          id: epic.sprint.id,
          name: epic.sprint.name,
        } : null,
        endDate: epic.endDate,
        storyPoints: epic.storyPoints,
        progress,
        childBreakdown,
        labels: (epic.labels || []).map((l) => ({ id: l.id, name: l.name, color: (l as any).color })),
        createdAt: epic.createdAt,
      };
    });

    const paginated = new PaginatedResponse(list, total, page, limit);
    return paginated.toEnvelopeData();
  }

  async listStories(projectId: number, opts: { page?: number; limit?: number; epicId?: number }) {
    const page = Math.max(1, opts.page || 1);
    const limit = clampLimit(opts.limit);

    // T0.9 — fetch the project prefix so itemKey matches the canonical
    // `${prefix}-${itemNumber}` shape every other endpoint emits.
    const [prefixRow] = await this.dataSource.query(
      `SELECT prefix FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectPrefix: string = prefixRow?.prefix ?? '';

    const qb = this.workItemRepo.createQueryBuilder('wi')
      .leftJoinAndSelect('wi.status', 'status')
      .leftJoinAndSelect('wi.assignee', 'assignee')
      .leftJoinAndSelect('wi.sprint', 'sprint')
      .leftJoinAndSelect('wi.labels', 'labels')
      .where('wi.projectId = :projectId', { projectId })
      .andWhere("wi.itemType = 'story'");
    // NB: stories never carry parent_id under the post-5.6 model — the
    // `wi.parent` join used to populate a `parent` field in the response is
    // dead and has been removed. The story-belongs-to-epic relationship now
    // lives in `work_item_associations` and the `epicId` filter joins through
    // it below.

    if (opts.epicId) {
      qb.andWhere(
        `wi.id IN (
          SELECT a.item_id FROM work_item_associations a
          WHERE a.linked_item_id = :epicId AND a.link_type = 'belongs_to'
        )`,
        { epicId: opts.epicId },
      );
    }

    qb.orderBy('wi.sortOrder', 'ASC').addOrderBy('wi.createdAt', 'DESC');

    const [stories, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Batch compute progress + childBreakdown using a single multi-root recursive CTE
    const storyIds = stories.map((s) => s.id);
    const statsMap = await this.computeDescendantStatsBatch(storyIds);
    const emptyStats = {
      progress: { totalItems: 0, completedItems: 0, totalPoints: 0, completedPoints: 0, progressPercent: 0 },
      childBreakdown: { stories: 0, tasks: 0, subtasks: 0, bugs: 0 },
      childStatusBreakdown: { done: 0, wip: 0, open: 0 },
    };

    // Batch-resolve each story's parent epic (belongs_to → epic).
    const epicByStory = new Map<number, { id: number; itemKey: string; title: string }>();
    if (storyIds.length > 0) {
      const epicRows = await this.dataSource.query(
        `SELECT a.item_id AS "storyId", e.id, e.item_number AS "itemNumber", e.title
         FROM work_item_associations a
         JOIN work_items e ON e.id = a.linked_item_id
         WHERE a.item_id = ANY($1) AND a.link_type = 'belongs_to'
           AND e.item_type = 'epic' AND e.deleted_at IS NULL`,
        [storyIds],
      );
      for (const r of epicRows) {
        if (!epicByStory.has(r.storyId)) {
          epicByStory.set(r.storyId, {
            id: r.id,
            itemKey: `${projectPrefix}-${r.itemNumber}`,
            title: r.title,
          });
        }
      }
    }

    const list = stories.map((story) => {
      const { progress, childBreakdown } = statsMap.get(story.id) ?? emptyStats;
      const epic = epicByStory.get(story.id) ?? null;

      return {
        id: story.id,
        itemKey: `${projectPrefix}-${story.itemNumber}`,
        itemType: story.itemType,
        title: story.title,
        priority: story.priority,
        status: story.status ? {
          id: story.status.id,
          name: story.status.name,
          category: (story.status as any).category,
          color: (story.status as any).color,
        } : null,
        // `parent` is preserved in the response shape as null for backward
        // compatibility — stories no longer have a parent_id parent under
        // the post-5.6 model. The epic→story relationship is exposed via
        // /items/:id (associations.belongsTo) instead.
        parent: null,
        assignee: story.assignee ? {
          id: story.assignee.id,
          displayName: (story.assignee as any).displayName,
          avatarUrl: (story.assignee as any).avatarUrl,
        } : null,
        sprint: story.sprint ? {
          id: story.sprint.id,
          name: story.sprint.name,
        } : null,
        storyPoints: story.storyPoints,
        progress,
        childBreakdown,
        bugCount: childBreakdown.bugs,
        epicId: epic?.id ?? null,
        epicKey: epic?.itemKey ?? null,
        epicTitle: epic?.title ?? null,
        labels: (story.labels || []).map((l) => ({ id: l.id, name: l.name, color: (l as any).color })),
        createdAt: story.createdAt,
      };
    });

    const paginated = new PaginatedResponse(list, total, page, limit);
    return paginated.toEnvelopeData();
  }

  async getBacklog(projectId: number) {
    // Fetch ALL items in this project that are "in backlog":
    // - Tasks/bugs/subtasks: sprint_id IS NULL
    // - Epics/stories: always included (sprint is informational) BUT only if they
    //   have at least one unsprinted descendant, OR they themselves have no sprint
    //
    // Strategy: fetch all items with sprint_id IS NULL plus all epics/stories,
    // then build the tree using associations and prune epics/stories that have no backlog descendants.

    // Step 1: Get IDs of all tasks/bugs in a sprint (to exclude)
    const sprintedTaskIds: number[] = (await this.dataSource.query(
      `SELECT id FROM work_items WHERE project_id = $1 AND sprint_id IS NOT NULL AND item_type IN ('task', 'bug')`,
      [projectId],
    )).map((r: any) => r.id);

    // Step 2: Fetch all backlog-eligible items:
    // - All epics and stories (always candidates for the tree)
    // - All tasks/bugs where sprint_id IS NULL
    // - All subtasks where parent is NOT a sprinted task
    let allItems: any[];
    if (sprintedTaskIds.length > 0) {
      allItems = await this.dataSource.query(`
        SELECT wi.id, wi.item_type AS "itemType", wi.parent_id AS "parentId",
               wi.title, wi.priority, wi.story_points AS "storyPoints",
               wi.status_id AS "statusId", wi.sprint_id AS "sprintId",
               wi.item_number AS "itemNumber", wi.sort_order AS "sortOrder",
               wi.assignee_id AS "assigneeId", wi.end_date AS "endDate",
               ps.name AS "statusName", ps.category AS "statusCategory", ps.color AS "statusColor"
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.project_id = $1
          AND (
            wi.item_type IN ('epic', 'story')
            OR (wi.item_type IN ('task', 'bug') AND wi.sprint_id IS NULL)
            OR (wi.item_type = 'subtask' AND wi.parent_id != ALL($2))
          )
        ORDER BY wi.sort_order ASC, wi.created_at ASC
      `, [projectId, sprintedTaskIds]);
    } else {
      allItems = await this.dataSource.query(`
        SELECT wi.id, wi.item_type AS "itemType", wi.parent_id AS "parentId",
               wi.title, wi.priority, wi.story_points AS "storyPoints",
               wi.status_id AS "statusId", wi.sprint_id AS "sprintId",
               wi.item_number AS "itemNumber", wi.sort_order AS "sortOrder",
               wi.assignee_id AS "assigneeId", wi.end_date AS "endDate",
               ps.name AS "statusName", ps.category AS "statusCategory", ps.color AS "statusColor"
        FROM work_items wi
        JOIN project_statuses ps ON ps.id = wi.status_id
        WHERE wi.project_id = $1
        ORDER BY wi.sort_order ASC, wi.created_at ASC
      `, [projectId]);
    }

    // Step 3: Fetch belongs_to associations for tree building
    const associations = await this.dataSource.query(`
      SELECT a.item_id AS "itemId", a.linked_item_id AS "linkedItemId"
      FROM work_item_associations a
      JOIN work_items wi ON wi.id = a.item_id
      WHERE wi.project_id = $1 AND a.link_type = 'belongs_to'
    `, [projectId]);

    // Step 4: Build lookup and tree
    const itemMap = new Map<number, any>();
    for (const item of allItems) {
      itemMap.set(item.id, {
        id: item.id,
        itemType: item.itemType,
        itemNumber: item.itemNumber,
        title: item.title,
        priority: item.priority,
        storyPoints: item.storyPoints,
        status: { id: item.statusId, name: item.statusName, category: item.statusCategory, color: item.statusColor },
        parentId: item.parentId,
        sprintId: item.sprintId,
        children: [] as any[],
      });
    }

    // Link children to parents using associations (for non-subtasks) and parentId (for subtasks)
    const roots: any[] = [];

    // First: link via belongs_to associations (tasks/stories belong_to epics/stories)
    for (const assoc of associations) {
      const child = itemMap.get(assoc.itemId);
      const parent = itemMap.get(assoc.linkedItemId);
      if (child && parent) {
        parent.children.push(child);
        // Mark as linked so we don't add to roots
        child._linked = true;
      }
    }

    // Second: link subtasks via parentId
    for (const item of itemMap.values()) {
      if (item.itemType === 'subtask' && item.parentId && itemMap.has(item.parentId)) {
        itemMap.get(item.parentId)!.children.push(item);
        item._linked = true;
      }
    }

    // Collect roots: items not linked as children
    for (const item of itemMap.values()) {
      if (!item._linked) {
        roots.push(item);
      }
    }

    // Clean up internal _linked flag
    for (const item of itemMap.values()) {
      delete item._linked;
    }

    // Step 5: Prune only epics/stories that have a sprint AND no backlog descendants.
    // Per spec: an item is "in backlog" if it has no sprintId, OR (for epics/stories)
    // if any of its unsprinted children exist.
    // Epics/stories without sprint are always included.
    // Epics/stories WITH sprint are included only if they have backlog descendants.
    function hasBacklogContent(node: any): boolean {
      // Tasks and subtasks are always backlog content (they were already filtered to unsprinted)
      if (node.itemType === 'task' || node.itemType === 'bug' || node.itemType === 'subtask') return true;
      // Epic/story without sprint: always backlog
      if (!node.sprintId) return true;
      // Epic/story WITH sprint: only if has backlog descendants
      return node.children.some((c: any) => hasBacklogContent(c));
    }

    const filteredRoots = roots.filter(r => hasBacklogContent(r));

    // Step 6: Compute stats from ALL items in the tree (flatten)
    function flattenTree(nodes: any[]): any[] {
      const flat: any[] = [];
      for (const n of nodes) {
        flat.push(n);
        flat.push(...flattenTree(n.children));
      }
      return flat;
    }

    const allBacklogItems = flattenTree(filteredRoots);
    const stats = {
      totalItems: allBacklogItems.length,
      totalPoints: allBacklogItems.reduce((sum: number, i: any) => sum + (i.storyPoints || 0), 0),
      byType: {
        epic: allBacklogItems.filter((i: any) => i.itemType === 'epic').length,
        story: allBacklogItems.filter((i: any) => i.itemType === 'story').length,
        task: allBacklogItems.filter((i: any) => i.itemType === 'task').length,
        bug: allBacklogItems.filter((i: any) => i.itemType === 'bug').length,
        subtask: allBacklogItems.filter((i: any) => i.itemType === 'subtask').length,
      },
      byPriority: {
        urgent: allBacklogItems.filter((i: any) => i.priority === 'urgent').length,
        high: allBacklogItems.filter((i: any) => i.priority === 'high').length,
        medium: allBacklogItems.filter((i: any) => i.priority === 'medium').length,
        low: allBacklogItems.filter((i: any) => i.priority === 'low').length,
        none: allBacklogItems.filter((i: any) => i.priority === 'none').length,
      },
    };

    // Clean up internal fields from response
    function cleanTree(nodes: any[]): any[] {
      return nodes.map(n => {
        const { parentId, sprintId, ...rest } = n;
        return { ...rest, children: cleanTree(n.children) };
      });
    }

    return {
      tree: cleanTree(filteredRoots),
      stats,
    };
  }

  /**
   * Computes descendant stats for many root items in a single multi-root
   * recursive CTE — avoids the per-row N+1 in listEpics/listStories.
   *
   * The CTE carries the originating root id through every recursion step, so a
   * single GROUP BY at the end produces one row per root that has descendants.
   * Roots with no descendants are absent from the result map; callers should
   * fall back to all-zero stats via `?? defaultStats`.
   */
  private async computeDescendantStatsBatch(
    rootIds: number[],
  ): Promise<
    Map<
      number,
      {
        progress: {
          totalItems: number;
          completedItems: number;
          totalPoints: number;
          completedPoints: number;
          progressPercent: number;
        };
        childBreakdown: { stories: number; tasks: number; subtasks: number; bugs: number };
        childStatusBreakdown: { done: number; wip: number; open: number };
      }
    >
  > {
    const map = new Map<
      number,
      {
        progress: {
          totalItems: number;
          completedItems: number;
          totalPoints: number;
          completedPoints: number;
          progressPercent: number;
        };
        childBreakdown: { stories: number; tasks: number; subtasks: number; bugs: number };
        childStatusBreakdown: { done: number; wip: number; open: number };
      }
    >();

    if (rootIds.length === 0) return map;

    const rows = await this.dataSource.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT a.linked_item_id AS root_id, a.item_id AS id, wi.item_type, wi.status_id, wi.story_points, 1 AS depth
        FROM work_item_associations a
        JOIN work_items wi ON wi.id = a.item_id
        WHERE a.linked_item_id = ANY($1) AND a.link_type = 'belongs_to'
        UNION ALL
        SELECT d.root_id, a2.item_id, wi2.item_type, wi2.status_id, wi2.story_points, d.depth + 1
        FROM work_item_associations a2
        JOIN work_items wi2 ON wi2.id = a2.item_id
        JOIN descendants d ON a2.linked_item_id = d.id
        WHERE a2.link_type = 'belongs_to' AND d.depth < 4
      )
      SELECT
        d.root_id AS root_id,
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE ps.category = 'done')::int AS completed_items,
        COALESCE(SUM(d.story_points), 0)::int AS total_points,
        COALESCE(SUM(d.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COUNT(*) FILTER (WHERE d.item_type = 'story')::int AS story_count,
        COUNT(*) FILTER (WHERE d.item_type = 'task')::int AS task_count,
        COUNT(*) FILTER (WHERE d.item_type = 'subtask')::int AS subtask_count,
        COUNT(*) FILTER (WHERE d.item_type = 'bug')::int AS bug_count,
        COUNT(*) FILTER (WHERE ps.category IN ('in_progress', 'in_review'))::int AS wip_count,
        COUNT(*) FILTER (WHERE ps.category = 'backlog')::int AS open_count
      FROM descendants d
      JOIN project_statuses ps ON ps.id = d.status_id
      GROUP BY d.root_id
    `,
      [rootIds],
    );

    for (const row of rows) {
      const rootId = Number(row.root_id);
      const totalItems = Number(row.total_items);
      const completedItems = Number(row.completed_items);
      map.set(rootId, {
        progress: {
          totalItems,
          completedItems,
          totalPoints: Number(row.total_points),
          completedPoints: Number(row.completed_points),
          progressPercent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        },
        childBreakdown: {
          stories: Number(row.story_count),
          tasks: Number(row.task_count),
          subtasks: Number(row.subtask_count),
          bugs: Number(row.bug_count),
        },
        childStatusBreakdown: {
          done: completedItems,
          wip: Number(row.wip_count),
          open: Number(row.open_count),
        },
      });
    }

    return map;
  }

  // =========================================================================
  // STORY STATS
  // =========================================================================

  async getStoryStats(projectId: number) {
    const [row] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ps.category = 'backlog')::int AS open,
        COUNT(*) FILTER (WHERE ps.category IN ('in_progress', 'in_review'))::int AS in_flight,
        COUNT(*) FILTER (WHERE ps.category = 'done')::int AS done,
        COALESCE(SUM(wi.story_points), 0)::int AS total_points,
        COALESCE(SUM(wi.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points
      FROM work_items wi
      JOIN project_statuses ps ON ps.id = wi.status_id
      WHERE wi.project_id = $1 AND wi.item_type = 'story' AND wi.deleted_at IS NULL
    `,
      [projectId],
    );
    return {
      total: Number(row.total),
      open: Number(row.open),
      inFlight: Number(row.in_flight),
      done: Number(row.done),
      totalPoints: Number(row.total_points),
      completedPoints: Number(row.completed_points),
    };
  }

  // =========================================================================
  // ACCEPTANCE CRITERIA
  // =========================================================================

  /** Throws NOT_FOUND when the item doesn't exist (or is soft-deleted) in this project. */
  private async assertItemInProject(projectId: number, itemId: number): Promise<WorkItem> {
    const item = await this.workItemRepo.findOne({ where: { id: itemId, projectId } });
    if (!item || item.deletedAt) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  private async projectPrefix(projectId: number): Promise<string> {
    const [row] = await this.dataSource.query(`SELECT prefix FROM projects WHERE id = $1`, [projectId]);
    return row?.prefix ?? '';
  }

  async listAcceptanceCriteria(projectId: number, itemId: number) {
    await this.assertItemInProject(projectId, itemId);
    const prefix = await this.projectPrefix(projectId);
    const criteria = await this.criterionRepo.find({
      where: { workItemId: itemId },
      relations: ['verifier', 'linkedItem', 'linkedItem.status'],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const list = criteria.map((c) => this.formatCriterion(c, prefix));
    return {
      list,
      total: list.length,
      met: list.filter((c) => c.isMet).length,
    };
  }

  /** when/then must be supplied together (both structured) or both omitted (plain). */
  private assertStructuredPairing(whenText: unknown, thenText: unknown) {
    const hasWhen = whenText != null;
    const hasThen = thenText != null;
    if (hasWhen !== hasThen) {
      throw new AppLogicException(
        'INVALID_CRITERION',
        HttpStatus.BAD_REQUEST,
        'A structured criterion requires both When and Then.',
      );
    }
  }

  /** Validate linkedItemId (if provided) belongs to this project. */
  private async validateLinkedItem(linkedItemId: number | null | undefined, projectId: number) {
    if (linkedItemId == null) return;
    const linked = await this.workItemRepo.findOne({ where: { id: linkedItemId, projectId } });
    if (!linked || linked.deletedAt) {
      throw new AppLogicException(
        'CROSS_PROJECT_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
        'Linked item not found in this project.',
      );
    }
  }

  async createAcceptanceCriterion(projectId: number, itemId: number, dto: CreateAcceptanceCriterionDto) {
    await this.assertItemInProject(projectId, itemId);
    this.assertStructuredPairing(dto.whenText, dto.thenText);
    await this.validateLinkedItem(dto.linkedItemId, projectId);

    // Append to the end — deterministic ordering without a manual reorder.
    const count = await this.criterionRepo.count({ where: { workItemId: itemId } });
    const criterion = this.criterionRepo.create({
      workItemId: itemId,
      givenText: dto.givenText,
      whenText: dto.whenText ?? null,
      thenText: dto.thenText ?? null,
      linkedItemId: dto.linkedItemId ?? null,
      sortOrder: `n${String(count).padStart(6, '0')}`,
      isMet: false,
    });
    const saved = await this.criterionRepo.save(criterion);
    return this.loadCriterion(projectId, itemId, saved.id);
  }

  async updateAcceptanceCriterion(
    projectId: number,
    itemId: number,
    criterionId: number,
    dto: UpdateAcceptanceCriterionDto,
    userId: number,
  ) {
    await this.assertItemInProject(projectId, itemId);
    const criterion = await this.criterionRepo.findOne({ where: { id: criterionId, workItemId: itemId } });
    if (!criterion) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (dto.linkedItemId !== undefined) {
      await this.validateLinkedItem(dto.linkedItemId, projectId);
      criterion.linkedItemId = dto.linkedItemId;
    }
    if (dto.givenText !== undefined) criterion.givenText = dto.givenText;
    if (dto.whenText !== undefined) criterion.whenText = dto.whenText;
    if (dto.thenText !== undefined) criterion.thenText = dto.thenText;
    // After applying text edits, the structured pairing must still hold.
    this.assertStructuredPairing(criterion.whenText, criterion.thenText);

    if (dto.isMet !== undefined && dto.isMet !== criterion.isMet) {
      criterion.isMet = dto.isMet;
      if (dto.isMet) {
        criterion.verifiedBy = userId;
        criterion.verifiedAt = new Date();
      } else {
        criterion.verifiedBy = null;
        criterion.verifiedAt = null;
      }
    }

    await this.criterionRepo.save(criterion);
    return this.loadCriterion(projectId, itemId, criterion.id);
  }

  async deleteAcceptanceCriterion(projectId: number, itemId: number, criterionId: number) {
    await this.assertItemInProject(projectId, itemId);
    const criterion = await this.criterionRepo.findOne({ where: { id: criterionId, workItemId: itemId } });
    if (!criterion) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.criterionRepo.remove(criterion);
    return { id: criterionId };
  }

  async reorderAcceptanceCriteria(projectId: number, itemId: number, orderedIds: number[]) {
    await this.assertItemInProject(projectId, itemId);
    const criteria = await this.criterionRepo.find({ where: { workItemId: itemId } });
    const byId = new Map(criteria.map((c) => [c.id, c]));
    let i = 0;
    for (const id of orderedIds) {
      const c = byId.get(id);
      if (c) {
        c.sortOrder = `n${String(i).padStart(6, '0')}`;
        await this.criterionRepo.save(c);
        i++;
      }
    }
    return this.listAcceptanceCriteria(projectId, itemId);
  }

  private async loadCriterion(projectId: number, itemId: number, criterionId: number) {
    const prefix = await this.projectPrefix(projectId);
    const c = await this.criterionRepo.findOne({
      where: { id: criterionId, workItemId: itemId },
      relations: ['verifier', 'linkedItem', 'linkedItem.status'],
    });
    return this.formatCriterion(c!, prefix);
  }

  // =========================================================================
  // STORY WORKFLOW (approve / reopen)
  // =========================================================================

  /** First project status of a category, in board order. Throws if none exists. */
  private async firstStatusOfCategory(projectId: number, category: string): Promise<{ id: number; category: string }> {
    const [status] = await this.dataSource.query(
      `SELECT id, category FROM project_statuses
       WHERE project_id = $1 AND category = $2
       ORDER BY sort_order ASC LIMIT 1`,
      [projectId, category],
    );
    if (!status) {
      throw new AppLogicException(
        'NO_STATUS_FOR_CATEGORY',
        HttpStatus.BAD_REQUEST,
        `No '${category}' status configured for this project.`,
      );
    }
    return status;
  }

  /** Rejects with ITEM_BLOCKED when the item has any unresolved `blocks` association. */
  private async assertNoOpenBlockers(id: number) {
    const blockers = await this.dataSource.query(
      `SELECT a.id, wi.title, ps.category
       FROM work_item_associations a
       JOIN work_items wi ON wi.id = a.linked_item_id
       JOIN project_statuses ps ON ps.id = wi.status_id
       WHERE a.item_id = $1 AND a.link_type = 'blocks'`,
      [id],
    );
    const unresolved = blockers.filter((b: any) => b.category !== 'done');
    if (unresolved.length > 0) {
      throw new AppLogicException(
        'ITEM_BLOCKED',
        HttpStatus.BAD_REQUEST,
        `Blocked by ${unresolved[0].title}. Resolve the blocker first.`,
      );
    }
  }

  async approveStory(projectId: number, id: number, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item || item.deletedAt) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.assertNoOpenBlockers(id);
    const doneStatus = await this.firstStatusOfCategory(projectId, 'done');
    item.statusId = doneStatus.id;
    item.completedAt = new Date();
    item.approvedBy = userId;
    item.approvedAt = new Date();
    await this.workItemRepo.save(item);
    this.eventEmitter.emit('work_item.updated', { id, projectId, userId });
    this.eventEmitter.emit('story.approved', { id, projectId, userId });
    return this.findOne(projectId, id);
  }

  async reopenStory(projectId: number, id: number, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id, projectId } });
    if (!item || item.deletedAt) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const inProgress = await this.firstStatusOfCategory(projectId, 'in_progress');
    item.statusId = inProgress.id;
    item.completedAt = null;
    item.approvedBy = null;
    item.approvedAt = null;
    await this.workItemRepo.save(item);
    this.eventEmitter.emit('work_item.updated', { id, projectId, userId });
    this.eventEmitter.emit('story.reopened', { id, projectId, userId });
    return this.findOne(projectId, id);
  }

  // =========================================================================
  // RELEASE NOTES
  // =========================================================================

  async getReleaseNote(projectId: number, itemId: number) {
    await this.assertItemInProject(projectId, itemId);
    const note = await this.releaseNoteRepo.findOne({ where: { workItemId: itemId } });
    return {
      body: note?.body ?? '',
      publishedAt: note?.publishedAt ?? null,
      updatedAt: note?.updatedAt ?? null,
    };
  }

  async upsertReleaseNote(projectId: number, itemId: number, dto: UpsertReleaseNoteDto) {
    await this.assertItemInProject(projectId, itemId);
    let note = await this.releaseNoteRepo.findOne({ where: { workItemId: itemId } });
    if (!note) {
      note = this.releaseNoteRepo.create({ workItemId: itemId, body: dto.body });
    } else {
      note.body = dto.body;
    }
    if (dto.publish) {
      note.publishedAt = new Date();
    }
    await this.releaseNoteRepo.save(note);
    return { body: note.body, publishedAt: note.publishedAt, updatedAt: note.updatedAt };
  }

  // =========================================================================
  // VALIDATION METHODS
  // =========================================================================

  /**
   * Validates parent-child type combinations.
   *
   * The canonical Trackero hierarchy model (Task 5.6 reconciliation):
   *   - `subtask` is the ONLY item type that uses `parent_id`. A subtask
   *     MUST have a parent. The parent's itemType must be one of
   *     `task` | `story` | `epic` | `bug`.
   *   - All non-subtask items (`epic`, `story`, `task`, `bug`) have
   *     `parent_id = NULL`. Cross-type linkage (epic↔story, story↔task,
   *     epic↔task, epic↔bug, etc.) lives in `work_item_associations`
   *     with `link_type = 'belongs_to'`.
   *
   * Parent → Allowed children:
   *   null  → epic, story, task, bug
   *   epic  → subtask
   *   story → subtask
   *   task  → subtask
   *   bug   → (nothing — leaf)
   *   subtask → (nothing — leaf)
   */
  async validateParentChildType(
    itemType: WorkItem['itemType'],
    parent: WorkItem | null,
  ): Promise<void> {
    if (itemType === 'subtask') {
      if (parent === null) {
        throw new AppLogicException('SUBTASK_REQUIRES_PARENT', HttpStatus.BAD_REQUEST);
      }
      if (!['task', 'story', 'epic', 'bug'].includes(parent.itemType)) {
        throw new AppLogicException('INVALID_PARENT_CHILD_TYPE', HttpStatus.BAD_REQUEST,
          `A ${parent.itemType} cannot be parent of a subtask`);
      }
      return;
    }

    // Bug: cannot have parent, cannot have children
    if (itemType === 'bug' && parent !== null) {
      throw new AppLogicException('INVALID_PARENT_CHILD_TYPE', HttpStatus.BAD_REQUEST,
        'Bugs cannot have a parent. Use associations instead.');
    }

    // All other types (epic, story, task): parentId must be null
    if (parent !== null) {
      throw new AppLogicException('INVALID_PARENT_CHILD_TYPE', HttpStatus.BAD_REQUEST,
        `Only subtasks can have a parent. Use associations for ${itemType}.`);
    }
  }

  /**
   * Validates hierarchy depth. Maximum 4 levels.
   *
   * Under the post-5.6 canonical model the parent_id chain is structurally
   * bounded at 2 levels (subtask → {epic,story,task} → null) because non-subtask
   * items always have parent_id = NULL — `validateParentChildType` enforces that
   * before this method runs. The check is kept as a defense-in-depth guard
   * against any future schema drift or direct-SQL inserts that bypass the
   * service layer; in normal operation it returns after a single SELECT.
   */
  async validateDepth(parentId: number | null): Promise<void> {
    if (parentId === null) {
      return; // depth 1, always valid
    }

    // Walk up the ancestor chain
    let depth = 1; // the new item itself
    let currentParentId: number | null = parentId;

    while (currentParentId !== null) {
      depth++;
      if (depth > 4) {
        throw new AppLogicException('MAX_DEPTH_EXCEEDED', HttpStatus.BAD_REQUEST);
      }

      const rows: any[] = await this.dataSource.query(
        `SELECT parent_id FROM work_items WHERE id = $1`,
        [currentParentId],
      );
      if (!rows[0]) {
        break;
      }
      currentParentId = rows[0].parent_id;
    }
  }

  /**
   * Validates that setting newParentId as parent of itemId would not create
   * a circular reference. Walks UP from newParentId looking for itemId.
   */
  async validateCircularReference(itemId: number, newParentId: number): Promise<void> {
    if (itemId === newParentId) {
      throw new AppLogicException('CIRCULAR_REFERENCE', HttpStatus.BAD_REQUEST);
    }

    let currentId: number | null = newParentId;
    const visited = new Set<number>();

    while (currentId !== null) {
      if (currentId === itemId) {
        throw new AppLogicException('CIRCULAR_REFERENCE', HttpStatus.BAD_REQUEST);
      }
      if (visited.has(currentId)) {
        break; // safety: already visited this node
      }
      visited.add(currentId);

      const rows: any[] = await this.dataSource.query(
        `SELECT parent_id FROM work_items WHERE id = $1`,
        [currentId],
      );
      if (!rows[0]) {
        break;
      }
      currentId = rows[0].parent_id;
    }
  }

  /**
   * Validates whether a work item can be deleted.
   *
   * Under the post-5.6 canonical model the only items that use `parent_id` are
   * subtasks, and a subtask's parent may be a `task`, `story`, `epic`, or `bug`. So
   * the only "blocking children" any non-leaf item can carry are direct
   * subtasks. The rule is symmetric across all three valid subtask parents:
   * an item with direct subtask children cannot be deleted — the subtasks
   * must be removed first. This preserves the invariant that every existing
   * subtask has a valid parent (rather than orphaning subtasks with
   * parent_id = NULL via the FK's ON DELETE SET NULL).
   *
   * | Deleting        | Has direct subtask children? | Result                |
   * |-----------------|------------------------------|-----------------------|
   * | Epic            | Yes                          | REJECT                |
   * | Story           | Yes                          | REJECT                |
   * | Task            | Yes                          | REJECT                |
   * | Epic/Story/Task | No                           | ALLOW                 |
   * | Bug             | N/A (leaf)                   | ALLOW                 |
   * | Subtask         | N/A (leaf)                   | ALLOW                 |
   */
  async validateDeletion(item: WorkItem): Promise<void> {
    // Leaf types: always deletable
    if (item.itemType === 'subtask') {
      return;
    }

    // epic | story | task | bug — block if direct subtask children exist.
    // Phase 10 — soft-deleted children don't block parent deletion; once a
    // subtask is soft-deleted it's invisible to the rest of the app, so the
    // "no orphan subtask" invariant is satisfied by the filter below.
    const [subtaskCount] = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM work_items
       WHERE parent_id = $1 AND item_type = 'subtask' AND deleted_at IS NULL`,
      [item.id],
    );
    if (parseInt(subtaskCount.cnt) > 0) {
      // Use the type-specific code where one exists (preserves existing API
      // contract for story/task); fall back to STORY_HAS_DIRECT_SUBTASKS for
      // epic — same shape, same HTTP status.
      if (item.itemType === 'task' || item.itemType === 'bug') {
        throw new AppLogicException('TASK_HAS_SUBTASKS', HttpStatus.BAD_REQUEST);
      }
      throw new AppLogicException('STORY_HAS_DIRECT_SUBTASKS', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Validates whether an item can be reparented to a new parent.
   * Rules from HIERARCHY-RULES.md section 3:
   *
   * - Cross-project: REJECT
   * - Circular reference: REJECT
   * - Depth exceeded after move: REJECT
   *
   * Note: a task→task move is implicitly rejected by validateParentChildType
   * below — under the post-5.6 canonical model only `subtask` items may have a
   * non-null parent, so any attempt to reparent a `task` to a non-null parent
   * fails with INVALID_PARENT_CHILD_TYPE. The previously explicit
   * "task-with-subtasks moved under another task" branch was unreachable in
   * normal flow and has been removed.
   */
  async validateReparenting(
    item: WorkItem,
    newParent: WorkItem | null,
  ): Promise<void> {
    // Detaching (parent=null) is always allowed (except subtask, handled by parent-child type validation)
    if (newParent === null) {
      return;
    }

    // Cross-project check
    if (newParent.projectId !== item.projectId) {
      throw new AppLogicException('CROSS_PROJECT_NOT_ALLOWED', HttpStatus.BAD_REQUEST);
    }

    // Circular reference check
    await this.validateCircularReference(item.id, newParent.id);

    // Validate parent-child type is valid for the move
    await this.validateParentChildType(item.itemType, newParent);

    // Validate depth after move: count ancestors of newParent + 1 (this item) + max descendant depth
    const ancestorDepth = await this.getAncestorDepth(newParent.id);
    const descendantDepth = await this.getMaxDescendantDepth(item.id);
    const totalDepth = ancestorDepth + 1 + descendantDepth; // ancestors + this item + descendants

    if (totalDepth > 4) {
      throw new AppLogicException('MAX_DEPTH_EXCEEDED', HttpStatus.BAD_REQUEST);
    }
  }

  // =========================================================================
  // CROSS-PROJECT REFERENCE VALIDATION (Task 2.5 — audit §4.2/§4.3)
  // =========================================================================
  //
  // A caller with access to project A must not be able to attach a status,
  // sprint, label or assignee that belongs to a different project. These
  // helpers run a single existence query scoped to the target project and
  // throw on mismatch. When invoked inside a transaction the caller passes the
  // transaction's EntityManager so the read participates in the same tx.

  /**
   * Validates that the status belongs to the given project.
   */
  private async validateStatusInProject(
    statusId: number,
    projectId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource;
    const rows = await runner.query(
      `SELECT 1 FROM project_statuses WHERE id = $1 AND project_id = $2`,
      [statusId, projectId],
    );
    if (rows.length === 0) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Status not found in this project');
    }
  }

  /**
   * Validates that the sprint belongs to the given project.
   */
  private async validateSprintInProject(
    sprintId: number,
    projectId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource;
    const rows = await runner.query(
      `SELECT 1 FROM sprints WHERE id = $1 AND project_id = $2`,
      [sprintId, projectId],
    );
    if (rows.length === 0) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Sprint not found in this project');
    }
  }

  /**
   * Validates that ALL given label ids belong to the given project.
   * One query — compares the count of matches to the count of requested ids.
   */
  private async validateLabelsInProject(
    labelIds: number[],
    projectId: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (!labelIds || labelIds.length === 0) {
      return;
    }
    const runner = manager ?? this.dataSource;
    const uniqueIds = [...new Set(labelIds)];
    const rows = await runner.query(
      `SELECT id FROM labels WHERE id = ANY($1) AND project_id = $2`,
      [uniqueIds, projectId],
    );
    if (rows.length !== uniqueIds.length) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.BAD_REQUEST, 'One or more labels do not belong to this project');
    }
  }

  /**
   * Validates that the assignee is a member of the given project.
   */
  private async validateAssigneeInProject(
    assigneeId: number,
    projectId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource;
    const rows = await runner.query(
      `SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = $2`,
      [assigneeId, projectId],
    );
    if (rows.length === 0) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.BAD_REQUEST, 'Assignee is not a member of this project');
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Count the number of ancestors of an item (including itself).
   * e.g., root item → 1, root → child → 2, etc.
   */
  private async getAncestorDepth(itemId: number): Promise<number> {
    let depth = 1;
    let currentId: number | null = itemId;

    while (currentId !== null) {
      const rows: any[] = await this.dataSource.query(
        `SELECT parent_id FROM work_items WHERE id = $1`,
        [currentId],
      );
      if (!rows[0] || rows[0].parent_id === null) {
        break;
      }
      currentId = rows[0].parent_id;
      depth++;
    }

    return depth;
  }

  /**
   * Get the maximum depth of descendants below an item.
   * If item has no children → 0.
   * If item has children but no grandchildren → 1.
   * Uses a recursive CTE with a depth limit of 4 for safety.
   */
  private async getMaxDescendantDepth(itemId: number): Promise<number> {
    const result = await this.dataSource.query(`
      WITH RECURSIVE descendants AS (
        SELECT id, 1 as depth FROM work_items WHERE parent_id = $1
        UNION ALL
        SELECT wi.id, d.depth + 1
        FROM work_items wi
        JOIN descendants d ON wi.parent_id = d.id
        WHERE d.depth < 4
      )
      SELECT COALESCE(MAX(depth), 0) as max_depth FROM descendants
    `, [itemId]);

    return parseInt(result[0].max_depth);
  }
}
