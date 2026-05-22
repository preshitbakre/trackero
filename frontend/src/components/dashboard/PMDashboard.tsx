import { ResponsiveLine } from '@nivo/line';
import { GreetingBar } from './GreetingBar';
import { StatCard, StatCardGrid } from './StatCard';
import { TaskRow } from './TaskRow';
import { TeamWorkloadBar } from './TeamWorkloadBar';
import { ActivityItem } from './ActivityItem';
import { DashboardSection, TwoColumnLayout } from './DashboardSection';

function getDueLabel(daysUntilDue: number): { text: string; className: string } {
  if (daysUntilDue < 0) return { text: `Overdue ${Math.abs(daysUntilDue)}d`, className: 'text-danger bg-danger/10' };
  if (daysUntilDue === 0) return { text: 'Due today', className: 'text-warning bg-warning/10' };
  if (daysUntilDue === 1) return { text: 'Due tomorrow', className: 'text-warning bg-warning/10' };
  return { text: `Due in ${daysUntilDue}d`, className: 'text-neutral-500 bg-neutral-100 dark:bg-dneutral-200 dark:text-dneutral-500' };
}

export function PMDashboard({ data }: { data: any }) {
  const { greeting, myProjectsStats, activeSprintsByProject, burndownPreview, teamWorkload, blockedTasks, myTasks, upcomingDeadlines, epicProgress, recentActivity } = data;
  const maxTasks = Math.max(...(teamWorkload.length > 0 ? teamWorkload.map((u: any) => u.openTaskCount) : [1]), 1);

  const summaryText = activeSprintsByProject.length > 0 && activeSprintsByProject[0].sprint
    ? `${activeSprintsByProject[0].sprint.name} has ${activeSprintsByProject[0].sprint.daysRemaining} days remaining — ${activeSprintsByProject[0].sprint.progressPercent}% complete`
    : `Managing ${myProjectsStats.totalProjects} project${myProjectsStats.totalProjects !== 1 ? 's' : ''}`;

  return (
    <div className="p-6">
      <GreetingBar userName={greeting.userName} date={greeting.date} summaryText={summaryText} />

      <StatCardGrid>
        <StatCard icon="&#x1F4C1;" iconColor="text-peri" iconBg="bg-peri-light" label="My projects" value={myProjectsStats.totalProjects} />
        <StatCard icon="&#x2611;" iconColor="text-mint" iconBg="bg-mint-light" label="Open tasks" value={myProjectsStats.openTasksAcrossProjects} subtext={`across ${myProjectsStats.totalProjects} projects`} />
        <StatCard icon="&#x1F6D1;" iconColor="text-danger" iconBg="bg-red-50" label="Blocked" value={myProjectsStats.totalBlockedTasks} subtext={myProjectsStats.totalBlockedTasks > 0 ? 'Needs attention' : 'None'} valueColor={myProjectsStats.totalBlockedTasks > 0 ? 'text-danger' : undefined} />
        <StatCard icon="&#x23F0;" iconColor="text-tan" iconBg="bg-tan-light" label="Overdue" value={myProjectsStats.overdueTasks} subtext={myProjectsStats.overdueTasks > 0 ? 'Past due date' : 'None'} valueColor={myProjectsStats.overdueTasks > 0 ? 'text-danger' : undefined} />
      </StatCardGrid>

      {/* Sprint health + Burndown */}
      <TwoColumnLayout>
        <DashboardSection title="Sprint health">
          {activeSprintsByProject.length > 0 ? (
            <div className="space-y-4">
              {activeSprintsByProject.map((asp: any) => (
                <div key={asp.projectId}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[16px] font-mono text-neutral-400 dark:text-dneutral-500">{asp.projectPrefix}</span>
                    <span className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700">
                      {asp.sprint ? asp.sprint.name : 'No active sprint'}
                    </span>
                    {asp.sprint && (
                      <span className="text-[16px] text-mint dark:text-mint-dm bg-mint-light dark:bg-mint-dm/30 px-1.5 py-0.5 rounded">active</span>
                    )}
                  </div>
                  {asp.sprint && (
                    <>
                      <div className="flex items-center justify-between text-[16px] text-neutral-400 dark:text-dneutral-500 mb-1">
                        <span>{asp.sprint.daysRemaining} days left · {asp.sprint.completedPoints}/{asp.sprint.totalPoints} pts</span>
                        <span>{asp.sprint.progressPercent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-dneutral-300 mb-2">
                        <div className="h-full rounded-full bg-peri transition-all" style={{ width: `${asp.sprint.progressPercent}%` }} />
                      </div>
                      <div className="flex gap-2 text-[16px] text-neutral-400 dark:text-dneutral-500">
                        <span>Backlog:{asp.sprint.tasksByStatus.backlog}</span>
                        <span>In Progress:{asp.sprint.tasksByStatus.in_progress}</span>
                        <span>Done:{asp.sprint.tasksByStatus.done}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No active sprints</p>
          )}
        </DashboardSection>

        <DashboardSection title="Burndown preview" viewAllLink={activeSprintsByProject[0]?.projectId ? `/projects/${activeSprintsByProject[0].projectId}/charts` : undefined} viewAllText="View full chart">
          {burndownPreview && burndownPreview.dataPoints?.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveLine
                data={[
                  { id: 'Ideal', data: burndownPreview.dataPoints.map((p: any) => ({ x: p.date, y: p.ideal })) },
                  { id: 'Actual', data: burndownPreview.dataPoints.map((p: any) => ({ x: p.date, y: p.actual })) },
                ]}
                margin={{ top: 10, right: 10, bottom: 30, left: 35 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0 }}
                colors={['#9BAAB8', '#4A6FA5']}
                pointSize={3}
                enableGridX={false}
                axisBottom={{ tickRotation: -45, tickSize: 0, tickPadding: 5 }}
                axisLeft={{ tickSize: 0, tickPadding: 5 }}
                theme={{ text: { fill: '#6D7F8E', fontSize: 10 }, grid: { line: { stroke: '#C8D3DE', strokeWidth: 0.5 } } }}
              />
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-8 text-center">No burndown data available</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* Workload + Blocked */}
      <TwoColumnLayout>
        <DashboardSection title="Team workload">
          {teamWorkload.length > 0 ? (
            <div className="space-y-1">
              {teamWorkload.map((u: any) => (
                <TeamWorkloadBar key={u.userId} user={{ displayName: u.displayName, avatarUrl: u.avatarUrl }} taskCount={u.openTaskCount} maxTaskCount={maxTasks} overdueCount={u.overdueCount} />
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No team members</p>
          )}
        </DashboardSection>

        <DashboardSection title="Blocked tasks">
          {blockedTasks.length > 0 ? (
            <div className="space-y-3">
              {blockedTasks.map((bt: any) => (
                <div key={bt.id} className="text-[16px]">
                  <div className="flex items-center gap-2">
                    <span className="text-danger">&#x1F512;</span>
                    <span className="font-mono font-medium text-neutral-700 dark:text-dneutral-700">{bt.taskKey}</span>
                    <span className="text-neutral-500 dark:text-dneutral-500 truncate">{bt.title}</span>
                  </div>
                  <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 ml-6 mt-0.5">
                    blocked by <span className="font-mono font-medium">{bt.blockedBy.taskKey}</span> — {bt.blockedBy.title}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No blocked tasks</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* My tasks + Deadlines */}
      <TwoColumnLayout>
        <DashboardSection title="My tasks">
          {myTasks.length > 0 ? (
            <div className="space-y-0.5">
              {myTasks.map((t: any) => (
                <TaskRow key={t.id} taskKey={t.taskKey} title={t.title} priority={t.priority} status={t.status} endDate={t.endDate} hasBlockers={t.hasBlockers} />
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No tasks assigned to you</p>
          )}
        </DashboardSection>

        <DashboardSection title="Upcoming deadlines (7 days)">
          {upcomingDeadlines.length > 0 ? (
            <div className="space-y-2">
              {upcomingDeadlines.map((d: any) => {
                const label = getDueLabel(d.daysUntilDue);
                return (
                  <div key={d.id} className="flex items-center gap-2 text-[16px]">
                    <span className="font-mono text-neutral-400 dark:text-dneutral-500 text-[16px]">{d.taskKey}</span>
                    <span className="text-neutral-700 dark:text-dneutral-700 truncate flex-1">{d.title}</span>
                    <span className={`text-[16px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${label.className}`}>{label.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No upcoming deadlines</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* Epics + Activity */}
      <TwoColumnLayout>
        <DashboardSection title="Epic progress">
          {epicProgress.length > 0 ? (
            <div className="space-y-3">
              {epicProgress.map((e: any) => (
                <div key={e.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 truncate">{e.title}</span>
                    <span className="text-[16px] text-neutral-400 dark:text-dneutral-500 ml-auto">{e.progressPercent}% ({e.completedTasks}/{e.totalTasks})</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-dneutral-300">
                    <div className="h-full rounded-full transition-all" style={{ width: `${e.progressPercent}%`, backgroundColor: e.color }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 py-4 text-center">No active epics</p>
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
    </div>
  );
}
