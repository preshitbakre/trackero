import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { useRole } from '../hooks/useRole';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { RowSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { PRIORITY_BORDER_COLORS, PRIORITY_BADGE_COLORS, STATUS_BADGE_COLORS } from '../lib/colors';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { LabelList } from '../components/ui/LabelBadge';
import { TypeTag } from '../components/ui';
import { calculateMidpoint } from '../lib/lexorank';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Drawer } from '../components/common/Drawer';

interface BacklogTask {
  id: number;
  itemNumber: number;
  itemKey?: string;
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

function SortableTaskRow({ task, selected, highlighted, onSelect, onClick, subtaskCount, collapsed, onToggleCollapse, canEdit = true, sprints = [], onMoveSprint }: {
  task: BacklogTask; selected: boolean; highlighted?: boolean; onSelect: (id: number) => void; onClick: () => void;
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

  const typeKind = (task.itemType || task.type || 'task') as 'task' | 'bug' | 'story' | 'epic' | 'subtask';
  return (
    <div
      ref={setNodeRef}
      style={style}
      // Editorial table row per frame 9: hairline-divided rows, no rounded
      // cards or drop shadows. The lilac-tint selected state matches the
      // design's row-highlight treatment.
      className={`flex items-center gap-3 px-4 py-2 border-b border-rule transition-colors ${
        highlighted ? 'bg-lilac-tint/60' : selected ? 'bg-lilac-tint/40' : 'hover:bg-paper/50'
      }`}
    >
      {canEdit && (
        <input type="checkbox" checked={selected} onChange={() => onSelect(task.id)} className="w-3.5 h-3.5 accent-lilac" aria-label="Select" />
      )}
      {canEdit && (
        <span
          {...listeners}
          {...attributes}
          className="cursor-grab text-faint hover:text-mute text-[14px] leading-none"
          aria-label="Drag to reorder"
        >{'\u2807'}</span>
      )}
      {onToggleCollapse ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          className="text-faint hover:text-text"
          aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
        >
          <svg className={`w-3 h-3 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : <span className="w-3" />}

      <TypeTag kind={typeKind} size="sm" />

      <span onClick={onClick} className="text-[12px] font-mono text-faint flex-shrink-0 w-[90px] cursor-pointer hover:text-lilac-dark">
        {task.itemKey ?? `#${task.itemNumber}`}
      </span>

      <span
        onClick={onClick}
        className="flex-1 min-w-0 text-[14px] text-text truncate cursor-pointer hover:text-lilac-dark"
      >
        {task.title}
      </span>

      <div className="flex-shrink-0 w-[100px] min-w-0">
        <LabelList labels={task.labels || []} max={2} />
      </div>

      {/* Priority — dot + label */}
      {badge ? (
        <div className="flex items-center gap-1.5 flex-shrink-0 w-[70px]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
          <span className="text-[12px] text-mute">{task.priority.toLowerCase()}</span>
        </div>
      ) : (
        <span className="w-[70px] flex-shrink-0 text-[12px] text-faint">—</span>
      )}

      {/* Status — soft inline pill */}
      {task.status && (
        <span className="inline-flex items-center gap-1 text-[11px] text-mute w-[80px] flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.status.color }} />
          <span className="truncate">{task.status.name}</span>
        </span>
      )}

      <span className="text-[13px] tabular-nums text-text w-[40px] text-right flex-shrink-0">
        {task.storyPoints != null && task.storyPoints > 0 ? task.storyPoints : '—'}
      </span>

      <div className="flex-shrink-0 w-7 flex justify-end" title={task.assignee?.displayName}>
        {task.assignee ? (
          <Avatar user={task.assignee} size="xs" />
        ) : (
          <span className="text-faint text-[12px]">—</span>
        )}
      </div>

      {subtaskCount != null && subtaskCount > 0 && collapsed && (
        <span className="text-[11px] text-faint italic w-[60px] flex-shrink-0 text-right">{subtaskCount} sub</span>
      )}

      {canEdit && sprints.length > 0 && onMoveSprint && (
        <div className="flex-shrink-0 w-[140px]">
          <Select
            value=""
            onChange={(val) => { if (val) onMoveSprint(task.id, parseInt(val)); }}
            placeholder="→ Sprint"
            options={[{ value: '', label: '—' }, ...sprints.map((s) => ({ value: String(s.id), label: s.name }))]}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTaskId = searchParams.get('task') ? Number(searchParams.get('task')) : null;
  const selectTask = useCallback((id: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('task', String(id));
      else next.delete('task');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
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
      const { data: taskData } = await apiClient.get(`/projects/${projectId}/items?itemType=epic,story,task,bug,subtask&limit=300`);
      const allItems: BacklogTask[] = taskData.data.list || [];
      const backlogWorkIds = new Set(
        allItems.filter((t) => {
          const tp = t.itemType || t.type;
          return (tp === 'task' || tp === 'bug') && (t.sprintId === null || t.sprintId === undefined);
        }).map((t) => t.id),
      );
      const backlogTasks = allItems.filter((t) => {
        const type = t.itemType || t.type;
        if (type === 'epic' || type === 'story') return true;
        if (type === 'task' || type === 'bug') return backlogWorkIds.has(t.id);
        if (type === 'subtask') return t.parentId !== null && backlogWorkIds.has(t.parentId);
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

  const handleCreated = (createdId?: number) => {
    if (createdId) {
      selectTask(createdId);
    }
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

  const handleBulkDelete = async () => {
    if (!projectId || selectedIds.size === 0) return;
    for (const taskId of selectedIds) {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}`);
    }
    setSelectedIds(new Set());
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
      <div className={`flex-1 flex flex-col overflow-hidden p-6 ${selectedTaskId || showCreate ? 'mr-[480px]' : ''}`}>
        {/* STEP 6: Page header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-4 flex-wrap">
            <h1 className="font-serif text-[36px] text-text">
              Backlog
            </h1>
            <p className="text-[11px] tracking-[0.18em] uppercase font-serif font-semibold text-faint">
              {tasks.length} items · {totalPoints} pts
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
            <Button size="sm" variant="danger" onClick={() => setShowBulkDeleteConfirm(true)}>Delete</Button>
            <Button variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear</Button>
          </div>
        )}

        {error && <ErrorState message="Failed to load backlog" onRetry={loadData} />}

        {loading && tasks.length === 0 && !error && (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <RowSkeleton key={i} />)}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {/* Editorial table header — widths mirror SortableTaskRow flex items */}
        {parentTasks.length > 0 && (
          <div className="sticky top-0 z-10 bg-paper flex items-center gap-3 px-4 pb-1 mb-0 border-b-2 border-rule text-[10px] uppercase tracking-[0.16em] text-faint font-semibold">
            {canEdit && <span className="w-3.5 flex-shrink-0" />}{/* checkbox */}
            {canEdit && <span className="w-3.5 flex-shrink-0" />}{/* drag handle */}
            <span className="w-3 flex-shrink-0" />{/* collapse toggle */}
            <span className="w-4 flex-shrink-0" />{/* type tag */}
            <span className="w-[90px] flex-shrink-0">ID</span>
            <span className="flex-1 min-w-0">Title</span>
            <span className="w-[100px] flex-shrink-0">Labels</span>
            <span className="w-[70px] flex-shrink-0">Priority</span>
            <span className="w-[80px] flex-shrink-0">Status</span>
            <span className="w-[40px] flex-shrink-0 text-right">Pts</span>
            <span className="w-7 flex-shrink-0 text-right">Owner</span>
            {canEdit && sprints.length > 0 && <span className="w-[140px] flex-shrink-0 text-right">Move</span>}
          </div>
        )}
        <SortableContext items={parentTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div>
            {parentTasks.map((task) => {
              const subtasks = subtaskMap.get(task.id) || [];
              const isCollapsed = collapsedParents.has(task.id);
              return (
                <div key={task.id}>
                  <SortableTaskRow
                    task={task}
                    selected={selectedIds.has(task.id)}
                    highlighted={selectedTaskId === task.id}
                    onSelect={toggleSelect}
                    onClick={() => selectTask(task.id)}
                    subtaskCount={subtasks.length}
                    collapsed={isCollapsed}
                    onToggleCollapse={subtasks.length > 0 ? () => toggleParentCollapse(task.id) : undefined}
                    canEdit={canEdit}
                    sprints={sprints}
                    onMoveSprint={handleMoveToSprint}
                  />
                  {subtasks.length > 0 && !isCollapsed && (
                    // Subtasks render as compact indented rows; the design
                    // groups parent + children with a thin left rule so the
                    // structure reads at a glance without extra chrome.
                    <div className="pl-10 border-l border-rule/70">
                      {subtasks.map((st) => {
                        const stBadge = PRIORITY_BADGE_COLORS[st.priority];
                        return (
                          <div
                            key={st.id}
                            className={`flex items-center gap-3 px-4 py-1.5 border-b border-rule/60 transition-colors ${
                              selectedTaskId === st.id ? 'bg-lilac-tint/60' : 'hover:bg-paper/50'
                            }`}
                          >
                            {canEdit && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(st.id)}
                                onChange={(e) => { e.stopPropagation(); toggleSelect(st.id); }}
                                className="w-3.5 h-3.5 accent-lilac"
                                aria-label="Select subtask"
                              />
                            )}
                            <span className="text-faint text-[12px]">└</span>
                            <TypeTag kind="subtask" size="sm" />
                            <span onClick={() => selectTask(st.id)} className="text-[12px] font-mono text-faint w-[90px] flex-shrink-0 cursor-pointer hover:text-lilac-dark">
                              {st.itemKey ?? `#${st.itemNumber}`}
                            </span>
                            <span onClick={() => selectTask(st.id)} className="flex-1 min-w-0 text-[13px] text-text truncate cursor-pointer hover:text-lilac-dark">{st.title}</span>
                            {stBadge ? (
                              <div className="flex items-center gap-1.5 flex-shrink-0 w-[70px]">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stBadge.color }} />
                                <span className="text-[11px] text-mute">{st.priority.toLowerCase()}</span>
                              </div>
                            ) : (
                              <span className="w-[70px] flex-shrink-0 text-[11px] text-faint">—</span>
                            )}
                            {st.status && (() => {
                              const stStatus = STATUS_BADGE_COLORS[st.status.category || 'backlog'] || STATUS_BADGE_COLORS.backlog;
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] w-[80px] flex-shrink-0" style={{ color: stStatus.color }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stStatus.dot }} />
                                  <span className="truncate">{st.status.name}</span>
                                </span>
                              );
                            })()}
                            <span className="text-[13px] tabular-nums text-text w-[40px] text-right flex-shrink-0">
                              {st.storyPoints != null && st.storyPoints > 0 ? st.storyPoints : '—'}
                            </span>
                            <div className="flex-shrink-0 w-7 flex justify-end" title={st.assignee?.displayName}>
                              {st.assignee ? (
                                <Avatar user={st.assignee} size="xs" />
                              ) : (
                                <span className="text-faint text-[11px]">—</span>
                              )}
                            </div>
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

      <Drawer
        open={!!(selectedTaskId || showCreate)}
        onClose={() => { selectTask(null); setShowCreate(false); }}
      >
        {showCreate && projectId ? (
          <CreateItemDialog
            projectId={parseInt(projectId)}
            defaultType="task"
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
            bare
          />
        ) : selectedTaskId && projectId ? (
          <TaskDetailPanel
            projectId={parseInt(projectId)}
            taskId={selectedTaskId}
            projectPrefix=""
            onClose={() => selectTask(null)}
            onUpdated={loadData}
            onNavigateToTask={(id) => selectTask(id)}
            bare
          />
        ) : null}
      </Drawer>

      {showBulkDeleteConfirm && (
        <ConfirmDialog
          title="Delete items"
          message={`Are you sure you want to delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { setShowBulkDeleteConfirm(false); handleBulkDelete(); }}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </>
  );
}
