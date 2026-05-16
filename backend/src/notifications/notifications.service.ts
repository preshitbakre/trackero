import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: number, page: number = 1, limit: number = 20, isRead?: boolean) {
    const qb = this.notifRepo.createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (isRead !== undefined) {
      qb.andWhere('n.isRead = :isRead', { isRead });
    }

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
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
    referenceType: 'task' | 'sprint' | 'comment' | 'project',
    referenceId: number,
    title: string,
    body?: string | null,
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
    });
    await this.notifRepo.save(notif);
  }

  // --- Event Listeners ---

  @OnEvent('task.assigned')
  async onTaskAssigned(payload: { taskId: number; projectId: number; actorId: number; assigneeId: number | null }) {
    if (!payload.assigneeId) return;
    // Get task info for title
    const [task] = await this.dataSource.query(
      'SELECT task_number, title FROM tasks WHERE id = $1', [payload.taskId],
    );
    const [project] = await this.dataSource.query(
      'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
    );
    const taskKey = `${project?.prefix || ''}-${task?.task_number || ''}`;

    await this.createNotification(
      payload.assigneeId,
      payload.actorId,
      'task_assigned',
      'task',
      payload.taskId,
      `You were assigned to ${taskKey}`,
      task?.title || null,
    );
  }

  @OnEvent('task.status_changed')
  async onTaskStatusChanged(payload: { taskId: number; projectId: number; actorId: number; oldStatusId: number; newStatusId: number }) {
    // Notify reporter if different from actor
    const [task] = await this.dataSource.query(
      'SELECT reporter_id, task_number, title FROM tasks WHERE id = $1', [payload.taskId],
    );
    if (!task || task.reporter_id === payload.actorId) return;

    const [project] = await this.dataSource.query(
      'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
    );
    const taskKey = `${project?.prefix || ''}-${task.task_number}`;

    await this.createNotification(
      task.reporter_id,
      payload.actorId,
      'task_status_changed',
      'task',
      payload.taskId,
      `Status changed on ${taskKey}`,
      task.title,
    );
  }

  @OnEvent('comment.added')
  async onCommentAdded(payload: { taskId: number; projectId: number; actorId: number; commentId: number }) {
    // Notify assignee + reporter (not author)
    const [task] = await this.dataSource.query(
      'SELECT assignee_id, reporter_id, task_number, title FROM tasks WHERE id = $1', [payload.taskId],
    );
    if (!task) return;

    const [project] = await this.dataSource.query(
      'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
    );
    const taskKey = `${project?.prefix || ''}-${task.task_number}`;
    const recipients = new Set<number>();

    if (task.assignee_id) recipients.add(task.assignee_id);
    if (task.reporter_id) recipients.add(task.reporter_id);

    for (const userId of recipients) {
      await this.createNotification(
        userId,
        payload.actorId,
        'comment_added',
        'task',
        payload.taskId,
        `New comment on ${taskKey}`,
        task.title,
      );
    }
  }
}
