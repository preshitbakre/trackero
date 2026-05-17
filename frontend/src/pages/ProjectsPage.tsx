import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

interface Project {
  id: number;
  name: string;
  prefix: string;
  status: string;
  createdAt: string;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const { data } = await apiClient.get('/projects');
      setProjects(data.data.list || []);
    } catch {}
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Projects</h1>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600"
          >
            Create Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 dark:text-dneutral-500">
          <p className="text-lg">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}/board`}
              className="block p-4 rounded-lg border border-neutral-200 dark:border-dneutral-200 hover:border-primary-400 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500">
                  {project.prefix}
                </span>
                <span className={`text-sm px-1.5 py-0.5 rounded ${
                  project.status === 'active'
                    ? 'bg-secondary-100 dark:bg-dsecondary-100 text-secondary-700 dark:text-dsecondary-600'
                    : 'bg-neutral-100 dark:bg-dneutral-200 text-neutral-400'
                }`}>
                  {project.status}
                </span>
              </div>
              <h3 className="font-medium text-neutral-700 dark:text-dneutral-700">{project.name}</h3>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadProjects(); document.dispatchEvent(new CustomEvent('projects-updated')); }}
        />
      )}
    </div>
  );
}

function generatePrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    return words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
  }
  if (words.length >= 2) {
    // Take first 2 chars of first word + first char of remaining words, pad to 4
    const chars = words.map((w) => w[0].toUpperCase()).join('');
    if (chars.length >= 4) return chars.slice(0, 4);
    // Pad from first word
    const extra = words[0].slice(1, 1 + (4 - chars.length)).toUpperCase();
    return (chars[0] + extra + chars.slice(1)).slice(0, 4);
  }
  // Single word — take first 4 letters
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
}

function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!prefixTouched) {
      setPrefix(generatePrefix(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/projects', { name, prefix: prefix.toUpperCase(), description: description || undefined });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Create Project</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-danger dark:text-danger">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Name</label>
            <input
              type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} required
              placeholder="e.g. Cubitraq"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Prefix</label>
            <input
              type="text" value={prefix}
              onChange={(e) => { setPrefixTouched(true); setPrefix(e.target.value.toUpperCase()); }}
              required pattern="[A-Z]{2,10}" maxLength={10}
              className={`${inputClass} font-mono`}
            />
            <p className="text-sm text-neutral-400 mt-1">Auto-generated from name. Edit if needed.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Description (optional)</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="What is this project about?"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 dark:text-dneutral-500 hover:text-neutral-700">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
