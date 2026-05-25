import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { useRole } from '../../hooks/useRole';
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
  const { canAdminister: isAdmin } = useRole();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    apiClient.get(`/projects/${projectId}`).then((res) => {
      setProject(res.data.data);
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
    return <div className="h-32 bg-neutral-200 rounded animate-pulse" />;
  }

  const isArchived = project.status === 'archived';

  return (
    <div>
      <h2 className="font-serif text-[20px] serif-i text-danger mb-1">Danger zone</h2>
      <p className="text-[12px] text-mute mb-4">Irreversible operations. We'll ask you twice.</p>

      <div className="space-y-3">
        {isArchived ? (
          <div className="flex items-center gap-4 rounded-[var(--radius)] border border-success p-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-text">Restore this project</h3>
              <p className="text-[12px] text-mute mt-0.5">Unarchive and allow modifications again.</p>
            </div>
            <button
              onClick={handleRestore}
              className="text-[12px] font-medium border border-success text-success rounded-[var(--radius)] px-4 py-1.5 hover:bg-success/10 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Restore {project.name}…
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-[var(--radius)] border border-danger/40 p-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-text">Archive this project</h3>
              <p className="text-[12px] text-mute mt-0.5">Project moves to read-only. Boards lock, no new items, all data preserved.</p>
            </div>
            <button
              onClick={() => setShowArchive(true)}
              className="text-[12px] font-medium border border-danger/40 text-danger rounded-[var(--radius)] px-4 py-1.5 hover:bg-danger/10 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Archive {project.name}…
            </button>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center gap-4 rounded-[var(--radius)] border border-danger/40 p-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-text">Delete this project</h3>
              <p className="text-[12px] text-mute mt-0.5">Everything goes — items, comments, attachments. 7-day grace before purge.</p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="text-[12px] font-medium bg-danger text-white rounded-[var(--radius)] px-4 py-1.5 hover:bg-danger/90 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Delete {project.name}…
            </button>
          </div>
        )}
      </div>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <div className="bg-card rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-[20px] text-text mb-2">Archive project</h2>
        <p className="text-[12px] text-mute mb-1">Are you sure you want to archive '{projectName}'?</p>
        <p className="text-[12px] text-faint mb-4">This will make the project read-only. No one will be able to create or edit tasks.</p>
        {error && <div className="text-[12px] text-danger mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] text-mute mb-1">Type the project name to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus placeholder={projectName} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!matches || loading}>
              {loading ? 'Archiving…' : 'Archive'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <div className="bg-card rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-[20px] text-danger mb-2">Delete project permanently</h2>
        <p className="text-[12px] text-mute mb-1">This will permanently delete '{projectName}' and ALL its data.</p>
        <p className="text-[12px] text-faint mb-1">Including all tasks, sprints, epics, comments, attachments, and activity logs.</p>
        <p className="text-[12px] text-danger font-medium mb-4">This action cannot be undone.</p>
        {error && <div className="text-[12px] text-danger mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] text-mute mb-1">Type '{projectPrefix}' to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus placeholder={projectPrefix} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!matches || loading}>
              {loading ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
