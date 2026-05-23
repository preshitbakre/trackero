import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRole } from '../../hooks/useRole';
import { toast } from '../common/Toast';
import { StatusColumn } from './StatusColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { CardSkeleton } from '../common/Skeleton';
import { Select } from '../ui/Select';
import { ErrorState } from '../common/ErrorState';
import { AssigneeMultiSelect } from '../common/AssigneeMultiSelect';

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

interface BoardColumn {
  status: { id: number; name: string; category: string; color: string };
  tasks: BoardTask[];
  taskCount: number;
}

export function KanbanBoard({ epicFilter, headerSlot }: { epicFilter?: number; headerSlot?: React.ReactNode } = {}) {
  const { id: projectId } = useParams();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<string>('');
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ id: number; name: string }[]>([]);
  const [sprints, setSprints] = useState<{ id: number; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { canEdit } = useRole();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const dragRequestSeq = useRef<number>(0);

  const loadBoard = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (sprintId) params.set('sprintId', sprintId);
      if (epicFilter) params.set('epicId', String(epicFilter));
      if (selectedAssignees.length > 0) params.set('assigneeId', selectedAssignees.join(','));
      const { data } = await apiClient.get(`/projects/${projectId}/board?${params}`);
      setColumns(data.data.columns || []);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [projectId, sprintId, epicFilter, selectedAssignees]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => {
      setSprints((r.data.data.list || []).filter((s: any) => s.status === 'active' || s.status === 'planning'));
    }).catch(() => {});
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((r) => {
      setAssigneeOptions((r.data.data.list || []).map((o: any) => ({ id: o.value, name: o.label })));
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const socket = getSocket();

    const currentUserId = useAuthStore.getState().user?.id;

    const handleBoardMoved = (data: { itemId: number; statusId: number; actorId?: number }) => {
      // Skip if this is our own optimistic update
      if (data.actorId === currentUserId) return;
      setColumns((prev) => {
        const newCols = prev.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== data.itemId),
        }));
        const targetCol = newCols.find((c) => c.status.id === data.statusId);
        // Find the task in old columns
        const task = prev.flatMap((c) => c.tasks).find((t) => t.id === data.itemId);
        if (targetCol && task) {
          targetCol.tasks.push(task);
          targetCol.taskCount = targetCol.tasks.length;
        }
        return newCols;
      });
    };

    const handleItemCreated = () => loadBoard();
    const handleItemDeleted = (data: { itemId: number }) => {
      setColumns((prev) => prev.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== data.itemId),
        taskCount: col.tasks.filter((t) => t.id !== data.itemId).length,
      })));
    };

    socket.on('board:moved', handleBoardMoved);
    socket.on('work-item:created', handleItemCreated);
    socket.on('work-item:updated', handleItemCreated);
    socket.on('work-item:deleted', handleItemDeleted);

    return () => {
      socket.off('board:moved', handleBoardMoved);
      socket.off('work-item:created', handleItemCreated);
      socket.off('work-item:updated', handleItemCreated);
      socket.off('work-item:deleted', handleItemDeleted);
    };
  }, [loadBoard]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(event.active.id as number);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as number;
    const overId = over.id as string;

    // Determine target status
    let targetStatusId: number;
    if (overId.startsWith('column-')) {
      targetStatusId = parseInt(overId.replace('column-', ''));
    } else {
      // Dropped on another task - find its column
      const col = columns.find((c) => c.tasks.some((t) => t.id === parseInt(overId)));
      if (!col) { setActiveTask(null); return; }
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

    dragRequestSeq.current += 1;
    const myReq = dragRequestSeq.current;

    // API call
    try {
      await apiClient.put(`/projects/${projectId}/board/move`, {
        itemId: taskId,
        statusId: targetStatusId,
        sortOrder: 'n',
      });
      // Only the latest drag reloads — stale drags skip to avoid clobbering newer optimistic state.
      if (myReq === dragRequestSeq.current) {
        loadBoard();
      }
    } catch (err: any) {
      toast(err.response?.data?.message || 'Move failed', 'error');
      // Still skip reload if a newer drag is in flight; that drag will resync the UI.
      if (myReq === dragRequestSeq.current) {
        loadBoard();
      }
    } finally {
      setActiveTask(null);
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
      <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-transparent dark:bg-transparent">
        {headerSlot}
        <div className="flex-1" />
        <Select
          value={sprintId}
          onChange={setSprintId}
          placeholder="All sprints"
          options={[
            { value: '', label: 'All sprints' },
            ...sprints.map((s) => ({ value: String(s.id), label: `${s.name} (${s.status})` })),
          ]}
        />
        <AssigneeMultiSelect
          options={assigneeOptions}
          selected={selectedAssignees}
          onChange={setSelectedAssignees}
        />
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        <div className="flex-1 overflow-x-auto px-4 py-2 bg-transparent dark:bg-transparent">
          <div className="flex gap-4 h-full">
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
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && <TaskCard task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>

      {selectedTaskId && projectId && (() => {
        // Check if the selected task is a subtask — if so, open parent with subtask stacked
        const selectedTask = columns.flatMap((c) => c.tasks).find((t) => t.id === selectedTaskId);
        const isSubtask = selectedTask?.itemType === 'subtask';

        if (isSubtask && selectedTask?.parentRef?.id) {
          // Open parent drawer with subtask pre-stacked on top
          return (
            <TaskDetailPanel
              projectId={parseInt(projectId)}
              taskId={selectedTask.parentRef.id}
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
