import { GreetingBar } from './GreetingBar';
import { StatCard, StatCardGrid } from './StatCard';
import { TaskRow } from './TaskRow';
import { ActivityItem } from './ActivityItem';
import { DashboardSection, TwoColumnLayout } from './DashboardSection';

function getDueLabel(daysUntilDue: number): { text: string; className: string } {
  if (daysUntilDue < 0) return { text: `Overdue ${Math.abs(daysUntilDue)}d`, className: 'text-danger bg-danger/10' };
  if (daysUntilDue === 0) return { text: 'Due today', className: 'text-warning bg-warning/10' };
  if (daysUntilDue === 1) return { text: 'Due tomorrow', className: 'text-warning bg-warning/10' };
  return { text: `Due in ${daysUntilDue}d`, className: 'text-neutral-500 bg-neutral-100 dark:bg-dneutral-200 dark:text-dneutral-500' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MemberDashboard({ data }: { data: any }) {
  const { greeting, personalStats, myTasks, dueSoon, myBlockedTasks, activeSprintSummary, activityOnMyTasks, recentlyCompleted } = data;

  const summaryParts: string[] = [];
  if (personalStats.myInProgress > 0) summaryParts.push(`${personalStats.myInProgress} in progress`);
  if (personalStats.myBlocked > 0) summaryParts.push(`${personalStats.myBlocked} blocked`);
  const summaryText = summaryParts.length > 0 ? `You have ${summaryParts.join(', ')}` : 'You have no active tasks';

  return (
    <div className="p-6">
      <GreetingBar userName={greeting.userName} date={greeting.date} summaryText={summaryText} />

      <StatCardGrid>
        <StatCard icon="&#x2611;" label="My open tasks" value={personalStats.myOpenTasks} />
        <StatCard icon="&#x25B6;" label="In progress" value={personalStats.myInProgress} />
        <StatCard icon="&#x1F512;" label="Blocked" value={personalStats.myBlocked} subtext={personalStats.myBlocked > 0 ? `${personalStats.myBlocked} need${personalStats.myBlocked === 1 ? 's' : ''} help` : 'None'} valueColor={personalStats.myBlocked > 0 ? 'text-danger' : undefined} />
        <StatCard icon="&#x1F4C5;" label="Due this week" value={personalStats.dueThisWeek} subtext={dueSoon.some((d: any) => d.daysUntilDue < 0) ? 'Has overdue' : 'None overdue'} valueColor={dueSoon.some((d: any) => d.daysUntilDue < 0) ? 'text-warning' : undefined} />
      </StatCardGrid>

      {/* My focus + Sprint summary */}
      <TwoColumnLayout>
        <DashboardSection title="My focus">
          {myTasks.length > 0 ? (
            <div className="space-y-0.5">
              {myTasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status.category === 'in_progress' ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-dneutral-400'}`} />
                  <div className="flex-1 min-w-0">
                    <TaskRow taskKey={t.taskKey} title={t.title} priority={t.priority} status={t.status} dueDate={t.dueDate} hasBlockers={t.hasBlockers} />
                  </div>
                </div>
              ))}
              <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-2 px-3">
                ● = in progress &nbsp; ○ = backlog
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-neutral-400 dark:text-dneutral-500">No tasks assigned</p>
              <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-1">Check with your project manager</p>
            </div>
          )}
        </DashboardSection>

        <DashboardSection title="Active sprints">
          {activeSprintSummary.length > 0 ? (
            <div className="space-y-4">
              {activeSprintSummary.map((sp: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono text-neutral-400 dark:text-dneutral-500">{sp.projectPrefix}</span>
                    <span className="text-sm font-medium text-neutral-700 dark:text-dneutral-700">{sp.sprintName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-neutral-400 dark:text-dneutral-500 mb-1">
                    <span>{sp.progressPercent}% · {sp.daysRemaining} days left</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-dneutral-300 mb-1.5">
                    <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${sp.progressPercent}%` }} />
                  </div>
                  <p className="text-sm text-neutral-400 dark:text-dneutral-500">
                    My tasks: {sp.myCompletedInSprint}/{sp.myTasksInSprint} done
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 py-4 text-center">No active sprints</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* Due soon + Blocked */}
      <TwoColumnLayout>
        <DashboardSection title="Due soon & overdue">
          {dueSoon.length > 0 ? (
            <div className="space-y-2">
              {dueSoon.map((d: any) => {
                const label = getDueLabel(d.daysUntilDue);
                return (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-neutral-400 dark:text-dneutral-500 text-sm">{d.taskKey}</span>
                    <span className="text-neutral-700 dark:text-dneutral-700 truncate flex-1">{d.title}</span>
                    <span className={`text-sm px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${label.className}`}>{label.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 py-4 text-center">Nothing due soon</p>
          )}
        </DashboardSection>

        <DashboardSection title="Blocked">
          {myBlockedTasks.length > 0 ? (
            <div className="space-y-3">
              {myBlockedTasks.map((bt: any) => (
                <div key={bt.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-danger">&#x1F512;</span>
                    <span className="font-mono font-medium text-neutral-700 dark:text-dneutral-700">{bt.taskKey}</span>
                    <span className="text-neutral-500 dark:text-dneutral-500 truncate">{bt.title}</span>
                  </div>
                  <p className="text-sm text-neutral-400 dark:text-dneutral-500 ml-6 mt-0.5">
                    Blocked by <span className="font-mono font-medium">{bt.blockedBy.taskKey}</span>
                    {bt.blockedBy.assignee && <span> ({bt.blockedBy.assignee.displayName})</span>}
                    <br />"{bt.blockedBy.title}"
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 py-4 text-center">Nothing blocked</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>

      {/* Activity + Completed */}
      <TwoColumnLayout>
        <DashboardSection title="Activity on my tasks">
          {activityOnMyTasks.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-dneutral-200">
              {activityOnMyTasks.map((a: any, i: number) => (
                <ActivityItem key={i} {...a} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 py-4 text-center">No recent activity on your tasks</p>
          )}
        </DashboardSection>

        <DashboardSection title="Recently completed">
          {recentlyCompleted.length > 0 ? (
            <div className="space-y-2">
              {recentlyCompleted.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="text-success flex-shrink-0">&#x2713;</span>
                  <span className="font-mono text-neutral-400 dark:text-dneutral-500 text-sm">{c.taskKey}</span>
                  <span className="text-neutral-700 dark:text-dneutral-700 truncate flex-1">{c.title}</span>
                  <span className="text-sm text-neutral-400 dark:text-dneutral-500 flex-shrink-0">{timeAgo(c.completedAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 py-4 text-center">No completions this week</p>
          )}
        </DashboardSection>
      </TwoColumnLayout>
    </div>
  );
}
