import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityLog } from './entities/activity-log.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';

@Injectable()
export class ActivityService {
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
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      workItemId: payload.item?.id,
      userId: payload.userId,
      action: 'created',
    }));
  }

  @OnEvent('work_item.updated')
  async onWorkItemUpdated(payload: {
    item: any;
    userId: number;
    projectId: number;
    changes: any;
    previous?: { statusId: number | null };
  }) {
    const rows = [
      // Generic 'updated' row — feeds the activity feed. Always written.
      this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.item?.id,
        userId: payload.userId,
        action: 'updated',
      }),
    ];

    // Status-change row — feeds the cumulative-flow chart's history
    // reconstruction (D-C6). Gate on `payload.previous`, the deliberate
    // "status actually changed" signal computed by WorkItemsService.update()
    // — NOT on changes.statusId, which is the raw DTO value and is present
    // even for a no-op PUT that resends the item's current status.
    // The CFD query does CAST(new_value AS INTEGER), so new_value MUST be
    // the numeric status id as a string.
    if (payload.previous !== undefined) {
      const oldStatusId = payload.previous.statusId;
      rows.push(this.activityRepo.create({
        projectId: payload.projectId,
        workItemId: payload.item?.id,
        userId: payload.userId,
        action: 'updated',
        fieldChanged: 'status',
        oldValue:
          oldStatusId === undefined || oldStatusId === null
            ? null
            : String(oldStatusId),
        newValue: String(payload.changes?.statusId),
      }));
    }

    await this.activityRepo.save(rows);
  }

  @OnEvent('work_item.deleted')
  async onWorkItemDeleted(payload: { itemId: number; itemType: string; userId: number; projectId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      workItemId: payload.itemId,
      userId: payload.userId,
      action: 'deleted',
    }));
  }

  @OnEvent('comment.added')
  async onCommentAdded(payload: { workItemId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      workItemId: payload.workItemId,
      userId: payload.actorId,
      action: 'comment_added',
    }));
  }

  @OnEvent('attachment.added')
  async onAttachmentAdded(payload: { workItemId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      workItemId: payload.workItemId,
      userId: payload.actorId,
      action: 'attachment_added',
    }));
  }

  @OnEvent('sprint.started')
  async onSprintStarted(payload: { sprintId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      userId: payload.actorId,
      action: 'sprint_started',
    }));
  }

  @OnEvent('sprint.completed')
  async onSprintCompleted(payload: { sprintId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      userId: payload.actorId,
      action: 'sprint_completed',
    }));
  }

  @OnEvent('sprint.cancelled')
  async onSprintCancelled(payload: { sprintId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      userId: payload.actorId,
      action: 'sprint_cancelled',
    }));
  }
}
