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
  return { text: `Due in ${daysUntilDue}d`, className: 'text-neutral-500 bg-neutral-100' };
}

export function PMDashboard({ data }: { data: any }) {
  const safeData = data ?? {};
  const {
    greeting = {},
    myProjectsStats = {},
    activeSprintsByProject = [],
    burndownPreview = null,
    teamWorkload = [],
    blockedTasks = [],
    myTasks = [],
    upcomingDeadlines = [],
    epicProgress = [],
    recentActivity = [],
  } = safeData;

  const totalProjects = myProjectsStats.totalProjects ?? 0;
  const openTasksAcrossProjects = myProjectsStats.openTasksAcrossProjects ?? 0;
  const totalBlockedTasksCount = myProjectsStats.totalBlockedTasks ?? 0;
  const overdueTasks = myProjectsStats.overdueTasks ?? 0;

  const maxTasks = Math.max(...(teamWorkload.length > 0 ? teamWorkload.map((u: any) => u.openTaskCount ?? 0) : [1]), 1);

  const firstSprint = activeSprintsByProject?.[0]?.sprint;
  const summaryText = firstSprint
    ? `${firstSprint.name ?? ''} has ${firstSprint.daysRemaining ?? 0} days remaining — ${firstSprint.progressPercent ?? 0}% complete`
    : `Managing ${totalProjects} project${totalProjects !== 1 ? 's' : ''}`;

  return (
    <>
      <GreetingBar userName={greeting?.userName ?? ''} date={greeting?.date ?? ''} summaryText={summaryText} />

      <div className="px-[28px] py-6">

      <StatCardGrid>
        <StatCard icon="&#x1F4C1;" iconColor="text-lilac-dark" iconBg="bg-lilac-tint" label="My projects" value={totalProjects} />
        <StatCard icon="&#x2611;" iconColor="text-mint" iconBg="bg-mint-light" label="Open tasks" value={openTasksAcrossProjects} subtext={`across ${totalProjects} projects`} />
        <StatCard icon="&#x1F6D1;" iconColor="text-danger" iconBg="bg-red-50" label="Blocked" value={totalBlockedTasksCount} subtext={totalBlockedTasksCount > 0 ? 'Needs attention' : 'None'} valueColor={totalBlockedTasksCount > 0 ? 'text-danger' : undefined} />
        <StatCard icon="&#x23F0;" iconColor="text-tan" iconBg="bg-tan-light" label="Overdue" value={overdueTasks} subtext={overdueTasks > 0 ? 'Past due date' : 'None'} valueColor={overdueTasks > 0 ? 'text-danger' : undefined} />
      </StatCardGrid>

      {/* Sprint health + Burndown */}
      <TwoColumnLayout>
        <DashboardSection title="Sprint health">
          {activeSprintsByProject.length > 0 ? (
            <div className="space-y-4">
              {activeSprintsByProject.map((asp: any) => (
                <div key={asp.projectId}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[16px] font-mono text-neutral-400">{asp.projectPrefix}</span>
                    <span className="text-[16px] font-medium text-neutral-700">
                      {asp.sprint ? asp.sprint.name : 'No active sprint'}
                    </span>
                    {asp.sprint && (
                      <span className="text-[16px] text-mint bg-mint-light px-1.5 py-0.5 rounded">active</span>
                    )}
                  </div>
                  {asp.sprint && (
                    <>
                      <div className="flex items-center justify-between text-[16px] text-neutral-400 mb-1">
                        <span>{asp.sprint.daysRemaining ?? 0} days left · {asp.sprint.completedPoints ?? 0}/{asp.sprint.totalPoints ?? 0} pts</span>
                        <span>{asp.sprint.progressPercent ?? 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-200 mb-2">
                        <div className="h-full rounded-full bg-lilac transition-all" style={{ width: `${asp.sprint.progressPercent ?? 0}%` }} />
                      </div>
                      <div className="flex gap-2 text-[16px] text-neutral-400">
                        <span>Backlog:{asp.sprint.tasksByStatus?.backlog ?? 0}</span>
                        <span>In Progress:{asp.sprint.tasksByStatus?.in_progress ?? 0}</span>
                        <span>Done:{asp.sprint.tasksByStatus?.done ?? 0}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No active sprints</p>
          )}
        </DashboardSection>

        <DashboardSection title="Burndown preview" viewAllLink={activeSprintsByProject?.[0]?.projectId ? `/projects/${activeSprintsByProject[0].projectId}/charts` : undefined} viewAllText="View full chart">
          {burndownPreview && (burndownPreview.dataPoints?.length ?? 0) > 0 ? (
            <div className="h-[200px]">
              <ResponsiveLine
                data={[
                  { id: 'Ideal', data: (burndownPreview.dataPoints ?? []).map((p: any) => ({ x: p?.date, y: p?.ideal ?? 0 })) },
                  { id: 'Actual', data: (burndownPreview.dataPoints ?? []).map((p: any) => ({ x: p?.date, y: p?.actual ?? 0 })) },
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
            <p className="text-[16px] text-neutral-400 py-8 text-center">No burndown data available</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* Workload + Blocked */}
      <TwoColumnLayout>
        <DashboardSection title="Team workload">
          {teamWorkload.length > 0 ? (
            <div className="space-y-1">
              {teamWorkload.map((u: any) => (
                <TeamWorkloadBar key={u.userId} user={{ displayName: u.displayName ?? '', avatarUrl: u.avatarUrl }} taskCount={u.openTaskCount ?? 0} maxTaskCount={maxTasks} overdueCount={u.overdueCount ?? 0} />
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No team members</p>
          )}
        </DashboardSection>

        <DashboardSection title="Blocked tasks">
          {blockedTasks.length > 0 ? (
            <div className="space-y-3">
              {blockedTasks.map((bt: any) => (
                <div key={bt.id} className="text-[16px]">
                  <div className="flex items-center gap-2">
                    <span className="text-danger">&#x1F512;</span>
                    <span className="font-mono font-medium text-neutral-700">{bt.taskKey}</span>
                    <span className="text-neutral-500 truncate">{bt.title}</span>
                  </div>
                  <p className="text-[16px] text-neutral-400 ml-6 mt-0.5">
                    blocked by <span className="font-mono font-medium">{bt.blockedBy?.taskKey ?? ''}</span> — {bt.blockedBy?.title ?? ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No blocked tasks</p>
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
            <p className="text-[16px] text-neutral-400 py-4 text-center">No tasks assigned to you</p>
          )}
        </DashboardSection>

        <DashboardSection title="Upcoming deadlines (7 days)">
          {upcomingDeadlines.length > 0 ? (
            <div className="space-y-2">
              {upcomingDeadlines.map((d: any) => {
                const label = getDueLabel(d.daysUntilEnd ?? 0);
                return (
                  <div key={d.id} className="flex items-center gap-2 text-[16px]">
                    <span className="font-mono text-neutral-400 text-[16px]">{d.taskKey}</span>
                    <span className="text-neutral-700 truncate flex-1">{d.title}</span>
                    <span className={`text-[16px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${label.className}`}>{label.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No upcoming deadlines</p>
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
                    <span className="text-[16px] font-medium text-neutral-700 truncate">{e.title ?? ''}</span>
                    <span className="text-[16px] text-neutral-400 ml-auto">{e.progressPercent ?? 0}% ({e.completedTasks ?? 0}/{e.totalTasks ?? 0})</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-200">
                    <div className="h-full rounded-full transition-all" style={{ width: `${e.progressPercent ?? 0}%`, backgroundColor: e.color }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400 py-4 text-center">No active epics</p>
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
      </div>
    </>
  );
}
