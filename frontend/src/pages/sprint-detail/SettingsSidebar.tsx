import { Eyebrow } from '../../components/ui/Eyebrow';
import { StatusPill, type StatusKey } from '../../components/ui/StatusPill';
import type { SprintDetail } from '../SprintDetailPage';

const STATUS_PILL_MAP: Record<SprintDetail['status'], StatusKey> = {
  planning: 'planning',
  active: 'active',
  completed: 'shipped',
  cancelled: 'cancelled',
};

/**
 * Right-rail sidebar for the Settings tab. Shows static sprint identity
 * (ID, number, status) and an audit trail (created / started / last
 * edited). Distinct from the Overview sidebar, which surfaces
 * burndown-style metrics.
 */
export function SettingsSidebar({ sprint }: { sprint: SprintDetail }) {
  const createdHandle = sprint.createdByUser?.handle ?? (sprint.createdBy != null ? `user${sprint.createdBy}` : null);
  const startedHandle = sprint.startedByUser?.handle ?? (sprint.startedBy != null ? `user${sprint.startedBy}` : null);
  return (
    <aside className="w-[320px] flex-shrink-0 self-stretch overflow-y-auto bg-paper-2 border-l border-rule px-[22px] py-5">
      <section>
        <Eyebrow>Sprint identity</Eyebrow>
        <dl className="mt-3 space-y-4 text-[13px]">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute">ID</dt>
            <dd className="mt-0.5 font-mono font-medium text-[14px] text-text">S-{sprint.sprintNumber}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute">Number</dt>
            <dd className="mt-0.5 font-serif text-[20px] text-text">{sprint.sprintNumber}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute mb-1.5">Status</dt>
            <dd>
              <StatusPill status={STATUS_PILL_MAP[sprint.status]} solid dot block />
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-t border-rule pt-6">
        <Eyebrow>Audit</Eyebrow>
        <ul className="mt-3 space-y-1.5 font-mono text-[12px] text-mute leading-relaxed">
          <li>
            Created {formatDateTime(sprint.createdAt)}
            {createdHandle && (
              <>
                {' '}by <span className="text-lilac">@{createdHandle}</span>
              </>
            )}
          </li>
          {sprint.status !== 'planning' && (sprint.startedAt || sprint.startedBy != null) && (
            <li>
              Started {formatDateTime(sprint.startedAt ?? sprint.updatedAt)}
              {startedHandle && (
                <>
                  {' '}by <span className="text-lilac">@{startedHandle}</span>
                </>
              )}
            </li>
          )}
          <li>Last edited {relativeTime(sprint.updatedAt)}</li>
        </ul>
      </section>
    </aside>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // 24h HH:mm
  return `${date} · ${time}`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
