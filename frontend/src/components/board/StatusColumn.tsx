import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { useState } from 'react';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';

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
  const [headerHover, setHeaderHover] = useState(false);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      const res = await apiClient.post(`/projects/${projectId}/items`, { itemType: 'task', title: quickTitle });
      const itemId = res.data.data.item.id;
      if (itemId && res.data.data.item.statusId !== status.id) {
        await apiClient.put(`/projects/${projectId}/board/move`, {
          itemId,
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
      className={`flex flex-col w-[280px] flex-shrink-0 rounded-xl p-2 transition-colors duration-150 ${
        isOver
          ? 'bg-peri-light dark:bg-peri-dm/15 ring-2 ring-dashed ring-peri/30'
          : 'bg-neutral-100/50 dark:bg-dneutral-100/30'
      }`}
    >
      {/* Column header — sticky */}
      <div
        className={`sticky top-0 z-10 flex items-center justify-between py-2 px-1 mb-3 rounded-lg ${
          overWip ? 'bg-red-50/50 dark:bg-red-500/5 px-2' : ''
        }`}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
      >
        <div className="flex items-center">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
          <span className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700 ml-2">{status.name}</span>
          <span className={`ml-2 text-[14px] px-1.5 py-0.5 rounded-full ${
            overWip
              ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400 font-medium'
              : 'bg-neutral-200 text-neutral-600 dark:bg-dneutral-200 dark:text-dneutral-500 font-medium'
          }`}>
            {wipLimit > 0 ? `${taskCount} / ${wipLimit}` : taskCount}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowQuickAdd(true)}
            className={`w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 dark:text-dneutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200 transition-opacity duration-100 ${
              headerHover ? 'opacity-100' : 'opacity-0'
            }`}
          >
            +
          </button>
        )}
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-[100px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
        ))}

        {tasks.length === 0 && !showQuickAdd && (
          <div className="flex flex-col items-center justify-center min-h-[160px] bg-neutral-100/30 dark:bg-dneutral-100/20 rounded-xl">
            <span className="text-[14px] text-neutral-300 dark:text-dneutral-300">No tasks</span>
            <span className="text-[14px] text-neutral-300 dark:text-dneutral-300 mt-1">Drop here or click + to add</span>
          </div>
        )}
      </div>

      {/* Quick add / add task area */}
      {canEdit && (
        <div className="mt-2">
          {showQuickAdd ? (
            <form onSubmit={handleQuickAdd} className="space-y-1">
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Task title..."
                autoFocus
                onBlur={() => !quickTitle && setShowQuickAdd(false)}
                className="w-full text-[16px] px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-peri focus:outline-none focus:ring-2 focus:ring-peri/20"
              />
              <div className="flex gap-1">
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-full py-2 mx-1 rounded-lg text-center text-[14px] cursor-pointer text-neutral-400 hover:bg-neutral-200/50 hover:text-neutral-600 dark:hover:bg-dneutral-300/30 dark:hover:text-dneutral-500 transition-colors duration-150"
            >
              + Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
