import { Avatar } from '../ui/Avatar';
import { TypeTag } from '../ui/TypeTag';

export interface ScopeEntry {
  id: number;
  action: 'added' | 'removed' | 'commit';
  user: { id: number; displayName: string; avatarUrl: string | null };
  createdAt: string;
  pointsDelta: number;
  workItem?: { id: number; itemKey: string; title: string; itemType: 'task' | 'bug' | 'story' | 'epic' | 'subtask' };
  totalItems?: number;
}

const ACTION_STYLE: Record<ScopeEntry['action'], string> = {
  added:   'bg-mint-light text-mint-dark',
  removed: 'bg-[#E0525215] text-danger',
  commit:  'bg-lilac-tint text-lilac',
};

const ACTION_LABEL: Record<ScopeEntry['action'], string> = {
  added: 'added',
  removed: 'removed',
  commit: 'commit',
};

export function ScopeTimeline({ entries }: { entries: ScopeEntry[] }) {
  return (
    <div>
      {entries.map((e) => (
        <article key={`${e.action}-${e.id}`} className="flex flex-col gap-1 py-3 border-b border-rule">
          <header className="flex items-center gap-2">
            <Avatar user={e.user} size="xs" />
            <span className="text-[13px] font-medium">{e.user.displayName || 'Unknown'}</span>
            <span className="text-[11px] text-faint">{relativeTime(e.createdAt)}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACTION_STYLE[e.action]}`}>
              {ACTION_LABEL[e.action]}
            </span>
            {typeof e.pointsDelta === 'number' && e.pointsDelta !== 0 && (
              <span className={`text-[12px] font-medium ml-auto ${e.action === 'removed' ? 'text-danger' : 'text-mint-dark'}`}>
                {e.action === 'removed' ? '−' : '+'}{Math.abs(e.pointsDelta)} pts
              </span>
            )}
          </header>
          {e.workItem && (
            <div className="flex items-center gap-2 ml-[28px]">
              <TypeTag kind={e.workItem.itemType} size="sm" />
              <span className="font-mono text-[12px] text-faint">{e.workItem.itemKey}</span>
              <span className="text-[13px]">{e.workItem.title}</span>
            </div>
          )}
          {e.action === 'commit' && typeof e.totalItems === 'number' && (
            <p className="ml-[28px] text-[12px] text-mute">
              Committed {e.pointsDelta} pts across {e.totalItems} items.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
