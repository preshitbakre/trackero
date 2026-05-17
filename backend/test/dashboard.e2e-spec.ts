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
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Task one', priority: 'high', assigneeId: memberId });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Task two', priority: 'medium', assigneeId: memberId });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Unassigned task', priority: 'low' });
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
        .post(`/api/projects/${proj2Id}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Secret task' });

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
