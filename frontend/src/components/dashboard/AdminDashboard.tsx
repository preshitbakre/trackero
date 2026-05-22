import { useState } from 'react';
import { GreetingBar } from './GreetingBar';
import { StatCard, StatCardGrid } from './StatCard';
import { ProjectCard } from './ProjectCard';
import { ActivityItem } from './ActivityItem';
import { DashboardSection, TwoColumnLayout } from './DashboardSection';
import { CreateProjectDialog } from '../common/CreateProjectDialog';

export function AdminDashboard({ data }: { data: any }) {
  const [showCreate, setShowCreate] = useState(false);
  const { greeting, instanceStats, sprintOverview, projects, teamWorkload, blockedTasks, recentActivity, userStats } = data;


  return (
    <div className="p-6">
      <GreetingBar
        userName={greeting.userName}
        date={greeting.date}
        summaryText={`${instanceStats.activeUsers} users across ${instanceStats.activeProjects} projects`}
      />

      <StatCardGrid>
        <StatCard icon="&#x1F465;" iconColor="text-peri" iconBg="bg-peri-light" label="Total users" value={instanceStats.totalUsers} subtext={`${instanceStats.activeUsers} active`} />
        <StatCard icon="&#x1F4C1;" iconColor="text-mint" iconBg="bg-mint-light" label="Active projects" value={instanceStats.activeProjects} subtext={`${instanceStats.totalProjects - instanceStats.activeProjects} archived`} />
        <StatCard icon="&#x1F504;" iconColor="text-tan" iconBg="bg-tan-light" label="Active sprints" value={sprintOverview.activeSprintsCount} subtext={sprintOverview.sprintsAtRisk > 0 ? `${sprintOverview.sprintsAtRisk} at risk` : 'On track'} valueColor={sprintOverview.sprintsAtRisk > 0 ? 'text-warning' : undefined} />
        <StatCard icon="&#x1F6D1;" iconColor="text-danger" iconBg="bg-red-50" label="Blocked tasks" value={sprintOverview.totalBlockedTasks} subtext={sprintOverview.totalBlockedTasks > 0 ? 'Needs attention' : 'None'} valueColor={sprintOverview.totalBlockedTasks > 0 ? 'text-danger' : undefined} />
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
              <p className="text-neutral-400 dark:text-dneutral-500 mb-3">No projects yet</p>
              <button onClick={() => setShowCreate(true)} className="text-[16px] text-white bg-peri px-4 py-2 rounded-md hover:bg-peri">
                Create your first project
              </button>
            </div>
          )}
        </DashboardSection>

        <DashboardSection
          title="Team workload"
          footer={
            <div className="flex items-center gap-4 text-[14px] text-neutral-400 dark:text-dneutral-500 flex-wrap">
              <span>Admins <strong className="text-neutral-700 dark:text-dneutral-700">{userStats.rolesBreakdown.admin}</strong></span>
              <span>PMs <strong className="text-neutral-700 dark:text-dneutral-700">{userStats.rolesBreakdown.project_manager}</strong></span>
              <span>Members <strong className="text-neutral-700 dark:text-dneutral-700">{userStats.rolesBreakdown.member}</strong></span>
              <span>Viewers <strong className="text-neutral-700 dark:text-dneutral-700">{userStats.rolesBreakdown.viewer}</strong></span>
              {userStats.pendingInvitations > 0 && (
                <span className="text-warning">{userStats.pendingInvitations} pending</span>
              )}
            </div>
          }
        >
          {teamWorkload.length > 0 ? (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-neutral-200 dark:bg-dneutral-300 text-[12px] text-neutral-700 dark:text-dneutral-600 uppercase tracking-wider">
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
                      <tr key={u.userId} className="border-b border-neutral-100 dark:border-dneutral-200/50">
                        <td className="px-2 py-1.5 text-neutral-700 dark:text-dneutral-700 truncate">{u.displayName}</td>
                        <td className="w-14 px-2 py-1.5 text-center text-neutral-700 dark:text-dneutral-700">{u.openTaskCount}</td>
                        <td className="w-14 px-2 py-1.5 text-center text-peri dark:text-peri-dm">{u.inProgressCount}</td>
                        <td className={`w-16 px-2 py-1.5 text-center ${u.overdueCount > 0 ? 'text-danger font-medium' : 'text-neutral-400 dark:text-dneutral-500'}`}>{u.overdueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No team members</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      <TwoColumnLayout>
        <DashboardSection title="Blocked tasks">
          {blockedTasks.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-dneutral-200">
              {blockedTasks.map((bt: any) => (
                <div key={bt.id} className="py-2 text-[16px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-danger text-[16px]">&#x1F512;</span>
                    <span className="font-mono font-medium text-neutral-700 dark:text-dneutral-700">{bt.taskKey}</span>
                    <span className="text-neutral-500 dark:text-dneutral-500 truncate">{bt.title}</span>
                  </div>
                  <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 ml-5 mt-0.5 truncate">
                    &larr; {bt.blockedBy.taskKey} {bt.blockedBy.title}
                    {bt.blockedBy.assignee && ` (${bt.blockedBy.assignee.displayName})`}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No blocked tasks</p>
          )}
        </DashboardSection>

        <DashboardSection title="Recent activity">
          {recentActivity.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-dneutral-200">
              {recentActivity.map((a: any, i: number) => (
                <ActivityItem key={i} {...a} />
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No recent activity</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            document.dispatchEvent(new CustomEvent('projects-updated'));
          }}
        />
      )}
    </div>
  );
}
