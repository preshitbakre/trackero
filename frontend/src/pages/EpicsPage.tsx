import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

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
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role !== 'viewer';

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
    open: 'bg-neutral-100 dark:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500',
    in_progress: 'bg-accent-100 dark:bg-daccent-100 text-accent-700 dark:text-daccent-500',
    done: 'bg-secondary-100 dark:bg-dsecondary-100 text-secondary-700 dark:text-dsecondary-600',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Epics</h1>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600"
          >
            Create Epic
          </button>
        )}
      </div>

      {epics.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 dark:text-dneutral-500">
          <p>Epics help you group related work. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => (
            <div
              key={epic.id}
              className="flex items-center gap-3 p-4 rounded-lg border border-neutral-200 dark:border-dneutral-200"
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: epic.color }} />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-700 dark:text-dneutral-700 truncate">{epic.title}</h3>
              </div>
              <span className={`text-sm px-2 py-0.5 rounded ${statusColors[epic.status]}`}>
                {epic.status.replace('_', ' ')}
              </span>
              <Link
                to={`/projects/${projectId}/epics/${epic.id}/board`}
                className="text-sm text-primary-500 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Board &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={() => setShowCreate(false)}>
          <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Create Epic</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                placeholder="Epic title"
                className="w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-neutral-500">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md disabled:opacity-50">
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
