import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin } from './setup';
import { SprintsService } from '../src/sprints/sprints.service';

/** A date `daysFromNow` days ahead of today, as YYYY-MM-DD — sprints reject past start dates. */
const futureDate = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];

describe('WorkItems Sprints (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
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

    // Create a project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Project', prefix: 'TEST' });
    projectId = projRes.body.data.item.id;
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  describe('Sprints', () => {
    it('creates sprint -> 201 with auto sprintNumber', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Complete auth', startDate: futureDate(1), endDate: futureDate(15) })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0051');
      expect(res.body.data.item.name).toBe('Sprint 1');
      expect(res.body.data.item.status).toBe('planning');
      expect(res.body.data.item.sprintNumber).toBe(1);
    });

    it('auto-increments sprintNumber per project', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) })
        .expect(201);

      expect(res.body.data.item.sprintNumber).toBe(2);
    });

    it('cannot start sprint with no tasks -> 400', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Empty Sprint', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });

      const sprintId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.code).toBe('F-L-0021');
    });

    it('cannot start when another sprint is active -> 409', async () => {
      // Create two sprints
      const s1Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });
      const s2Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });

      const sprint1Id = s1Res.body.data.item.id;
      const sprint2Id = s2Res.body.data.item.id;

      // Add a task to sprint 1 so it can start
      await createItem({ itemType: 'task', title: 'Task 1', sprintId: sprint1Id }).expect(201);

      // Start sprint 1
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Add a task to sprint 2
      await createItem({ itemType: 'task', title: 'Task 2', sprintId: sprint2Id }).expect(201);

      // Try to start sprint 2
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint2Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(res.body.code).toBe('F-L-0020');
    });

    it('sprint start sets status to active -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });
      const sprintId = createRes.body.data.item.id;

      // Add a task
      await createItem({ itemType: 'task', title: 'Task 1', sprintId }).expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0055');
      expect(res.body.data.status).toBe('active');
    });

    it('sprint complete moves incomplete tasks to next sprint or backlog', async () => {
      const s1Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });
      const sprint1Id = s1Res.body.data.item.id;

      // Create sprint 2 (planning) to receive incomplete tasks
      const s2Res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 2', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });
      const sprint2Id = s2Res.body.data.item.id;

      // Add task to sprint 1
      const taskRes = await createItem({ itemType: 'task', title: 'Incomplete Task', sprintId: sprint1Id }).expect(201);
      const taskId = taskRes.body.data.item.id;

      // Start sprint 1
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Complete sprint 1 — default 'ask' carry-over policy requires an
      // explicit action per incomplete item; roll the one task to Sprint 2.
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprint1Id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemActions: { [taskId]: 'roll' } })
        .expect(200);

      expect(res.body.code).toBe('S-0056');
      expect(res.body.data.movedTasks).toBe(1);
      expect(res.body.data.movedTo).toBe('Sprint 2');

      // Verify task moved to sprint 2
      const ds = app.get(DataSource);
      const tasks = await ds.query(
        `SELECT sprint_id FROM work_items WHERE id = $1`,
        [taskId],
      );
      expect(tasks[0].sprint_id).toBe(sprint2Id);
    });

    it('cannot complete sprint that is not active -> 400', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Not Active', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });

      const sprintId = createRes.body.data.item.id;
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.code).toBe('F-L-0023');
    });

    it('concurrent starts of two planning sprints -> exactly one wins, project never has two active sprints', async () => {
      // Drive the race at the service layer: two start() calls in genuinely
      // overlapping transactions. Each locks only its own planning-sprint row,
      // so both can pass the "no other active sprint" pre-check before either
      // commits. The partial unique index UQ_sprint_one_active_per_project is
      // the real guard — the loser's UPDATE raises 23505, which start()
      // translates to a clean SPRINT_ALREADY_ACTIVE conflict.
      //
      // The race window is narrow and timing-dependent, so a single pair is
      // not reliable. Run many concurrent pairs: without the index+catch the
      // two-active-sprints invariant breaks in at least one round; with the
      // fix it must hold in every round.
      const service = app.get(SprintsService);
      const ds = app.get(DataSource);
      const adminId = (await ds.query(
        `SELECT id FROM users WHERE email = 'admin@test.com'`,
      ))[0].id;
      const ROUNDS = 25;

      for (let round = 0; round < ROUNDS; round++) {
        // Fresh project per round so each race is independent.
        const projRes = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: `Race Project ${round}`, prefix: `R${round}` });
        const raceProjectId = projRes.body.data.item.id;

        // Two planning sprints, each with a task so both are startable.
        const mkSprint = async (name: string) => {
          const r = await request(app.getHttpServer())
            .post(`/api/projects/${raceProjectId}/sprints`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name, goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });
          return r.body.data.item.id as number;
        };
        const sprintAId = await mkSprint('Sprint A');
        const sprintBId = await mkSprint('Sprint B');
        await request(app.getHttpServer())
          .post(`/api/projects/${raceProjectId}/items`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ itemType: 'task', title: 'Task A', sprintId: sprintAId })
          .expect(201);
        await request(app.getHttpServer())
          .post(`/api/projects/${raceProjectId}/items`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ itemType: 'task', title: 'Task B', sprintId: sprintBId })
          .expect(201);

        const settled = await Promise.allSettled([
          service.start(raceProjectId, sprintAId, adminId),
          service.start(raceProjectId, sprintBId, adminId),
        ]);

        const fulfilled = settled.filter((r) => r.status === 'fulfilled');
        const rejected = settled.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );

        // Exactly one start succeeds; the other fails cleanly.
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // The loser must surface the same clean SPRINT_ALREADY_ACTIVE conflict
        // the pre-check throws — never a raw DB error.
        const err = rejected[0].reason as any;
        expect(err.appCode).toBe('F-L-0020');
        expect(err.getStatus()).toBe(409);

        // The project must end up with exactly one active sprint.
        const active = await ds.query(
          `SELECT id FROM sprints WHERE project_id = $1 AND status = 'active'`,
          [raceProjectId],
        );
        expect(active.length).toBe(1);
      }
    });

    it('concurrent sprint creates -> no duplicate sprintNumber, every create resolves cleanly', async () => {
      // sprintNumber is auto-assigned from MAX(sprintNumber)+1. Two concurrent
      // create() calls can both read the same MAX and pick the same number.
      // The unique index UQ_sprint_number_project is the real guard — the
      // loser's INSERT raises 23505, which create() translates to a clean 409.
      const service = app.get(SprintsService);
      const ds = app.get(DataSource);
      const adminId = (await ds.query(
        `SELECT id FROM users WHERE email = 'admin@test.com'`,
      ))[0].id;

      const ROUNDS = 15;
      for (let round = 0; round < ROUNDS; round++) {
        const projRes = await request(app.getHttpServer())
          .post('/api/projects')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: `SN Race ${round}`, prefix: `SN${round}` });
        const raceProjectId = projRes.body.data.item.id;

        const dto = { name: 'S', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) };
        const settled = await Promise.allSettled([
          service.create(raceProjectId, { ...dto }, adminId),
          service.create(raceProjectId, { ...dto }, adminId),
        ]);

        // No raw 500-style errors: any rejection must be a clean 409 conflict.
        for (const r of settled) {
          if (r.status === 'rejected') {
            const err = r.reason as any;
            expect(err.appCode).toBe('F-L-0002');
            expect(err.getStatus()).toBe(409);
          }
        }

        // sprintNumbers must be unique within the project.
        const numbers = (await ds.query(
          `SELECT sprint_number FROM sprints WHERE project_id = $1`,
          [raceProjectId],
        )).map((r: any) => r.sprint_number);
        expect(new Set(numbers).size).toBe(numbers.length);
      }
    });

    it('lists sprints -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint 1', goal: 'Sprint goal', startDate: futureDate(1), endDate: futureDate(15) });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0050');
      expect(res.body.data.list.length).toBe(1);
    });
  });
});
