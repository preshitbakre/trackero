import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/auth.store';
import { StatusColumn } from './StatusColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { CardSkeleton } from '../common/Skeleton';
import { Select } from '../ui/Select';
import { ErrorState } from '../common/ErrorState';

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
  parentId?: number | null;
  parentTaskNumber?: number | null;
}

interface BoardColumn {
  status: { id: number; name: string; category: string; color: string };
  tasks: BoardTask[];
  taskCount: number;
}

export function KanbanBoard({ epicFilter }: { epicFilter?: number } = {}) {
  const { id: projectId } = useParams();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<string>('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [sprints, setSprints] = useState<{ id: number; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role !== 'viewer';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const loadBoard = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (sprintId) params.set('sprintId', sprintId);
      if (epicFilter) params.set('epicId', String(epicFilter));
      if (assignedToMe && user) params.set('assigneeId', String(user.id));
      const { data } = await apiClient.get(`/projects/${projectId}/board?${params}`);
      setColumns(data.data.columns || []);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [projectId, sprintId, epicFilter, assignedToMe, user]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => {
      setSprints((r.data.data.list || []).filter((s: any) => s.status === 'active' || s.status === 'planning'));
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const socket = getSocket();

    const currentUserId = useAuthStore.getState().user?.id;

    const handleBoardMoved = (data: { taskId: number; statusId: number; actorId?: number }) => {
      // Skip if this is our own optimistic update
      if (data.actorId === currentUserId) return;
      setColumns((prev) => {
        const newCols = prev.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== data.taskId),
        }));
        const targetCol = newCols.find((c) => c.status.id === data.statusId);
        // Find the task in old columns
        const task = prev.flatMap((c) => c.tasks).find((t) => t.id === data.taskId);
        if (targetCol && task) {
          targetCol.tasks.push(task);
          targetCol.taskCount = targetCol.tasks.length;
        }
        return newCols;
      });
    };

    const handleTaskCreated = () => loadBoard();
    const handleTaskDeleted = (data: { taskId: number }) => {
      setColumns((prev) => prev.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== data.taskId),
        taskCount: col.tasks.filter((t) => t.id !== data.taskId).length,
      })));
    };

    socket.on('board:moved', handleBoardMoved);
    socket.on('task:created', handleTaskCreated);
    socket.on('task:deleted', handleTaskDeleted);

    return () => {
      socket.off('board:moved', handleBoardMoved);
      socket.off('task:created', handleTaskCreated);
      socket.off('task:deleted', handleTaskDeleted);
    };
  }, [loadBoard]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(event.active.id as number);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !projectId) return;

    const taskId = active.id as number;
    const overId = over.id as string;

    // Determine target status
    let targetStatusId: number;
    if (overId.startsWith('column-')) {
      targetStatusId = parseInt(overId.replace('column-', ''));
    } else {
      // Dropped on another task - find its column
      const col = columns.find((c) => c.tasks.some((t) => t.id === parseInt(overId)));
      if (!col) return;
      targetStatusId = col.status.id;
    }

    // Optimistic update
    setColumns((prev) => {
      const newCols = prev.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== taskId),
      }));
      const targetCol = newCols.find((c) => c.status.id === targetStatusId);
      const task = findTask(taskId);
      if (targetCol && task) {
        targetCol.tasks.push({ ...task, sortOrder: 'n' });
        targetCol.taskCount = targetCol.tasks.length;
      }
      return newCols;
    });

    // API call
    try {
      await apiClient.put(`/projects/${projectId}/board/move`, {
        taskId,
        statusId: targetStatusId,
        sortOrder: 'n',
      });
      // Reload to update subtask counts, WIP counts, etc.
      loadBoard();
    } catch (err: any) {
      // Revert on failure
      alert(err.response?.data?.message || 'Move failed');
      loadBoard();
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Could implement cross-column preview here
  };

  const findTask = (taskId: number): BoardTask | undefined => {
    for (const col of columns) {
      const task = col.tasks.find((t) => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-200 dark:border-dneutral-200">
        <Select
          value={sprintId}
          onChange={setSprintId}
          placeholder="All tasks (no sprint filter)"
          options={[
            { value: '', label: 'All tasks (no sprint filter)' },
            ...sprints.map((s) => ({ value: String(s.id), label: `${s.name} (${s.status})` })),
          ]}
        />
        <button
          onClick={() => setAssignedToMe((v) => !v)}
          className={`text-sm px-3 py-1 rounded-md border ${
            assignedToMe
              ? 'bg-primary-500 text-white border-primary-500'
              : 'border-neutral-200 dark:border-dneutral-300 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
          }`}
        >
          My tasks
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && columns.length === 0 && !error && (
        <div className="flex-1 p-4">
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-[280px] space-y-2 p-2">
                <div className="h-6 w-24 bg-neutral-200 dark:bg-dneutral-200 rounded animate-pulse mb-3" />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && <ErrorState message="Failed to load board" onRetry={loadBoard} />}

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((col) => (
              <StatusColumn
                key={col.status.id}
                status={col.status}
                tasks={col.tasks}
                taskCount={col.taskCount}
                onTaskClick={(taskId) => setSelectedTaskId(taskId)}
                projectId={parseInt(projectId || '0')}
                onTaskCreated={loadBoard}
                canEdit={canEdit}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedTaskId && projectId && (() => {
        // Check if the selected task is a subtask
        const selectedTask = columns.flatMap((c) => c.tasks).find((t) => t.id === selectedTaskId);
        const parentId = selectedTask?.parentId;

        if (parentId) {
          // Subtask: open parent drawer + stacked subtask drawer
          return (
            <TaskDetailPanel
              projectId={parseInt(projectId)}
              taskId={parentId}
              projectPrefix=""
              onClose={() => setSelectedTaskId(null)}
              onUpdated={loadBoard}
              defaultSubtaskId={selectedTaskId}
            />
          );
        }

        return (
          <TaskDetailPanel
            projectId={parseInt(projectId)}
            taskId={selectedTaskId}
            projectPrefix=""
            onClose={() => setSelectedTaskId(null)}
            onUpdated={loadBoard}
          />
        );
      })()}
    </div>
  );
}
