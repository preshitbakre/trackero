import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { useState } from 'react';
import { apiClient } from '../../api/client';

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

interface StatusColumnProps {
  status: { id: number; name: string; category: string; color: string; wipLimit?: number };
  tasks: BoardTask[];
  taskCount: number;
  onTaskClick: (taskId: number) => void;
  projectId: number;
  onTaskCreated: () => void;
  canEdit?: boolean;
}

export function StatusColumn({ status, tasks, taskCount, onTaskClick, projectId, onTaskCreated, canEdit = true }: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.id}` });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      const res = await apiClient.post(`/projects/${projectId}/tasks`, { title: quickTitle });
      const taskId = res.data.data.item.id;
      // Move to this column's status if not the default
      if (taskId && res.data.data.item.statusId !== status.id) {
        await apiClient.put(`/projects/${projectId}/board/move`, {
          taskId,
          statusId: status.id,
          sortOrder: 'n',
        });
      }
      setQuickTitle('');
      setShowQuickAdd(false);
      onTaskCreated();
    } catch {}
  };

  const wipLimit = status.wipLimit || 0;
  const overWip = wipLimit > 0 && taskCount > wipLimit;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[280px] flex-shrink-0 rounded-lg ${
        isOver ? 'bg-primary-50 ring-2 ring-primary-200' : overWip ? 'bg-danger/5 dark:bg-danger/5' : 'bg-neutral-50 dark:bg-dneutral-100'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium text-neutral-600 dark:text-dneutral-600">{status.name}</span>
        <span className={`text-sm ml-auto ${overWip ? 'text-danger font-medium' : 'text-neutral-400'}`}>
          {wipLimit > 0 ? `${taskCount}/${wipLimit}` : taskCount}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
        ))}

        {tasks.length === 0 && !showQuickAdd && (
          <div className="text-center py-4 text-sm text-neutral-400">No tasks</div>
        )}
      </div>

      {/* Quick add */}
      {canEdit && (
        <div className="px-2 pb-2">
          {showQuickAdd ? (
            <form onSubmit={handleQuickAdd} className="space-y-1">
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Task title..."
                autoFocus
                onBlur={() => !quickTitle && setShowQuickAdd(false)}
                className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 text-neutral-700 dark:text-dneutral-700"
              />
              <div className="flex gap-1">
                <button type="submit" className="text-sm px-2 py-1 bg-primary-500 text-white rounded">Add</button>
                <button type="button" onClick={() => setShowQuickAdd(false)} className="text-sm px-2 py-1 text-neutral-400">Cancel</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-full text-left text-sm text-neutral-400 hover:text-neutral-500 dark:hover:text-dneutral-600 px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200"
            >
              + Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
