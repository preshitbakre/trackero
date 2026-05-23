import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { useRole } from '../hooks/useRole';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { RowSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { PRIORITY_BORDER_COLORS, PRIORITY_BADGE_COLORS, STATUS_BADGE_COLORS, AVATAR_COLORS } from '../lib/colors';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { LabelList } from '../components/ui/LabelBadge';
import { calculateMidpoint } from '../lib/lexorank';

interface BacklogTask {
  id: number;
  itemNumber: number;
  title: string;
  type: string;
  itemType?: string;
  priority: string;
  storyPoints: number | null;
  assigneeId: number | null;
  assignee?: { id: number; displayName: string } | null;
  sortOrder: string;
  parentId: number | null;
  sprintId?: number | null;
  status?: { name: string; color: string; category?: string };
  labels?: { id: number; name: string; color: string }[];
}

interface SprintTarget {
  id: number;
  name: string;
  status: string;
  taskCount: number;
  totalPoints: number;
}

function SortableTaskRow({ task, selected, onSelect, onClick, subtaskCount, collapsed, onToggleCollapse, canEdit = true, sprints = [], onMoveSprint }: {
  task: BacklogTask; selected: boolean; onSelect: (id: number) => void; onClick: () => void;
  subtaskCount?: number; collapsed?: boolean; onToggleCollapse?: () => void; canEdit?: boolean;
  sprints?: SprintTarget[]; onMoveSprint?: (taskId: number, sprintId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: transform && !isDragging ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : undefined,
    borderLeftColor: PRIORITY_BORDER_COLORS[task.priority] || PRIORITY_BORDER_COLORS.none,
    borderLeftWidth: 4,
  };
  const badge = PRIORITY_BADGE_COLORS[task.priority];
  const avatar = task.assignee ? AVATAR_COLORS[task.assignee.id % 4] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-5 py-3.5 rounded-xl ${
        selected ? 'ring-2 ring-[#88A9D6] bg-white' : 'bg-white dark:bg-dneutral-100 hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)]'
      } shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition-all duration-150`}
    >
      {canEdit && (
        <input type="checkbox" checked={selected} onChange={() => onSelect(task.id)} className="w-4 h-4 rounded border-neutral-200" />
      )}
      {canEdit && <span {...listeners} {...attributes} className="cursor-grab text-neutral-300 hover:text-neutral-500">{'\u2807'}</span>}
      {onToggleCollapse ? (
        <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} className="text-neutral-400 hover:text-neutral-600">
          <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : <span className="w-3.5" />}
      <span
        className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: ({ epic: '#7C5CFC35', story: '#88A9D640', task: '#D6B58840', subtask: '#A8A19A35' } as Record<string, string>)[task.itemType || task.type || 'task'] || '#A8A19A35',
          color: ({ epic: '#4A2FC0', story: '#2E5A8E', task: '#7A5E2A', subtask: '#5C5650' } as Record<string, string>)[task.itemType || task.type || 'task'] || '#5C5650',
        }}
      >
        {(task.itemType || task.type || 'task').slice(0, task.itemType === 'subtask' ? 3 : undefined)}
      </span>
      <span className="text-[14px] font-mono text-neutral-300">#{task.itemNumber}</span>
      <span onClick={onClick} className="flex-1 text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700 truncate cursor-pointer hover:text-lilac-dark">{task.title}</span>

      {/* Right-side metadata — muted, secondary to title */}
      {task.status && (
        <span className="flex items-center gap-1.5 text-[14px] text-neutral-400">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.status.color }} />
          {task.status.name}
        </span>
      )}
      {badge && (
        <span className="text-[14px] px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.color }}>
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </span>
      )}
      {task.storyPoints != null && task.storyPoints > 0 && (
        <span className="text-[14px] px-1.5 py-0.5 rounded" style={{ background: '#88A9D625', color: '#3F5E8E' }}>
          {task.storyPoints} pts
        </span>
      )}
      {avatar && task.assignee && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0" style={{ background: avatar.bg, color: avatar.color }}>
          {task.assignee.displayName?.charAt(0)?.toUpperCase() || '?'}
        </div>
      )}
      <LabelList labels={task.labels || []} max={2} />
      {subtaskCount != null && subtaskCount > 0 && collapsed && (
        <span className="text-[14px] text-neutral-400">({subtaskCount})</span>
      )}
      {canEdit && sprints.length > 0 && onMoveSprint && (
        <div className="ml-4 pl-4 border-l border-neutral-200 dark:border-dneutral-300 flex-shrink-0">
        <Select
          value=""
          onChange={(val) => { if (val) onMoveSprint(task.id, parseInt(val)); }}
          placeholder="Choose sprint"
          options={[{ value: '', label: 'Unassigned' }, ...sprints.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
        </div>
      )}
    </div>
  );
}

export function BacklogPage() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [sprints, setSprints] = useState<SprintTarget[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [defaultSubtaskId, setDefaultSubtaskId] = useState<number | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { canEdit } = useRole();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeTask, setActiveTask] = useState<BacklogTask | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const { data: taskData } = await apiClient.get(`/projects/${projectId}/items?itemType=epic,story,task,subtask&limit=300`);
      const allItems: BacklogTask[] = taskData.data.list || [];
      // Backlog items: items with no sprint (epics/stories always have sprint=null or informational)
      // Tasks: only those with no sprint
      // Subtasks: only those whose parent task is in backlog
      const backlogTaskIds = new Set(
        allItems.filter((t) => (t.itemType || t.type) === 'task' && (t.sprintId === null || t.sprintId === undefined)).map((t) => t.id),
      );
      const backlogTasks = allItems.filter((t) => {
        const type = t.itemType || t.type;
        if (type === 'epic' || type === 'story') return t.sprintId === null || t.sprintId === undefined;
        if (type === 'task') return backlogTaskIds.has(t.id);
        if (type === 'subtask') return t.parentId !== null && backlogTaskIds.has(t.parentId);
        return false;
      });
      setTasks(backlogTasks);

      const { data: sprintData } = await apiClient.get(`/projects/${projectId}/sprints?limit=100`);
      const planSprints = (sprintData.data.list || []).filter((s: any) => s.status === 'planning' || s.status === 'active');
      setSprints(planSprints);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => setShowCreate(true);
    document.addEventListener('shortcut-create-item', handler as EventListener);
    return () => document.removeEventListener('shortcut-create-item', handler as EventListener);
  }, []);

  const handleCreated = () => {
    setShowCreate(false);
    loadData();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) return;

    const activeId = active.id as number;
    const overIdNum = over.id as number;
    if (activeId === overIdNum) return;

    const oldIndex = tasks.findIndex((t) => t.id === activeId);
    const newIndex = tasks.findIndex((t) => t.id === overIdNum);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reordered);

    const above = newIndex > 0 ? reordered[newIndex - 1].sortOrder : null;
    const below = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : null;

    const newSortOrder = calculateMidpoint(above ?? null, below ?? null);

    try {
      await apiClient.put(`/projects/${projectId}/items/reorder`, {
        reorders: [{ itemId: activeId, sortOrder: newSortOrder }],
      });
    } catch {
      loadData();
    }
  };

  const handleBulkMoveToSprint = async (sprintId: number) => {
    if (!projectId || selectedIds.size === 0) return;
    for (const taskId of selectedIds) {
      await apiClient.put(`/projects/${projectId}/items/${taskId}/sprint`, { sprintId });
    }
    setSelectedIds(new Set());
    loadData();
  };

  const handleMoveToSprint = async (taskId: number, sprintId: number) => {
    if (!projectId) return;
    await apiClient.put(`/projects/${projectId}/items/${taskId}/sprint`, { sprintId });
    loadData();
  };

  const handleBulkAssignToMe = async () => {
    if (!projectId || selectedIds.size === 0 || !user) return;
    for (const taskId of selectedIds) {
      await apiClient.put(`/projects/${projectId}/items/${taskId}`, { assigneeId: user.id });
    }
    setSelectedIds(new Set());
    loadData();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(new Set());
  const toggleParentCollapse = (id: number) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const subtaskMap = new Map<number, BacklogTask[]>();
  const parentTasks: BacklogTask[] = [];
  for (const t of tasks) {
    if (t.parentId) {
      const list = subtaskMap.get(t.parentId) || [];
      list.push(t);
      subtaskMap.set(t.parentId, list);
    } else {
      parentTasks.push(t);
    }
  }

  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const urgentCount = tasks.filter((t) => t.priority === 'urgent').length;
  const highCount = tasks.filter((t) => t.priority === 'high').length;
  const mediumCount = tasks.filter((t) => t.priority === 'medium').length;

  return (
    <>
    <ReadOnlyBanner />
    <DndContext sensors={canEdit ? sensors : []} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={(e) => { handleDragEnd(e).finally(() => setActiveTask(null)); }}>
    <div className="flex h-full">
      {/* Main backlog list */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* STEP 6: Page header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-serif text-[28px] text-text dark:text-dneutral-700">Backlog</h1>
            <p className="text-[14px] text-neutral-400 mt-0.5">
              {tasks.length} tasks · {totalPoints} pts
              {mediumCount > 0 && <> · <span style={{ color: '#D6B588' }}>{mediumCount} medium</span></>}
              {highCount > 0 && <> · <span style={{ color: '#E88A48' }}>{highCount} high</span></>}
              {urgentCount > 0 && <> · <span style={{ color: '#E05252' }}>{urgentCount} urgent</span></>}
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setShowCreate(true)}>+ Create Task</Button>
          )}
        </div>

        {/* Bulk actions */}
        {canEdit && selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-lilac-tint rounded-lg">
            <span className="text-[16px] font-medium text-lilac-dark">{selectedIds.size} selected</span>
            <Button size="sm" onClick={handleBulkAssignToMe}>Assign to me</Button>
            {sprints.map((s) => (
              <Button key={s.id} size="sm" variant="secondary" onClick={() => handleBulkMoveToSprint(s.id)}>&rarr; {s.name}</Button>
            ))}
            <Button variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear</Button>
          </div>
        )}

        {canEdit && showCreate && projectId && (
          <CreateItemDialog
            projectId={parseInt(projectId)}
            defaultType="task"
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}

        {error && <ErrorState message="Failed to load backlog" onRetry={loadData} />}

        {loading && tasks.length === 0 && !error && (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <RowSkeleton key={i} />)}
          </div>
        )}

        <SortableContext items={parentTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {parentTasks.map((task) => {
              const subtasks = subtaskMap.get(task.id) || [];
              const isCollapsed = collapsedParents.has(task.id);
              return (
                <div key={task.id}>
                  <SortableTaskRow
                    task={task}
                    selected={selectedIds.has(task.id)}
                    onSelect={toggleSelect}
                    onClick={() => { setSelectedTaskId(task.id); setDefaultSubtaskId(undefined); }}
                    subtaskCount={subtasks.length}
                    collapsed={isCollapsed}
                    onToggleCollapse={subtasks.length > 0 ? () => toggleParentCollapse(task.id) : undefined}
                    canEdit={canEdit}
                    sprints={sprints}
                    onMoveSprint={handleMoveToSprint}
                  />
                  {subtasks.length > 0 && !isCollapsed && (
                    <div className="ml-10 mt-2 space-y-2 border-l-2 border-[#88A9D630] dark:border-dneutral-300 pl-5">
                      {subtasks.map((st) => {
                        const stAvatar = st.assignee ? AVATAR_COLORS[st.assignee.id % 4] : null;
                        const stBadge = PRIORITY_BADGE_COLORS[st.priority];
                        return (
                          <div
                            key={st.id}
                            onClick={() => { setSelectedTaskId(task.id); setDefaultSubtaskId(st.id); }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer bg-white dark:bg-dneutral-100/50 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] shadow-[0_1px_6px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.25)] transition-all duration-150"
                          >
                            {canEdit && (
                              <input type="checkbox" checked={selectedIds.has(st.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(st.id); }} className="w-3.5 h-3.5 rounded border-neutral-200" />
                            )}
                            <span className="text-neutral-300 text-[14px]">└</span>
                            <span
                              className="text-[10px] font-semibold uppercase px-1 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: ({ epic: '#7C5CFC35', story: '#88A9D640', task: '#D6B58840', subtask: '#A8A19A35' } as Record<string, string>)[st.itemType || st.type || 'subtask'] || '#A8A19A35',
                                color: ({ epic: '#4A2FC0', story: '#2E5A8E', task: '#7A5E2A', subtask: '#5C5650' } as Record<string, string>)[st.itemType || st.type || 'subtask'] || '#5C5650',
                              }}
                            >sub</span>
                            <span className="text-[14px] font-mono text-neutral-400">#{st.itemNumber}</span>
                            <span className="flex-1 text-[14px] text-neutral-600 dark:text-dneutral-600 truncate">{st.title}</span>
                            {st.status && (() => {
                              const stStatus = STATUS_BADGE_COLORS[st.status.category || 'backlog'] || STATUS_BADGE_COLORS.backlog;
                              return (
                                <span className="flex items-center gap-1.5 text-[14px]" style={{ color: stStatus.color }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stStatus.dot }} />
                                  {st.status.name}
                                </span>
                              );
                            })()}
                            {stBadge && (
                              <span className="text-[14px] px-1 py-0.5 rounded" style={{ background: stBadge.bg, color: stBadge.color }}>{st.priority.charAt(0).toUpperCase() + st.priority.slice(1)}</span>
                            )}
                            {st.storyPoints != null && st.storyPoints > 0 && (
                              <span className="text-[14px] px-1 py-0.5 rounded" style={{ background: '#88A9D630', color: '#3F5E8E' }}>{st.storyPoints} pts</span>
                            )}
                            {stAvatar && st.assignee && (
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: stAvatar.bg, color: stAvatar.color }}>
                                {st.assignee.displayName?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SortableContext>

        {/* STEP 8: Empty state */}
        {tasks.length === 0 && !showCreate && !loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#88D68E40' }}>
              <svg className="w-8 h-8" style={{ color: '#3E8E44' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-medium text-neutral-500 mb-1">Backlog is clear</h3>
            <p className="text-[14px] text-neutral-400">All tasks have been assigned to sprints. Nice work!</p>
          </div>
        )}
      </div>

    </div>

    <DragOverlay dropAnimation={null}>
      {activeTask && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-dneutral-100 shadow-xl opacity-90"
             style={{ borderLeft: `3px solid ${PRIORITY_BORDER_COLORS[activeTask.priority] || PRIORITY_BORDER_COLORS.none}` }}>
          <span className="text-[14px] font-mono text-neutral-400">#{activeTask.itemNumber}</span>
          <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{activeTask.title}</span>
          {activeTask.storyPoints != null && activeTask.storyPoints > 0 && (
            <span className="text-[14px] px-1.5 py-0.5 rounded" style={{ background: '#88A9D630', color: '#3F5E8E' }}>{activeTask.storyPoints} pts</span>
          )}
        </div>
      )}
    </DragOverlay>
    </DndContext>

      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix=""
          defaultSubtaskId={defaultSubtaskId}
          onClose={() => { setSelectedTaskId(null); setDefaultSubtaskId(undefined); }}
          onUpdated={loadData}
        />
      )}
    </>
  );
}
