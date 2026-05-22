import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let pmToken: string;
  let pmId: number;
  let memberToken: string;
  let memberId: number;
  let viewerToken: string;
  let viewerId: number;
  let projectId: number;
  let projectPrefix: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    // Register users
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const pm = await registerInvitedUser(app, adminToken, 'pm@test.com', 'project_manager');
    pmToken = pm.token;
    pmId = pm.id;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    memberId = member.id;

    const viewer = await registerInvitedUser(app, adminToken, 'viewer@test.com', 'viewer');
    viewerToken = viewer.token;
    viewerId = viewer.id;

    // Create a project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard Test', prefix: 'DASH' });
    projectId = projRes.body.data.item.id;
    projectPrefix = 'DASH';

    // Add PM, member, viewer to project
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: pmId, role: 'project_manager' });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerId, role: 'viewer' });

    // Create tasks assigned to member
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Task one', priority: 'high', assigneeId: memberId });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Task two', priority: 'medium', assigneeId: memberId });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Unassigned task', priority: 'low' });
  });

  // ── Admin Dashboard ────────────────────────────────────────

  describe('Admin dashboard', () => {
    test('returns all required sections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.role).toBe('admin');
      expect(d.greeting).toBeDefined();
      expect(d.greeting.userName).toBe('Admin');
      expect(d.greeting.date).toBeDefined();

      // instanceStats
      expect(d.instanceStats).toBeDefined();
      expect(d.instanceStats.totalUsers).toBe(4);
      expect(d.instanceStats.totalProjects).toBe(1);
      expect(d.instanceStats.activeProjects).toBe(1);
      expect(typeof d.instanceStats.activeUsers).toBe('number');

      // sprintOverview
      expect(d.sprintOverview).toBeDefined();
      expect(typeof d.sprintOverview.activeSprintsCount).toBe('number');
      expect(typeof d.sprintOverview.sprintsAtRisk).toBe('number');
      expect(typeof d.sprintOverview.avgVelocity).toBe('number');
      expect(typeof d.sprintOverview.totalBlockedTasks).toBe('number');

      // projects
      expect(d.projects).toBeDefined();
      expect(d.projects.length).toBe(1);
      expect(d.projects[0].name).toBe('Dashboard Test');
      expect(d.projects[0].prefix).toBe('DASH');
      expect(d.projects[0].taskCount).toBe(3);
      expect(typeof d.projects[0].openTaskCount).toBe('number');
      expect(typeof d.projects[0].memberCount).toBe('number');

      // teamWorkload
      expect(d.teamWorkload).toBeDefined();
      expect(Array.isArray(d.teamWorkload)).toBe(true);
      expect(d.teamWorkload.length).toBeGreaterThanOrEqual(1);
      expect(d.teamWorkload[0]).toHaveProperty('userId');
      expect(d.teamWorkload[0]).toHaveProperty('displayName');
      expect(d.teamWorkload[0]).toHaveProperty('openTaskCount');
      expect(d.teamWorkload[0]).toHaveProperty('inProgressCount');
      expect(d.teamWorkload[0]).toHaveProperty('overdueCount');

      // blockedTasks
      expect(d.blockedTasks).toBeDefined();
      expect(Array.isArray(d.blockedTasks)).toBe(true);

      // recentActivity
      expect(d.recentActivity).toBeDefined();
      expect(Array.isArray(d.recentActivity)).toBe(true);

      // userStats
      expect(d.userStats).toBeDefined();
      expect(typeof d.userStats.pendingInvitations).toBe('number');
      expect(typeof d.userStats.deactivatedUsers).toBe('number');
      expect(d.userStats.rolesBreakdown).toBeDefined();
      expect(d.userStats.rolesBreakdown.admin).toBe(1);
    });

    test('admin sees all projects', async () => {
      // Create a second project
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Second Project', prefix: 'SEC' });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.projects.length).toBe(2);
    });
  });

  // ── PM Dashboard ───────────────────────────────────────────

  describe('PM dashboard', () => {
    test('returns all required sections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${pmToken}`);

      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.role).toBe('project_manager');
      expect(d.greeting.userName).toBe('Project_manager');

      // myProjectsStats
      expect(d.myProjectsStats).toBeDefined();
      expect(d.myProjectsStats.totalProjects).toBeGreaterThanOrEqual(1);
      expect(typeof d.myProjectsStats.openTasksAcrossProjects).toBe('number');
      expect(typeof d.myProjectsStats.totalBlockedTasks).toBe('number');
      expect(typeof d.myProjectsStats.overdueTasks).toBe('number');

      // activeSprintsByProject
      expect(d.activeSprintsByProject).toBeDefined();
      expect(Array.isArray(d.activeSprintsByProject)).toBe(true);

      // burndownPreview
      // Could be null if no active sprint
      expect(d).toHaveProperty('burndownPreview');

      // teamWorkload
      expect(d.teamWorkload).toBeDefined();
      expect(Array.isArray(d.teamWorkload)).toBe(true);

      // blockedTasks
      expect(d.blockedTasks).toBeDefined();
      expect(Array.isArray(d.blockedTasks)).toBe(true);

      // myTasks
      expect(d.myTasks).toBeDefined();
      expect(Array.isArray(d.myTasks)).toBe(true);

      // upcomingDeadlines
      expect(d.upcomingDeadlines).toBeDefined();
      expect(Array.isArray(d.upcomingDeadlines)).toBe(true);

      // epicProgress
      expect(d.epicProgress).toBeDefined();
      expect(Array.isArray(d.epicProgress)).toBe(true);

      // recentActivity
      expect(d.recentActivity).toBeDefined();
      expect(Array.isArray(d.recentActivity)).toBe(true);
    });
  });

  // ── Member Dashboard ───────────────────────────────────────

  describe('Member dashboard', () => {
    test('returns all required sections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.role).toBe('member');
      expect(d.greeting.userName).toBe('Member');

      // personalStats
      expect(d.personalStats).toBeDefined();
      expect(d.personalStats.myOpenTasks).toBe(2);
      expect(typeof d.personalStats.myInProgress).toBe('number');
      expect(typeof d.personalStats.myBlocked).toBe('number');
      expect(typeof d.personalStats.dueThisWeek).toBe('number');

      // myTasks — member has 2 assigned tasks
      expect(d.myTasks).toBeDefined();
      expect(d.myTasks.length).toBe(2);
      expect(d.myTasks[0]).toHaveProperty('taskKey');
      expect(d.myTasks[0]).toHaveProperty('title');
      expect(d.myTasks[0]).toHaveProperty('priority');
      expect(d.myTasks[0]).toHaveProperty('status');
      expect(d.myTasks[0]).toHaveProperty('hasBlockers');
      expect(d.myTasks[0]).toHaveProperty('subtaskCount');
      expect(d.myTasks[0]).toHaveProperty('subtaskDoneCount');

      // dueSoon
      expect(d.dueSoon).toBeDefined();
      expect(Array.isArray(d.dueSoon)).toBe(true);

      // myBlockedTasks
      expect(d.myBlockedTasks).toBeDefined();
      expect(Array.isArray(d.myBlockedTasks)).toBe(true);

      // activeSprintSummary
      expect(d.activeSprintSummary).toBeDefined();
      expect(Array.isArray(d.activeSprintSummary)).toBe(true);

      // activityOnMyTasks
      expect(d.activityOnMyTasks).toBeDefined();
      expect(Array.isArray(d.activityOnMyTasks)).toBe(true);

      // recentlyCompleted
      expect(d.recentlyCompleted).toBeDefined();
      expect(Array.isArray(d.recentlyCompleted)).toBe(true);
    });

    test('member myTasks sorted by priority', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${memberToken}`);

      const tasks = res.body.data.myTasks;
      // Task one is high, Task two is medium — high should come first
      expect(tasks[0].priority).toBe('high');
      expect(tasks[1].priority).toBe('medium');
    });

    test('activeSprintSummary does NOT double-count when sprint has multiple tasks (cartesian-product regression)', async () => {
      // Build a sprint with 3 tasks total — 2 assigned to the member, 1 unassigned.
      // The two member tasks have story points; 1 of them will be marked done.
      // Without the cartesian-product fix:
      //   myTasksInSprint inflates from 2 -> total_tasks(3) × my_tasks(2) = 6
      //   myCompletedInSprint inflates from 1 -> total_tasks(3) × my_completed(1) = 3
      //   total_points and completed_points also inflate 2× (each t row repeats per t2)
      // With the fix:
      //   myTasksInSprint = 2, myCompletedInSprint = 1
      //   progressPercent = round(completed_points / total_points × 100)

      // 1. Create a sprint (start date today, end date 14 days out)
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const sprintRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sprint A', startDate: today, endDate });
      expect(sprintRes.status).toBe(201);
      const sprintId = sprintRes.body.data.item.id;

      // 2. Fetch the 3 existing tasks from setup (Task one, Task two, Unassigned task)
      const itemsRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(itemsRes.status).toBe(200);
      const items = itemsRes.body.data.list as Array<{ id: number; title: string; assigneeId: number | null }>;
      const taskOne = items.find((i) => i.title === 'Task one')!;
      const taskTwo = items.find((i) => i.title === 'Task two')!;
      const unassigned = items.find((i) => i.title === 'Unassigned task')!;
      expect(taskOne).toBeDefined();
      expect(taskTwo).toBeDefined();
      expect(unassigned).toBeDefined();

      // 3. Assign all 3 tasks to the sprint with non-zero story points
      //    Use distinct point values so any inflation is detectable from the raw numbers.
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskOne.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sprintId, storyPoints: 5 })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskTwo.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sprintId, storyPoints: 3 })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${unassigned.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sprintId, storyPoints: 2 })
        .expect(200);

      // 4. Start the sprint
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/sprints/${sprintId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 5. Mark Task one (a member-assigned task with 5 story points) as done
      const statusesRes = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/statuses`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statusesRes.status).toBe(200);
      const statuses = statusesRes.body.data as Array<{ id: number; category: string }>;
      const doneStatus = statuses.find((s) => s.category === 'done')!;
      expect(doneStatus).toBeDefined();
      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskOne.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ statusId: doneStatus.id })
        .expect(200);

      // 6. Hit the member dashboard and assert correct (non-inflated) numbers
      const dashRes = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(dashRes.status).toBe(200);
      const summary = dashRes.body.data.activeSprintSummary;
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBe(1);

      const s = summary[0];
      expect(s.projectName).toBe('Dashboard Test');
      expect(s.projectPrefix).toBe('DASH');
      expect(s.sprintName).toBe('Sprint A');

      // Correct member-side counts (the cartesian-product bug would return 6 and 3).
      expect(s.myTasksInSprint).toBe(2);
      expect(s.myCompletedInSprint).toBe(1);

      // progressPercent: 5 done out of (5 + 3 + 2) = 10 total = 50%.
      // (The bug inflates both numerator and denominator by the same factor,
      // so this assertion mostly guards future regressions where someone
      // changes only one side.)
      expect(s.progressPercent).toBe(50);
    });
  });

  // ── Viewer Dashboard ───────────────────────────────────────

  describe('Viewer dashboard', () => {
    test('returns all required sections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      const d = res.body.data;

      expect(d.role).toBe('viewer');
      expect(d.greeting.userName).toBe('Viewer');

      // overviewStats
      expect(d.overviewStats).toBeDefined();
      expect(d.overviewStats.projectsCount).toBe(1);
      expect(d.overviewStats.totalTasks).toBe(3);
      expect(typeof d.overviewStats.completedTasks).toBe('number');
      expect(typeof d.overviewStats.overallProgress).toBe('number');

      // projects
      expect(d.projects).toBeDefined();
      expect(d.projects.length).toBe(1);
      expect(d.projects[0].name).toBe('Dashboard Test');

      // sprintProgress
      expect(d.sprintProgress).toBeDefined();
      expect(Array.isArray(d.sprintProgress)).toBe(true);

      // epicProgress
      expect(d.epicProgress).toBeDefined();
      expect(Array.isArray(d.epicProgress)).toBe(true);

      // recentCompletions
      expect(d.recentCompletions).toBeDefined();
      expect(Array.isArray(d.recentCompletions)).toBe(true);

      // teamMembers
      expect(d.teamMembers).toBeDefined();
      expect(Array.isArray(d.teamMembers)).toBe(true);
      expect(d.teamMembers.length).toBeGreaterThanOrEqual(1);
      expect(d.teamMembers[0]).toHaveProperty('displayName');
      expect(d.teamMembers[0]).toHaveProperty('role');
      expect(d.teamMembers[0]).toHaveProperty('openTaskCount');
    });

    test('viewer cannot see tasks from projects they are not in', async () => {
      // Create second project, do NOT add viewer
      const proj2Res = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Secret Project', prefix: 'SECR' });
      const proj2Id = proj2Res.body.data.item.id;

      await request(app.getHttpServer())
        .post(`/api/projects/${proj2Id}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Secret task' });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${viewerToken}`);

      const d = res.body.data;
      // Viewer should still only see 1 project
      expect(d.overviewStats.projectsCount).toBe(1);
      expect(d.projects.length).toBe(1);
      // totalTasks should only count DASH project tasks (3), not SECR
      expect(d.overviewStats.totalTasks).toBe(3);
    });
  });

  // ── Auth guard ─────────────────────────────────────────────

  test('rejects unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
