import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';

interface TaskItem {
  id: number;
  taskNumber: number;
  title: string;
  type: string;
  priority: string;
  statusId: number;
  storyPoints: number | null;
}

export function TasksPage() {
  const { id: projectId } = useParams();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  const loadTasks = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks`);
      setTasks(data.data.list || []);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/tasks`, { title: newTitle });
      setNewTitle('');
      setShowCreate(false);
      loadTasks();
    } catch {}
  };

  const priorityDot: Record<string, string> = {
    urgent: 'bg-priority-urgent',
    high: 'bg-priority-high',
    medium: 'bg-priority-medium',
    low: 'bg-priority-low',
    none: 'bg-priority-none',
  };

  const typeIcon: Record<string, string> = {
    task: '○',
    bug: '●',
    story: '◆',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Tasks</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600"
        >
          Create Task
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 flex gap-2">
          <input
            type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..." autoFocus
            className="flex-1 rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700"
          />
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md">Add</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-neutral-400">Cancel</button>
        </form>
      )}

      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => setSelectedTaskId(task.id)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-dneutral-100 cursor-pointer border border-transparent hover:border-neutral-200 dark:hover:border-dneutral-200"
          >
            <span className="text-neutral-400 text-sm">{typeIcon[task.type] || '○'}</span>
            <span className="flex-1 text-sm text-neutral-700 dark:text-dneutral-700 truncate">{task.title}</span>
            <span className={`w-2 h-2 rounded-full ${priorityDot[task.priority]}`} />
            {task.storyPoints && (
              <span className="text-sm text-neutral-400 bg-neutral-100 dark:bg-dneutral-200 px-1.5 py-0.5 rounded">
                {task.storyPoints}
              </span>
            )}
          </div>
        ))}
        {tasks.length === 0 && !showCreate && (
          <div className="text-center py-12 text-neutral-400">No tasks yet</div>
        )}
      </div>

      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix="TST"
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadTasks}
        />
      )}
    </div>
  );
}
