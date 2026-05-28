interface Props {
  done: number;
  wip: number;
  open: number;
  className?: string;
}

const SEGMENTS = [
  { key: 'done', color: '#88D68E', label: 'done' },
  { key: 'wip', color: '#D6B588', label: 'WIP' },
  { key: 'open', color: '#E8E3F0', label: 'open' },
] as const;

/**
 * Segmented done / WIP / open bar with a legend — used in the story detail
 * right rail's "Children" section. Falls back to an empty track when there
 * are no children.
 */
export function ChildrenProgressBar({ done, wip, open, className = '' }: Props) {
  const total = done + wip + open;
  const counts = { done, wip, open };
  return (
    <div className={className}>
      <div className="flex h-2 w-full overflow-hidden bg-paper-3" style={{ borderRadius: 0 }}>
        {total > 0 &&
          SEGMENTS.map((s) => {
            const v = counts[s.key];
            if (v === 0) return null;
            return (
              <span
                key={s.key}
                style={{ width: `${(v / total) * 100}%`, backgroundColor: s.color }}
              />
            );
          })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[12px] text-mute">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-semibold text-text">{counts[s.key]}</span> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
