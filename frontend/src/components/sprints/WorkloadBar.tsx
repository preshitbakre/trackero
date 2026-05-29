import { Avatar } from '../ui/Avatar';

interface WorkloadBarProps {
  user: { id: number; displayName: string; avatarUrl?: string | null };
  assigned: number;
  done: number;
  inProgress: number;
  capacity: number | null;
}

const DONE_COLOR = '#1F5236';     // forest — completed points
const IN_PROGRESS_COLOR = '#1A1424'; // ink — work in progress
const OVER_COLOR = '#7C3AED';     // accent — points beyond capacity

/**
 * Per-member workload bar for the Sprint Detail sidebar. The bar is a
 * stacked strip — done (green) + in-progress (ink) + over-capacity overflow
 * (accent) — laid over a light track that represents remaining capacity.
 * Over capacity → the assigned/capacity ratio renders in accent.
 */
export function WorkloadBar({ user, assigned, done, inProgress, capacity }: WorkloadBarProps) {
  // Default cap when capacity not set; spec calls this "sane default".
  const cap = capacity ?? 6;
  const over = assigned > cap;
  // The bar spans whichever is larger so the overflow is visible past capacity.
  const denom = Math.max(cap, assigned, 1);
  const w = (n: number) => `${Math.max(0, (n / denom) * 100)}%`;
  const overage = over ? assigned - cap : 0;

  return (
    <div className="flex items-center gap-2 h-[24px]">
      <Avatar user={user} size="xs" />
      <div
        className="flex-1 h-[6px] bg-paper-3 overflow-hidden flex"
        aria-label={over ? `${assigned} of ${cap} — over capacity` : `${assigned} of ${cap}`}
      >
        <div style={{ width: w(done), backgroundColor: DONE_COLOR }} />
        <div style={{ width: w(inProgress), backgroundColor: IN_PROGRESS_COLOR }} />
        {over && <div style={{ width: w(overage), backgroundColor: OVER_COLOR }} />}
      </div>
      <span className={`text-[11px] font-mono w-[28px] text-right ${over ? 'text-lilac' : 'text-mute'}`}>
        {assigned}/{cap}
      </span>
    </div>
  );
}
