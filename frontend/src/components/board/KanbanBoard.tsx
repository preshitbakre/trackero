import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
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
  const user = useAuthStore((s) => s.user);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkStatusPicker, setShowBulkStatusPicker] = useState(false);
  const [showBulkAssignPicker, setShowBulkAssignPicker] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkStatusChange = async (statusId: number) => {
    if (!projectId || selectedIds.size === 0) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/bulk-status`, {
        itemIds: [...selectedIds],
        statusId,
      });
      setSelectedIds(new Set());
      setShowBulkStatusPicker(false);
      loadBoard();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Bulk status update failed', 'error');
    }
  };

  const handleBulkAssign = async (assigneeId: number | null) => {
    if (!projectId || selectedIds.size === 0) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/bulk-assign`, {
        itemIds: [...selectedIds],
        assigneeId,
      });
      setSelectedIds(new Set());
      setShowBulkAssignPicker(false);
      loadBoard();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Bulk assign failed', 'error');
    }
  };

  const handleBulkAssignToMe = async () => {
    if (!user) return;
    await handleBulkAssign(user.id);
  };

  useEffect(() => {
    if (!showBulkStatusPicker && !showBulkAssignPicker) return;
    const close = () => { setShowBulkStatusPicker(false); setShowBulkAssignPicker(false); };
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [showBulkStatusPicker, showBulkAssignPicker]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const dragRequestSeq = useRef<number>(0);

  const loadBoard = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (sprintId === 'backlog') {
        params.set('backlog', 'true');
      } else if (sprintId === 'all') {
        // No filter — show everything including backlog
      } else if (sprintId) {
        params.set('sprintId', sprintId);
      } else {
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
    const handler = () => loadBoard();
    document.addEventListener('item-created', handler);
    return () => document.removeEventListener('item-created', handler);
  }, [loadBoard]);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => {
      const list = (r.data.data.list || []).filter((s: any) => s.status === 'active' || s.status === 'planning');
      setSprints(list);
      // When the URL doesn't pin a sprint, default to the active sprint, then
      // the first available sprint, then the backlog — never an empty value
      // (the "All sprints"/"All items" options were removed).
      if (!sprintDefaultApplied) {
        const active = list.find((s: any) => s.status === 'active');
        setSprintId(active ? String(active.id) : list[0] ? String(list[0].id) : 'backlog');
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

  const midpoint = (a: string, b: string): string => {
    const base = 'a';
    const pad = (s: string, len: number) => s.padEnd(len, base);
    const maxLen = Math.max(a.length, b.length) + 1;
    const aa = pad(a || base, maxLen);
    const bb = pad(b || '', maxLen);
    let result = '';
    for (let i = 0; i < maxLen; i++) {
      const ca = aa.charCodeAt(i);
      const cb = bb.charCodeAt(i) || (base.charCodeAt(0) + 26);
      const mid = Math.floor((ca + cb) / 2);
      result += String.fromCharCode(mid);
      if (mid > ca) return result;
    }
    return result + 'm';
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as number;
    const overId = String(over.id);

    // Find source column
    const sourceCol = columns.find((c) => c.tasks.some((t) => t.id === taskId));

    // Determine target column and position
    let targetStatusId: number;
    let targetTasks: BoardTask[];

    if (overId.startsWith('column-')) {
      targetStatusId = parseInt(overId.replace('column-', ''));
      const col = columns.find((c) => c.status.id === targetStatusId);
      targetTasks = col ? col.tasks.filter((t) => t.id !== taskId) : [];
    } else {
      const col = columns.find((c) => c.tasks.some((t) => t.id === parseInt(overId)));
      if (!col) { setActiveTask(null); return; }
      targetStatusId = col.status.id;
      targetTasks = col.tasks.filter((t) => t.id !== taskId);
    }

    // Same column, same position — no-op
    if (sourceCol?.status.id === targetStatusId && overId.startsWith('column-')) {
      setActiveTask(null);
      return;
    }

    // Compute sort order based on drop position
    let newSortOrder: string;
    if (overId.startsWith('column-') || targetTasks.length === 0) {
      const last = targetTasks[targetTasks.length - 1];
      newSortOrder = last ? midpoint(last.sortOrder, '') : 'n';
    } else {
      const overIndex = targetTasks.findIndex((t) => t.id === parseInt(overId));
      if (overIndex <= 0) {
        newSortOrder = midpoint('', targetTasks[0].sortOrder);
      } else {
        newSortOrder = midpoint(targetTasks[overIndex - 1].sortOrder, targetTasks[overIndex].sortOrder);
      }
    }

    // Optimistic update
    const task = findTask(taskId);
    if (task) {
      setColumns((prev) => {
        const newCols = prev.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== taskId),
        }));
        const targetCol = newCols.find((c) => c.status.id === targetStatusId);
        if (targetCol) {
          const updatedTask = { ...task, sortOrder: newSortOrder };
          if (overId.startsWith('column-') || targetCol.tasks.length === 0) {
            targetCol.tasks.push(updatedTask);
          } else {
            const idx = targetCol.tasks.findIndex((t) => t.id === parseInt(overId));
            targetCol.tasks.splice(idx >= 0 ? idx : targetCol.tasks.length, 0, updatedTask);
          }
          targetCol.taskCount = targetCol.tasks.length;
        }
        // Update source column count
        const srcCol = newCols.find((c) => c.status.id === sourceCol?.status.id);
        if (srcCol && srcCol.status.id !== targetStatusId) {
          srcCol.taskCount = srcCol.tasks.length;
        }
        return newCols;
      });
    }

    dragRequestSeq.current += 1;
    const myReq = dragRequestSeq.current;

    try {
      await apiClient.put(`/projects/${projectId}/board/move`, {
        itemId: taskId,
        statusId: targetStatusId,
        sortOrder: newSortOrder,
      });
      document.dispatchEvent(new CustomEvent('board:item-moved', { detail: { itemId: taskId } }));
      if (myReq === dragRequestSeq.current) {
        loadBoard();
      }
    } catch (err: any) {
      toast(err.response?.data?.message || 'Move failed', 'error');
      if (myReq === dragRequestSeq.current) {
        loadBoard();
      }
    } finally {
      setActiveTask(null);
    }
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
            { value: 'backlog', label: 'Backlog' },
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
            <KbdKey tone="on-accent">C</KbdKey>
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {canEdit && selectedIds.size > 0 && (
        <div
          className="sticky top-[53px] z-20 flex items-center gap-3 px-6 h-[40px] bg-paper-2 border-b border-rule"
          aria-live="polite"
        >
          <span className="text-[13px] text-text font-medium">
            {selectedIds.size} selected
          </span>

          {/* Status change */}
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setShowBulkStatusPicker((v) => !v)}>
              Change status
            </Button>
            {showBulkStatusPicker && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-rule shadow-lg z-30 min-w-[160px]">
                {columns.map((col) => (
                  <button
                    key={col.status.id}
                    onClick={() => handleBulkStatusChange(col.status.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text hover:bg-lilac-tint text-left"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.status.color }} />
                    {col.status.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign */}
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setShowBulkAssignPicker((v) => !v)}>
              Assign
            </Button>
            {showBulkAssignPicker && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-rule shadow-lg z-30 min-w-[180px] max-h-[240px] overflow-y-auto">
                <button
                  onClick={() => handleBulkAssign(null)}
                  className="w-full px-3 py-2 text-[13px] text-faint hover:bg-lilac-tint text-left"
                >
                  Unassign
                </button>
                {assigneeOptions.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleBulkAssign(m.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text hover:bg-lilac-tint text-left"
                  >
                    <Avatar user={{ id: m.id, displayName: m.name }} size="xs" />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button size="sm" variant="ghost" onClick={handleBulkAssignToMe}>Assign to me</Button>

          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

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
                selectedIds={selectedIds}
                onSelect={canEdit ? toggleSelect : undefined}
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
          onCreated={() => { loadBoard(); }}
        />
      )}
    </div>
  );
}
