import { useDraggable } from '@dnd-kit/core';
import { Tooltip } from '../common/Tooltip';

interface BoardTask {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  assigneeId: number | null;
  assignee?: { id: number; displayName: string; avatarUrl?: string | null } | null;
  storyPoints: number | null;
  sortOrder: string;
  epicId: number | null;
  parentId?: number | null;
  parentTaskNumber?: number | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  hasBlockers?: boolean;
}

interface TaskCardProps {
  task: BoardTask;
  isDragging?: boolean;
  onClick?: () => void;
}

export function TaskCard({ task, isDragging, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const priorityColors: Record<string, string> = {
    urgent: 'bg-priority-urgent',
    high: 'bg-priority-high',
    medium: 'bg-priority-medium',
    low: 'bg-priority-low',
    none: 'bg-priority-none',
  };

  const typeIcons: Record<string, string> = {
    task: '○',
    bug: '●',
    story: '◆',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`p-3 rounded-lg border bg-neutral-50 dark:bg-dneutral-100 cursor-pointer transition-shadow ${
        isDragging
          ? 'shadow-lg border-primary-500 opacity-90'
          : 'border-neutral-200 dark:border-dneutral-300 hover:shadow-md hover:border-neutral-200 dark:hover:border-dneutral-300'
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm text-neutral-400 mb-1">
        {task.parentId && (
          <Tooltip label={`Subtask of #${task.parentTaskNumber}`}>
            <span className="text-neutral-400">↳</span>
          </Tooltip>
        )}
        <Tooltip label={task.type.charAt(0).toUpperCase() + task.type.slice(1)}>
          <span className={task.type === 'bug' ? 'text-danger' : task.type === 'story' ? 'text-primary-400' : ''}>
            {typeIcons[task.type] || '○'}
          </span>
        </Tooltip>
        <span className="font-mono">#{task.taskNumber}</span>
        {task.hasBlockers && (
          <Tooltip label="Blocked">
            <span className="text-danger">🔒</span>
          </Tooltip>
        )}
        {task.assignee && (
          <span className="ml-auto text-sm px-2 py-0.5 rounded-full bg-primary-100 dark:bg-dprimary-100 text-primary-600 dark:text-dprimary-600 truncate max-w-[120px]">
            {task.assignee.displayName}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-neutral-700 dark:text-dneutral-700 line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-2 mt-2">
        <Tooltip label={`Priority: ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`}>
          <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
        </Tooltip>
        {task.storyPoints != null && task.storyPoints > 0 && (
          <span className="text-sm text-neutral-400 bg-neutral-100 dark:bg-dneutral-200 px-1.5 py-0.5 rounded">
            {task.storyPoints}pts
          </span>
        )}
        {task.subtaskCount != null && task.subtaskCount > 0 && (
          <Tooltip label={`Subtasks: ${task.subtaskDoneCount} of ${task.subtaskCount} done`}>
            <span className="text-sm text-neutral-400">☑ {task.subtaskDoneCount}/{task.subtaskCount}</span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
