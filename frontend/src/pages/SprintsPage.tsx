import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  sprintNumber: number;
  startDate: string | null;
  endDate: string | null;
}

export function SprintsPage() {
  const { id: projectId } = useParams();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSprints();
  }, [projectId]);

  const loadSprints = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints`);
      setSprints(data.data.list || []);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/sprints`, { name, goal: goal || undefined });
      setName('');
      setGoal('');
      setShowCreate(false);
      loadSprints();
    } catch {}
    setLoading(false);
  };

  const handleStart = async (sprintId: number) => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/start`);
      loadSprints();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to start sprint');
    }
  };

  const handleComplete = async (sprintId: number) => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/complete`);
      loadSprints();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to complete sprint');
    }
  };

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    completed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Sprints</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          Create Sprint
        </button>
      </div>

      {sprints.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>Create a sprint to start planning your work</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sprints.map((sprint) => (
            <div
              key={sprint.id}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-50">{sprint.name}</h3>
                  {sprint.goal && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{sprint.goal}</p>
                  )}
                  {sprint.startDate && (
                    <p className="text-xs text-gray-400 mt-1">
                      {sprint.startDate} → {sprint.endDate}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[sprint.status]}`}>
                    {sprint.status}
                  </span>
                  {sprint.status === 'planning' && (
                    <button
                      onClick={() => handleStart(sprint.id)}
                      className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Start
                    </button>
                  )}
                  {sprint.status === 'active' && (
                    <button
                      onClick={() => handleComplete(sprint.id)}
                      className="text-xs px-2 py-1 bg-brand text-white rounded hover:bg-brand/90"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-50">Create Sprint</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Sprint name"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
              <textarea
                value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
                placeholder="Sprint goal (optional)"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
