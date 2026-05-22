import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkItem } from '../work-items/entities/work-item.entity';
import { WorkItemAssociation } from '../work-items/entities/work-item-association.entity';
import { ProjectStatus } from '../projects/entities/project-status.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(WorkItem)
    private readonly workItemRepo: Repository<WorkItem>,
    @InjectRepository(ProjectStatus)
    private readonly statusRepo: Repository<ProjectStatus>,
    @InjectRepository(WorkItemAssociation)
    private readonly assocRepo: Repository<WorkItemAssociation>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getBoard(projectId: number, filters: {
    sprintId?: number;
    assigneeIds?: number[];
    priority?: string;
    epicId?: number;
    storyId?: number;
  }) {
    const statuses = await this.statusRepo.find({
      where: { projectId },
      order: { sortOrder: 'ASC' },
    });

    // Step 1: run the per-column item queries and collect ALL items into one
    // flat list, remembering which column (status index) each belongs to.
    const itemsByStatus: WorkItem[][] = [];
    const allItems: WorkItem[] = [];
    for (const status of statuses) {
      const qb = this.workItemRepo.createQueryBuilder('wi')
        .where('wi.projectId = :projectId', { projectId })
        .andWhere('wi.statusId = :statusId', { statusId: status.id })
        .andWhere("wi.itemType IN ('task', 'bug', 'subtask')");

      if (filters.sprintId) {
        // Tasks with this sprintId, plus subtasks whose parent is in this sprint
        qb.andWhere(`(
          wi.sprintId = :sprintId
          OR (wi.itemType = 'subtask' AND wi.parentId IN (
            SELECT id FROM work_items WHERE sprint_id = :sprintId AND item_type = 'task'
          ))
        )`, { sprintId: filters.sprintId });
      }
      if (filters.assigneeIds && filters.assigneeIds.length > 0) {
        qb.andWhere('wi.assigneeId IN (:...assigneeIds)', { assigneeIds: filters.assigneeIds });
      }
      if (filters.priority) {
        qb.andWhere('wi.priority = :priority', { priority: filters.priority });
      }
      if (filters.epicId) {
        // Filter by association: items that belong_to the epic + subtasks of those items
        qb.andWhere(`wi.id IN (
          SELECT a.item_id FROM work_item_associations a
          WHERE a.linked_item_id = :epicId AND a.link_type = 'belongs_to'
          UNION
          SELECT wi2.id FROM work_items wi2
          JOIN work_item_associations a2 ON a2.item_id = wi2.parent_id
          WHERE a2.linked_item_id = :epicId AND a2.link_type = 'belongs_to' AND wi2.item_type = 'subtask'
        )`, { epicId: filters.epicId });
      }
      if (filters.storyId) {
        qb.andWhere(`(wi.parentId = :storyId OR wi.parentId IN (
          SELECT id FROM work_items WHERE parent_id = :storyId
        ))`, { storyId: filters.storyId });
      }

      qb.leftJoin('wi.assignee', 'assignee')
        .addSelect(['assignee.id', 'assignee.displayName', 'assignee.avatarUrl'])
        .leftJoinAndSelect('wi.labels', 'labels');

      qb.orderBy('wi.sortOrder', 'ASC');

      const items = await qb.getMany();
      itemsByStatus.push(items);
      allItems.push(...items);
    }

    // Step 2: batched, set-based enrichment queries keyed by item id.
    const allIds = allItems.map((i) => i.id);

    // Subtask counts (total + done) for task items, keyed by parent id.
    const taskIds = allItems.filter((i) => i.itemType === 'task').map((i) => i.id);
    const subtaskCounts = new Map<number, { total: number; done: number }>();
    if (taskIds.length > 0) {
      const rows = await this.dataSource.query(
        `SELECT parent_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ps.category = 'done')::int AS done
         FROM work_items wi
         JOIN project_statuses ps ON ps.id = wi.status_id
         WHERE wi.parent_id = ANY($1)
         GROUP BY parent_id`,
        [taskIds],
      );
      for (const r of rows) {
        subtaskCounts.set(r.parent_id, { total: r.total, done: r.done });
      }
    }

    // Comment counts keyed by work item id.
    const commentCounts = new Map<number, number>();
    if (allIds.length > 0) {
      const rows = await this.dataSource.query(
        `SELECT work_item_id, COUNT(*)::int AS count
         FROM comments WHERE work_item_id = ANY($1) GROUP BY work_item_id`,
        [allIds],
      );
      for (const r of rows) commentCounts.set(r.work_item_id, r.count);
    }

    // Attachment counts keyed by work item id.
    const attachmentCounts = new Map<number, number>();
    if (allIds.length > 0) {
      const rows = await this.dataSource.query(
        `SELECT work_item_id, COUNT(*)::int AS count
         FROM attachments WHERE work_item_id = ANY($1) GROUP BY work_item_id`,
        [allIds],
      );
      for (const r of rows) attachmentCounts.set(r.work_item_id, r.count);
    }

    // Blocker flags: set of item ids that have an outgoing 'blocks' association.
    const blockedIds = new Set<number>();
    if (allIds.length > 0) {
      const rows = await this.dataSource.query(
        `SELECT DISTINCT item_id FROM work_item_associations
         WHERE item_id = ANY($1) AND link_type = 'blocks'`,
        [allIds],
      );
      for (const r of rows) blockedIds.add(r.item_id);
    }

    // Parent refs for subtasks: one query for all distinct parent ids.
    const parentRefs = new Map<number, { id: number; itemKey: string; title: string }>();
    const parentIds = [
      ...new Set(
        allItems
          .filter((i) => i.itemType === 'subtask' && i.parentId)
          .map((i) => i.parentId as number),
      ),
    ];
    if (parentIds.length > 0) {
      const rows = await this.dataSource.query(
        `SELECT wi.id, wi.item_number, wi.title, p.prefix
         FROM work_items wi JOIN projects p ON p.id = wi.project_id
         WHERE wi.id = ANY($1)`,
        [parentIds],
      );
      for (const r of rows) {
        parentRefs.set(r.id, {
          id: r.id,
          itemKey: `${r.prefix}-${r.item_number}`,
          title: r.title,
        });
      }
    }

    // Epic colors for task/bug items: one recursive CTE walking 'belongs_to'
    // associations up to the epic ancestor. The base case starts from ALL ids
    // at once and carries the originating item id (root_id) down through the
    // recursion so the final SELECT maps each starting item to its epic color.
    const epicColors = new Map<number, string>();
    const epicCandidateIds = allItems
      .filter((i) => i.itemType === 'task' || i.itemType === 'bug')
      .map((i) => i.id);
    if (epicCandidateIds.length > 0) {
      const rows = await this.dataSource.query(
        `WITH RECURSIVE ancestors AS (
           SELECT a.item_id AS root_id, a.linked_item_id AS id, wi.item_type, wi.color
           FROM work_item_associations a
           JOIN work_items wi ON wi.id = a.linked_item_id
           WHERE a.item_id = ANY($1) AND a.link_type = 'belongs_to'
           UNION ALL
           SELECT anc.root_id, a2.linked_item_id, wi2.item_type, wi2.color
           FROM work_item_associations a2
           JOIN work_items wi2 ON wi2.id = a2.linked_item_id
           JOIN ancestors anc ON a2.item_id = anc.id
           WHERE a2.link_type = 'belongs_to'
         )
         SELECT DISTINCT ON (root_id) root_id, color
         FROM ancestors WHERE item_type = 'epic'`,
        [epicCandidateIds],
      );
      for (const r of rows) {
        if (r.color) epicColors.set(r.root_id, r.color);
      }
    }

    // Step 3: build each column's enriched items via map/set lookups — no awaits.
    const columns = statuses.map((status, statusIdx) => {
      const items = itemsByStatus[statusIdx];
      const enrichedItems = items.map((item) => {
        let subtaskCount = 0;
        let subtaskDoneCount = 0;
        if (item.itemType === 'task') {
          const counts = subtaskCounts.get(item.id);
          if (counts) {
            subtaskCount = counts.total;
            subtaskDoneCount = counts.done;
          }
        }

        const hasBlockers = blockedIds.has(item.id);

        const commentCount = commentCounts.get(item.id) || 0;
        const attachmentCount = attachmentCounts.get(item.id) || 0;

        let parentRef: { id: number; itemKey: string; title: string } | null = null;
        if (item.itemType === 'subtask' && item.parentId) {
          parentRef = parentRefs.get(item.parentId) || null;
        }

        let epicColor: string | null = null;
        if (item.itemType === 'task' || item.itemType === 'bug') {
          epicColor = epicColors.get(item.id) || null;
        }

        return {
          id: item.id,
          itemKey: `${item.itemNumber}`,
          itemType: item.itemType,
          title: item.title,
          priority: item.priority,
          assignee: item.assignee ? {
            id: item.assignee.id,
            displayName: (item.assignee as any).displayName,
            avatarUrl: (item.assignee as any).avatarUrl,
          } : null,
          storyPoints: item.storyPoints,
          subtaskCount,
          subtaskDoneCount,
          commentCount,
          attachmentCount,
          hasBlockers,
          labels: (item.labels || []).map((l) => ({
            id: l.id,
            name: l.name,
            color: (l as any).color,
          })),
          sortOrder: item.sortOrder,
          parentRef,
          epicColor,
        };
      });

      return {
        status: {
          id: status.id,
          name: status.name,
          category: status.category,
          color: status.color,
          wipLimit: status.wipLimit || 0,
        },
        tasks: enrichedItems,
        taskCount: items.length,
      };
    });

    return { columns };
  }

  async moveCard(projectId: number, itemId: number, statusId: number, sortOrder: string, userId: number) {
    const item = await this.workItemRepo.findOne({ where: { id: itemId, projectId } });
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const targetStatus = await this.statusRepo.findOne({ where: { id: statusId, projectId } });
    if (!targetStatus) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check dependency blocks when moving to done
    if (targetStatus.category === 'done') {
      const blockers = await this.dataSource.query(
        `SELECT a.id, wi.item_number, ps.category
         FROM work_item_associations a
         JOIN work_items wi ON wi.id = a.linked_item_id
         JOIN project_statuses ps ON ps.id = wi.status_id
         WHERE a.item_id = $1 AND a.link_type = 'blocks'`,
        [itemId],
      );
      const unresolvedBlockers = blockers.filter((b: any) => b.category !== 'done');
      if (unresolvedBlockers.length > 0) {
        throw new AppLogicException('ITEM_BLOCKED', HttpStatus.BAD_REQUEST);
      }

      item.completedAt = new Date();
    } else {
      // Moving out of done — clear completedAt
      const currentStatus = await this.statusRepo.findOne({ where: { id: item.statusId } });
      if (currentStatus?.category === 'done') {
        item.completedAt = null;
      }
    }

    item.statusId = statusId;
    item.sortOrder = sortOrder;
    await this.workItemRepo.save(item);

    this.eventEmitter.emit('board.moved', {
      projectId,
      itemId: item.id,
      statusId,
      sortOrder,
      completedAt: item.completedAt,
      actorId: userId,
    });

    return {
      id: item.id,
      itemKey: `${item.itemNumber}`,
      statusId: item.statusId,
      sortOrder: item.sortOrder,
      completedAt: item.completedAt,
    };
  }
}
