import { useDraggable } from '@dnd-kit/core';

interface BoardTask {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  assigneeId: number | null;
  storyPoints: number | null;
  sortOrder: string;
  epicId: number | null;
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
    urgent: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-yellow-400',
    low: 'bg-blue-400',
    none: 'bg-gray-300',
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
      className={`p-3 rounded-lg border bg-white dark:bg-gray-900 cursor-pointer transition-shadow ${
        isDragging
          ? 'shadow-lg border-brand opacity-90'
          : 'border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
        <span>{typeIcons[task.type] || '○'}</span>
        <span className="font-mono">#{task.taskNumber}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-2 mt-2">
        <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
        {task.storyPoints && (
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {task.storyPoints}
          </span>
        )}
      </div>
    </div>
  );
}
