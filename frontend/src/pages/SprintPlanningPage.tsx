import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { LabelList } from '../components/ui/LabelBadge';
import { toast } from '../components/common/Toast';

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#7C5CFC35', text: '#4A2FC0' },
  story:   { bg: '#88A9D640', text: '#2E5A8E' },
  task:    { bg: '#D6B58840', text: '#7A5E2A' },
  subtask: { bg: '#A8A19A35', text: '#5C5650' },
};

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
}

function DraggableTask({ task, readOnly, subtaskCount }: { task: PlanTask; readOnly?: boolean; subtaskCount?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: readOnly });
  const style: React.CSSProperties = {
    transform: transform && !isDragging ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };
  const typeStyle = TYPE_STYLES[task.itemType] || TYPE_STYLES.task;
  const priorityColors: Record<string, string> = { urgent: 'bg-priority-urgent', high: 'bg-priority-high', medium: 'bg-priority-medium', low: 'bg-priority-low', none: 'bg-priority-none' };

  return (
    <div ref={setNodeRef} style={style} {...(readOnly ? {} : listeners)} {...attributes}
      className={`flex items-center gap-2 px-3 py-2 rounded shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] bg-neutral-50 dark:bg-dneutral-100 ${readOnly ? 'cursor-default' : 'cursor-grab'}`}
    >
      <span
        className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
      >
        {task.itemType}
      </span>
      <span className="text-[14px] font-mono text-neutral-400 flex-shrink-0">{task.itemKey || `#${task.itemNumber}`}</span>
      <span className="flex-1 text-[16px] truncate text-neutral-700 dark:text-dneutral-700">{task.title}</span>
      <LabelList labels={task.labels || []} max={2} />
      {subtaskCount != null && subtaskCount > 0 && (
        <span className="text-[12px] text-neutral-400 flex-shrink-0">{subtaskCount} sub</span>
      )}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority]}`} />
      {task.storyPoints != null && task.storyPoints > 0 && (
        <span className="text-[14px] text-neutral-400 flex-shrink-0">{task.storyPoints}pts</span>
      )}
    </div>
  );
}

function DroppableZone({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex-1 min-h-0 rounded-xl p-3 overflow-y-auto transition-colors ${isOver ? 'bg-lilac-tint ring-2 ring-dashed ring-lilac/30' : 'bg-card/60 border border-rule'}`}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-faint mb-2">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** Cell-based progress meter — N segments shown, fills proportionally to committed/of-capacity. */
function CapacityCells({ committed, capacity }: { committed: number; capacity: number }) {
  const cells = 14;
  const ratio = capacity > 0 ? committed / capacity : 0;
  const filled = Math.min(cells, Math.round(ratio * cells));
  const over = committed > capacity;
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: cells }, (_, i) => {
        const isFilled = i < filled;
        const isLast = i === filled - 1;
        const color = over ? 'bg-danger' : isLast ? 'bg-lilac' : isFilled ? 'bg-text' : 'bg-rule';
        return <span key={i} className={`h-5 flex-1 rounded-sm ${color}`} />;
      })}
    </div>
  );
}

export function SprintPlanningPage() {
  const { id: projectId, sprintId } = useParams();
  const [sprint, setSprint] = useState<any>(null);
  const [backlogItems, setBacklogItems] = useState<PlanTask[]>([]);
  const [sprintItems, setSprintItems] = useState<PlanTask[]>([]);
  const [subtaskCounts, setSubtaskCounts] = useState<Map<number, number>>(new Map());
  const [velocity, setVelocity] = useState<number>(0);

  const { isReadOnly } = useRole();
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
      const [sprintRes, itemsRes, velRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/sprints/${sprintId}`),
        apiClient.get(`/projects/${projectId}/items?itemType=epic,story,task&limit=200`),
        apiClient.get(`/projects/${projectId}/velocity`),
      ]);
      setSprint(sprintRes.data.data);
      const allItems: PlanTask[] = (itemsRes.data.data.list || []).map((i: any) => ({
        ...i,
        itemType: i.itemType || i.type || 'task',
      }));

      // Count subtasks per parent
      const counts = new Map<number, number>();
      // Fetch subtasks just for counting
      const subRes = await apiClient.get(`/projects/${projectId}/items?itemType=subtask&limit=500`);
      const subtasks = subRes.data.data.list || [];
      for (const st of subtasks) {
        if (st.parentId) counts.set(st.parentId, (counts.get(st.parentId) || 0) + 1);
      }
      setSubtaskCounts(counts);

      // Split into backlog vs sprint (exclude subtasks from planning view)
      setBacklogItems(allItems.filter((t) => t.sprintId === null || t.sprintId === undefined));
      setSprintItems(allItems.filter((t) => t.sprintId === parseInt(sprintId!)));

      const velData = velRes.data.data || [];
      if (velData.length > 0) {
        const avg = velData.reduce((sum: number, v: any) => sum + (v.completed_points || 0), 0) / velData.length;
        setVelocity(Math.round(avg));
      }
    } catch (err) { console.error(err); }
  }, [projectId, sprintId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) return;

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
  const capacity = velocity || Math.max(committedPoints, backlogPoints, 1);
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
    <div className="p-6 h-full flex flex-col">
      <Link to={`/projects/${projectId}/sprints`} className="text-[12px] text-mute hover:text-text inline-block mb-3">← Sprints</Link>

      {/* Editorial header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-faint mb-1">
            PLANNING
            {startLabel ? ` · STARTS ${startLabel}` : ''}
            {lengthDays ? ` · ${lengthDays} DAYS` : ''}
          </div>
          <h1 className="font-serif text-[36px] leading-tight text-text dark:text-dneutral-700">
            {sprint?.name || 'Sprint'}
            {sprint?.goal && <span className="italic"> — &ldquo;{sprint.goal}&rdquo;</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="px-4 h-9 rounded-md bg-card text-text border border-rule hover:bg-paper text-[13px] font-medium">Save draft</button>
          <button className="px-4 h-9 rounded-md bg-lilac text-white hover:bg-lilac-dark text-[13px] font-medium">Start sprint  →</button>
        </div>
      </div>

      {/* Capacity meter */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-serif italic text-[32px] leading-none text-text">{committedPoints}</span>
            <span className="text-[14px] text-mute">of <span className="font-semibold text-text">{capacity}</span> POINTS COMMITTED</span>
          </div>
          <CapacityCells committed={committedPoints} capacity={capacity} />
        </div>
        <div className="rounded-xl bg-card px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-faint">Avg velocity · last 3 sprints</div>
          <div className="font-serif italic text-[28px] leading-none text-text mt-1">
            {velocity || '—'}
            <span className="text-mute text-[18px]">/{capacity}</span>
          </div>
        </div>
      </div>

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
                  <DraggableTask key={task.id} task={task} readOnly={isReadOnly} subtaskCount={subtaskCounts.get(task.id)} />
                ))}
              </SortableContext>
              {backlogItems.length === 0 && <p className="text-[12px] text-faint text-center py-4">No backlog items</p>}
            </DroppableZone>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-baseline gap-2 mb-2 flex-shrink-0">
              <span className="font-serif italic text-[18px] text-text">{sprint?.name || 'Sprint'}</span>
              <span className="text-[12px] text-mute">{sprintItems.length} items · {committedPoints} pts committed</span>
              <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-faint">↑ RE-ORDER</span>
            </div>
            <DroppableZone id="sprint-zone" label="DROP TO COMMIT">
              <SortableContext items={sprintItems.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {sprintItems.map((task) => (
                  <DraggableTask key={task.id} task={task} readOnly={isReadOnly} subtaskCount={subtaskCounts.get(task.id)} />
                ))}
              </SortableContext>
              {sprintItems.length === 0 && <p className="text-[12px] text-faint text-center py-4">Drag items here</p>}
            </DroppableZone>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-neutral-50 dark:bg-dneutral-100 shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] opacity-90">
              <span
                className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: (TYPE_STYLES[activeTask.itemType] || TYPE_STYLES.task).bg, color: (TYPE_STYLES[activeTask.itemType] || TYPE_STYLES.task).text }}
              >
                {activeTask.itemType}
              </span>
              <span className="text-[14px] font-mono text-neutral-400">{activeTask.itemKey || `#${activeTask.itemNumber}`}</span>
              <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{activeTask.title}</span>
              {activeTask.storyPoints != null && activeTask.storyPoints > 0 && (
                <span className="text-[14px] text-neutral-400">{activeTask.storyPoints}pts</span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
