import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { EmailService } from '../common/services/email.service';
import { clampLimit } from '../common/helpers/pagination.helper';
import {
  COMMENT_ADDED,
  COMMENT_MENTIONED,
  type CommentAddedPayload,
  type CommentMentionedPayload,
} from '../comments/events/comment-added.event';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailService: EmailService,
  ) {}

  async list(userId: number, page: number = 1, limit: number = 20, isRead?: boolean) {
    limit = clampLimit(limit);
    const qb = this.notifRepo.createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (isRead !== undefined) {
      qb.andWhere('n.isRead = :isRead', { isRead });
    }

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  async getUnreadCount(userId: number) {
    const count = await this.notifRepo.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(userId: number, notifId: number) {
    await this.notifRepo.update(
      { id: notifId, userId },
      { isRead: true, readAt: new Date() },
    );
  }

  async markAllRead(userId: number) {
    await this.notifRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  // --- Private helper ---
  private async createNotification(
    userId: number,
    actorId: number,
    type: string,
    referenceType: 'work_item' | 'task' | 'sprint' | 'comment' | 'project',
    referenceId: number,
    title: string,
    body?: string | null,
    projectId?: number | null,
  ) {
    // Suppression: never notify the actor
    if (userId === actorId) return;

    // Suppression: check user is active
    const [user] = await this.dataSource.query(
      'SELECT is_active FROM users WHERE id = $1', [userId],
    );
    if (!user || !user.is_active) return;

    // Suppression: duplicate within 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await this.notifRepo.findOne({
      where: {
        userId,
        type,
        referenceId,
        createdAt: MoreThan(fiveMinAgo),
      },
    });
    if (existing) return;

    const notif = this.notifRepo.create({
      userId,
      type,
      referenceType,
      referenceId,
      title,
      body: body || null,
      projectId: projectId || null,
    });
    await this.notifRepo.save(notif);

    // Emit to gateway for real-time delivery
    this.eventEmitter.emit('notification.created', { notification: notif });

    // Send email for certain notification types
    if (['task_assigned', 'sprint_starting', 'task_due_soon', 'task_overdue'].includes(type)) {
      const [userEmail] = await this.dataSource.query(
        'SELECT email FROM users WHERE id = $1', [userId],
      );
      if (userEmail?.email) {
        this.emailService.sendEmail(userEmail.email, title, body || title).catch(() => {});
      }
    }
  }

  // --- Event Listeners ---

  @OnEvent('work_item.assigned')
  async onWorkItemAssigned(payload: {
    itemId: number;
    projectId: number;
    actorId: number;
    assigneeId: number | null;
  }) {
    try {
      if (!payload.assigneeId) return;

      const [item] = await this.dataSource.query(
        'SELECT item_number, title FROM work_items WHERE id = $1', [payload.itemId],
      );
      if (!item) return;

      const [project] = await this.dataSource.query(
        'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
      );
      const itemKey = `${project?.prefix || ''}-${item.item_number}`;

      await this.createNotification(
        payload.assigneeId,
        payload.actorId,
        'task_assigned',
        'task',
        payload.itemId,
        `You were assigned to ${itemKey}`,
        item.title || null,
        payload.projectId,
      );
    } catch (err) {
      this.logger.error(`onWorkItemAssigned failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('story.approved')
  async onStoryApproved(payload: { id: number; projectId: number; userId: number }) {
    try {
      const [item] = await this.dataSource.query(
        'SELECT item_number, title, reporter_id FROM work_items WHERE id = $1', [payload.id],
      );
      if (!item) return;
      const [project] = await this.dataSource.query(
        'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
      );
      const itemKey = `${project?.prefix || ''}-${item.item_number}`;

      const watchers = await this.dataSource.query(
        'SELECT user_id FROM work_item_watchers WHERE work_item_id = $1', [payload.id],
      );
      const recipients = new Set<number>(watchers.map((w: any) => w.user_id));
      if (item.reporter_id) recipients.add(item.reporter_id);

      for (const userId of recipients) {
        await this.createNotification(
          userId,
          payload.userId,
          'story_approved',
          'work_item',
          payload.id,
          `${itemKey} was approved`,
          item.title || null,
          payload.projectId,
        );
      }
    } catch (err) {
      this.logger.error(`onStoryApproved failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent(COMMENT_ADDED)
  async onCommentAdded(payload: CommentAddedPayload) {
    try {
      // Notify assignee + reporter (not author).
      const [task] = await this.dataSource.query(
        'SELECT assignee_id, reporter_id, item_number, title FROM work_items WHERE id = $1',
        [payload.workItemId],
      );
      if (!task) return;

      const [project] = await this.dataSource.query(
        'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
      );
      const itemKey = `${project?.prefix || ''}-${task.item_number}`;
      const recipients = new Set<number>();

      if (task.assignee_id) recipients.add(task.assignee_id);
      if (task.reporter_id) recipients.add(task.reporter_id);

      for (const userId of recipients) {
        await this.createNotification(
          userId,
          payload.actorId,
          'comment_added',
          'work_item',
          payload.workItemId,
          `New comment on ${itemKey}`,
          task.title,
          payload.projectId,
        );
      }
    } catch (err) {
      this.logger.error(`onCommentAdded failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('project.member_added')
  async onMemberAdded(payload: { userId: number; projectId: number; actorId: number; projectName: string }) {
    try {
      await this.createNotification(
        payload.userId,
        payload.actorId,
        'added_to_project',
        'project',
        payload.projectId,
        `You were added to ${payload.projectName}`,
        null,
        payload.projectId,
      );
    } catch (err) {
      this.logger.error(`onMemberAdded failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent(COMMENT_MENTIONED)
  async onMentioned(payload: CommentMentionedPayload) {
    try {
      const [task] = await this.dataSource.query(
        'SELECT item_number, title FROM work_items WHERE id = $1',
        [payload.workItemId],
      );
      const [project] = await this.dataSource.query(
        'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
      );
      const itemKey = `${project?.prefix || ''}-${task?.item_number || ''}`;

      await this.createNotification(
        payload.userId,
        payload.actorId,
        'mentioned',
        'work_item',
        payload.workItemId,
        `You were mentioned in ${itemKey}`,
        task?.title || null,
        payload.projectId,
      );
    } catch (err) {
      this.logger.error(`onMentioned failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.started')
  async onSprintStarted(payload: { sprintId: number; projectId: number; actorId: number }) {
    try {
      const [sprint] = await this.dataSource.query(
        'SELECT name FROM sprints WHERE id = $1', [payload.sprintId],
      );
      const members = await this.dataSource.query(
        'SELECT user_id FROM project_members WHERE project_id = $1',
        [payload.projectId],
      );

      for (const member of members) {
        await this.createNotification(
          member.user_id,
          payload.actorId,
          'sprint_starting',
          'sprint',
          payload.sprintId,
          `Sprint "${sprint?.name || ''}" has started`,
          null,
          payload.projectId,
        );
      }
    } catch (err) {
      this.logger.error(`onSprintStarted failed: ${err}`, (err as Error)?.stack);
    }
  }
}
