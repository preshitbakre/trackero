import { GreetingBar } from './GreetingBar';
import { StatCard, StatCardGrid } from './StatCard';
import { ProjectCard } from './ProjectCard';
import { DashboardSection, TwoColumnLayout } from './DashboardSection';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ViewerDashboard({ data }: { data: any }) {
  const safeData = data ?? {};
  const {
    greeting = {},
    overviewStats = {},
    projects = [],
    sprintProgress = [],
    epicProgress = [],
    recentCompletions = [],
    teamMembers = [],
  } = safeData;

  const projectsCount = overviewStats.projectsCount ?? 0;
  const totalTasks = overviewStats.totalTasks ?? 0;
  const completedTasks = overviewStats.completedTasks ?? 0;
  const overallProgress = overviewStats.overallProgress ?? 0;

  const summaryText = projectsCount > 0
    ? `Viewing ${projectsCount} project${projectsCount !== 1 ? 's' : ''} — ${overallProgress}% overall completion`
    : 'No projects assigned yet';

  return (
    <>
      <GreetingBar userName={greeting?.userName ?? ''} date={greeting?.date ?? ''} summaryText={summaryText} />

      <div className="px-[28px] py-6">

      <StatCardGrid>
        <StatCard icon="&#x1F4C1;" iconColor="text-lilac-dark" iconBg="bg-lilac-tint" label="Projects" value={projectsCount} />
        <StatCard icon="&#x2611;" iconColor="text-tan" iconBg="bg-tan-light" label="Total tasks" value={totalTasks} />
        <StatCard icon="&#x2705;" iconColor="text-mint" iconBg="bg-mint-light" label="Completed" value={completedTasks} />
        <StatCard icon="&#x1F4CA;" iconColor="text-mint" iconBg="bg-mint-light" label="Progress" value={`${overallProgress}%`} progressBar={{ percent: overallProgress, color: '#4A6FA5' }} />
      </StatCardGrid>

      {projects.length === 0 ? (
        <div className="rounded-lg shadow-sm bg-white p-8 text-center">
          <p className="text-neutral-400">You haven't been added to any projects yet.</p>
          <p className="text-[16px] text-neutral-400 mt-1">Ask your admin to add you.</p>
        </div>
      ) : (
        <>
          {/* Projects + Sprint progress */}
          <TwoColumnLayout>
            <DashboardSection title="Projects overview">
              <div className="space-y-3">
                {projects.map((p: any) => (
                  <ProjectCard key={p.id} {...p} />
                ))}
              </div>
            </DashboardSection>

            <DashboardSection title="Sprint progress">
              {sprintProgress.length > 0 ? (
                <div className="space-y-4">
                  {sprintProgress.map((sp: any, i: number) => (
                    <div key={`${sp.projectName ?? ''}-${sp.sprintName ?? ''}-${i}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[16px] font-medium text-neutral-700">{sp.projectName ?? ''}</span>
                        <span className="text-[16px] text-neutral-400">— {sp.sprintName ?? ''}</span>
                      </div>
                      <div className="flex items-center justify-between text-[16px] text-neutral-400 mb-1">
                        <span>{sp.daysRemaining ?? 0} days left</span>
                        <span>{sp.progressPercent ?? 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-200 mb-2">
                        <div className="h-full rounded-full bg-lilac transition-all" style={{ width: `${sp.progressPercent ?? 0}%` }} />
                      </div>
                      <div className="flex gap-2 text-[16px] text-neutral-400 flex-wrap">
                        <span>Backlog:{sp.tasksByStatus?.backlog ?? 0}</span>
                        <span>In Progress:{sp.tasksByStatus?.in_progress ?? 0}</span>
                        <span>Done:{sp.tasksByStatus?.done ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[16px] text-neutral-400 py-4 text-center">No active sprints</p>
              )}
            </DashboardSection>
          </TwoColumnLayout>

          {/* Epics + Recent completions */}
          <TwoColumnLayout>
            <DashboardSection title="Epic progress">
              {epicProgress.length > 0 ? (
                <div className="space-y-3">
                  {epicProgress.map((e: any, i: number) => (
                    <div key={`${e.title ?? ''}-${e.projectName ?? ''}-${i}`}>
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

            <DashboardSection title="Recent completions">
              {recentCompletions.length > 0 ? (
                <div className="space-y-2">
                  {recentCompletions.map((c: any, i: number) => (
                    <div key={`${c.taskKey ?? ''}-${c.completedAt ?? ''}-${i}`} className="flex items-center gap-2 text-[16px]">
                      <span className="text-success flex-shrink-0">&#x2713;</span>
                      <span className="font-mono text-neutral-400 text-[16px]">{c.taskKey ?? ''}</span>
                      <span className="text-neutral-700 truncate flex-1">{c.title ?? ''}</span>
                      <span className="text-[16px] text-neutral-400 flex-shrink-0">{c.completedBy?.displayName ?? ''}</span>
                      <span className="text-[16px] text-neutral-400 flex-shrink-0">{c.completedAt ? timeAgo(c.completedAt) : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[16px] text-neutral-400 py-4 text-center">No recent completions</p>
              )}
            </DashboardSection>
          </TwoColumnLayout>

          {/* Team */}
          <DashboardSection title="Team">
            <div className="space-y-2">
              {teamMembers.map((m: any, i: number) => {
                const memberKey = `${m.displayName ?? ''}-${m.role ?? ''}-${i}`;
                const initial = m.displayName?.charAt(0)?.toUpperCase() || '?';
                const roleBadge: Record<string, string> = {
                  admin: 'bg-lilac-tint text-neutral-700',
                  project_manager: 'bg-tan-light text-neutral-600',
                  member: 'bg-mint-light text-neutral-700',
                  viewer: 'bg-neutral-100 text-neutral-500',
                };
                return (
                  <div key={memberKey} className="flex items-center gap-3 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-lilac-tint flex items-center justify-center text-[16px] font-medium text-lilac-dark flex-shrink-0">
                      {initial}
                    </div>
                    <span className="text-[16px] font-medium text-neutral-700 flex-1">{m.displayName ?? ''}</span>
                    <span className={`text-[16px] px-1.5 py-0.5 rounded font-medium ${roleBadge[m.role] || roleBadge.member}`}>
                      {m.role === 'project_manager' ? 'PM' : (m.role ?? '')}
                    </span>
                    <span className="text-[16px] text-neutral-400">{m.openTaskCount ?? 0} open</span>
                  </div>
                );
              })}
            </div>
          </DashboardSection>
        </>
      )}
      </div>
    </>
  );
}
