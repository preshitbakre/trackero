import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { EmailService } from '../common/services/email.service';
import { clampLimit } from '../common/helpers/pagination.helper';

@Injectable()
export class NotificationsService {
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
    referenceType: 'task' | 'sprint' | 'comment' | 'project',
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
      payload.projectId,
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
      payload.projectId,
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
        payload.projectId,
      );
    }
  }

  @OnEvent('blocker.resolved')
  async onBlockerResolved(payload: { blockerTaskId: number; projectId: number; actorId: number }) {
    // Find all tasks blocked by this one
    const blockedTasks = await this.dataSource.query(
      `SELECT td.task_id, t.assignee_id, t.task_number
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id
       WHERE td.depends_on_task_id = $1 AND td.dependency_type = 'blocks'`,
      [payload.blockerTaskId],
    );

    const [project] = await this.dataSource.query(
      'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
    );

    for (const blocked of blockedTasks) {
      if (!blocked.assignee_id) continue;
      const taskKey = `${project?.prefix || ''}-${blocked.task_number}`;
      await this.createNotification(
        blocked.assignee_id,
        payload.actorId,
        'blocker_resolved',
        'task',
        blocked.task_id,
        `Blocker resolved for ${taskKey}`,
        null,
        payload.projectId,
      );
    }
  }

  @OnEvent('project.member_added')
  async onMemberAdded(payload: { userId: number; projectId: number; actorId: number; projectName: string }) {
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
  }

  @OnEvent('comment.mentioned')
  async onMentioned(payload: { userId: number; actorId: number; taskId: number; projectId: number; commentId: number }) {
    const [task] = await this.dataSource.query(
      'SELECT task_number, title FROM tasks WHERE id = $1', [payload.taskId],
    );
    const [project] = await this.dataSource.query(
      'SELECT prefix FROM projects WHERE id = $1', [payload.projectId],
    );
    const taskKey = `${project?.prefix || ''}-${task?.task_number || ''}`;

    await this.createNotification(
      payload.userId,
      payload.actorId,
      'mentioned',
      'comment',
      payload.commentId,
      `You were mentioned in ${taskKey}`,
      task?.title || null,
      payload.projectId,
    );
  }

  @OnEvent('sprint.started')
  async onSprintStarted(payload: { sprintId: number; projectId: number; actorId: number }) {
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
  }
}
