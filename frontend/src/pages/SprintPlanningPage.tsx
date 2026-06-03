import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { LabelList } from '../components/ui/LabelBadge';
import { toast } from '../components/common/Toast';
import { TypeTag } from '../components/ui/TypeTag';
import { PageHeader } from '../components/ui/PageHeader';
import type { TypeTagKind } from '../components/ui/TypeTag';

interface PlanTask {
  id: number;
  itemNumber: number;
  itemKey?: string;
  title: string;
  itemType: string;
  priority: string;
  storyPoints: number | null;
  sprintId?: number | null;
  parentId?: number | null;
  childCount?: number;
  labels?: { id: number; name: string; color: string }[];
  assignee?: { id: number; displayName: string; avatarUrl?: string } | null;
}

function DraggableTask({ task, readOnly, subtaskCount, showAssignee }: { task: PlanTask; readOnly?: boolean; subtaskCount?: number; showAssignee?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: readOnly });
  const style: React.CSSProperties = {
    transform: transform && !isDragging ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };
  const priorityColors: Record<string, string> = { urgent: 'bg-priority-urgent', high: 'bg-priority-high', medium: 'bg-priority-medium', low: 'bg-priority-low', none: 'bg-priority-none' };

  return (
    <div ref={setNodeRef} style={style} {...(readOnly ? {} : listeners)} {...attributes}
      className={`flex items-center gap-2 px-3 py-2 border-b border-rule bg-transparent ${readOnly ? 'cursor-default' : 'cursor-grab'}`}
    >
      <TypeTag kind={(task.itemType || 'task') as TypeTagKind} size="sm" />
      <span className="text-[14px] font-mono text-mute flex-shrink-0">{task.itemKey || `#${task.itemNumber}`}</span>
      <span className="flex-1 text-[14px] truncate text-text">{task.title}</span>
      <LabelList labels={task.labels || []} max={2} />
      {showAssignee && task.assignee && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-lilac text-white flex-shrink-0"
          style={{ width: 22, height: 22, fontSize: 10, fontWeight: 600 }}
          title={task.assignee.displayName}
        >
          {initials(task.assignee.displayName)}
        </span>
      )}
      {subtaskCount != null && subtaskCount > 0 && (
        <span className="text-[12px] text-neutral-400 flex-shrink-0">{subtaskCount} sub</span>
      )}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority]}`} />
      {task.storyPoints != null && task.storyPoints > 0 && (
        <span className="text-[14px] text-neutral-400 flex-shrink-0">{task.storyPoints}</span>
      )}
    </div>
  );
}

function SubtaskRow({ subtask }: { subtask: PlanTask }) {
  // Subtasks are read-only on the planning surface — they inherit the parent's
  // sprint. Rendered indented under the parent so the planner sees the full
  // breakdown without being able to drag them independently.
  return (
    <div className="flex items-center gap-2 pl-9 pr-3 py-1.5 border-b border-rule/40 bg-transparent">
      <TypeTag kind="subtask" size="sm" />
      <span className="text-[12px] font-mono text-mute flex-shrink-0">{subtask.itemKey || `#${subtask.itemNumber}`}</span>
      <span className="flex-1 text-[12px] truncate text-mute">{subtask.title}</span>
      {subtask.storyPoints != null && subtask.storyPoints > 0 && (
        <span className="text-[12px] text-faint flex-shrink-0">{subtask.storyPoints}</span>
      )}
    </div>
  );
}

function DroppableZone({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex-1 min-h-0 rounded-xl p-3 overflow-y-auto transition-colors ${isOver ? 'bg-lilac-tint ring-2 ring-dashed ring-lilac/30' : 'border border-dashed border-rule'}`}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-faint mb-2">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function SprintPlanningPage() {
  const { id: projectId, sprintId } = useParams();
  const [sprint, setSprint] = useState<any>(null);
  const [backlogItems, setBacklogItems] = useState<PlanTask[]>([]);
  const [sprintItems, setSprintItems] = useState<PlanTask[]>([]);
  const [subtaskCounts, setSubtaskCounts] = useState<Map<number, number>>(new Map());
  const [subtasksByParent, setSubtasksByParent] = useState<Map<number, PlanTask[]>>(new Map());
  const [starting, setStarting] = useState(false);

  const { isReadOnly: roleReadOnly, canManageProject } = useRole();
  // Completed/cancelled sprints are immutable here — no drops, no save.
  const isSprintLocked = sprint?.status === 'completed' || sprint?.status === 'cancelled';
  const isReadOnly = roleReadOnly || isSprintLocked;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeTask, setActiveTask] = useState<PlanTask | null>(null);
  const dragRequestSeq = useRef<number>(0);

  const handleDragStart = (event: DragStartEvent) => {
    const all = [...backlogItems, ...sprintItems];
    setActiveTask(all.find((t) => t.id === event.active.id) || null);
  };

  const loadData = useCallback(async () => {
    if (!projectId || !sprintId) return;
    try {
      const [sprintRes, itemsRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/sprints/${sprintId}`),
        apiClient.get(`/projects/${projectId}/items?itemType=epic,story,task,bug&limit=200`),
      ]);
      setSprint(sprintRes.data.data);
      const allItems: PlanTask[] = (itemsRes.data.data.list || []).map((i: any) => ({
        ...i,
        itemType: i.itemType || i.type || 'task',
      }));

      // Subtasks: fetch and group by parentId. The planner sees them nested
      // under their parent so the full work breakdown is visible while choosing
      // what to commit. Subtasks themselves are read-only here — they inherit
      // the parent's sprint, so dragging them independently makes no sense.
      const counts = new Map<number, number>();
      const byParent = new Map<number, PlanTask[]>();
      const subRes = await apiClient.get(`/projects/${projectId}/items?itemType=subtask&limit=500`);
      const subtasks: PlanTask[] = (subRes.data.data.list || []).map((s: any) => ({
        ...s,
        itemType: s.itemType || s.type || 'subtask',
      }));
      for (const st of subtasks) {
        if (!st.parentId) continue;
        counts.set(st.parentId, (counts.get(st.parentId) || 0) + 1);
        const list = byParent.get(st.parentId) || [];
        list.push(st);
        byParent.set(st.parentId, list);
      }
      setSubtaskCounts(counts);
      setSubtasksByParent(byParent);

      setBacklogItems(allItems.filter((t) => t.sprintId === null || t.sprintId === undefined));
      setSprintItems(allItems.filter((t) => t.sprintId === parseInt(sprintId!)));
    } catch (err) { console.error(err); }
  }, [projectId, sprintId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    document.addEventListener('item-created', handler);
    return () => document.removeEventListener('item-created', handler);
  }, [loadData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) return;
    if (isSprintLocked) return;

    const taskId = active.id as number;
    const target = String(over.id);

    let zone: 'sprint' | 'backlog' | null = null;
    if (target === 'sprint-zone') {
      zone = 'sprint';
    } else if (target === 'backlog-zone') {
      zone = 'backlog';
    } else {
      const overId = Number(over.id);
      if (sprintItems.some((t) => t.id === overId)) zone = 'sprint';
      else if (backlogItems.some((t) => t.id === overId)) zone = 'backlog';
    }

    if (!zone) return;

    const isAlreadyInSprint = sprintItems.some((t) => t.id === taskId);
    if (zone === 'sprint' && isAlreadyInSprint) return;
    if (zone === 'backlog' && !isAlreadyInSprint) return;

    dragRequestSeq.current += 1;
    const myReq = dragRequestSeq.current;

    try {
      if (zone === 'sprint') {
        await apiClient.put(`/projects/${projectId}/items/${taskId}/sprint`, { sprintId: parseInt(sprintId!) });
      } else {
        await apiClient.put(`/projects/${projectId}/items/${taskId}/sprint`, { sprintId: null });
      }
    } catch (err: any) {
      toast(err.response?.data?.message || 'Move failed', 'error');
    } finally {
      // Only the latest drag reloads — stale drags skip to avoid clobbering newer state.
      if (myReq === dragRequestSeq.current) {
        loadData();
      }
    }
  };

  const committedPoints = sprintItems.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const backlogPoints = backlogItems.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const startLabel = (() => {
    const start = sprint?.startDate ?? sprint?.start_date;
    if (!start) return null;
    const d = new Date(start);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  })();
  const lengthDays = (() => {
    const s = sprint?.startDate ?? sprint?.start_date;
    const e = sprint?.endDate ?? sprint?.end_date;
    if (!s || !e) return null;
    return Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86_400_000));
  })();

  return (
    <div className="h-full flex flex-col">
      <PageHeader>
      <Link to={`/projects/${projectId}/sprints`} className="text-[12px] text-mute hover:text-text inline-block mb-3">← Sprints</Link>

      {/* Editorial header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-faint mb-1">
            {sprint?.status === 'active' ? 'MID-SPRINT SCOPE CHANGE' : 'PLANNING'}
            {startLabel ? ` · ${sprint?.status === 'active' ? 'STARTED' : 'STARTS'} ${startLabel}` : ''}
            {lengthDays ? ` · ${lengthDays} DAYS` : ''}
          </div>
          <h1 className="font-serif text-[36px] text-text">
            {sprint?.name || 'Sprint'}
            {sprint?.goal && <span className="italic"> — &ldquo;{sprint.goal}&rdquo;</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sprint?.status === 'active' && (
            <Link
              to={`/projects/${projectId}/sprints/${sprintId}`}
              className="px-4 h-9 inline-flex items-center rounded-md bg-card text-text border border-rule hover:bg-paper text-[13px] font-medium"
            >
              ← Back to sprint
            </Link>
          )}
          {sprint?.status === 'planning' && canManageProject && (
            <button
              type="button"
              disabled={isReadOnly}
              onClick={async () => {
                if (!projectId || !sprintId) return;
                try {
                  await apiClient.put(`/projects/${projectId}/sprints/${sprintId}`, {
                    name: sprint?.name,
                    goal: sprint?.goal ?? null,
                  });
                  toast('Draft saved.', 'success');
                } catch (err: any) {
                  toast(err.response?.data?.message || 'Save failed', 'error');
                }
              }}
              className="px-4 h-9 rounded-md bg-card text-text border border-rule hover:bg-paper text-[13px] font-medium disabled:opacity-50"
            >
              Save draft
            </button>
          )}
          {sprint?.status === 'planning' && canManageProject && (
            <button
              type="button"
              disabled={isReadOnly || starting}
              onClick={async () => {
                if (!projectId || !sprintId) return;
                setStarting(true);
                try {
                  await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/start`);
                  toast('Sprint started.', 'success');
                  loadData();
                } catch (err: any) {
                  toast(err.response?.data?.message || 'Could not start sprint', 'error');
                } finally {
                  setStarting(false);
                }
              }}
              className="px-4 h-9 rounded-md bg-lilac text-white hover:bg-lilac-dark text-[13px] font-medium disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start sprint  →'}
            </button>
          )}
        </div>
      </div>
      </PageHeader>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-[28px] py-6">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={(e) => { handleDragEnd(e).finally(() => setActiveTask(null)); }}>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-0">
            <div className="flex items-baseline gap-2 mb-2 flex-shrink-0">
              <span className="font-serif italic text-[18px] text-text">Backlog</span>
              <span className="text-[12px] text-mute">{backlogItems.length} items · {backlogPoints} pts</span>
            </div>
            <DroppableZone id="backlog-zone" label="DRAG RIGHT →">
              <SortableContext items={backlogItems.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {backlogItems.map((task) => (
                  <div key={task.id}>
                    <DraggableTask task={task} readOnly={isReadOnly} subtaskCount={subtaskCounts.get(task.id)} />
                    {(subtasksByParent.get(task.id) || []).map((st) => (
                      <SubtaskRow key={st.id} subtask={st} />
                    ))}
                  </div>
                ))}
              </SortableContext>
              {backlogItems.length === 0 && <p className="text-[12px] text-faint text-center py-4">No backlog items</p>}
            </DroppableZone>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-baseline gap-2 mb-2 flex-shrink-0">
              <span className="font-serif italic text-[18px] text-text">{sprint?.name || 'Sprint'}</span>
              <span className="text-[12px] text-mute">{sprintItems.length} items · {committedPoints} pts committed</span>
              <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-faint">↑↓ TO RE-ORDER</span>
            </div>
            <DroppableZone id="sprint-zone" label={sprint?.status === 'active' ? 'DROP TO ADD MID-SPRINT' : 'DROP TO COMMIT'}>
              <SortableContext items={sprintItems.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {sprintItems.map((task) => (
                  <div key={task.id}>
                    <DraggableTask task={task} readOnly={isReadOnly} subtaskCount={subtaskCounts.get(task.id)} showAssignee />
                    {(subtasksByParent.get(task.id) || []).map((st) => (
                      <SubtaskRow key={st.id} subtask={st} />
                    ))}
                  </div>
                ))}
              </SortableContext>
              {sprintItems.length === 0 && <p className="text-[12px] text-faint text-center py-4">Drag items here</p>}
              {backlogItems.length > 0 && (
                <div className="mt-2 border border-dashed border-lilac/30 rounded px-3 py-2 text-center text-[12px] text-faint">
                  + Drop {backlogItems[0].itemKey || `#${backlogItems[0].itemNumber}`} here
                  {backlogItems[0].storyPoints ? ` · +${backlogItems[0].storyPoints} pts` : ''}
                </div>
              )}
            </DroppableZone>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-card shadow-xl opacity-90">
              <TypeTag kind={(activeTask.itemType || 'task') as TypeTagKind} size="sm" />
              <span className="text-[14px] font-mono text-mute">{activeTask.itemKey || `#${activeTask.itemNumber}`}</span>
              <span className="text-[14px] text-text truncate">{activeTask.title}</span>
              {activeTask.storyPoints != null && activeTask.storyPoints > 0 && (
                <span className="text-[14px] text-mute">{activeTask.storyPoints}pts</span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}
