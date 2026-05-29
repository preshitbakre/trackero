import { Avatar } from '../ui/Avatar';
import { TypeTag } from '../ui/TypeTag';

export interface ScopeEntry {
  id: number;
  action: 'added' | 'removed' | 'commit' | 'goal';
  user: { id: number; displayName: string; avatarUrl: string | null };
  createdAt: string;
  pointsDelta: number;
  workItem?: { id: number; itemKey: string; title: string; itemType: 'task' | 'bug' | 'story' | 'epic' | 'subtask' };
  totalItems?: number;
  note?: string | null;
}

// Square node colour on the rail.
const NODE_COLOR: Record<ScopeEntry['action'], string> = {
  added: '#1F5236',   // forest
  removed: '#7C3AED', // accent
  commit: '#1A1424',  // ink
  goal: '#1A1424',    // ink
};

const BADGE: Record<ScopeEntry['action'], string> = {
  added: 'bg-[#1F52361A] text-c-forest',
  removed: 'bg-lilac-tint text-lilac-dark',
  commit: 'bg-ink text-paper',
  goal: 'bg-paper-2 text-ink-2',
};

const PILL: Record<ScopeEntry['action'], string> = {
  added: 'bg-[#1F523614] text-c-forest',
  removed: 'bg-lilac-tint text-lilac',
  commit: 'bg-[#1F523614] text-c-forest',
  goal: '',
};

export function ScopeTimeline({ entries }: { entries: ScopeEntry[] }) {
  return (
    <div className="relative">
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        const showPts = e.action !== 'goal' && e.pointsDelta !== 0;
        return (
          <article key={`${e.action}-${e.id}`} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Rail + square node */}
            <div className="relative flex-shrink-0 w-3 flex justify-center">
              {!last && (
                <span className="absolute top-2.5 -bottom-6 left-1/2 -translate-x-1/2 w-px bg-rule" />
              )}
              <span
                className="relative z-10 mt-1 w-2.5 h-2.5"
                style={{ backgroundColor: NODE_COLOR[e.action] }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <header className="flex items-center gap-2 flex-wrap">
                <Avatar user={e.user} size="xs" />
                <span className="text-[13px] font-medium text-text">{e.user.displayName || 'Unknown'}</span>
                <span className="text-[11px] text-faint">{relativeTime(e.createdAt)}</span>
                <span className={`text-[10px] px-1.5 rounded-[2px] font-medium ${BADGE[e.action]}`}>
                  {e.action}
                </span>
                {showPts && (
                  <span className={`text-[12px] font-medium px-[7px] py-0.5 ml-auto ${PILL[e.action]}`}>
                    {e.action === 'removed' ? '−' : '+'}{Math.abs(e.pointsDelta)} pts
                  </span>
                )}
              </header>

              <div className="mt-1.5 ml-[28px]">
                {e.action === 'goal' ? (
                  <p className="text-[13px] text-text">
                    Sprint goal updated:{' '}
                    <span className="font-serif italic text-mute">"{e.note}"</span>
                  </p>
                ) : e.action === 'commit' ? (
                  <p className="text-[13px] text-mute">
                    Committed <span className="font-semibold text-text">{e.pointsDelta} pts</span> across{' '}
                    {e.totalItems} items.
                  </p>
                ) : e.workItem ? (
                  <div className="flex items-center gap-2">
                    <TypeTag kind={e.workItem.itemType} size="sm" />
                    <span className="font-mono text-[12px] text-faint">{e.workItem.itemKey}</span>
                    <span className="text-[13px] text-text">{e.workItem.title}</span>
                  </div>
                ) : null}

                {e.action === 'removed' && (
                  <p className="mt-1 text-[12px] italic text-faint">Pulled — out of scope for this sprint.</p>
                )}
              </div>
            </div>
          </article>
        );
      })}
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
