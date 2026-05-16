import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DndContext, DragEndEvent, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../api/client';

interface PlanTask {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  storyPoints: number | null;
}

function DraggableTask({ task }: { task: PlanTask }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const typeIcons: Record<string, string> = { task: '\u25CB', bug: '\u25CF', story: '\u25C6' };
  const priorityColors: Record<string, string> = { urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-blue-400', none: 'bg-gray-300' };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 cursor-grab hover:border-gray-300"
    >
      <span className="text-xs text-gray-400">{typeIcons[task.type] || '\u25CB'}</span>
      <span className="text-xs font-mono text-gray-400">#{task.taskNumber}</span>
      <span className="flex-1 text-sm truncate text-gray-900 dark:text-gray-50">{task.title}</span>
      <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
      {task.storyPoints != null && task.storyPoints > 0 && (
        <span className="text-xs text-gray-400">{task.storyPoints}pts</span>
      )}
    </div>
  );
}

function DroppableZone({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex-1 min-h-[200px] rounded-lg border-2 border-dashed p-2 transition-colors ${isOver ? 'border-brand bg-brand/5' : 'border-gray-200 dark:border-gray-700'}`}>
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function SprintPlanningPage() {
  const { id: projectId, sprintId } = useParams();
  const [sprint, setSprint] = useState<any>(null);
  const [backlogTasks, setBacklogTasks] = useState<PlanTask[]>([]);
  const [sprintTasks, setSprintTasks] = useState<PlanTask[]>([]);
  const [velocity, setVelocity] = useState<number>(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadData = useCallback(async () => {
    if (!projectId || !sprintId) return;
    try {
      const [sprintRes, tasksRes, velRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/sprints/${sprintId}`),
        apiClient.get(`/projects/${projectId}/tasks?limit=-1`),
        apiClient.get(`/projects/${projectId}/velocity`),
      ]);
      setSprint(sprintRes.data.data);
      const allTasks = tasksRes.data.data.list || [];
      setBacklogTasks(allTasks.filter((t: any) => !t.sprintId));
      setSprintTasks(allTasks.filter((t: any) => t.sprintId === parseInt(sprintId!)));

      // Average velocity from last sprints
      const velData = velRes.data.data || [];
      if (velData.length > 0) {
        const avg = velData.reduce((sum: number, v: any) => sum + (v.completed_points || 0), 0) / velData.length;
        setVelocity(Math.round(avg));
      }
    } catch {}
  }, [projectId, sprintId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) return;

    const taskId = active.id as number;
    const target = String(over.id);

    if (target === 'sprint-zone') {
      // Move to sprint
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/move`, { sprintId: parseInt(sprintId!) });
      loadData();
    } else if (target === 'backlog-zone') {
      // Move to backlog
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/move`, { sprintId: null });
      loadData();
    }
  };

  const committedPoints = sprintTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const capacityPercent = velocity > 0 ? Math.min(100, Math.round((committedPoints / velocity) * 100)) : 0;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to={`/projects/${projectId}/sprints`} className="text-sm text-gray-400 hover:text-gray-600">&larr; Sprints</Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Plan: {sprint?.name || 'Sprint'}
          </h1>
          {sprint?.goal && <p className="text-sm text-gray-500 mt-1">{sprint.goal}</p>}
        </div>
        {/* Capacity indicator */}
        <div className="text-right">
          <p className="text-sm text-gray-500">Capacity</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-50">
            {committedPoints} / {velocity || '?'} pts
          </p>
          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-1">
            <div
              className={`h-full rounded-full transition-all ${capacityPercent > 100 ? 'bg-red-500' : capacityPercent > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(capacityPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
          {/* Left: Backlog */}
          <div className="overflow-y-auto">
            <h2 className="text-sm font-medium text-gray-500 mb-2">Backlog ({backlogTasks.length} tasks)</h2>
            <DroppableZone id="backlog-zone" label="Drop here to remove from sprint">
              <SortableContext items={backlogTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {backlogTasks.map((task) => <DraggableTask key={task.id} task={task} />)}
              </SortableContext>
              {backlogTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No backlog tasks</p>}
            </DroppableZone>
          </div>

          {/* Right: Sprint */}
          <div className="overflow-y-auto">
            <h2 className="text-sm font-medium text-gray-500 mb-2">
              {sprint?.name || 'Sprint'} ({sprintTasks.length} tasks, {committedPoints} pts)
            </h2>
            <DroppableZone id="sprint-zone" label="Drop here to add to sprint">
              <SortableContext items={sprintTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {sprintTasks.map((task) => <DraggableTask key={task.id} task={task} />)}
              </SortableContext>
              {sprintTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Drag tasks here</p>}
            </DroppableZone>
          </div>
        </div>
      </DndContext>
    </div>
  );
}
