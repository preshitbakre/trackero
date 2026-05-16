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
  status: { id: number; name: string; category: string; color: string };
  tasks: BoardTask[];
  taskCount: number;
  onTaskClick: (taskId: number) => void;
  projectId: number;
  onTaskCreated: () => void;
}

export function StatusColumn({ status, tasks, taskCount, onTaskClick, projectId, onTaskCreated }: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.id}` });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/tasks`, { title: quickTitle });
      setQuickTitle('');
      setShowQuickAdd(false);
      onTaskCreated();
    } catch {}
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[280px] flex-shrink-0 rounded-lg ${
        isOver ? 'bg-brand/5 ring-2 ring-brand/20' : 'bg-gray-50 dark:bg-gray-900/50'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{status.name}</span>
        <span className="text-xs text-gray-400 ml-auto">{taskCount}</span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
        ))}

        {tasks.length === 0 && !showQuickAdd && (
          <div className="text-center py-4 text-xs text-gray-400">No tasks</div>
        )}
      </div>

      {/* Quick add */}
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
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
            <div className="flex gap-1">
              <button type="submit" className="text-xs px-2 py-1 bg-brand text-white rounded">Add</button>
              <button type="button" onClick={() => setShowQuickAdd(false)} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowQuickAdd(true)}
            className="w-full text-left text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}
