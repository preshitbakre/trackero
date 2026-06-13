import { Link } from 'react-router-dom';
import type { StoryListItem } from '../../pages/stories/types';
import { StatusPill } from '../ui/StatusPill';
import type { StatusKey } from '../ui/StatusPill';
import { TypeTag } from '../ui/TypeTag';
import { Avatar } from '../ui/Avatar';
import { LabelList } from '../ui/LabelBadge';
import { MetricNumber } from '../ui/MetricNumber';
import { PRIORITY_BADGE_COLORS } from '../../lib/colors';

// Only urgent surfaces a priority pill on the card (matches the Epics card —
// P1/P2/P3 stay clean; only P0 raises a flag).
const PRIORITY_LABEL: Record<string, string> = { urgent: 'P0' };

function statusColor(cat?: string | null): string {
  switch (cat) {
    case 'done': return '#88D68E';
    case 'in_progress': return '#D6B588';
    case 'in_review': return '#D688D0';
    case 'cancelled': return '#E05252';
    default: return '#A8A1B5';
  }
}

interface Props {
  story: StoryListItem;
  projectId: string | number;
}

/** List card for one story. Whole card links to the detail page. */
export function StoryCard({ story, projectId }: Props) {
  const barColor = story.status?.color || statusColor(story.status?.category);
  const showPriority = story.priority === 'urgent';
  const priorityPill = PRIORITY_BADGE_COLORS[story.priority];
  const pct = story.progress.progressPercent;
  const tasksTotal = story.progress.totalItems;
  const tasksDone = story.progress.completedItems;

  return (
    <Link
      to={`/projects/${projectId}/stories/${story.id}`}
      className="group relative block bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.10)] transition-shadow p-4 pl-5"
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: barColor }} aria-hidden />

      {/* Top row */}
      <div className="flex items-center gap-2">
        <TypeTag kind="story" size="sm" />
        <span className="text-[12px] font-mono text-mute">{story.itemKey}</span>
        <span className="text-faint">·</span>
        {story.status && <StatusPill status={(story.status.category as StatusKey) || 'backlog'} dot caps />}
        {showPriority && priorityPill && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: priorityPill.bg, color: priorityPill.color }}
          >
            {PRIORITY_LABEL[story.priority]}
          </span>
        )}
        <span className="ml-auto">{story.assignee && <Avatar user={story.assignee} size="sm" />}</span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-[16px] font-medium text-text truncate">{story.title}</h3>

      {/* Labels */}
      {story.labels.length > 0 && (
        <div className="mt-1.5">
          <LabelList labels={story.labels} max={3} />
        </div>
      )}

      {/* Progress */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-text">
          <MetricNumber size="sm" italic>
            {tasksDone}
          </MetricNumber>{' '}
          <span className="font-serif italic text-[14px] text-mute">of {tasksTotal} tasks</span>
        </span>
        <span className="text-right text-[13px] text-mute leading-tight">
          {pct}% · {story.progress.completedPoints}/{story.progress.totalPoints}
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
          {story.childBreakdown.tasks} tasks · {story.childBreakdown.bugs} bugs
        </span>
        {story.sprint && <span>{story.sprint.name}</span>}
      </div>
    </Link>
  );
}
