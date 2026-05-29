import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityLog } from './entities/activity-log.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityRepo: Repository<ActivityLog>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Recent activity for items currently in a sprint — feeds the Sprint Detail
   * "Recent" rail. activity_logs has no sprint_id, so we join to work_items
   * and filter on the item's current sprint. Generic 'updated' rows (no
   * field_changed) are noise and excluded; the rest are phrased server-side
   * into a ready-to-render line.
   */
  async listSprintActivity(projectId: number, sprintId: number, limit = 8) {
    const rows = await this.dataSource.query(
      `
      SELECT a.id,
             a.action,
             a.field_changed AS "fieldChanged",
             a.old_value AS "oldValue",
             a.new_value AS "newValue",
             a.created_at AS "createdAt",
             u.id AS "userId",
             u.display_name AS "displayName",
             u.avatar_url AS "avatarUrl",
             wi.item_number AS "itemNumber",
             ns.name AS "newStatusName"
      FROM activity_logs a
      JOIN work_items wi ON wi.id = a.work_item_id
      JOIN users u ON u.id = a.user_id
      LEFT JOIN project_statuses ns
        ON a.field_changed = 'status'
        AND ns.id = CASE WHEN a.new_value ~ '^[0-9]+$' THEN a.new_value::int ELSE NULL END
      WHERE wi.sprint_id = $1
        AND wi.deleted_at IS NULL
        AND NOT (a.action = 'updated' AND a.field_changed IS NULL)
      ORDER BY a.created_at DESC
      LIMIT $2
      `,
      [sprintId, clampLimit(limit)],
    );

    const [proj] = await this.dataSource.query(`SELECT prefix FROM projects WHERE id = $1`, [projectId]);
    const prefix: string | undefined = proj?.prefix;

    return {
      entries: rows.map((r: any) => {
        const itemKey = prefix ? `${prefix}-${r.itemNumber}` : `#${r.itemNumber}`;
        return {
          id: r.id,
          user: { id: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl },
          createdAt: r.createdAt,
          text: this.phraseActivity(r, itemKey, sprintId),
        };
      }),
    };
  }

  private phraseActivity(
    r: { action: string; fieldChanged: string | null; oldValue: string | null; newValue: string | null; newStatusName: string | null },
    itemKey: string,
    sprintId: number,
  ): string {
    if (r.action === 'created') return `created ${itemKey}`;
    if (r.action === 'comment_added') return `commented on ${itemKey}`;
    if (r.action === 'attachment_added') return `attached a file to ${itemKey}`;

    switch (r.fieldChanged) {
      case 'status':
        return `moved ${itemKey} to ${r.newStatusName ?? 'a new status'}`;
      case 'sprint':
        if (r.newValue === String(sprintId)) return `pulled ${itemKey} into the sprint`;
        if (r.oldValue === String(sprintId)) return `moved ${itemKey} out of the sprint`;
        return `changed the sprint of ${itemKey}`;
      case 'assignee':
        return `reassigned ${itemKey}`;
      case 'priority':
        return `changed ${itemKey} priority`;
      case 'story_points':
        return `re-estimated ${itemKey}`;
      case 'title':
        return `renamed ${itemKey}`;
      default:
        return `updated ${itemKey}`;
    }
  }

  async listProjectActivity(projectId: number, page: number = 1, limit: number = 20) {
    limit = clampLimit(limit);
    const qb = this.activityRepo.createQueryBuilder('a')
      .leftJoin('a.user', 'user')
      .addSelect(['user.id', 'user.displayName', 'user.avatarUrl'])
      .where('a.projectId = :projectId', { projectId })
      .orderBy('a.createdAt', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  async listTaskActivity(projectId: number, workItemId: number, page: number = 1, limit: number = 20) {
    limit = clampLimit(limit);
    const qb = this.activityRepo.createQueryBuilder('a')
      .leftJoin('a.user', 'user')
      .addSelect(['user.id', 'user.displayName', 'user.avatarUrl'])
      .where('a.projectId = :projectId AND a.workItemId = :workItemId', { projectId, workItemId })
      .orderBy('a.createdAt', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  // --- Event Listeners ---

  @OnEvent('work_item.created')
  async onWorkItemCreated(payload: { item: any; userId: number; projectId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.item?.id,
        userId: payload.userId,
        action: 'created',
      }));
    } catch (err) {
      this.logger.error(`onWorkItemCreated failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('work_item.updated')
  async onWorkItemUpdated(payload: {
    item: any;
    userId: number;
    projectId: number;
    changes: any;
    previous?: Partial<Record<string, { old: any; new: any }>>;
  }) {
    try {
      const rows: ActivityLog[] = [
        // Generic 'updated' row — feeds the activity feed. Always written.
        this.activityRepo.create({
          projectId: payload.projectId,
          workItemId: payload.item?.id,
          userId: payload.userId,
          action: 'updated',
        }),
      ];

      // Phase 2 — one granular row per changed field so the rail can
      // render "Alice raised priority to high" instead of just "Alice
      // updated BST-142". The cumulative-flow chart (D-C6) reads the
      // 'status' row specifically and casts new_value to INTEGER, so
      // status rows preserve the old-as-stringified-id contract.
      const previous = payload.previous ?? {};
      const FIELD_NAME_MAP: Record<string, string> = {
        statusId: 'status',
        title: 'title',
        priority: 'priority',
        storyPoints: 'story_points',
        assigneeId: 'assignee',
        sprintId: 'sprint',
        startDate: 'start_date',
        endDate: 'end_date',
        reviewerId: 'reviewer',
      };

      const toStr = (v: unknown): string | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (v instanceof Date) return v.toISOString();
        return JSON.stringify(v);
      };

      for (const [key, change] of Object.entries(previous)) {
        if (!change) continue;
        const fieldChanged = FIELD_NAME_MAP[key] ?? key;
        rows.push(this.activityRepo.create({
          projectId: payload.projectId,
          workItemId: payload.item?.id,
          userId: payload.userId,
          action: 'updated',
          fieldChanged,
          oldValue: toStr(change.old),
          newValue: toStr(change.new),
        }));
      }

      await this.activityRepo.save(rows);
    } catch (err) {
      this.logger.error(`onWorkItemUpdated failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('work_item.deleted')
  async onWorkItemDeleted(payload: { itemId: number; itemType: string; userId: number; projectId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.itemId,
        userId: payload.userId,
        action: 'deleted',
      }));
    } catch (err) {
      this.logger.error(`onWorkItemDeleted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('comment.added')
  async onCommentAdded(payload: { workItemId: number; projectId: number; actorId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.workItemId,
        userId: payload.actorId,
        action: 'comment_added',
      }));
    } catch (err) {
      this.logger.error(`onCommentAdded failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('attachment.added')
  async onAttachmentAdded(payload: { workItemId: number; projectId: number; actorId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.workItemId,
        userId: payload.actorId,
        action: 'attachment_added',
      }));
    } catch (err) {
      this.logger.error(`onAttachmentAdded failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.started')
  async onSprintStarted(payload: { sprintId: number; projectId: number; actorId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        userId: payload.actorId,
        action: 'sprint_started',
      }));
    } catch (err) {
      this.logger.error(`onSprintStarted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.completed')
  async onSprintCompleted(payload: { sprintId: number; projectId: number; actorId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        userId: payload.actorId,
        action: 'sprint_completed',
      }));
    } catch (err) {
      this.logger.error(`onSprintCompleted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.cancelled')
  async onSprintCancelled(payload: { sprintId: number; projectId: number; actorId: number }) {
    try {
      await this.activityRepo.save(this.activityRepo.create({
        projectId: payload.projectId,
        userId: payload.actorId,
        action: 'sprint_cancelled',
      }));
    } catch (err) {
      this.logger.error(`onSprintCancelled failed: ${err}`, (err as Error)?.stack);
    }
  }
}
