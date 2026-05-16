import { useState, useEffect, useCallback } from 'react';
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
import { StatusColumn } from './StatusColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';

interface BoardTask {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  assigneeId: number | null;
  storyPoints: number | null;
  sortOrder: string;
  epicId: number | null;
}

interface BoardColumn {
  status: { id: number; name: string; category: string; color: string };
  tasks: BoardTask[];
  taskCount: number;
}

export function KanbanBoard() {
  const { id: projectId } = useParams();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const loadBoard = useCallback(async () => {
    if (!projectId) return;
    try {
      const params = new URLSearchParams();
      if (sprintId) params.set('sprintId', sprintId);
      const { data } = await apiClient.get(`/projects/${projectId}/board?${params}`);
      setColumns(data.data.columns || []);
    } catch {}
  }, [projectId, sprintId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(event.active.id as number);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !projectId) return;

    const taskId = active.id as number;
    const overId = over.id as string;

    // Determine target status
    let targetStatusId: number;
    if (overId.startsWith('column-')) {
      targetStatusId = parseInt(overId.replace('column-', ''));
    } else {
      // Dropped on another task - find its column
      const col = columns.find((c) => c.tasks.some((t) => t.id === parseInt(overId)));
      if (!col) return;
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

    // API call
    try {
      await apiClient.put(`/projects/${projectId}/board/move`, {
        taskId,
        statusId: targetStatusId,
        sortOrder: 'n',
      });
    } catch (err: any) {
      // Revert on failure
      alert(err.response?.data?.message || 'Move failed');
      loadBoard();
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
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800">
        <select
          value={sprintId}
          onChange={(e) => setSprintId(e.target.value)}
          className="text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1"
        >
          <option value="">All tasks (no sprint filter)</option>
        </select>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((col) => (
              <StatusColumn
                key={col.status.id}
                status={col.status}
                tasks={col.tasks}
                taskCount={col.taskCount}
                onTaskClick={(taskId) => setSelectedTaskId(taskId)}
                projectId={parseInt(projectId || '0')}
                onTaskCreated={loadBoard}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix=""
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadBoard}
        />
      )}
    </div>
  );
}
