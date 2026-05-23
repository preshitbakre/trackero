import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

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
