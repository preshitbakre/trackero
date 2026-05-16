import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

interface Epic {
  id: number;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  priority: string;
  color: string;
  createdAt: string;
}

export function EpicsPage() {
  const { id: projectId } = useParams();
  const [epics, setEpics] = useState<Epic[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEpics();
  }, [projectId]);

  const loadEpics = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/epics`);
      setEpics(data.data.list || []);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/epics`, { title });
      setTitle('');
      setShowCreate(false);
      loadEpics();
    } catch {}
    setLoading(false);
  };

  const statusColors = {
    open: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    in_progress: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    done: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Epics</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          Create Epic
        </button>
      </div>

      {epics.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>Epics help you group related work. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => (
            <div
              key={epic.id}
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: epic.color }} />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-gray-50 truncate">{epic.title}</h3>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${statusColors[epic.status]}`}>
                {epic.status.replace('_', ' ')}
              </span>
              <Link
                to={`/projects/${projectId}/epics/${epic.id}/board`}
                className="text-xs text-brand hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Board &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-50">Create Epic</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                placeholder="Epic title"
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
