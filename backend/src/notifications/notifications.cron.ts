import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Postgres advisory-lock key for the daily notifications cron. Distinct from
 * the auth advisory lock (991001). pg_try_advisory_lock is non-blocking: if a
 * second instance / overlapping run finds the lock held it skips rather than
 * queueing, so each user gets each daily notification exactly once.
 */
const DAILY_NOTIFICATIONS_LOCK_KEY = 991002;

@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 9 * * *', { name: 'daily-notifications' }) // Daily at 9 AM
  async handleDailyNotifications() {
    // Overlap / multi-instance guard: only one run proceeds at a time.
    const [{ locked }] = await this.dataSource.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [DAILY_NOTIFICATIONS_LOCK_KEY],
    );
    if (!locked) {
      this.logger.warn('daily notifications cron already running — skipping');
      return;
    }

    try {
      await this.checkSprintEnding();
      await this.checkTasksDueSoon();
      await this.checkTasksOverdue();
    } finally {
      // Session-scoped lock — always release, even if a check threw.
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
        DAILY_NOTIFICATIONS_LOCK_KEY,
      ]);
    }
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
        await this.insertNotification(
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
      await this.insertNotification(
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
      const itemKey = `${item.prefix}-${item.item_number}`;
      await this.insertNotification(
        item.assignee_id, 'task_overdue', 'work_item', item.id,
        `${itemKey} is overdue`, item.title,
      );
    }
  }

  /**
   * Race-free dedup insert. The "UQ_notif_daily_dedup" partial unique index on
   * (user_id, type, reference_id, created_at::date) enforces at most one
   * cron notification per kind/reference per user per calendar day; a same-day
   * duplicate hits the index and is silently dropped by ON CONFLICT DO NOTHING.
   * is_read / created_at use their column defaults.
   */
  private async insertNotification(
    userId: number, type: string, referenceType: string, referenceId: number,
    title: string, body: string | null,
  ) {
    await this.dataSource.query(
      `INSERT INTO notifications (user_id, type, reference_type, reference_id, title, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [userId, type, referenceType, referenceId, title, body],
    );
  }
}
