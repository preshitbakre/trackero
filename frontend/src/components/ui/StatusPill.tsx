import { STATUS_BADGE_COLORS } from '../../lib/colors';

/**
 * Status keys the pill understands. The work-status keys mirror
 * `lib/colors.ts` STATUS_BADGE_COLORS; the project-status keys cover
 * the directory + Today surfaces (`on_track`, `planning`, etc).
 */
export type StatusKey =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'
  | 'on_track'
  | 'planning'
  | 'ends_today'
  | 'at_risk'
  | 'idle'
  | 'no_sprint'
  | 'archived'
  | 'active'
  | 'shipped'
  | 'ends_in_days'
  | 'in_flight'
  | 'blocked'
  | 'draft'
  | 'epic_at_risk';

interface StatusPillProps {
  status: StatusKey;
  hint?: string;
  className?: string;
  /** Opt-in leading dot (used on dense story/table rows to match the design). */
  dot?: boolean;
  /** Solid, filled treatment (white uppercase text on the status colour) — used in the sprint-detail header. */
  solid?: boolean;
  /** Full-width block (with `solid`): a left-aligned status bar, used in detail right rails. */
  block?: boolean;
}

const PROJECT_STATUS_PALETTE: Record<string, { bg: string; color: string }> = {
  on_track: { bg: '#88D68E20', color: '#3E8E44' },
  planning: { bg: '#88A9D620', color: '#3F5E8E' },
  ends_today: { bg: '#D6B58830', color: '#8C6638' },
  at_risk: { bg: '#E0525215', color: '#E05252' },
  idle: { bg: '#E8E3F0', color: '#6B6377' },
  no_sprint: { bg: '#E8E3F0', color: '#A8A1B5' },
  archived: { bg: '#E8E3F0', color: '#A8A1B5' },
  active: { bg: '#7C3AED15', color: '#7C3AED' },
  shipped: { bg: '#88D68E20', color: '#3E8E44' },
  ends_in_days: { bg: '#7C3AED15', color: '#6326D6' },
  // Epic lifecycle states (Epics rebuild). `epic_at_risk` is an epic-only amber
  // treatment so the shared red `at_risk` stays unchanged for Today/directory.
  in_flight: { bg: '#7C3AED15', color: '#6326D6' },
  blocked: { bg: '#E0525215', color: '#E05252' },
  draft: { bg: '#E8E3F0', color: '#A8A1B5' },
  epic_at_risk: { bg: '#E88A4818', color: '#B5631F' },
};

const LABELS: Record<StatusKey, string> = {
  backlog: 'backlog',
  todo: 'todo',
  in_progress: 'in progress',
  in_review: 'in review',
  done: 'done',
  cancelled: 'cancelled',
  on_track: 'on track',
  planning: 'planning',
  ends_today: 'ends today',
  at_risk: 'at risk',
  idle: 'idle',
  no_sprint: 'no sprint',
  archived: 'archived',
  active: 'active',
  shipped: 'shipped',
  ends_in_days: 'ends in',
  in_flight: 'in flight',
  blocked: 'blocked',
  draft: 'draft',
  epic_at_risk: 'at risk',
};

/**
 * Lowercase 11px pill that encodes status. Work-status keys (backlog,
 * todo, …) pull from STATUS_BADGE_COLORS so the work-item palette
 * stays a single source of truth; project-status keys (on_track,
 * planning, …) pull from the local map below.
 */
export function StatusPill({ status, hint, className = '', dot = false, solid = false, block = false }: StatusPillProps) {
  const workPalette = (STATUS_BADGE_COLORS as Record<string, { bg: string; color: string }>)[status];
  const palette = workPalette ?? PROJECT_STATUS_PALETTE[status] ?? PROJECT_STATUS_PALETTE.idle;
  const label = LABELS[status];
  const dotColor = (STATUS_BADGE_COLORS as Record<string, { dot?: string }>)[status]?.dot ?? palette.color;

  if (solid) {
    const shape = block
      ? 'flex w-full justify-start rounded-md px-3 py-2'
      : 'inline-flex rounded-[2px] px-2.5 py-1';
    return (
      <span
        className={`items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${shape} ${className}`}
        style={{ backgroundColor: palette.color, color: '#fff' }}
      >
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
        {label}
        {hint ? <span className="ml-1 text-[10px] opacity-80">· {hint}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${className}`}
      style={{ backgroundColor: palette.bg, color: palette.color }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {label}
      {hint ? <span className="ml-1 text-[10px] opacity-80">· {hint}</span> : null}
    </span>
  );
}
