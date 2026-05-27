import { Eyebrow } from '../../components/ui/Eyebrow';
import { WorkloadBar } from '../../components/sprints/WorkloadBar';
import type { SprintDetail } from '../SprintDetailPage';

const TYPE_COLORS: Record<string, string> = {
  story:   '#1F5236', // forest
  task:    '#1F5A8A', // sky
  bug:     '#7C3AED', // accent
  subtask: '#7A6F88', // ink-3
  epic:    '#5A1A6E', // plum
};

/**
 * Sidebar for the Sprint Detail Overview and Scope Changes tabs.
 * Renders Dates, per-member Workload (when assignees exist),
 * type breakdown, and a placeholder for the activity feed.
 */
export function OverviewSidebar({ sprint }: { sprint: SprintDetail }) {
  const overCount = sprint.assignees.filter(
    (a) => a.capacity != null && a.assigned > a.capacity,
  ).length;

  return (
    <aside className="w-[220px] space-y-6 flex-shrink-0">
      <section>
        <Eyebrow>Dates</Eyebrow>
        <div className="mt-2 flex items-baseline gap-3 text-[13px]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-mute">Start</p>
            <p className="font-medium">{formatDate(sprint.startDate)}</p>
          </div>
          <span className="text-faint">→</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-mute">End</p>
            <p className="font-medium">{formatDate(sprint.endDate)}</p>
          </div>
        </div>
      </section>

      {sprint.assignees.length > 0 && (
        <section>
          <Eyebrow>
            Workload{' '}
            {overCount > 0 && (
              <span className="text-danger ml-1">{overCount} over</span>
            )}
          </Eyebrow>
          <div className="mt-2 space-y-1.5">
            {sprint.assignees.map((u) => (
              <WorkloadBar
                key={u.id}
                user={u}
                assigned={u.assigned}
                capacity={u.capacity}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <Eyebrow>By type</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {(['story', 'task', 'bug', 'subtask'] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span
                className="inline-block"
                style={{ width: 8, height: 8, backgroundColor: TYPE_COLORS[k] }}
              />
              <span className="text-mute capitalize">{k}</span>
              <span className="font-semibold text-text ml-auto">
                {sprint.typeCounts[k] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Eyebrow>Recent</Eyebrow>
        <p className="mt-2 text-[11px] text-mute">
          Activity feed coming soon — see scope changes tab for now.
        </p>
      </section>
    </aside>
  );
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
