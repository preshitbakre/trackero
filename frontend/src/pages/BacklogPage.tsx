import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, closestCorners, PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { RowSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';

interface BacklogTask {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  storyPoints: number | null;
  assigneeId: number | null;
  sortOrder: string;
  status?: { name: string; color: string };
}

interface SprintTarget {
  id: number;
  name: string;
  status: string;
  taskCount: number;
  totalPoints: number;
}

function SortableTaskRow({ task, selected, onSelect, onClick }: {
  task: BacklogTask; selected: boolean; onSelect: (id: number) => void; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-blue-400', none: 'bg-gray-300',
  };
  const typeIcons: Record<string, string> = { task: '\u25CB', bug: '\u25CF', story: '\u25C6' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${selected ? 'border-brand bg-brand/5' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(task.id)}
        className="w-4 h-4 rounded border-gray-300"
      />
      <span {...listeners} {...attributes} className="cursor-grab text-gray-400 hover:text-gray-600">{'\u2807'}</span>
      <span className={`text-xs ${task.type === 'bug' ? 'text-red-500' : task.type === 'story' ? 'text-violet-500' : 'text-gray-400'}`}>{typeIcons[task.type] || '\u25CB'}</span>
      <span className="text-xs font-mono text-gray-400">#{task.taskNumber}</span>
      <span onClick={onClick} className="flex-1 text-sm text-gray-900 dark:text-gray-50 truncate cursor-pointer hover:text-brand">{task.title}</span>
      <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || 'bg-gray-300'}`} />
      {task.storyPoints != null && task.storyPoints > 0 && (
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{task.storyPoints}pts</span>
      )}
    </div>
  );
}

function SprintDropTarget({ sprint }: { sprint: SprintTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint-${sprint.id}` });

  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-lg border-2 border-dashed transition-colors ${
        isOver ? 'border-brand bg-brand/10' : 'border-gray-300 dark:border-gray-700'
      }`}
    >
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{sprint.name}</p>
      <p className="text-xs text-gray-400">
        {sprint.status} &middot; {sprint.taskCount} tasks &middot; {sprint.totalPoints}pts
      </p>
    </div>
  );
}

export function BacklogPage() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [sprints, setSprints] = useState<SprintTarget[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const user = useAuthStore((s) => s.user);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const { data: taskData } = await apiClient.get(`/projects/${projectId}/tasks?limit=-1`);
      const backlogTasks = (taskData.data.list || []).filter((t: any) => !t.sprintId);
      setTasks(backlogTasks);

      const { data: sprintData } = await apiClient.get(`/projects/${projectId}/sprints?limit=-1`);
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
    document.addEventListener('shortcut-create-task', handler as EventListener);
    return () => document.removeEventListener('shortcut-create-task', handler as EventListener);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !projectId) return;
    await apiClient.post(`/projects/${projectId}/tasks`, { title: newTitle });
    setNewTitle('');
    setShowCreate(false);
    loadData();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !projectId) return;

    const overId = String(over.id);

    // Dropped on a sprint target
    if (overId.startsWith('sprint-')) {
      const sprintId = parseInt(overId.replace('sprint-', ''));
      const taskId = active.id as number;
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/move`, { sprintId });
      loadData();
      return;
    }

    // Reorder within backlog list
    const activeId = active.id as number;
    const overIdNum = parseInt(overId);
    if (activeId === overIdNum) return;

    const oldIndex = tasks.findIndex((t) => t.id === activeId);
    const newIndex = tasks.findIndex((t) => t.id === overIdNum);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic reorder
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reordered);

    // Calculate new sortOrder using midpoint of neighbors
    const above = newIndex > 0 ? reordered[newIndex - 1].sortOrder : null;
    const below = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : null;

    // Simple midpoint: if between 'a' and 'c', use 'b'. If no neighbors, use 'n'.
    let newSortOrder: string;
    if (!above && !below) newSortOrder = 'n';
    else if (!above) newSortOrder = String.fromCharCode(below!.charCodeAt(0) - 1) || 'a';
    else if (!below) newSortOrder = String.fromCharCode(above.charCodeAt(0) + 1) || 'z';
    else newSortOrder = above + 'n'; // append to create between

    // Call API
    try {
      await apiClient.put(`/projects/${projectId}/tasks/reorder`, {
        reorders: [{ taskId: activeId, sortOrder: newSortOrder }],
      });
    } catch {
      loadData(); // Revert on failure
    }
  };

  const handleBulkMoveToSprint = async (sprintId: number) => {
    if (!projectId || selectedIds.size === 0) return;
    for (const taskId of selectedIds) {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/move`, { sprintId });
    }
    setSelectedIds(new Set());
    loadData();
  };

  const handleBulkAssignToMe = async () => {
    if (!projectId || selectedIds.size === 0 || !user) return;
    for (const taskId of selectedIds) {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/assign`, { assigneeId: user.id });
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

  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  return (
    <div className="flex h-full">
      {/* Main backlog list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Backlog</h1>
            <p className="text-sm text-gray-500">{tasks.length} tasks, {totalPoints} pts</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90">
            + Task
          </button>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-brand/5 border border-brand/20 rounded-lg">
            <span className="text-sm font-medium text-brand">{selectedIds.size} selected</span>
            <button onClick={handleBulkAssignToMe} className="text-xs px-2 py-1 bg-brand text-white rounded">Assign to me</button>
            {sprints.map((s) => (
              <button key={s.id} onClick={() => handleBulkMoveToSprint(s.id)} className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                &rarr; {s.name}
              </button>
            ))}
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 ml-auto">Clear</button>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-4 flex gap-2">
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title..." autoFocus className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md">Add</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          </form>
        )}

        {error && <ErrorState message="Failed to load backlog" onRetry={loadData} />}

        {loading && tasks.length === 0 && !error && (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <RowSkeleton key={i} />)}
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  selected={selectedIds.has(task.id)}
                  onSelect={toggleSelect}
                  onClick={() => setSelectedTaskId(task.id)}
                />
              ))}
            </div>
          </SortableContext>

          {tasks.length === 0 && !showCreate && (
            <div className="text-center py-12 text-gray-400">All caught up! No tasks in the backlog.</div>
          )}
        </DndContext>
      </div>

      {/* Sprint sidebar (drag targets) */}
      <div className="w-64 border-l border-gray-200 dark:border-gray-800 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Drag to sprint:</h3>
        <div className="space-y-2">
          {sprints.map((sprint) => (
            <SprintDropTarget key={sprint.id} sprint={sprint} />
          ))}
          {sprints.length === 0 && (
            <p className="text-xs text-gray-400">No planning sprints available</p>
          )}
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix=""
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}
