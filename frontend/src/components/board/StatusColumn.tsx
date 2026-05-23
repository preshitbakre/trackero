import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { useState } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
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
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to create task', 'error');
    }
  };

  const wipLimit = status.wipLimit || 0;
  const overWip = wipLimit > 0 && taskCount > wipLimit;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[300px] flex-shrink-0 rounded-xl p-3 transition-colors duration-150 ${
        isOver
          ? 'bg-lilac-tint ring-2 ring-dashed ring-lilac/30'
          : 'bg-card/60 dark:bg-dneutral-100/30'
      }`}
    >
      {/* Column header — sticky */}
      <div
        className={`sticky top-0 z-10 flex items-center justify-between pb-3 mb-2 border-b border-rule ${
          overWip ? 'border-danger/30' : ''
        }`}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text dark:text-dneutral-700">{status.name}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
            overWip
              ? 'bg-danger/15 text-danger'
              : 'bg-rule text-mute dark:bg-dneutral-200 dark:text-dneutral-500'
          }`}>
            {wipLimit > 0 ? `${taskCount} / ${wipLimit}` : taskCount}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowQuickAdd(true)}
            className={`w-6 h-6 rounded-md flex items-center justify-center text-mute hover:bg-lilac-tint hover:text-lilac-dark transition-opacity duration-100 ${
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
          <div className="flex flex-col items-center justify-center min-h-[140px] rounded-xl border border-dashed border-rule">
            <span className="text-[12px] text-faint">No tasks</span>
            <span className="text-[11px] text-faint mt-1">Drop here or click + to add</span>
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
                placeholder="Task title…"
                autoFocus
                onBlur={() => !quickTitle && setShowQuickAdd(false)}
                className="w-full text-[14px] px-2 py-1.5 rounded-lg border border-rule bg-card text-text placeholder-faint focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac/20"
              />
              <div className="flex gap-1">
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-full py-2 rounded-lg text-center text-[12px] cursor-pointer text-faint hover:bg-lilac-tint hover:text-lilac-dark transition-colors duration-150"
            >
              + Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
