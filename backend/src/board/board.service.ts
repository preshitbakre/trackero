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

    const columns = [];
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
      const taskCount = items.length;

      const enrichedItems = await Promise.all(items.map(async (item) => {
        // Subtask/comment counts for tasks
        let subtaskCount = 0;
        let subtaskDoneCount = 0;
        if (item.itemType === 'task') {
          subtaskCount = await this.workItemRepo.count({ where: { parentId: item.id } });
          const [doneResult] = await this.dataSource.query(
            `SELECT COUNT(*) as count FROM work_items wi
             JOIN project_statuses ps ON ps.id = wi.status_id
             WHERE wi.parent_id = $1 AND ps.category = 'done'`,
            [item.id],
          );
          subtaskDoneCount = parseInt(doneResult?.count || '0');
        }

        // Blocker check (item is blocked if it has outgoing 'blocks' associations)
        const hasBlockers = await this.assocRepo.count({
          where: { itemId: item.id, linkType: 'blocks' },
        }) > 0;

        // Comment count
        const [commentResult] = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM comments WHERE work_item_id = $1`,
          [item.id],
        );
        const commentCount = parseInt(commentResult?.count || '0');

        // Attachment count
        const [attachResult] = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM attachments WHERE work_item_id = $1`,
          [item.id],
        );
        const attachmentCount = parseInt(attachResult?.count || '0');

        // Parent ref for subtasks
        let parentRef: { id: number; itemKey: string; title: string } | null = null;
        if (item.itemType === 'subtask' && item.parentId) {
          const [parent] = await this.dataSource.query(
            `SELECT wi.id, item_number, title, p.prefix
             FROM work_items wi JOIN projects p ON p.id = wi.project_id
             WHERE wi.id = $1`,
            [item.parentId],
          );
          if (parent) {
            parentRef = {
              id: parent.id,
              itemKey: `${parent.prefix}-${parent.item_number}`,
              title: parent.title,
            };
          }
        }

        // Epic color: walk up associations to find epic ancestor
        let epicColor: string | null = null;
        if (item.itemType === 'task' || item.itemType === 'bug') {
          const epicResult = await this.dataSource.query(`
            WITH RECURSIVE ancestors AS (
              SELECT a.linked_item_id AS id, wi.item_type, wi.color
              FROM work_item_associations a
              JOIN work_items wi ON wi.id = a.linked_item_id
              WHERE a.item_id = $1 AND a.link_type = 'belongs_to'
              UNION ALL
              SELECT a2.linked_item_id, wi2.item_type, wi2.color
              FROM work_item_associations a2
              JOIN work_items wi2 ON wi2.id = a2.linked_item_id
              JOIN ancestors anc ON a2.item_id = anc.id
              WHERE a2.link_type = 'belongs_to'
            )
            SELECT color FROM ancestors WHERE item_type = 'epic' LIMIT 1
          `, [item.id]);
          epicColor = epicResult[0]?.color || null;
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
      }));

      columns.push({
        status: {
          id: status.id,
          name: status.name,
          category: status.category,
          color: status.color,
          wipLimit: status.wipLimit || 0,
        },
        tasks: enrichedItems,
        taskCount,
      });
    }

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
