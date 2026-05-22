import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboard(userId: number, role: string) {
    const user = await this.dataSource.query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId],
    );
    const userName = user[0]?.display_name || 'User';
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    switch (role) {
      case 'admin':
        return this.getAdminDashboard(userId, userName, date);
      case 'project_manager':
        return this.getProjectManagerDashboard(userId, userName, date);
      case 'member':
        return this.getMemberDashboard(userId, userName, date);
      case 'viewer':
        return this.getViewerDashboard(userId, userName, date);
      default:
        return this.getMemberDashboard(userId, userName, date);
    }
  }

  private async getAdminDashboard(userId: number, userName: string, date: string) {
    const db = this.dataSource;

    // ── instanceStats ──────────────────────────────────────────
    const [userCounts] = await db.query(`
      SELECT
        COUNT(*)::int AS "totalUsers",
        COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days' AND is_active = true)::int AS "activeUsers"
      FROM users
    `);
    const [projectCounts] = await db.query(`
      SELECT
        COUNT(*)::int AS "totalProjects",
        COUNT(*) FILTER (WHERE status = 'active')::int AS "activeProjects"
      FROM projects
    `);
    const instanceStats = {
      totalUsers: userCounts.totalUsers,
      activeUsers: userCounts.activeUsers,
      totalProjects: projectCounts.totalProjects,
      activeProjects: projectCounts.activeProjects,
    };

    // ── sprintOverview ─────────────────────────────────────────
    const activeSprints = await db.query(`
      SELECT s.id, s.start_date, s.end_date, s.project_id,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COALESCE(SUM(t.story_points), 0)::int AS total_points
      FROM sprints s
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.status = 'active'
      GROUP BY s.id
    `);

    let sprintsAtRisk = 0;
    for (const sp of activeSprints) {
      if (!sp.start_date || !sp.end_date || sp.total_points === 0) continue;
      const start = new Date(sp.start_date).getTime();
      const end = new Date(sp.end_date).getTime();
      const now = Date.now();
      const totalDuration = end - start;
      if (totalDuration <= 0) continue;
      const elapsed = Math.min(now - start, totalDuration);
      const expectedProgress = (elapsed / totalDuration) * 100;
      const actualProgress = (sp.completed_points / sp.total_points) * 100;
      if (actualProgress < expectedProgress - 10) sprintsAtRisk++;
    }

    const [velocityRow] = await db.query(`
      SELECT COALESCE(AVG(completed_points), 0)::int AS avg_velocity
      FROM (
        SELECT COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0) AS completed_points
        FROM sprints s
        LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
        LEFT JOIN project_statuses ps ON ps.id = t.status_id
        WHERE s.status = 'completed'
        GROUP BY s.id
        ORDER BY s.completed_at DESC
        LIMIT 5
      ) sub
    `);

    const [blockedCountRow] = await db.query(`
      SELECT COUNT(DISTINCT a.item_id)::int AS count
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      WHERE a.link_type = 'blocks'
        AND ps.category != 'done'
        AND bps.category != 'done'
    `);

    const sprintOverview = {
      activeSprintsCount: activeSprints.length,
      sprintsAtRisk,
      avgVelocity: velocityRow.avg_velocity,
      totalBlockedTasks: blockedCountRow.count,
    };

    // ── projects ───────────────────────────────────────────────
    const projects = await db.query(`
      SELECT
        p.id,
        p.name,
        p.prefix,
        p.status,
        (SELECT COUNT(*)::int FROM work_items WHERE project_id = p.id AND item_type IN ('task')) AS "taskCount",
        (SELECT COUNT(*)::int FROM work_items t2
         JOIN project_statuses ps2 ON ps2.id = t2.status_id
         WHERE t2.project_id = p.id AND t2.item_type IN ('task') AND ps2.category != 'done'
        ) AS "openTaskCount",
        (SELECT COUNT(*)::int FROM project_members WHERE project_id = p.id) AS "memberCount"
      FROM projects p
      ORDER BY p.created_at DESC
    `);

    // Attach active sprint info to each project
    const sprintsByProject = await db.query(`
      SELECT s.project_id, s.name, s.start_date, s.end_date,
        COALESCE(SUM(t.story_points), 0)::int AS total_points,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points
      FROM sprints s
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.status = 'active'
      GROUP BY s.id
    `);
    const sprintMap = new Map<number, any>();
    for (const sp of sprintsByProject) {
      const totalPts = sp.total_points || 1;
      const daysRemaining = sp.end_date ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - Date.now()) / 86400000)) : 0;
      sprintMap.set(sp.project_id, {
        name: sp.name,
        progressPercent: Math.round((sp.completed_points / totalPts) * 100),
        daysRemaining,
      });
    }
    for (const p of projects) {
      p.activeSprint = sprintMap.get(p.id) || null;
    }

    // ── teamWorkload ───────────────────────────────────────────
    const teamWorkload = await db.query(`
      SELECT
        u.id AS "userId",
        u.display_name AS "displayName",
        u.avatar_url AS "avatarUrl",
        COUNT(t.id) FILTER (WHERE ps.category != 'done')::int AS "openTaskCount",
        COUNT(t.id) FILTER (WHERE ps.category = 'in_progress')::int AS "inProgressCount",
        COUNT(t.id) FILTER (WHERE t.end_date IS NOT NULL AND t.end_date::date < CURRENT_DATE AND ps.category != 'done')::int AS "overdueCount"
      FROM users u
      LEFT JOIN work_items t ON t.assignee_id = u.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE u.is_active = true
      GROUP BY u.id
      ORDER BY "openTaskCount" DESC
    `);

    // ── blockedTasks ───────────────────────────────────────────
    const blockedTasks = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        assignee.display_name AS "assigneeDisplayName",
        bp.prefix || '-' || blocker.item_number AS "blockerTaskKey",
        blocker.title AS "blockerTitle",
        ba.display_name AS "blockerAssigneeDisplayName"
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN projects bp ON bp.id = blocker.project_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN users ba ON ba.id = blocker.assignee_id
      WHERE a.link_type = 'blocks'
        AND ps.category != 'done'
        AND bps.category != 'done'
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    const blockedTasksMapped = blockedTasks.map((bt: any) => ({
      id: bt.id,
      taskKey: bt.taskKey,
      title: bt.title,
      projectName: bt.projectName,
      assignee: bt.assigneeDisplayName ? { displayName: bt.assigneeDisplayName } : null,
      blockedBy: {
        taskKey: bt.blockerTaskKey,
        title: bt.blockerTitle,
        assignee: bt.blockerAssigneeDisplayName ? { displayName: bt.blockerAssigneeDisplayName } : null,
      },
    }));

    // ── recentActivity ─────────────────────────────────────────
    const activityRows = await db.query(`
      SELECT
        al.action,
        al.field_changed AS "fieldChanged",
        al.created_at AS "timestamp",
        u.display_name AS "actorDisplayName",
        u.avatar_url AS "actorAvatarUrl",
        t.item_number AS "taskNumber",
        p.prefix AS "projectPrefix",
        t.title AS "taskTitle"
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id
      LEFT JOIN work_items t ON t.id = al.work_item_id
      LEFT JOIN projects p ON p.id = al.project_id
      ORDER BY al.created_at DESC
      LIMIT 15
    `);
    const recentActivity = activityRows.map((a: any) => ({
      actor: { displayName: a.actorDisplayName, avatarUrl: a.actorAvatarUrl },
      action: a.action,
      target: {
        taskKey: a.projectPrefix && a.taskNumber ? `${a.projectPrefix}-${a.taskNumber}` : '',
        title: a.taskTitle || '',
      },
      detail: null,
      timestamp: a.timestamp,
    }));

    // ── userStats ──────────────────────────────────────────────
    const [pendingInvites] = await db.query(`
      SELECT COUNT(*)::int AS count FROM invitations WHERE status = 'pending'
    `);
    const [deactivatedUsers] = await db.query(`
      SELECT COUNT(*)::int AS count FROM users WHERE is_active = false
    `);
    const roleBreakdownRows = await db.query(`
      SELECT role, COUNT(*)::int AS count FROM users WHERE is_active = true GROUP BY role
    `);
    const rolesBreakdown: Record<string, number> = { admin: 0, project_manager: 0, member: 0, viewer: 0 };
    for (const row of roleBreakdownRows) {
      rolesBreakdown[row.role] = row.count;
    }
    const userStats = {
      pendingInvitations: pendingInvites.count,
      deactivatedUsers: deactivatedUsers.count,
      rolesBreakdown,
    };

    return {
      role: 'admin',
      greeting: { userName, date },
      instanceStats,
      sprintOverview,
      projects,
      teamWorkload,
      blockedTasks: blockedTasksMapped,
      recentActivity,
      userStats,
    };
  }

  private async getProjectManagerDashboard(userId: number, userName: string, date: string) {
    const db = this.dataSource;

    // Get PM's project IDs (projects where user is PM in project_members, or user is global admin)
    const pmProjectRows = await db.query(`
      SELECT DISTINCT p.id
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      LEFT JOIN users u ON u.id = $1
      WHERE pm.role = 'project_manager' OR u.role = 'admin'
    `, [userId]);
    const pmProjectIds = pmProjectRows.map((r: any) => r.id);

    if (pmProjectIds.length === 0) {
      return {
        role: 'project_manager',
        greeting: { userName, date },
        myProjectsStats: { totalProjects: 0, openTasksAcrossProjects: 0, totalBlockedTasks: 0, overdueTasks: 0 },
        activeSprintsByProject: [],
        burndownPreview: null,
        teamWorkload: [],
        blockedTasks: [],
        myTasks: [],
        upcomingDeadlines: [],
        epicProgress: [],
        recentActivity: [],
      };
    }

    // ── myProjectsStats ────────────────────────────────────────
    const [pmStats] = await db.query(`
      SELECT
        COUNT(DISTINCT t.id) FILTER (WHERE ps.category != 'done')::int AS "openTasksAcrossProjects",
        COUNT(DISTINCT t.id) FILTER (
          WHERE t.end_date IS NOT NULL AND t.end_date::date < CURRENT_DATE AND ps.category != 'done'
        )::int AS "overdueTasks"
      FROM work_items t
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.project_id = ANY($1) AND t.item_type IN ('task')
    `, [pmProjectIds]);

    const [pmBlockedCount] = await db.query(`
      SELECT COUNT(DISTINCT a.item_id)::int AS count
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      WHERE a.link_type = 'blocks'
        AND t.project_id = ANY($1)
        AND ps.category != 'done'
        AND bps.category != 'done'
    `, [pmProjectIds]);

    const myProjectsStats = {
      totalProjects: pmProjectIds.length,
      openTasksAcrossProjects: pmStats.openTasksAcrossProjects,
      totalBlockedTasks: pmBlockedCount.count,
      overdueTasks: pmStats.overdueTasks,
    };

    // ── activeSprintsByProject ──────────────────────────────────
    const sprintRows = await db.query(`
      SELECT
        s.id, s.name, s.status, s.start_date, s.end_date,
        s.project_id,
        p.name AS project_name, p.prefix AS project_prefix,
        COALESCE(SUM(t.story_points), 0)::int AS total_points,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COUNT(t.id) FILTER (WHERE ps.category = 'backlog')::int AS backlog,
        COUNT(t.id) FILTER (WHERE ps.category = 'in_progress')::int AS in_progress,
        COUNT(t.id) FILTER (WHERE ps.category = 'done')::int AS done
      FROM sprints s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.status = 'active' AND s.project_id = ANY($1)
      GROUP BY s.id, p.id
    `, [pmProjectIds]);

    const activeSprintsByProject = sprintRows.map((sp: any) => {
      const totalPts = sp.total_points || 1;
      const daysRemaining = sp.end_date ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - Date.now()) / 86400000)) : 0;
      return {
        projectId: sp.project_id,
        projectName: sp.project_name,
        projectPrefix: sp.project_prefix,
        sprint: {
          id: sp.id,
          name: sp.name,
          status: sp.status,
          daysRemaining,
          totalPoints: sp.total_points,
          completedPoints: sp.completed_points,
          progressPercent: Math.round((sp.completed_points / totalPts) * 100),
          tasksByStatus: {
            backlog: sp.backlog,
            in_progress: sp.in_progress,
            done: sp.done,
          },
        },
      };
    });

    // Also add projects with no active sprint
    const projectsWithSprint = new Set(sprintRows.map((s: any) => s.project_id));
    const noSprintProjects = await db.query(`
      SELECT id AS project_id, name AS project_name, prefix AS project_prefix
      FROM projects WHERE id = ANY($1) AND id != ALL($2)
    `, [pmProjectIds, [...projectsWithSprint]]);
    for (const p of noSprintProjects) {
      activeSprintsByProject.push({
        projectId: p.project_id,
        projectName: p.project_name,
        projectPrefix: p.project_prefix,
        sprint: null,
      });
    }

    // ── burndownPreview ────────────────────────────────────────
    let burndownPreview: any = null;
    if (sprintRows.length > 0) {
      const sp = sprintRows[0];
      if (sp.start_date && sp.end_date) {
        const startDate = new Date(sp.start_date);
        const endDate = new Date(sp.end_date);
        const today = new Date();
        const effectiveEnd = today < endDate ? today : endDate;
        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
        const totalPoints = sp.total_points || 0;

        const dataPoints: any[] = [];
        const current = new Date(startDate);
        let dayIndex = 0;

        while (current <= effectiveEnd) {
          const dateStr = current.toISOString().split('T')[0];
          const ideal = totalPoints * (1 - dayIndex / totalDays);

          const [completedRow] = await db.query(`
            SELECT COALESCE(SUM(story_points), 0)::int AS completed
            FROM work_items
            WHERE sprint_id = $1 AND completed_at IS NOT NULL AND completed_at <= $2::date + interval '1 day' AND item_type IN ('task')
          `, [sp.id, dateStr]);

          const actual = totalPoints - completedRow.completed;
          dataPoints.push({ date: dateStr, ideal: Math.round(ideal * 10) / 10, actual });

          current.setDate(current.getDate() + 1);
          dayIndex++;
        }

        burndownPreview = { sprintName: sp.name, dataPoints };
      }
    }

    // ── teamWorkload ───────────────────────────────────────────
    const teamWorkload = await db.query(`
      SELECT
        u.id AS "userId",
        u.display_name AS "displayName",
        u.avatar_url AS "avatarUrl",
        COUNT(t.id) FILTER (WHERE ps.category != 'done')::int AS "openTaskCount",
        COUNT(t.id) FILTER (WHERE ps.category = 'in_progress')::int AS "inProgressCount",
        COUNT(t.id) FILTER (WHERE t.end_date IS NOT NULL AND t.end_date::date < CURRENT_DATE AND ps.category != 'done')::int AS "overdueCount"
      FROM users u
      JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ANY($1)
      LEFT JOIN work_items t ON t.assignee_id = u.id AND t.item_type IN ('task') AND t.project_id = ANY($1)
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE u.is_active = true
      GROUP BY u.id
      ORDER BY "openTaskCount" DESC
    `, [pmProjectIds]);

    // ── blockedTasks ───────────────────────────────────────────
    const blockedRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        assignee.display_name AS "assigneeDisplayName",
        bp.prefix || '-' || blocker.item_number AS "blockerTaskKey",
        blocker.title AS "blockerTitle",
        ba.display_name AS "blockerAssigneeDisplayName"
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN projects bp ON bp.id = blocker.project_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN users ba ON ba.id = blocker.assignee_id
      WHERE a.link_type = 'blocks'
        AND t.project_id = ANY($1)
        AND ps.category != 'done'
        AND bps.category != 'done'
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [pmProjectIds]);
    const blockedTasks = blockedRows.map((bt: any) => ({
      id: bt.id,
      taskKey: bt.taskKey,
      title: bt.title,
      projectName: bt.projectName,
      assignee: bt.assigneeDisplayName ? { displayName: bt.assigneeDisplayName } : null,
      blockedBy: {
        taskKey: bt.blockerTaskKey,
        title: bt.blockerTitle,
        assignee: bt.blockerAssigneeDisplayName ? { displayName: bt.blockerAssigneeDisplayName } : null,
      },
    }));

    // ── myTasks ────────────────────────────────────────────────
    const myTaskRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        t.item_type AS "type",
        t.priority,
        ps.name AS "statusName", ps.category AS "statusCategory", ps.color AS "statusColor",
        p.name AS "projectName",
        t.story_points AS "storyPoints",
        t.end_date AS "endDate",
        EXISTS (
          SELECT 1 FROM work_item_associations a
          JOIN work_items bl ON bl.id = a.linked_item_id
          JOIN project_statuses bps ON bps.id = bl.status_id
          WHERE a.item_id = t.id AND a.link_type = 'blocks' AND bps.category != 'done'
        ) AS "hasBlockers"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.assignee_id = $1 AND t.item_type IN ('task') AND ps.category != 'done'
      ORDER BY
        CASE ps.category WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 ELSE 2 END,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END
      LIMIT 5
    `, [userId]);
    const myTasks = myTaskRows.map((t: any) => ({
      id: t.id,
      taskKey: t.taskKey,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: { name: t.statusName, category: t.statusCategory, color: t.statusColor },
      projectName: t.projectName,
      storyPoints: t.storyPoints,
      endDate: t.endDate,
      hasBlockers: t.hasBlockers,
    }));

    // ── upcomingDeadlines ──────────────────────────────────────
    const deadlineRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        assignee.display_name AS "assigneeDisplayName",
        t.end_date AS "endDate",
        (t.end_date::date - CURRENT_DATE)::int AS "daysUntilEnd"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      WHERE t.project_id = ANY($1)
        AND t.item_type IN ('task')
        AND t.end_date IS NOT NULL
        AND t.end_date::date <= CURRENT_DATE + INTERVAL '7 days'
        AND ps.category != 'done'
      ORDER BY t.end_date ASC
      LIMIT 10
    `, [pmProjectIds]);
    const upcomingDeadlines = deadlineRows.map((d: any) => ({
      id: d.id,
      taskKey: d.taskKey,
      title: d.title,
      projectName: d.projectName,
      assignee: d.assigneeDisplayName ? { displayName: d.assigneeDisplayName } : null,
      endDate: d.endDate,
      daysUntilEnd: d.daysUntilEnd,
    }));

    // ── epicProgress ───────────────────────────────────────────
    const epicRows = await db.query(`
      SELECT
        e.id,
        e.title,
        p.name AS "projectName",
        e.color,
        COUNT(t.id)::int AS "totalTasks",
        COUNT(t.id) FILTER (WHERE tps.category = 'done')::int AS "completedTasks"
      FROM work_items e
      JOIN projects p ON p.id = e.project_id
      JOIN project_statuses eps ON eps.id = e.status_id
      LEFT JOIN work_item_associations a ON a.linked_item_id = e.id AND a.link_type = 'belongs_to'
      LEFT JOIN work_items t ON t.id = a.item_id AND t.item_type IN ('task')
      LEFT JOIN project_statuses tps ON tps.id = t.status_id
      WHERE e.project_id = ANY($1) AND e.item_type = 'epic' AND eps.category != 'done'
      GROUP BY e.id, p.id
      ORDER BY e.created_at ASC
    `, [pmProjectIds]);
    const epicProgress = epicRows.map((e: any) => ({
      id: e.id,
      title: e.title,
      projectName: e.projectName,
      color: e.color,
      totalTasks: e.totalTasks,
      completedTasks: e.completedTasks,
      progressPercent: e.totalTasks > 0 ? Math.round((e.completedTasks / e.totalTasks) * 100) : 0,
    }));

    // ── recentActivity ─────────────────────────────────────────
    const activityRows = await db.query(`
      SELECT
        al.action,
        al.created_at AS "timestamp",
        u.display_name AS "actorDisplayName",
        u.avatar_url AS "actorAvatarUrl",
        t.item_number AS "taskNumber",
        p.prefix AS "projectPrefix",
        t.title AS "taskTitle"
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id
      LEFT JOIN work_items t ON t.id = al.work_item_id
      LEFT JOIN projects p ON p.id = al.project_id
      WHERE al.project_id = ANY($1)
      ORDER BY al.created_at DESC
      LIMIT 10
    `, [pmProjectIds]);
    const recentActivity = activityRows.map((a: any) => ({
      actor: { displayName: a.actorDisplayName, avatarUrl: a.actorAvatarUrl },
      action: a.action,
      target: {
        taskKey: a.projectPrefix && a.taskNumber ? `${a.projectPrefix}-${a.taskNumber}` : '',
        title: a.taskTitle || '',
      },
      detail: null,
      timestamp: a.timestamp,
    }));

    return {
      role: 'project_manager',
      greeting: { userName, date },
      myProjectsStats,
      activeSprintsByProject,
      burndownPreview,
      teamWorkload,
      blockedTasks,
      myTasks,
      upcomingDeadlines,
      epicProgress,
      recentActivity,
    };
  }

  private async getMemberDashboard(userId: number, userName: string, date: string) {
    const db = this.dataSource;

    // ── personalStats ──────────────────────────────────────────
    const [pStats] = await db.query(`
      SELECT
        COUNT(t.id) FILTER (WHERE ps.category != 'done')::int AS "myOpenTasks",
        COUNT(t.id) FILTER (WHERE ps.category = 'in_progress')::int AS "myInProgress",
        COUNT(t.id) FILTER (
          WHERE ps.category != 'done'
          AND t.end_date IS NOT NULL
          AND t.end_date::date >= CURRENT_DATE
          AND t.end_date::date <= (CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE)::int) * INTERVAL '1 day')::date
        )::int AS "dueThisWeek"
      FROM work_items t
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.assignee_id = $1 AND t.item_type IN ('task')
    `, [userId]);

    const [blockedStat] = await db.query(`
      SELECT COUNT(DISTINCT a.item_id)::int AS count
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      WHERE t.assignee_id = $1
        AND a.link_type = 'blocks'
        AND ps.category != 'done'
        AND bps.category != 'done'
    `, [userId]);

    const personalStats = {
      myOpenTasks: pStats.myOpenTasks,
      myInProgress: pStats.myInProgress,
      myBlocked: blockedStat.count,
      dueThisWeek: pStats.dueThisWeek,
    };

    // ── myTasks ────────────────────────────────────────────────
    const myTaskRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        t.item_type AS "type",
        t.priority,
        ps.id AS "statusId", ps.name AS "statusName", ps.category AS "statusCategory", ps.color AS "statusColor",
        p.name AS "projectName",
        t.story_points AS "storyPoints",
        t.end_date AS "endDate",
        EXISTS (
          SELECT 1 FROM work_item_associations a
          JOIN work_items bl ON bl.id = a.linked_item_id
          JOIN project_statuses bps ON bps.id = bl.status_id
          WHERE a.item_id = t.id AND a.link_type = 'blocks' AND bps.category != 'done'
        ) AS "hasBlockers",
        (SELECT COUNT(*)::int FROM work_items st WHERE st.parent_id = t.id) AS "subtaskCount",
        (SELECT COUNT(*)::int FROM work_items st
         JOIN project_statuses sps ON sps.id = st.status_id
         WHERE st.parent_id = t.id AND sps.category = 'done'
        ) AS "subtaskDoneCount"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.assignee_id = $1 AND t.item_type IN ('task') AND ps.category != 'done'
      ORDER BY
        CASE ps.category WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 ELSE 2 END,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        t.created_at ASC
      LIMIT 10
    `, [userId]);
    const myTasks = myTaskRows.map((t: any) => ({
      id: t.id,
      taskKey: t.taskKey,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: { id: t.statusId, name: t.statusName, category: t.statusCategory, color: t.statusColor },
      projectName: t.projectName,
      storyPoints: t.storyPoints,
      endDate: t.endDate,
      hasBlockers: t.hasBlockers,
      subtaskCount: t.subtaskCount,
      subtaskDoneCount: t.subtaskDoneCount,
    }));

    // ── dueSoon ────────────────────────────────────────────────
    const dueSoonRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        t.end_date AS "endDate",
        (t.end_date::date - CURRENT_DATE)::int AS "daysUntilEnd"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.assignee_id = $1
        AND t.item_type IN ('task')
        AND t.end_date IS NOT NULL
        AND t.end_date::date <= CURRENT_DATE + INTERVAL '7 days'
        AND ps.category != 'done'
      ORDER BY t.end_date ASC
    `, [userId]);
    const dueSoon = dueSoonRows.map((d: any) => ({
      id: d.id,
      taskKey: d.taskKey,
      title: d.title,
      projectName: d.projectName,
      endDate: d.endDate,
      daysUntilEnd: d.daysUntilEnd,
    }));

    // ── myBlockedTasks ─────────────────────────────────────────
    const myBlockedRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        bp.prefix || '-' || blocker.item_number AS "blockerTaskKey",
        blocker.title AS "blockerTitle",
        ba.display_name AS "blockerAssigneeDisplayName"
      FROM work_item_associations a
      JOIN work_items t ON t.id = a.item_id
      JOIN projects p ON p.id = t.project_id
      JOIN project_statuses ps ON ps.id = t.status_id
      JOIN work_items blocker ON blocker.id = a.linked_item_id
      JOIN projects bp ON bp.id = blocker.project_id
      JOIN project_statuses bps ON bps.id = blocker.status_id
      LEFT JOIN users ba ON ba.id = blocker.assignee_id
      WHERE t.assignee_id = $1
        AND a.link_type = 'blocks'
        AND ps.category != 'done'
        AND bps.category != 'done'
      ORDER BY t.created_at DESC
    `, [userId]);
    const myBlockedTasks = myBlockedRows.map((b: any) => ({
      id: b.id,
      taskKey: b.taskKey,
      title: b.title,
      blockedBy: {
        taskKey: b.blockerTaskKey,
        title: b.blockerTitle,
        assignee: b.blockerAssigneeDisplayName ? { displayName: b.blockerAssigneeDisplayName } : null,
      },
    }));

    // ── activeSprintSummary ────────────────────────────────────
    const sprintSummaryRows = await db.query(`
      SELECT
        p.name AS "projectName",
        p.prefix AS "projectPrefix",
        s.name AS "sprintName",
        s.end_date,
        COALESCE(SUM(t.story_points), 0)::int AS total_points,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COUNT(t2.id)::int AS "myTasksInSprint",
        COUNT(t2.id) FILTER (WHERE ps2.category = 'done')::int AS "myCompletedInSprint"
      FROM sprints s
      JOIN projects p ON p.id = s.project_id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      LEFT JOIN work_items t2 ON t2.sprint_id = s.id AND t2.item_type IN ('task') AND t2.assignee_id = $1
      LEFT JOIN project_statuses ps2 ON ps2.id = t2.status_id
      WHERE s.status = 'active'
      GROUP BY s.id, p.id
    `, [userId]);
    const activeSprintSummary = sprintSummaryRows.map((sp: any) => {
      const totalPts = sp.total_points || 1;
      const daysRemaining = sp.end_date ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - Date.now()) / 86400000)) : 0;
      return {
        projectName: sp.projectName,
        projectPrefix: sp.projectPrefix,
        sprintName: sp.sprintName,
        daysRemaining,
        progressPercent: Math.round((sp.completed_points / totalPts) * 100),
        myTasksInSprint: sp.myTasksInSprint,
        myCompletedInSprint: sp.myCompletedInSprint,
      };
    });

    // ── activityOnMyTasks ──────────────────────────────────────
    const activityRows = await db.query(`
      SELECT
        al.action,
        al.created_at AS "timestamp",
        u.display_name AS "actorDisplayName",
        u.avatar_url AS "actorAvatarUrl",
        t.item_number AS "taskNumber",
        p.prefix AS "projectPrefix",
        t.title AS "taskTitle",
        al.field_changed AS "fieldChanged",
        al.new_value AS "newValue"
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id
      JOIN work_items t ON t.id = al.work_item_id
      JOIN projects p ON p.id = al.project_id
      WHERE al.user_id != $1
        AND (t.assignee_id = $1 OR t.reporter_id = $1)
      ORDER BY al.created_at DESC
      LIMIT 10
    `, [userId]);
    const activityOnMyTasks = activityRows.map((a: any) => ({
      actor: { displayName: a.actorDisplayName, avatarUrl: a.actorAvatarUrl },
      action: a.action,
      target: {
        taskKey: a.projectPrefix && a.taskNumber ? `${a.projectPrefix}-${a.taskNumber}` : '',
        title: a.taskTitle || '',
      },
      detail: null,
      timestamp: a.timestamp,
    }));

    // ── recentlyCompleted ──────────────────────────────────────
    const completedRows = await db.query(`
      SELECT
        t.id,
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        t.completed_at AS "completedAt"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      WHERE t.assignee_id = $1
        AND t.item_type IN ('task')
        AND t.completed_at IS NOT NULL
        AND t.completed_at > NOW() - INTERVAL '7 days'
      ORDER BY t.completed_at DESC
      LIMIT 5
    `, [userId]);
    const recentlyCompleted = completedRows.map((c: any) => ({
      id: c.id,
      taskKey: c.taskKey,
      title: c.title,
      projectName: c.projectName,
      completedAt: c.completedAt,
    }));

    return {
      role: 'member',
      greeting: { userName, date },
      personalStats,
      myTasks,
      dueSoon,
      myBlockedTasks,
      activeSprintSummary,
      activityOnMyTasks,
      recentlyCompleted,
    };
  }

  private async getViewerDashboard(userId: number, userName: string, date: string) {
    const db = this.dataSource;

    // Get viewer's project IDs
    const viewerProjectRows = await db.query(`
      SELECT project_id AS id FROM project_members WHERE user_id = $1
    `, [userId]);
    const viewerProjectIds = viewerProjectRows.map((r: any) => r.id);

    if (viewerProjectIds.length === 0) {
      return {
        role: 'viewer',
        greeting: { userName, date },
        overviewStats: { projectsCount: 0, totalTasks: 0, completedTasks: 0, overallProgress: 0 },
        projects: [],
        sprintProgress: [],
        epicProgress: [],
        recentCompletions: [],
        teamMembers: [],
      };
    }

    // ── overviewStats ──────────────────────────────────────────
    const [overview] = await db.query(`
      SELECT
        COUNT(t.id)::int AS "totalTasks",
        COUNT(t.id) FILTER (WHERE ps.category = 'done')::int AS "completedTasks"
      FROM work_items t
      JOIN project_statuses ps ON ps.id = t.status_id
      WHERE t.project_id = ANY($1) AND t.item_type IN ('task')
    `, [viewerProjectIds]);
    const totalTasks = overview.totalTasks || 0;
    const completedTasks = overview.completedTasks || 0;
    const overviewStats = {
      projectsCount: viewerProjectIds.length,
      totalTasks,
      completedTasks,
      overallProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };

    // ── projects ───────────────────────────────────────────────
    const projectRows = await db.query(`
      SELECT
        p.id,
        p.name,
        p.prefix,
        (SELECT COUNT(*)::int FROM work_items WHERE project_id = p.id AND item_type IN ('task')) AS "taskCount",
        (SELECT COUNT(*)::int FROM work_items t2
         JOIN project_statuses ps2 ON ps2.id = t2.status_id
         WHERE t2.project_id = p.id AND t2.item_type IN ('task') AND ps2.category != 'done'
        ) AS "openTaskCount",
        (SELECT COUNT(*)::int FROM work_items t3
         JOIN project_statuses ps3 ON ps3.id = t3.status_id
         WHERE t3.project_id = p.id AND t3.item_type IN ('task') AND ps3.category = 'done'
        ) AS "completedTaskCount",
        (SELECT COUNT(*)::int FROM project_members WHERE project_id = p.id) AS "memberCount"
      FROM projects p
      WHERE p.id = ANY($1)
      ORDER BY p.created_at DESC
    `, [viewerProjectIds]);

    // Attach active sprint
    const sprintsByProject = await db.query(`
      SELECT s.project_id, s.name, s.end_date,
        COALESCE(SUM(t.story_points), 0)::int AS total_points,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points
      FROM sprints s
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.status = 'active' AND s.project_id = ANY($1)
      GROUP BY s.id
    `, [viewerProjectIds]);
    const sprintMap = new Map<number, any>();
    for (const sp of sprintsByProject) {
      const totalPts = sp.total_points || 1;
      const daysRemaining = sp.end_date ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - Date.now()) / 86400000)) : 0;
      sprintMap.set(sp.project_id, {
        name: sp.name,
        progressPercent: Math.round((sp.completed_points / totalPts) * 100),
        daysRemaining,
        totalPoints: sp.total_points,
        completedPoints: sp.completed_points,
      });
    }
    const projects = projectRows.map((p: any) => ({
      ...p,
      activeSprint: sprintMap.get(p.id) || null,
    }));

    // ── sprintProgress ─────────────────────────────────────────
    const sprintProgressRows = await db.query(`
      SELECT
        p.name AS "projectName",
        s.name AS "sprintName",
        s.end_date,
        COALESCE(SUM(t.story_points), 0)::int AS total_points,
        COALESCE(SUM(t.story_points) FILTER (WHERE ps.category = 'done'), 0)::int AS completed_points,
        COUNT(t.id) FILTER (WHERE ps.category = 'backlog')::int AS backlog,
        COUNT(t.id) FILTER (WHERE ps.category = 'in_progress')::int AS in_progress,
        COUNT(t.id) FILTER (WHERE ps.category = 'done')::int AS done
      FROM sprints s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN work_items t ON t.sprint_id = s.id AND t.item_type IN ('task')
      LEFT JOIN project_statuses ps ON ps.id = t.status_id
      WHERE s.status = 'active' AND s.project_id = ANY($1)
      GROUP BY s.id, p.id
    `, [viewerProjectIds]);
    const sprintProgress = sprintProgressRows.map((sp: any) => {
      const totalPts = sp.total_points || 1;
      const daysRemaining = sp.end_date ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - Date.now()) / 86400000)) : 0;
      return {
        projectName: sp.projectName,
        sprintName: sp.sprintName,
        progressPercent: Math.round((sp.completed_points / totalPts) * 100),
        daysRemaining,
        tasksByStatus: {
          backlog: sp.backlog,
          in_progress: sp.in_progress,
          done: sp.done,
        },
      };
    });

    // ── epicProgress ───────────────────────────────────────────
    const epicRows = await db.query(`
      SELECT
        e.title,
        p.name AS "projectName",
        e.color,
        COUNT(t.id)::int AS "totalTasks",
        COUNT(t.id) FILTER (WHERE tps.category = 'done')::int AS "completedTasks"
      FROM work_items e
      JOIN projects p ON p.id = e.project_id
      JOIN project_statuses eps ON eps.id = e.status_id
      LEFT JOIN work_item_associations a ON a.linked_item_id = e.id AND a.link_type = 'belongs_to'
      LEFT JOIN work_items t ON t.id = a.item_id AND t.item_type IN ('task')
      LEFT JOIN project_statuses tps ON tps.id = t.status_id
      WHERE e.project_id = ANY($1) AND e.item_type = 'epic' AND eps.category != 'done'
      GROUP BY e.id, p.id
      ORDER BY e.created_at ASC
    `, [viewerProjectIds]);
    const epicProgress = epicRows.map((e: any) => ({
      title: e.title,
      projectName: e.projectName,
      color: e.color,
      totalTasks: e.totalTasks,
      completedTasks: e.completedTasks,
      progressPercent: e.totalTasks > 0 ? Math.round((e.completedTasks / e.totalTasks) * 100) : 0,
    }));

    // ── recentCompletions ──────────────────────────────────────
    const completionRows = await db.query(`
      SELECT
        p.prefix || '-' || t.item_number AS "taskKey",
        t.title,
        p.name AS "projectName",
        COALESCE(assignee.display_name, 'Unassigned') AS "completedByDisplayName",
        t.completed_at AS "completedAt"
      FROM work_items t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      WHERE t.project_id = ANY($1)
        AND t.item_type IN ('task')
        AND t.completed_at IS NOT NULL
        AND t.completed_at > NOW() - INTERVAL '7 days'
      ORDER BY t.completed_at DESC
      LIMIT 10
    `, [viewerProjectIds]);
    const recentCompletions = completionRows.map((c: any) => ({
      taskKey: c.taskKey,
      title: c.title,
      projectName: c.projectName,
      completedBy: { displayName: c.completedByDisplayName },
      completedAt: c.completedAt,
    }));

    // ── teamMembers ────────────────────────────────────────────
    const teamMemberRows = await db.query(`
      SELECT DISTINCT ON (u.id)
        u.display_name AS "displayName",
        u.avatar_url AS "avatarUrl",
        u.role,
        (SELECT COUNT(*)::int FROM work_items t
         JOIN project_statuses ps ON ps.id = t.status_id
         WHERE t.assignee_id = u.id AND t.item_type IN ('task') AND ps.category != 'done'
        ) AS "openTaskCount"
      FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = ANY($1) AND u.is_active = true
      ORDER BY u.id, u.display_name
    `, [viewerProjectIds]);
    const teamMembers = teamMemberRows.map((m: any) => ({
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      openTaskCount: m.openTaskCount,
    }));

    return {
      role: 'viewer',
      greeting: { userName, date },
      overviewStats,
      projects,
      sprintProgress,
      epicProgress,
      recentCompletions,
      teamMembers,
    };
  }
}
