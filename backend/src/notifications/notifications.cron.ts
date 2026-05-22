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

    const items = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.assignee_id, wi.project_id, p.prefix
       FROM work_items wi JOIN projects p ON p.id = wi.project_id
       JOIN project_statuses ps ON ps.id = wi.status_id
       WHERE wi.end_date = $1 AND wi.assignee_id IS NOT NULL
       AND ps.category != 'done'`,
      [tomorrowStr],
    );

    for (const item of items) {
      const itemKey = `${item.prefix}-${item.item_number}`;
      await this.createIfNotDuplicate(
        item.assignee_id, 'task_due_soon', 'work_item', item.id,
        `${itemKey} is due tomorrow`, item.title,
      );
    }
  }

  private async checkTasksOverdue() {
    const today = new Date().toISOString().split('T')[0];

    const items = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.assignee_id, wi.project_id, p.prefix
       FROM work_items wi JOIN projects p ON p.id = wi.project_id
       JOIN project_statuses ps ON ps.id = wi.status_id
       WHERE wi.end_date < $1 AND wi.assignee_id IS NOT NULL
       AND ps.category != 'done'`,
      [today],
    );

    for (const item of items) {
      // Only notify once per 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await this.notifRepo.findOne({
        where: {
          userId: item.assignee_id,
          type: 'task_overdue',
          referenceId: item.id,
          createdAt: MoreThan(oneDayAgo),
        },
      });
      if (existing) continue;

      const itemKey = `${item.prefix}-${item.item_number}`;
      await this.notifRepo.save(this.notifRepo.create({
        userId: item.assignee_id,
        type: 'task_overdue',
        referenceType: 'work_item',
        referenceId: item.id,
        title: `${itemKey} is overdue`,
        body: item.title,
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
