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
  return (
    <aside className="w-[220px] space-y-6 flex-shrink-0">
      <section>
        <Eyebrow>Sprint identity</Eyebrow>
        <dl className="mt-2 space-y-3 text-[13px]">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute">ID</dt>
            <dd className="font-medium">S-{sprint.sprintNumber}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute">Number</dt>
            <dd className="font-medium">{sprint.sprintNumber}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-mute">Status</dt>
            <dd className="mt-1">
              <StatusPill status={STATUS_PILL_MAP[sprint.status]} />
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <Eyebrow>Audit</Eyebrow>
        <ul className="mt-2 space-y-1 text-[11px] text-mute">
          <li>
            Created {formatDateTime(sprint.createdAt)}
            {sprint.createdBy != null && (
              <>
                {' '}
                by <span className="text-lilac">@user{sprint.createdBy}</span>
              </>
            )}
          </li>
          {sprint.startedBy != null && sprint.status !== 'planning' && (
            <li>
              Started {formatDateTime(sprint.updatedAt)} by{' '}
              <span className="text-lilac">@user{sprint.startedBy}</span>
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
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
