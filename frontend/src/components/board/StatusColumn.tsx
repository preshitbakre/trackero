import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { useState } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
      className={`flex flex-col w-[228px] flex-shrink-0 transition-colors duration-150 ${
        isOver
          ? 'bg-[var(--color-lilac-tint)] ring-2 ring-dashed ring-lilac/30'
          : 'bg-[var(--paper)] border border-[var(--line)]'
      }`}
    >
      {/* Column header */}
      <div
        className={`flex items-center gap-2 px-3 pt-3 pb-[10px] border-b border-[var(--line)] ${
          overWip ? 'border-danger/30' : ''
        }`}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
        <span className="text-[12px] font-semibold uppercase tracking-[0.02em] text-ink">{status.name}</span>
        <span className="font-mono text-[11px] text-mute">
          {wipLimit > 0 ? `${taskCount}/${wipLimit}` : taskCount}
        </span>
        {canEdit && (
          <button
            onClick={() => setShowQuickAdd(true)}
            className={`ml-auto w-5 h-5 rounded flex items-center justify-center text-mute hover:bg-[var(--color-lilac-tint)] hover:text-[var(--accent)] transition-opacity duration-100 text-[14px] ${
              headerHover ? 'opacity-100' : 'opacity-0'
            }`}
          >
            +
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-[10px] flex flex-col gap-2 min-h-[100px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
        ))}

        {tasks.length === 0 && !showQuickAdd && (
          <div className="flex flex-col items-center justify-center min-h-[140px] border border-dashed border-[var(--line)]">
            <span className="text-[12px] text-faint">No tasks</span>
            <span className="text-[11px] text-faint mt-1">Drop here or click + to add</span>
          </div>
        )}
      </div>

      {/* Quick add */}
      {canEdit && (
        <div className="px-[10px] pb-[10px]">
          {showQuickAdd ? (
            <form onSubmit={handleQuickAdd} className="space-y-1">
              <Input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Task title…"
                autoFocus
                onBlur={() => !quickTitle && setShowQuickAdd(false)}
                className="!text-[13px] !px-2 !py-1.5"
              />
              <div className="flex gap-1">
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQuickAdd(true)}
              className="w-full !text-[11px] !h-auto !py-1.5 text-faint"
            >
              + Add task
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
