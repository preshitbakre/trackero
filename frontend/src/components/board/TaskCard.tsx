import { useDraggable } from '@dnd-kit/core';
import { Tooltip } from '../common/Tooltip';
import { TypeTag, Avatar } from '../ui';
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
}

interface TaskCardProps {
  task: BoardTask;
  isDragging?: boolean;
  onClick?: () => void;
  selected?: boolean;
  onSelect?: (id: number) => void;
  selectionActive?: boolean;
}

export function TaskCard({ task, isDragging, onClick, selected, onSelect, selectionActive }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging: isBeingDragged } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = isBeingDragged ? { opacity: 0.4 } : {};

  const typeName = task.itemType || 'task';
  const typeKind = (typeName as TypeTagKind) || 'task';
  const labels = task.labels || [];
  const taskKey = task.itemKey;

  const showPoints = task.storyPoints != null && task.storyPoints > 0;
  const showSubtasks = task.subtaskCount > 0;
  const hasMetadata = showPoints || showSubtasks;

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(task.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`relative p-[10px] rounded-[4px] cursor-grab border border-[var(--line)] transition-all duration-150 group/card ${
        task.hasBlockers ? 'border-l-2 border-l-danger' : ''
      } ${
        isDragging
          ? 'shadow-xl opacity-90 scale-105 rotate-1'
          : ''
      } ${selected ? 'bg-lilac-tint/40 ring-1 ring-lilac/30' : 'bg-white'}`}
    >
      {/* Checkbox — top-right corner */}
      {onSelect && (
        <div
          onClick={handleCheckbox}
          className={`absolute top-[6px] right-[6px] z-10 ${selectionActive ? 'block' : 'hidden group-hover/card:block'}`}
        >
          <input
            type="checkbox"
            checked={!!selected}
            readOnly
            className="w-3.5 h-3.5 accent-lilac cursor-pointer"
            aria-label={`Select ${taskKey}`}
          />
        </div>
      )}

      {/* Row 1: type badge + key (+ parent ref) */}
      <div className="flex items-center gap-1.5">
        <Tooltip label={typeName.charAt(0).toUpperCase() + typeName.slice(1)}>
          <TypeTag kind={typeKind} size="sm" />
        </Tooltip>
        <span className="font-mono text-[10.5px] leading-[14.7px] text-mute">{taskKey}</span>

        {task.parentRef && (
          <Tooltip label={`${task.parentRef.itemKey}: ${task.parentRef.title}`}>
            <span className="font-mono text-[10.5px] text-mute">
              <span className="text-[rgb(173,163,186)] mx-0.5">›</span>
              {task.parentRef.itemKey}
            </span>
          </Tooltip>
        )}
      </div>

      {/* Row 2: title */}
      <div className="mt-1.5 flex items-start gap-1">
        {task.hasBlockers && (
          <Tooltip label="Blocked">
            <span className="text-danger text-[13px] mt-0.5">🔒</span>
          </Tooltip>
        )}
        <p className="text-[13px] font-medium leading-[1.35] text-ink line-clamp-2">{task.title}</p>
      </div>

      {/* Row 3: labels */}
      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 leading-[20px] rounded-[2px] border border-[var(--line)]"
              style={{ color: '#443458' }}
            >
              <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Row 4: metadata + avatar */}
      {(hasMetadata || task.assignee) && (
        <div className="flex items-center mt-2">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {showPoints && (
              <span className="font-mono text-[10.5px] text-mute">
                {task.storyPoints} pts
              </span>
            )}
            {showSubtasks && (
              <Tooltip label={`Subtasks: ${task.subtaskDoneCount} of ${task.subtaskCount} done`}>
                <span className="font-mono text-[10.5px] text-mute">
                  {showPoints ? '· ' : ''}{task.subtaskDoneCount}/{task.subtaskCount} sub
                </span>
              </Tooltip>
            )}
          </div>
          {task.assignee && (
            <Tooltip label={task.assignee.displayName}>
              <Avatar
                user={{ id: task.assignee.id, displayName: task.assignee.displayName, avatarUrl: task.assignee.avatarUrl }}
                size="xs"
                className="ml-auto"
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
