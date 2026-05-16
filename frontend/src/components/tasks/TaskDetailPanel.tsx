import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';

interface Subtask {
  id: number;
  taskNumber: number;
  title: string;
  statusId: number;
  completedAt: string | null;
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
}

interface Dependency {
  id: number;
  dependsOnTaskId?: number;
  taskId?: number;
  dependencyType: string;
  task?: { id: number; taskNumber: number; title: string };
  dependsOnTask?: { id: number; taskNumber: number; title: string };
}

interface TaskDetail {
  id: number;
  taskNumber: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  statusId: number;
  storyPoints: number | null;
  assigneeId: number | null;
  epicId: number | null;
  sprintId: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  subtasks?: Subtask[];
  blockedBy?: Dependency[];
  blocks?: Dependency[];
  subtaskCount?: number;
}

interface TaskDetailPanelProps {
  projectId: number;
  taskId: number;
  projectPrefix: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function TaskDetailPanel({ projectId, taskId, projectPrefix, onClose, onUpdated }: TaskDetailPanelProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showAddSubtask, setShowAddSubtask] = useState(false);

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks/${taskId}`);
      setTask(data.data);
      setTitle(data.data.title);
    } catch {}
  };

  const handleTitleSave = async () => {
    if (!title.trim() || title === task?.title) {
      setEditing(false);
      return;
    }
    try {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}`, { title });
      await loadTask();
      onUpdated?.();
    } catch {}
    setEditing(false);
  };

  const handleFieldChange = async (field: string, value: unknown) => {
    try {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}`, { [field]: value });
      await loadTask();
      onUpdated?.();
    } catch {}
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/tasks/${taskId}/subtasks`, { title: newSubtaskTitle });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      await loadTask();
    } catch {}
  };

  if (!task) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl z-40 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const taskKey = projectPrefix ? `${projectPrefix}-${task.taskNumber}` : `#${task.taskNumber}`;

  const priorityColors: Record<string, string> = {
    urgent: 'text-red-600',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-blue-500',
    none: 'text-gray-400',
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl z-40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <span className="text-sm font-mono text-gray-500">{taskKey}</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Title */}
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              autoFocus
              className="w-full text-lg font-bold bg-transparent border-b border-brand outline-none text-gray-900 dark:text-gray-50"
            />
          ) : (
            <h2
              onClick={() => setEditing(true)}
              className="text-lg font-bold text-gray-900 dark:text-gray-50 cursor-pointer hover:text-brand"
            >
              {task.title}
            </h2>
          )}

          {/* Properties */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Priority</span>
              <select
                value={task.priority}
                onChange={(e) => handleFieldChange('priority', e.target.value)}
                className={`bg-transparent text-right font-medium cursor-pointer ${priorityColors[task.priority]}`}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500">Type</span>
              <select
                value={task.type}
                onChange={(e) => handleFieldChange('type', e.target.value)}
                className="bg-transparent text-right font-medium text-gray-900 dark:text-gray-50 cursor-pointer"
              >
                <option value="task">Task</option>
                <option value="bug">Bug</option>
                <option value="story">Story</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500">Story Points</span>
              <input
                type="number"
                value={task.storyPoints ?? ''}
                onChange={(e) => handleFieldChange('storyPoints', e.target.value ? parseInt(e.target.value) : null)}
                className="w-16 text-right bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-gray-50"
                placeholder="-"
              />
            </div>

            {task.completedAt && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Completed</span>
                <span className="text-green-600 font-medium">
                  {new Date(task.completedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <div className="text-sm text-gray-700 dark:text-gray-300 min-h-[60px] p-3 rounded border border-gray-200 dark:border-gray-800">
              {task.description || <span className="text-gray-400 italic">No description</span>}
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">
                Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.length})`}
              </h3>
            </div>
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {task.subtasks.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-900">
                    <span className={st.completedAt ? 'text-green-500' : 'text-gray-400'}>
                      {st.completedAt ? '☑' : '☐'}
                    </span>
                    <span className={`flex-1 ${st.completedAt ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-50'}`}>
                      {st.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {showAddSubtask ? (
              <form onSubmit={handleAddSubtask} className="flex gap-1">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Subtask title..."
                  autoFocus
                  className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-transparent"
                />
                <button type="submit" className="text-xs px-2 py-1 bg-brand text-white rounded">Add</button>
                <button type="button" onClick={() => setShowAddSubtask(false)} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
              </form>
            ) : (
              <button
                onClick={() => setShowAddSubtask(true)}
                className="text-xs text-gray-400 hover:text-brand"
              >
                + Add subtask
              </button>
            )}
          </div>

          {/* Dependencies */}
          {((task.blockedBy && task.blockedBy.length > 0) || (task.blocks && task.blocks.length > 0)) && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Dependencies</h3>
              {task.blockedBy && task.blockedBy.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-gray-400 uppercase">Blocked by:</span>
                  {task.blockedBy.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-sm py-1 px-2">
                      <span className="text-red-500">🔒</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        #{dep.dependsOnTask?.taskNumber} {dep.dependsOnTask?.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {task.blocks && task.blocks.length > 0 && (
                <div>
                  <span className="text-xs text-gray-400 uppercase">Blocks:</span>
                  {task.blocks.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-sm py-1 px-2">
                      <span className="text-amber-500">⏳</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        #{dep.task?.taskNumber} {dep.task?.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
