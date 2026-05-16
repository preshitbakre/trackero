import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsCron {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 9 * * *') // Daily at 9 AM
  async handleDailyNotifications() {
    await this.checkSprintEnding();
    await this.checkTasksDueSoon();
    await this.checkTasksOverdue();
  }

  private async checkSprintEnding() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const sprints = await this.dataSource.query(
      `SELECT s.id, s.name, s.project_id FROM sprints s WHERE s.status = 'active' AND s.end_date = $1`,
      [tomorrowStr],
    );

    for (const sprint of sprints) {
      const members = await this.dataSource.query(
        'SELECT user_id FROM project_members WHERE project_id = $1',
        [sprint.project_id],
      );
      for (const member of members) {
        await this.createIfNotDuplicate(
          member.user_id, 'sprint_ending', 'sprint', sprint.id,
          `Sprint "${sprint.name}" ends tomorrow`, null,
        );
      }
    }
  }

  private async checkTasksDueSoon() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const tasks = await this.dataSource.query(
      `SELECT t.id, t.task_number, t.title, t.assignee_id, t.project_id, p.prefix
       FROM tasks t JOIN projects p ON p.id = t.project_id
       JOIN project_statuses ps ON ps.id = t.status_id
       WHERE t.due_date = $1 AND t.assignee_id IS NOT NULL
       AND ps.category NOT IN ('done', 'cancelled')`,
      [tomorrowStr],
    );

    for (const task of tasks) {
      const taskKey = `${task.prefix}-${task.task_number}`;
      await this.createIfNotDuplicate(
        task.assignee_id, 'task_due_soon', 'task', task.id,
        `${taskKey} is due tomorrow`, task.title,
      );
    }
  }

  private async checkTasksOverdue() {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await this.dataSource.query(
      `SELECT t.id, t.task_number, t.title, t.assignee_id, t.project_id, p.prefix
       FROM tasks t JOIN projects p ON p.id = t.project_id
       JOIN project_statuses ps ON ps.id = t.status_id
       WHERE t.due_date < $1 AND t.assignee_id IS NOT NULL
       AND ps.category NOT IN ('done', 'cancelled')`,
      [today],
    );

    for (const task of tasks) {
      // Only notify once per 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await this.notifRepo.findOne({
        where: {
          userId: task.assignee_id,
          type: 'task_overdue',
          referenceId: task.id,
          createdAt: MoreThan(oneDayAgo),
        },
      });
      if (existing) continue;

      const taskKey = `${task.prefix}-${task.task_number}`;
      await this.notifRepo.save(this.notifRepo.create({
        userId: task.assignee_id,
        type: 'task_overdue',
        referenceType: 'task',
        referenceId: task.id,
        title: `${taskKey} is overdue`,
        body: task.title,
      }));
    }
  }

  private async createIfNotDuplicate(
    userId: number, type: string, referenceType: string, referenceId: number,
    title: string, body: string | null,
  ) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await this.notifRepo.findOne({
      where: { userId, type, referenceId, createdAt: MoreThan(fiveMinAgo) },
    });
    if (existing) return;

    await this.notifRepo.save(this.notifRepo.create({
      userId, type, referenceType: referenceType as any, referenceId, title, body,
    }));
  }
}
