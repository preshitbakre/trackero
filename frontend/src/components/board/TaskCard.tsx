import { useDraggable } from '@dnd-kit/core';
import { Tooltip } from '../common/Tooltip';
import { AVATAR_COLORS, PRIORITY_BADGE_COLORS } from '../../lib/colors';
import { TypeTag } from '../ui';
import type { TypeTagKind } from '../ui';

interface BoardTask {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  priority: string;
  assignee: { id: number; displayName: string; avatarUrl: string | null } | null;
  storyPoints: number | null;
  subtaskCount: number;
  subtaskDoneCount: number;
  commentCount: number;
  attachmentCount: number;
  hasBlockers: boolean;
  labels: { id: number; name: string; color: string }[];
  sortOrder: string;
  parentRef: { id: number; itemKey: string; title: string } | null;
  epicColor: string | null;
}

interface TaskCardProps {
  task: BoardTask;
  isDragging?: boolean;
  onClick?: () => void;
}

export function TaskCard({ task, isDragging, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging: isBeingDragged } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties | undefined = isBeingDragged
    ? { opacity: 0.4 }
    : undefined;

  // Frame 5 anatomy: small coloured TypeTag (T/B/S/E/s) opens each row.
  // The wide priority pill that used to dominate the bottom row shrinks to
  // a dot + label, so the title block reads as the primary information.
  const typeName = task.itemType || 'task';
  const typeKind = (typeName as TypeTagKind) || 'task';
  const avatarStyle = task.assignee ? AVATAR_COLORS[task.assignee.id % AVATAR_COLORS.length] : null;
  const initial = task.assignee?.displayName?.charAt(0)?.toUpperCase() || '?';
  const labels = task.labels || [];
  const taskKey = task.itemKey;

  const priorityBadge = PRIORITY_BADGE_COLORS[task.priority];
  const showPriority = task.priority !== 'none' && priorityBadge;
  const showPoints = task.storyPoints != null && task.storyPoints > 0;
  const showSubtasks = task.subtaskCount > 0;
  const hasMetadata = showPriority || showPoints || showSubtasks;

  const allSubtasksDone = showSubtasks && task.subtaskDoneCount === task.subtaskCount;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`p-3 rounded-lg cursor-pointer transition-all duration-150 ${
        task.hasBlockers ? 'border-l-2 border-l-danger' : ''
      } ${
        isDragging
          ? 'shadow-xl opacity-90 scale-105 rotate-1'
          : 'shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:shadow-md dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]'
      } bg-white dark:bg-dneutral-100`}
    >
      {/* Row 1: type icon, task key, assignee avatar */}
      <div className="flex items-center gap-1.5">
        {task.parentRef && (
          <Tooltip label={`Subtask of ${task.parentRef.itemKey}: ${task.parentRef.title}`}>
            <span className="text-neutral-400 dark:text-dneutral-400 text-[14px]">↳</span>
          </Tooltip>
        )}
        <Tooltip label={typeName.charAt(0).toUpperCase() + typeName.slice(1)}>
          <TypeTag kind={typeKind} size="sm" />
        </Tooltip>
        <span className="font-mono text-[12px] text-faint">{taskKey}</span>

        {task.assignee && avatarStyle && (
          <Tooltip label={task.assignee.displayName}>
            <div className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ background: avatarStyle.bg, color: avatarStyle.color }}>
              {task.assignee.avatarUrl ? (
                <img src={task.assignee.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : initial}
            </div>
          </Tooltip>
        )}
      </div>

      {/* Row 2: title */}
      <div className="mt-1.5 flex items-start gap-1">
        {task.hasBlockers && (
          <Tooltip label="Blocked">
            <span className="text-danger text-[14px] mt-0.5">🔒</span>
          </Tooltip>
        )}
        <p className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 line-clamp-2">{task.title}</p>
      </div>

      {/* Row 3: labels */}
      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className="text-[14px] px-1.5 py-0.5 rounded-full border"
              style={{
                backgroundColor: `${label.color}1A`,
                color: label.color,
                borderColor: `${label.color}33`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Row 4: badges */}
      {hasMetadata && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {showPriority && priorityBadge && (
            <span className="inline-flex items-center gap-1 text-[11px] text-mute">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityBadge.color }} />
              {task.priority.toLowerCase()}
            </span>
          )}
          {showPoints && (
            <span className="text-[14px] font-medium px-1.5 py-0.5 rounded" style={{ background: '#D6B58845', color: '#8C6638' }}>
              {task.storyPoints} pts
            </span>
          )}
          {showSubtasks && (
            <Tooltip label={`Subtasks: ${task.subtaskDoneCount} of ${task.subtaskCount} done`}>
              <span className={`text-[14px] flex items-center gap-1 ${
                allSubtasksDone
                  ? 'text-mint dark:text-mint-dm'
                  : 'text-neutral-500 dark:text-dneutral-500'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {task.subtaskDoneCount}/{task.subtaskCount}
              </span>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
