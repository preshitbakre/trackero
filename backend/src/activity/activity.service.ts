import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityLog } from './entities/activity-log.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityRepo: Repository<ActivityLog>,
  ) {}

  async listProjectActivity(projectId: number, page: number = 1, limit: number = 20) {
    const qb = this.activityRepo.createQueryBuilder('a')
      .leftJoin('a.user', 'user')
      .addSelect(['user.id', 'user.displayName', 'user.avatarUrl'])
      .where('a.projectId = :projectId', { projectId })
      .orderBy('a.createdAt', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  async listTaskActivity(projectId: number, taskId: number, page: number = 1, limit: number = 20) {
    const qb = this.activityRepo.createQueryBuilder('a')
      .leftJoin('a.user', 'user')
      .addSelect(['user.id', 'user.displayName', 'user.avatarUrl'])
      .where('a.projectId = :projectId AND a.taskId = :taskId', { projectId, taskId })
      .orderBy('a.createdAt', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  // --- Event Listeners ---

  @OnEvent('task.created')
  async onTaskCreated(payload: { taskId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'created',
    }));
  }

  @OnEvent('task.updated')
  async onTaskUpdated(payload: { taskId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'updated',
    }));
  }

  @OnEvent('task.status_changed')
  async onTaskStatusChanged(payload: { taskId: number; projectId: number; actorId: number; oldStatusId: number; newStatusId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'status_changed',
      fieldChanged: 'status',
      oldValue: String(payload.oldStatusId),
      newValue: String(payload.newStatusId),
    }));
  }

  @OnEvent('task.assigned')
  async onTaskAssigned(payload: { taskId: number; projectId: number; actorId: number; assigneeId: number | null }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'assigned',
      fieldChanged: 'assignee',
      newValue: payload.assigneeId ? String(payload.assigneeId) : null,
    }));
  }

  @OnEvent('task.deleted')
  async onTaskDeleted(payload: { taskId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'deleted',
    }));
  }

  @OnEvent('comment.added')
  async onCommentAdded(payload: { taskId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
      userId: payload.actorId,
      action: 'comment_added',
    }));
  }

  @OnEvent('attachment.added')
  async onAttachmentAdded(payload: { taskId: number; projectId: number; actorId: number }) {
    await this.activityRepo.save(this.activityRepo.create({
      projectId: payload.projectId,
      taskId: payload.taskId,
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
