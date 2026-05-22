import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { useAuthStore } from '../../store/auth.store';
import { queryClient } from '../../lib/query-client';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface ProjectInfo {
  id: number;
  name: string;
  prefix: string;
  status: string;
  taskCount?: number;
}

export function DangerZoneTab() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    apiClient.get(`/projects/${projectId}`).then((res) => {
      const p = res.data.data;
      setProject(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  const handleRestore = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/unarchive`);
      setProject((p) => p ? { ...p, status: 'active' } : p);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      document.dispatchEvent(new CustomEvent('projects-updated'));
      toast('Project restored');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed', 'error');
    }
  };

  if (loading || !project) {
    return <div className="h-32 bg-neutral-200 dark:bg-dneutral-200 rounded animate-pulse" />;
  }

  const isArchived = project.status === 'archived';

  return (
    <div className="max-w-2xl space-y-6">
      {/* Archive / Restore */}
      {isArchived ? (
        <div className="rounded-lg border-2 border-success p-5">
          <h3 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-1">Restore this project</h3>
          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-4">Unarchive and allow modifications again.</p>
          <Button variant="success" onClick={handleRestore}>Restore project</Button>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-danger p-5">
          <h3 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-1">Archive this project</h3>
          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-4">
            Archived projects are read-only. No tasks, sprints, or epics can be created or modified. Team members can still view data.
          </p>
          <Button variant="danger" onClick={() => setShowArchive(true)}>Archive project</Button>
        </div>
      )}

      {/* Delete — admin only */}
      {isAdmin && (
        <div className="rounded-lg border-2 border-danger p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">Delete this project</h3>
            <span className="text-[16px] px-1.5 py-0.5 rounded bg-danger/10 text-danger font-medium">Admin only</span>
          </div>
          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-4">
            Permanently delete this project and ALL its data. This action CANNOT be undone.
          </p>
          <Button variant="danger" onClick={() => setShowDelete(true)}>Delete project</Button>
        </div>
      )}

      {/* Dialogs */}
      {showArchive && (
        <ArchiveConfirmDialog
          projectName={project.name}
          projectId={projectId!}
          onClose={() => setShowArchive(false)}
          onArchived={() => {
            setShowArchive(false);
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            document.dispatchEvent(new CustomEvent('projects-updated'));
            navigate('/dashboard');
          }}
        />
      )}
      {showDelete && (
        <DeleteConfirmDialog
          projectName={project.name}
          projectPrefix={project.prefix}
          projectId={projectId!}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false);
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            document.dispatchEvent(new CustomEvent('projects-updated'));
            navigate('/dashboard');
          }}
        />
      )}
    </div>
  );
}

function ArchiveConfirmDialog({ projectName, projectId, onClose, onArchived }: {
  projectName: string; projectId: string; onClose: () => void; onArchived: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const matches = confirmText === projectName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/archive`);
      onArchived();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed');
    }
    setLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold text-neutral-700 dark:text-dneutral-700 mb-2">Archive project</h2>
        <p className="text-[16px] text-neutral-500 dark:text-dneutral-500 mb-1">Are you sure you want to archive '{projectName}'?</p>
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-4">This will make the project read-only. No one will be able to create or edit tasks.</p>
        {error && <div className="text-[16px] text-danger mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[16px] text-neutral-500 dark:text-dneutral-500 mb-1">Type the project name to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus placeholder={projectName} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!matches || loading}>
              {loading ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function DeleteConfirmDialog({ projectName, projectPrefix, projectId, onClose, onDeleted }: {
  projectName: string; projectPrefix: string; projectId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const matches = confirmText === projectPrefix;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setLoading(true);
    try {
      await apiClient.delete(`/projects/${projectId}`);
      onDeleted();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed');
    }
    setLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold text-danger mb-2">Delete project permanently</h2>
        <p className="text-[16px] text-neutral-500 dark:text-dneutral-500 mb-1">This will permanently delete '{projectName}' and ALL its data.</p>
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-1">Including all tasks, sprints, epics, comments, attachments, and activity logs.</p>
        <p className="text-[16px] text-danger font-medium mb-4">This action cannot be undone.</p>
        {error && <div className="text-[16px] text-danger mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[16px] text-neutral-500 dark:text-dneutral-500 mb-1">Type '{projectPrefix}' to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus placeholder={projectPrefix} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!matches || loading}>
              {loading ? 'Deleting...' : 'Delete permanently'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
