import { Link } from 'react-router-dom';
import type { EpicListItem } from '../../api/epics';
import { epicStateToPill } from '../../api/epics';
import { StatusPill } from '../ui/StatusPill';
import type { StatusKey } from '../ui/StatusPill';
import { TypeTag } from '../ui/TypeTag';
import { Avatar } from '../ui/Avatar';
import { LabelList } from '../ui/LabelBadge';
import { MetricNumber } from '../ui/MetricNumber';
import { PRIORITY_BADGE_COLORS, PROJECT_STATUS_PALETTE } from '../../lib/colors';

// Only urgent surfaces a priority pill on the card (matches the mockup —
// every visible P1/P2/P3 epic stays clean; only P0 raises a flag).
const PRIORITY_LABEL: Record<string, string> = { urgent: 'P0' };

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  epic: EpicListItem;
  projectId: string | number;
}

/** List card for one epic. Whole card links to the detail page. */
export function EpicCard({ epic, projectId }: Props) {
  const blocked = epic.displayState === 'blocked';
  const pillKey = epicStateToPill(epic.displayState) as StatusKey;
  const barColor = PROJECT_STATUS_PALETTE[pillKey]?.color ?? '#A8A1B5';
  const showPriority = epic.priority === 'urgent';
  const priorityPill = PRIORITY_BADGE_COLORS[epic.priority];
  const pct = epic.progress.progressPercent;

  return (
    <Link
      to={`/projects/${projectId}/epics/${epic.id}`}
      className="group relative block bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.10)] transition-shadow p-4 pl-5"
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: barColor }} aria-hidden />

      {/* Top row */}
      <div className="flex items-center gap-2">
        <TypeTag kind="epic" size="sm" />
        <span className="text-[12px] font-mono text-mute">{epic.itemKey}</span>
        <span className="text-faint">·</span>
        <StatusPill status={pillKey} dot caps />
        {showPriority && priorityPill && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: priorityPill.bg, color: priorityPill.color }}
          >
            {PRIORITY_LABEL[epic.priority]}
          </span>
        )}
        <span className="ml-auto">{epic.lead && <Avatar user={epic.lead} size="sm" />}</span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-[16px] font-medium text-text truncate">{epic.title}</h3>

      {/* Labels */}
      {epic.labels.length > 0 && (
        <div className="mt-1.5">
          <LabelList labels={epic.labels} max={3} />
        </div>
      )}

      {/* Progress */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-text">
          <MetricNumber size="sm" italic>
            {epic.progress.completedItems}
          </MetricNumber>{' '}
          <span className="font-serif italic text-[14px] text-mute">of {epic.progress.totalItems} items</span>
        </span>
        <span className="text-right text-[13px] text-mute leading-tight">
          {pct}% · {epic.progress.completedPoints}/{epic.progress.totalPoints}
          <br />
          <span className="text-faint">pts</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 bg-rule overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>

      {/* Footer */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
        <span>
          {epic.childBreakdown.stories} stories · {epic.childBreakdown.tasks} tasks
        </span>
        {epic.endDate && <span>target {fmtDate(epic.endDate)}</span>}
        {blocked && epic.blockedBy && (
          <span className="text-[#E05252]">⛔ blocked by {epic.blockedBy.key}</span>
        )}
      </div>
    </Link>
  );
}
