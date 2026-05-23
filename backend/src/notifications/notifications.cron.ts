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
    // pg advisory locks are SESSION-scoped — they belong to the exact pooled
    // connection that ran pg_try_advisory_lock. dataSource.query() checks out
    // an arbitrary pooled connection per call, so an unlock could land on a
    // different connection and leave the lock lingering. Pin the acquire +
    // release to one dedicated QueryRunner connection.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // Overlap / multi-instance guard: only one run proceeds at a time.
      const rows = await queryRunner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [DAILY_NOTIFICATIONS_LOCK_KEY],
      );
      if (!rows[0]?.locked) {
        this.logger.warn('daily notifications cron already running — skipping');
        return;
      }

      try {
        await this.checkSprintEnding();
        await this.checkTasksDueSoon();
        await this.checkTasksOverdue();
      } finally {
        // Release on the SAME pinned connection that acquired the lock.
        await queryRunner.query('SELECT pg_advisory_unlock($1)', [
          DAILY_NOTIFICATIONS_LOCK_KEY,
        ]);
      }
    } finally {
      // Always return the connection to the pool. If the process crashed
      // before this ran, closing the connection auto-drops the session lock.
      await queryRunner.release();
    }
  }

  private async checkSprintEnding() {
    // Compare against the database's CURRENT_DATE so the cron's host timezone
    // doesn't shift "tomorrow" off the Postgres `date` column.
    const sprints = await this.dataSource.query(
      `SELECT s.id, s.name, s.project_id FROM sprints s
       WHERE s.status = 'active' AND s.end_date = CURRENT_DATE + INTERVAL '1 day'`,
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
    // Compare against the database's CURRENT_DATE so the cron's host timezone
    // doesn't shift "tomorrow" off the Postgres `date` column.
    const items = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.assignee_id, wi.project_id, p.prefix
       FROM work_items wi JOIN projects p ON p.id = wi.project_id
       JOIN project_statuses ps ON ps.id = wi.status_id
       WHERE wi.end_date = CURRENT_DATE + INTERVAL '1 day' AND wi.assignee_id IS NOT NULL
       AND ps.category != 'done'`,
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
    // Compare against the database's CURRENT_DATE so the cron's host timezone
    // doesn't shift "today" off the Postgres `date` column.
    const items = await this.dataSource.query(
      `SELECT wi.id, wi.item_number, wi.title, wi.assignee_id, wi.project_id, p.prefix
       FROM work_items wi JOIN projects p ON p.id = wi.project_id
       JOIN project_statuses ps ON ps.id = wi.status_id
       WHERE wi.end_date < CURRENT_DATE AND wi.assignee_id IS NOT NULL
       AND ps.category != 'done'`,
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
