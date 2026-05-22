import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

/** A date `daysFromNow` days ahead of today, as YYYY-MM-DD — sprints reject past start dates. */
const futureDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];

/**
 * Polls `query` until `predicate` returns true, or a ~2s timeout elapses.
 * Replaces fixed `setTimeout` sleeps when waiting for async `@OnEvent`
 * activity-log writes — removes flakiness without slowing the happy path.
 */
async function pollUntil<T>(
  query: () => Promise<T>,
  predicate: (rows: T) => boolean,
  { timeoutMs = 2000, intervalMs = 25 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let rows = await query();
  while (!predicate(rows) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    rows = await query();
  }
  return rows;
}

describe('Charts, Retro, Search (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Charts Project', prefix: 'CRT' });
    projectId = projRes.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  describe('Velocity', () => {
    it('returns velocity data for completed sprints -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/velocity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0180');
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Cumulative Flow', () => {
    it('returns cumulative flow data -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/cumulative-flow`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0181');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('reflects status history after status changes (D-C6)', async () => {
      // Fetch the project's default statuses (Open=backlog, In Progress=in_progress, Done=done)
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const statuses = statusRes.body.data.list ?? statusRes.body.data;
      const inProgressStatus = statuses.find((s: any) => s.category === 'in_progress');
      const doneStatus = statuses.find((s: any) => s.category === 'done');
      expect(inProgressStatus).toBeDefined();
      expect(doneStatus).toBeDefined();

      // Create a task (starts in the default backlog status)
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'CFD history task' })
        .expect(201);
      const taskId = taskRes.body.data.item.id;

      // Move it through 2 status changes: backlog -> in_progress -> done
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: inProgressStatus.id })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: doneStatus.id })
        .expect(200);

      // Poll until the async @OnEvent handlers commit the status-change rows.
      const dataSource = app.get(DataSource);
      const statusRows = await pollUntil(
        () => dataSource.query(
          `SELECT old_value, new_value FROM activity_logs
           WHERE work_item_id = $1 AND field_changed = 'status'
           ORDER BY created_at ASC`,
          [taskId],
        ),
        (rows: any[]) => rows.length >= 2,
      );
      expect(statusRows.length).toBeGreaterThanOrEqual(2);
      // The latest status-change row records the move to the done status
      expect(statusRows[statusRows.length - 1].new_value).toBe(String(doneStatus.id));

      // The CFD endpoint returns a non-empty series of typed buckets
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/cumulative-flow`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const series = res.body.data;
      expect(Array.isArray(series)).toBe(true);
      expect(series.length).toBeGreaterThan(0);
      for (const bucket of series) {
        expect(bucket).toHaveProperty('date');
        expect(bucket).toHaveProperty('backlog');
        expect(bucket).toHaveProperty('in_progress');
        expect(bucket).toHaveProperty('done');
      }

      // Today's bucket reflects the latest status: the task is now done
      const today = series[series.length - 1];
      expect(today.done).toBe(1);
      expect(today.in_progress).toBe(0);
      expect(today.backlog).toBe(0);
    });

    it('a no-op status PUT does NOT create an extra status-change row (D-C6)', async () => {
      const statusRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const statuses = statusRes.body.data.list ?? statusRes.body.data;
      const inProgressStatus = statuses.find((s: any) => s.category === 'in_progress');
      expect(inProgressStatus).toBeDefined();

      // Create a task — it starts in the default backlog status.
      const taskRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'No-op status task' })
        .expect(201);
      const taskId = taskRes.body.data.item.id;

      const dataSource = app.get(DataSource);
      const countStatusRows = async (): Promise<number> => {
        const [row] = await dataSource.query(
          `SELECT COUNT(*)::int AS cnt FROM activity_logs
           WHERE work_item_id = $1 AND field_changed = 'status'`,
          [taskId],
        );
        return row.cnt;
      };
      const countGenericUpdatedRows = async (): Promise<number> => {
        const [row] = await dataSource.query(
          `SELECT COUNT(*)::int AS cnt FROM activity_logs
           WHERE work_item_id = $1 AND field_changed IS NULL AND action = 'updated'`,
          [taskId],
        );
        return row.cnt;
      };

      // One REAL status change → exactly one status-change row + one generic
      // 'updated' row. Poll until both async writes commit.
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: inProgressStatus.id })
        .expect(200);
      await pollUntil(countGenericUpdatedRows, (cnt: number) => cnt >= 1);
      expect(await countStatusRows()).toBe(1);

      // No-op PUT: resend the SAME (now-current) statusId. update() sees no real
      // change (dto.statusId === item.statusId), so it must NOT produce another
      // status-change row — only a generic 'updated' row. Poll until THIS PUT's
      // generic row commits (generic-updated count reaches 2, one per PUT) so
      // the handler is guaranteed to have fully run before we assert.
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: inProgressStatus.id, title: 'No-op status task (renamed)' })
        .expect(200);
      await pollUntil(countGenericUpdatedRows, (cnt: number) => cnt >= 2);

      // Still exactly ONE status-change row — the no-op PUT added none.
      expect(await countStatusRows()).toBe(1);
    });
  });

  describe('Retrospectives', () => {
    let sprintId: number;

    beforeEach(async () => {
      const sprintRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', startDate: futureDate(1), endDate: futureDate(15) });
      sprintId = sprintRes.body.data.item.id;
    });

    it('creates retrospective -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0190');
      expect(res.body.data.sprintId).toBe(sprintId);
    });

    it('one retro per sprint enforced -> 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.code).toBe('F-L-0053');
    });

    it('gets retro with cards -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0191');
      expect(res.body.data.cards).toBeDefined();
    });

    it('adds card to retro -> 201', async () => {
      const retroRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);
      const retroId = retroRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ column: 'went_well', content: 'Great teamwork' })
        .expect(201);

      expect(res.body.code).toBe('S-0192');
      expect(res.body.data.content).toBe('Great teamwork');
      expect(res.body.data.column).toBe('went_well');
    });

    it('vote toggles and enforces one per user per card', async () => {
      const retroRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/retro`)
        .set('Authorization', `Bearer ${adminToken}`);
      const retroId = retroRes.body.data.id;

      const cardRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ column: 'went_well', content: 'Vote test' });
      const cardId = cardRes.body.data.id;

      // Vote (add)
      const voteRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(voteRes.body.code).toBe('S-0195');
      expect(voteRes.body.data.votes).toBe(1);

      // Vote again (toggle off)
      const unvoteRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(unvoteRes.body.data.votes).toBe(0);
    });
  });

  describe('Search', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Fix authentication bug in login' });
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Add user profile page' });
    });

    it('searches tasks by query -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0200');
      expect(res.body.data.list.length).toBe(1);
      expect(res.body.data.list[0].title).toContain('authentication');
    });

    it('returns empty for query < 2 chars', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search?q=a')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });

    it('scopes search to user projects (member sees only their projects)', async () => {
      // Create another project member is NOT in
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Secret Project', prefix: 'SEC' });
      const proj2Id = proj2Res.body.data.item.id;

      await request(app.getHttpServer())
        .post(`/api/projects/${proj2Id}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Secret authentication task' });

      // Member searches — should NOT see secret project tasks
      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      // Member is only in CRT project, not SEC
      const taskProjects = res.body.data.list.map((t: any) => t.projectId);
      expect(taskProjects.every((pid: number) => pid === projectId)).toBe(true);
    });

    it('filters by projectId when provided', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/search?q=profile&projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(1);
    });

    it('excludes archived project tasks', async () => {
      // Archive the project
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app.getHttpServer())
        .get('/api/search?q=authentication')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.list.length).toBe(0);
    });
  });
});
