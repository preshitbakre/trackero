import { Avatar } from '../ui/Avatar';

interface WorkloadBarProps {
  user: { id: number; displayName: string; avatarUrl?: string | null };
  assigned: number;
  capacity: number | null;
}

/**
 * Per-member capacity bar for the Sprint Detail sidebar.
 * Shows avatar + horizontal fill bar + assigned/capacity ratio.
 * Over capacity → fill renders in accent color.
 */
export function WorkloadBar({ user, assigned, capacity }: WorkloadBarProps) {
  // Default cap when capacity not set; spec calls this "sane default"
  const cap = capacity ?? 6;
  const pct = cap > 0 ? Math.min(100, (assigned / cap) * 100) : 0;
  const over = assigned > cap;
  return (
    <div className="flex items-center gap-2 h-[24px]">
      <Avatar user={user} size="xs" />
      <div className="flex-1 h-[6px] bg-paper-3 relative overflow-hidden">
        <div
          data-fill
          className={`absolute inset-y-0 left-0 ${over ? 'bg-lilac' : 'bg-ink'}`}
          style={{ width: `${pct}%` }}
          aria-label={over ? `${assigned} of ${cap} — over capacity` : `${assigned} of ${cap}`}
        />
      </div>
      <span className="text-[11px] font-mono text-mute w-[28px] text-right">
        {assigned}/{cap}
      </span>
    </div>
  );
}
