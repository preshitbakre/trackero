import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GreetingBar } from './GreetingBar';
import { StatCard, StatCardGrid } from './StatCard';
import { ProjectCard } from './ProjectCard';
import { ActivityItem } from './ActivityItem';
import { DashboardSection, TwoColumnLayout } from './DashboardSection';
import { CreateProjectDialog } from '../common/CreateProjectDialog';
import { Button } from '../ui/Button';

export function AdminDashboard({ data }: { data: any }) {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const safeData = data ?? {};
  const {
    greeting = {},
    instanceStats = {},
    sprintOverview = {},
    projects = [],
    teamWorkload = [],
    blockedTasks = [],
    recentActivity = [],
    userStats = {},
  } = safeData;

  const totalUsers = instanceStats.totalUsers ?? 0;
  const activeUsers = instanceStats.activeUsers ?? 0;
  const activeProjects = instanceStats.activeProjects ?? 0;
  const totalProjects = instanceStats.totalProjects ?? 0;
  const activeSprintsCount = sprintOverview.activeSprintsCount ?? 0;
  const sprintsAtRisk = sprintOverview.sprintsAtRisk ?? 0;
  const totalBlockedTasks = sprintOverview.totalBlockedTasks ?? 0;
  const rolesBreakdown = userStats.rolesBreakdown ?? {};
  const pendingInvitations = userStats.pendingInvitations ?? 0;

  return (
    <>
      <GreetingBar
        userName={greeting?.userName ?? ''}
        date={greeting?.date ?? ''}
        summaryText={`${activeUsers} users across ${activeProjects} projects`}
      />

      <div className="px-[28px] py-6">
      <StatCardGrid>
        <StatCard icon="&#x1F465;" iconColor="text-lilac-dark" iconBg="bg-lilac-tint" label="Total users" value={totalUsers} subtext={`${activeUsers} active`} />
        <StatCard icon="&#x1F4C1;" iconColor="text-mint" iconBg="bg-mint-light" label="Active projects" value={activeProjects} subtext={`${Math.max(0, totalProjects - activeProjects)} archived`} />
        <StatCard icon="&#x1F504;" iconColor="text-tan" iconBg="bg-tan-light" label="Active sprints" value={activeSprintsCount} subtext={sprintsAtRisk > 0 ? `${sprintsAtRisk} at risk` : 'On track'} valueColor={sprintsAtRisk > 0 ? 'text-warning' : undefined} />
        <StatCard icon="&#x1F6D1;" iconColor="text-danger" iconBg="bg-red-50" label="Blocked tasks" value={totalBlockedTasks} subtext={totalBlockedTasks > 0 ? 'Needs attention' : 'None'} valueColor={totalBlockedTasks > 0 ? 'text-danger' : undefined} />
      </StatCardGrid>

      <TwoColumnLayout>
        <DashboardSection title="All projects">
          {projects.length > 0 ? (
            <div className="space-y-1.5">
              {projects.map((p: any) => (
                <ProjectCard key={p.id} {...p} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-neutral-400 mb-3">No projects yet</p>
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create your first project
              </Button>
            </div>
          )}
        </DashboardSection>

        <DashboardSection
          title="Team workload"
          footer={
            <div className="flex items-center gap-4 text-[14px] text-neutral-400 flex-wrap">
              <span>Admins <strong className="text-neutral-700">{rolesBreakdown.admin ?? 0}</strong></span>
              <span>PMs <strong className="text-neutral-700">{rolesBreakdown.project_manager ?? 0}</strong></span>
              <span>Members <strong className="text-neutral-700">{rolesBreakdown.member ?? 0}</strong></span>
              <span>Viewers <strong className="text-neutral-700">{rolesBreakdown.viewer ?? 0}</strong></span>
              {pendingInvitations > 0 && (
                <span className="text-warning">{pendingInvitations} pending</span>
              )}
            </div>
          }
        >
          {teamWorkload.length > 0 ? (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-neutral-200 text-[12px] text-neutral-700 uppercase tracking-wider">
                    <th className="text-left font-medium px-2 py-1">Name</th>
                    <th className="w-14 text-center font-medium px-2 py-1">Open</th>
                    <th className="w-14 text-center font-medium px-2 py-1">Active</th>
                    <th className="w-16 text-center font-medium px-2 py-1">Overdue</th>
                  </tr>
                </thead>
              </table>
              <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                <table className="w-full text-[14px]">
                  <tbody>
                    {teamWorkload.map((u: any) => (
                      <tr key={u.userId} className="border-b border-neutral-100">
                        <td className="px-2 py-1.5 text-neutral-700 truncate">{u.displayName}</td>
                        <td className="w-14 px-2 py-1.5 text-center text-neutral-700">{u.openTaskCount}</td>
                        <td className="w-14 px-2 py-1.5 text-center text-lilac-dark">{u.inProgressCount}</td>
                        <td className={`w-16 px-2 py-1.5 text-center ${u.overdueCount > 0 ? 'text-danger font-medium' : 'text-neutral-400'}`}>{u.overdueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No team members</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      <TwoColumnLayout>
        <DashboardSection title="Blocked tasks">
          {blockedTasks.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              {blockedTasks.map((bt: any) => (
                <div key={bt.id} className="py-2 text-[16px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-danger text-[16px]">&#x1F512;</span>
                    <span className="font-mono font-medium text-neutral-700">{bt.taskKey}</span>
                    <span className="text-neutral-500 truncate">{bt.title}</span>
                  </div>
                  <p className="text-[16px] text-neutral-400 ml-5 mt-0.5 truncate">
                    &larr; {bt.blockedBy?.taskKey ?? ''} {bt.blockedBy?.title ?? ''}
                    {bt.blockedBy?.assignee && ` (${bt.blockedBy.assignee.displayName ?? ''})`}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No blocked tasks</p>
          )}
        </DashboardSection>

        <DashboardSection title="Recent activity">
          {recentActivity.length > 0 ? (
            <div className="divide-y divide-neutral-100">
              {recentActivity.map((a: any, i: number) => (
                <ActivityItem key={`${a.timestamp}-${a.target?.taskKey ?? ''}-${a.actor?.displayName ?? ''}-${i}`} {...a} />
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No recent activity</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
            document.dispatchEvent(new CustomEvent('projects-updated'));
            if (project?.id) navigate(`/projects/${project.id}/today`);
          }}
        />
      )}
      </div>
    </>
  );
}
