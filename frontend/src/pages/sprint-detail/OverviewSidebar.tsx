import { useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../../api/client';
import { Avatar } from '../../components/ui/Avatar';
import { WorkloadBar } from '../../components/sprints/WorkloadBar';
import type { SprintDetail } from '../SprintDetailPage';

interface ActivityEntry {
  id: number;
  user: { id: number; displayName: string; avatarUrl: string | null };
  createdAt: string;
  text: string;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const TYPE_COLORS: Record<string, string> = {
  story:   '#1F5236', // forest
  task:    '#1F5A8A', // sky
  bug:     '#7C3AED', // accent
  subtask: '#7A6F88', // ink-3
  epic:    '#5A1A6E', // plum
};

/** Sans-serif (Geist) section label — matches the design's sidebar headings. */
function Label({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">{children}</p>
  );
}

/**
 * Sidebar for the Sprint Detail Overview and Scope Changes tabs. A full-height
 * tinted rail (flush to the content's right edge) with Dates, per-member
 * Workload (every project member), a type breakdown, and the activity stub.
 */
export function OverviewSidebar({ sprint }: { sprint: SprintDetail }) {
  const overCount = sprint.assignees.filter(
    (a) => a.capacity != null && a.assigned > a.capacity,
  ).length;

  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    apiClient
      .get(`/projects/${sprint.projectId}/sprints/${sprint.id}/activity`, { params: { limit: 8 } })
      .then((r) => setActivity(r.data.data?.entries ?? []))
      .catch(() => setActivity([]));
  }, [sprint.projectId, sprint.id]);

  return (
    <aside className="w-[320px] flex-shrink-0 self-stretch overflow-y-auto bg-[#F1ECF7] border-l border-rule px-[22px] py-5 space-y-6">
      <section>
        <Label>Dates</Label>
        <div className="mt-2 flex w-full items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.1em] text-mute">Start</p>
            <p className="font-serif text-[22px] text-text leading-none whitespace-nowrap">
              {formatDate(sprint.startDate)}
              <span className="font-sans font-normal text-[13.5px] text-faint ml-1.5">→</span>
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-[0.1em] text-mute">End</p>
            <p className="font-serif text-[22px] text-text leading-none whitespace-nowrap">{formatDate(sprint.endDate)}</p>
          </div>
        </div>
      </section>

      <section>
        <Label>
          Workload{' '}
          {overCount > 0 && <span className="text-lilac ml-1">{overCount} over</span>}
        </Label>
        <div className="mt-2 space-y-1.5">
          {sprint.assignees.map((u) => (
            <WorkloadBar
              key={u.id}
              user={u}
              assigned={u.assigned}
              done={u.done}
              inProgress={u.inProgress}
              capacity={u.capacity}
            />
          ))}
        </div>
      </section>

      <section>
        <Label>By type</Label>
        <div className="mt-2 flex h-2 w-full overflow-hidden bg-paper-3">
          {(['story', 'task', 'bug', 'subtask'] as const).map((k) => {
            const n = sprint.typeCounts[k] ?? 0;
            return n > 0 ? (
              <div key={k} style={{ flexGrow: n, backgroundColor: TYPE_COLORS[k] }} />
            ) : null;
          })}
        </div>
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
        <Label>Recent</Label>
        {activity.length === 0 ? (
          <p className="mt-2 text-[11px] text-mute">No activity yet.</p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {activity.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-[11px] leading-snug">
                <span className="font-mono text-faint w-[40px] flex-shrink-0 text-right pt-0.5">
                  {timeAgo(e.createdAt)}
                </span>
                <Avatar user={e.user} size="xs" />
                <span className="text-mute">{e.text}</span>
              </div>
            ))}
          </div>
        )}
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
