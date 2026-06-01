import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/auth.store';
import { useRole } from '../../hooks/useRole';
import { toast } from '../common/Toast';
import { Select, Button, Avatar, KbdKey } from '../ui';
import { StatusColumn } from './StatusColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { CardSkeleton } from '../common/Skeleton';
import { ErrorState } from '../common/ErrorState';
import { CreateItemDialog } from '../common/CreateItemDialog';
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
}

interface BoardColumn {
  status: { id: number; name: string; category: string; color: string };
  tasks: BoardTask[];
  taskCount: number;
}

export function KanbanBoard({ epicFilter, headerSlot }: { epicFilter?: number; headerSlot?: React.ReactNode } = {}) {
  const { id: projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const selectedTaskId = searchParams.get('task') ? parseInt(searchParams.get('task')!) : null;
  const sprintParam = searchParams.get('sprint');
  // Initial sprint comes from ?sprint= when present. Otherwise we let the
  // sprint-loading effect below pick the active sprint as the default.
  const [sprintId, setSprintId] = useState<string>(sprintParam ?? '');
  const [sprintDefaultApplied, setSprintDefaultApplied] = useState<boolean>(sprintParam !== null);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ id: number; name: string }[]>([]);
  const [sprints, setSprints] = useState<{
    id: number; name: string; status: string;
    startDate: string | null; endDate: string | null;
    totalPoints: number; completedPoints: number;
  }[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { canEdit } = useRole();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragRequestSeq = useRef<number>(0);

  const loadBoard = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (sprintId) {
        params.set('sprintId', sprintId);
      } else {
        // "All sprints" = items currently in any sprint; backlog (sprintId IS NULL) is excluded.
        params.set('hasSprint', 'true');
      }
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
      const list = (r.data.data.list || []).filter((s: any) => s.status === 'active' || s.status === 'planning');
      setSprints(list);
      // When the URL doesn't pin a sprint, default to the active sprint (if any).
      // Falls back to "All sprints" when no active sprint exists.
      if (!sprintDefaultApplied) {
        const active = list.find((s: any) => s.status === 'active');
        if (active) setSprintId(String(active.id));
        setSprintDefaultApplied(true);
      }
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((r) => {
      setAssigneeOptions((r.data.data.list || []).map((o: any) => ({ id: o.value, name: o.label })));
    }).catch((err) => { console.error(err); });
  }, [projectId, sprintDefaultApplied]);

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

  // Identify the active sprint for the editorial header.
  const activeSprint = sprintId
    ? sprints.find((s) => String(s.id) === sprintId)
    : sprints.find((s) => s.status === 'active');
  const sprintMeta = (() => {
    if (!activeSprint) return null;
    const parts: string[] = [];
    if (activeSprint.startDate && activeSprint.endDate) {
      const start = new Date(activeSprint.startDate);
      const end = new Date(activeSprint.endDate);
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const elapsed = Math.max(0, Math.ceil((Date.now() - start.getTime()) / 86400000));
      parts.push(`d${Math.min(elapsed, totalDays)}/${totalDays}`);
      parts.push(`ends ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    }
    parts.push(`${activeSprint.completedPoints}/${activeSprint.totalPoints} pts`);
    return parts.join(' · ');
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-[10px] px-6 py-[14px] border-b border-[var(--line)] bg-white">
        {/* Sprint name + meta */}
        <div className="flex items-center gap-3">
          {activeSprint ? (
            <>
              <span className="font-serif text-[26px] leading-[26px] tracking-[-0.02em] text-ink">
                {activeSprint.name}
              </span>
              {sprintMeta && (
                <span className="font-mono text-[11px] text-mute self-end mb-[2px]">{sprintMeta}</span>
              )}
            </>
          ) : (
            <span className="font-serif text-[26px] leading-[26px] tracking-[-0.02em] text-ink">Board</span>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-rule" />

        {/* Sprint filter */}
        <Select
          value={sprintId}
          onChange={setSprintId}
          options={[
            { value: '', label: 'All sprints' },
            ...sprints.map((s) => ({ value: String(s.id), label: `${s.name} (${s.status})` })),
          ]}
          placeholder="Sprint"
        />

        {/* Assignee filter + selected avatars */}
        <AssigneeMultiSelect
          options={assigneeOptions}
          selected={selectedAssignees}
          onChange={setSelectedAssignees}
        />
        {selectedAssignees.length > 0 && (
          <div className="flex items-center">
            {assigneeOptions
              .filter((m) => selectedAssignees.includes(m.id))
              .slice(0, 5)
              .map((member, i) => (
                <Avatar
                  key={member.id}
                  user={{ id: member.id, displayName: member.name }}
                  size="xs"
                  className={`border-[1.5px] border-white ${i > 0 ? '-ml-2' : ''}`}
                  style={{ zIndex: 5 - i }}
                />
              ))}
          </div>
        )}

        {headerSlot}
        <div className="flex-1" />

        {/* New item */}
        {canEdit && (
          <Button variant="ink" size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
            + New item
            <KbdKey>C</KbdKey>
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && columns.length === 0 && !error && (
        <div className="flex-1 p-4">
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-[228px] space-y-2 p-2">
                <div className="h-6 w-24 bg-neutral-200 rounded animate-pulse mb-3" />
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
        <div className="flex-1 overflow-x-auto p-4 bg-[var(--paper-2)]">
          <div className="flex gap-3 h-full">
            {columns.map((col) => (
              <StatusColumn
                key={col.status.id}
                status={col.status}
                tasks={col.tasks}
                taskCount={col.taskCount}
                onTaskClick={(taskId) => {
                  setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('task', String(taskId)); return p; });
                }}
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

      {selectedTaskId && projectId && (
        <TaskDetailPanel
          key={`task-${selectedTaskId}`}
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix=""
          onClose={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('task'); return p; })}
          onUpdated={loadBoard}
          onNavigateToTask={(id) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('task', String(id)); return p; })}
        />
      )}

      {showCreateDialog && projectId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => { setShowCreateDialog(false); loadBoard(); }}
        />
      )}
    </div>
  );
}
