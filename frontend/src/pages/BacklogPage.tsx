import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { ChevronDown, CheckCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { useRole } from '../hooks/useRole';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { KbdKey } from '../components/ui/KbdKey';
import { Eyebrow } from '../components/ui/Eyebrow';
import { PageHeader } from '../components/ui/PageHeader';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { RowSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { PRIORITY_BORDER_COLORS, PRIORITY_BADGE_COLORS } from '../lib/colors';
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

function SortableTaskRow({ task, selected, highlighted, onSelect, onClick, subtaskCount, collapsed, onToggleCollapse, canEdit = true }: {
  task: BacklogTask; selected: boolean; highlighted?: boolean; onSelect: (id: number) => void; onClick: () => void;
  subtaskCount?: number; collapsed?: boolean; onToggleCollapse?: () => void; canEdit?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: transform && !isDragging ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : undefined,
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
      {canEdit ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(task.id)}
          className="w-3.5 h-3.5 accent-lilac flex-shrink-0"
          style={{ width: 20 }}
          aria-label={`Select ${task.itemKey ?? `#${task.itemNumber}`}`}
        />
      ) : (
        <span className="w-[20px] flex-shrink-0" />
      )}
      {canEdit ? (
        <span
          {...listeners}
          {...attributes}
          className="cursor-grab text-faint hover:text-mute text-[14px] leading-none w-[14px] flex-shrink-0 text-center"
          aria-label="Drag to reorder"
        >{'⠇'}</span>
      ) : (
        <span className="w-[14px] flex-shrink-0" />
      )}
      {onToggleCollapse ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          className="text-faint hover:text-text w-[12px] flex-shrink-0"
          aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
        >
          <ChevronDown size={12} className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      ) : <span className="w-[12px] flex-shrink-0" />}

      <span className="w-[20px] flex-shrink-0 flex items-center">
        <TypeTag kind={typeKind} size="sm" />
      </span>

      <span onClick={onClick} className="text-[12px] font-mono text-faint flex-shrink-0 w-[90px] cursor-pointer hover:text-lilac-dark">
        {task.itemKey ?? `#${task.itemNumber}`}
      </span>

      <span
        onClick={onClick}
        className="flex-1 min-w-0 text-[14px] text-text truncate cursor-pointer hover:text-lilac-dark"
      >
        {task.title}
      </span>

      <div className="flex-shrink-0 w-[140px] min-w-0">
        <LabelList labels={task.labels || []} max={2} />
      </div>

      {/* Priority — solid pill in the priority colour with white uppercase text */}
      {badge ? (
        <span className="w-[70px] flex-shrink-0 flex">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-white"
            style={{ backgroundColor: PRIORITY_BORDER_COLORS[task.priority] }}
          >
            {task.priority}
          </span>
        </span>
      ) : (
        <span className="w-[70px] flex-shrink-0 text-[12px] text-faint">—</span>
      )}

      <span className="text-[13px] tabular-nums text-text w-[40px] text-right flex-shrink-0">
        {task.storyPoints != null && task.storyPoints > 0 ? task.storyPoints : '—'}
      </span>

      <div className="flex-shrink-0 w-[50px] flex justify-center" title={task.assignee?.displayName}>
        {task.assignee ? (
          <Avatar user={task.assignee} size="xs" />
        ) : (
          <span className="text-faint text-[13px]">—</span>
        )}
      </div>

      {subtaskCount != null && subtaskCount > 0 && collapsed && (
        <span className="text-[11px] text-faint italic w-[60px] flex-shrink-0 text-right">{subtaskCount} sub</span>
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
  const { canEdit, canAdminister } = useRole();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: canEdit ? 5 : Infinity } }));
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
      const { data: taskData } = await apiClient.get(`/projects/${projectId}/items?itemType=story,task,bug,subtask&backlog=true&limit=300`);
      const backlogTasks: BacklogTask[] = taskData.data.list || [];
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
    const handler = (e: Event) => {
      e.preventDefault();
      selectTask(null);
      setShowCreate(true);
    };
    document.addEventListener('shortcut-create-item', handler);
    return () => document.removeEventListener('shortcut-create-item', handler);
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

  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);

  useEffect(() => {
    if (!showAssignPicker) return;
    const close = () => setShowAssignPicker(false);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [showAssignPicker]);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((r) => {
      setMembers((r.data.data.list || []).map((o: any) => ({ id: o.value, name: o.label })));
    }).catch(() => {});
  }, [projectId]);

  const handleBulkMoveToSprint = async (sprintId: number) => {
    if (!projectId || selectedIds.size === 0) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/bulk-sprint`, {
        itemIds: [...selectedIds],
        sprintId,
      });
    } catch { /* toast or ignore */ }
    setSelectedIds(new Set());
    loadData();
  };

  const handleBulkDelete = async () => {
    if (!projectId || selectedIds.size === 0) return;
    try {
      await apiClient.post(`/projects/${projectId}/items/bulk-delete`, {
        itemIds: [...selectedIds],
        hard: !!canAdminister,
      });
    } catch { /* toast or ignore */ }
    setSelectedIds(new Set());
    loadData();
  };

  const handleBulkAssign = async (assigneeId: number | null) => {
    if (!projectId || selectedIds.size === 0) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/bulk-assign`, {
        itemIds: [...selectedIds],
        assigneeId,
      });
    } catch { /* toast or ignore */ }
    setSelectedIds(new Set());
    setShowAssignPicker(false);
    loadData();
  };

  const handleBulkAssignToMe = async () => {
    if (!user) return;
    await handleBulkAssign(user.id);
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

  // Summary metrics. `inSprintCount` reflects items currently held in a sprint
  // — useful context even on a "backlog" view that may include items that have
  // been pulled into a sprint but not yet completed.
  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const inSprintCount = tasks.filter((t) => t.sprintId != null).length;

  // Points sum for the currently selected items — drives the bulk action bar.
  const selectedPoints = parentTasks
    .filter((t) => selectedIds.has(t.id))
    .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  // Preferred sprint target for the "Move to Sprint" bulk action. Prefer
  // active over planning so the most-relevant sprint is suggested first.
  const moveTargetSprint = sprints.find((s) => s.status === 'active') || sprints.find((s) => s.status === 'planning') || null;

  return (
    <>
    <ReadOnlyBanner />
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={(e) => { handleDragEnd(e).finally(() => setActiveTask(null)); }}>
    <div className="flex h-full">
      {/* Main backlog list */}
      <div className={`flex-1 flex flex-col overflow-hidden ${selectedTaskId || showCreate ? 'mr-[480px]' : ''}`}>
        {/* Page header with summary eyebrow */}
        <PageHeader className="flex items-center justify-between">
          <div className="flex items-baseline gap-4 flex-wrap">
            <h1 className="font-serif text-[36px] text-text">
              Backlog
            </h1>
            <Eyebrow>
              {tasks.length} items · {totalPoints} pts · {inSprintCount} in sprint
            </Eyebrow>
          </div>
          {canEdit && (
            <Button variant="ink" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
              + Create Task <KbdKey tone="on-accent">C</KbdKey>
            </Button>
          )}
        </PageHeader>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 px-[28px] pt-4">
        {/* Bulk action bar — appears only when items are selected */}
        {canEdit && selectedIds.size > 0 && (
          <div
            className="flex items-center gap-3 px-4 h-[40px] bg-paper-2 border-b border-rule"
            aria-live="polite"
          >
            <span className="text-[13px] text-text font-medium">
              {selectedIds.size} selected · {selectedPoints} pts
            </span>
            <Button size="sm" variant="ghost" onClick={handleBulkAssignToMe}>Assign to me</Button>
            <div className="relative">
              <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowAssignPicker((v) => !v); }}>Assign to...</Button>
              {showAssignPicker && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-rule shadow-lg z-30 min-w-[180px] max-h-[240px] overflow-y-auto">
                  <button
                    onClick={() => handleBulkAssign(null)}
                    className="w-full px-3 py-2 text-[13px] text-faint hover:bg-lilac-tint text-left"
                  >
                    Unassign
                  </button>
                  {members.map((m) => (
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
            {moveTargetSprint && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleBulkMoveToSprint(moveTargetSprint.id)}
              >
                → Move to Sprint {moveTargetSprint.name}
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setShowBulkDeleteConfirm(true)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear</Button>
          </div>
        )}

        {error && <ErrorState message="Failed to load backlog" onRetry={loadData} />}

        {loading && tasks.length === 0 && !error && (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <RowSkeleton key={i} />)}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {/* Editorial column header — widths mirror SortableTaskRow exactly */}
        {parentTasks.length > 0 && (
          <div
            className="sticky top-0 z-10 bg-paper flex items-center gap-3 px-4 h-[26px] border-b border-rule-2 text-mute text-[10px] font-semibold tracking-[0.1em] uppercase"
            role="row"
          >
            <span className="w-[20px] flex-shrink-0" role="columnheader" />{/* checkbox */}
            <span className="w-[14px] flex-shrink-0" role="columnheader" />{/* drag handle */}
            <span className="w-[12px] flex-shrink-0" role="columnheader" />{/* collapse toggle */}
            <span className="w-[20px] flex-shrink-0" role="columnheader" />{/* type tag */}
            <span className="w-[90px] flex-shrink-0" role="columnheader">ID</span>
            <span className="flex-1 min-w-0" role="columnheader">Title</span>
            <span className="w-[140px] flex-shrink-0" role="columnheader">Labels</span>
            <span className="w-[70px] flex-shrink-0" role="columnheader">Priority</span>
            <span className="w-[40px] flex-shrink-0 text-right" role="columnheader">Pts</span>
            <span className="w-[50px] flex-shrink-0 text-center" role="columnheader">Owner</span>
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
                              <span className="w-[70px] flex-shrink-0 flex">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-white"
                                  style={{ backgroundColor: PRIORITY_BORDER_COLORS[st.priority] }}
                                >
                                  {st.priority}
                                </span>
                              </span>
                            ) : (
                              <span className="w-[70px] flex-shrink-0 text-[11px] text-faint">—</span>
                            )}
                            <span className="text-[13px] tabular-nums text-text w-[40px] text-right flex-shrink-0">
                              {st.storyPoints != null && st.storyPoints > 0 ? st.storyPoints : '—'}
                            </span>
                            <div className="flex-shrink-0 w-[50px] flex justify-center" title={st.assignee?.displayName}>
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

        {/* Empty state */}
        {tasks.length === 0 && !showCreate && !loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#88D68E40' }}>
              <CheckCircle size={32} style={{ color: '#3E8E44' }} strokeWidth={1.5} />
            </div>
            <h3 className="text-[16px] font-medium text-neutral-500 mb-1">Backlog is clear</h3>
            <p className="text-[14px] text-neutral-400">All tasks have been assigned to sprints. Nice work!</p>
          </div>
        )}
        </div>
        </div>
      </div>

    </div>

    <DragOverlay dropAnimation={null}>
      {activeTask && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white shadow-xl opacity-90">
          <span className="text-[14px] font-mono text-neutral-400">#{activeTask.itemNumber}</span>
          <span className="text-[16px] text-neutral-700 truncate">{activeTask.title}</span>
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
          message={canAdminister
            ? `Are you sure you want to permanently delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`
            : `Are you sure you want to delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}? Items can be restored within 7 days.`}
          confirmLabel={canAdminister ? 'Delete permanently' : 'Delete'}
          danger
          onConfirm={() => { setShowBulkDeleteConfirm(false); handleBulkDelete(); }}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </>
  );
}
