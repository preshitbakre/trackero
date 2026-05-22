import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';
import { NotificationsCron } from '../src/notifications/notifications.cron';

/**
 * Task 3.9 — daily notifications cron must be idempotent and overlap-safe.
 * The cron creates sprint_ending / task_due_soon / task_overdue notifications.
 * Running it twice (concurrent runs, multiple instances, or an overlapping
 * slow run) must NOT produce duplicate notification rows.
 */
describe('Notifications Cron — idempotency & overlap (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cron Project', prefix: 'CRN' });
    projectId = projRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  /** Create a task assigned to the member with a given end_date (YYYY-MM-DD). */
  async function createAssignedTask(title: string, endDate: string): Promise<number> {
    const taskRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title });
    const taskId = taskRes.body.data.item.id;

    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${taskId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: memberId });

    await ds.query('UPDATE work_items SET end_date = $1 WHERE id = $2', [endDate, taskId]);
    return taskId;
  }

  /** Count notifications of a type for the member referencing a given id. */
  async function countNotifs(type: string, referenceId: number): Promise<number> {
    const rows = await ds.query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND type = $2 AND reference_id = $3',
      [memberId, type, referenceId],
    );
    return rows[0].c;
  }

  it('running the cron twice sequentially does NOT duplicate task_overdue notifications', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const taskId = await createAssignedTask('Overdue task', yesterday);

    const cron = app.get(NotificationsCron);
    await cron.handleDailyNotifications();
    await cron.handleDailyNotifications();

    expect(await countNotifs('task_overdue', taskId)).toBe(1);
  });

  it('running the cron twice sequentially does NOT duplicate task_due_soon notifications', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const taskId = await createAssignedTask('Due-soon task', tomorrow);

    const cron = app.get(NotificationsCron);
    await cron.handleDailyNotifications();
    await cron.handleDailyNotifications();

    expect(await countNotifs('task_due_soon', taskId)).toBe(1);
  });

  it('running the cron concurrently does NOT duplicate notifications (race-free)', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const taskId = await createAssignedTask('Concurrent overdue task', yesterday);

    const cron = app.get(NotificationsCron);
    await Promise.all([
      cron.handleDailyNotifications(),
      cron.handleDailyNotifications(),
    ]);

    expect(await countNotifs('task_overdue', taskId)).toBe(1);
  });

  it('the cron completes without error and produces the expected notification', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const taskId = await createAssignedTask('Single-run task', tomorrow);

    const cron = app.get(NotificationsCron);
    await expect(cron.handleDailyNotifications()).resolves.not.toThrow();

    expect(await countNotifs('task_due_soon', taskId)).toBe(1);
  });

  it('releases the advisory lock after a normal run (no leak on the pooled connection)', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    await createAssignedTask('Lock-release task', tomorrow);

    const cron = app.get(NotificationsCron);
    // A normal run acquires then releases the advisory lock.
    await cron.handleDailyNotifications();

    // From a separate connection the lock must now be free: if the previous
    // run leaked it (unlock landed on a different pooled connection), this
    // pg_try_advisory_lock would return false.
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      const [{ locked }] = await runner.query(
        'SELECT pg_try_advisory_lock(991002) AS locked',
      );
      expect(locked).toBe(true);
    } finally {
      await runner.query('SELECT pg_advisory_unlock(991002)');
      await runner.release();
    }
  });

  it('skips when the advisory lock is already held (overlap guard)', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const taskId = await createAssignedTask('Locked-out task', yesterday);

    // Acquire the cron's advisory lock from a dedicated connection so the
    // cron run finds it held and skips entirely.
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      const [{ locked }] = await runner.query(
        'SELECT pg_try_advisory_lock(991002) AS locked',
      );
      expect(locked).toBe(true);

      const cron = app.get(NotificationsCron);
      await cron.handleDailyNotifications();

      // Lock was held -> cron skipped -> no notification created.
      expect(await countNotifs('task_overdue', taskId)).toBe(0);
    } finally {
      await runner.query('SELECT pg_advisory_unlock(991002)');
      await runner.release();
    }
  });
});
