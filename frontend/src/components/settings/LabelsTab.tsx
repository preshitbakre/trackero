import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ErrorState } from '../common/ErrorState';

interface LabelRow {
  id: number;
  name: string;
  color: string;
  createdAt: string;
  taskCount: number;
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#22C55E',
  '#14B8A6', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#6B7280', '#78716C', '#1E2A35',
];

export function LabelsTab() {
  const { id: projectId } = useParams();
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState<LabelRow | null>(null);

  const loadLabels = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/labels`);
      setLabels(Array.isArray(data.data) ? data.data : data.data.list || []);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => { loadLabels(); }, [projectId]);

  const handleDelete = async (label: LabelRow) => {
    setDeletingLabel(null);
    try {
      await apiClient.delete(`/projects/${projectId}/labels/${label.id}`);
      loadLabels();
      toast('Label deleted');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 animate-pulse">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-neutral-200 rounded" />)}
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load labels" onRetry={loadLabels} />;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-[20px] text-text">Labels</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="text-[12px] font-medium text-text border border-rule rounded-[var(--radius)] px-3 py-1.5 hover:bg-paper transition-colors"
        >
          + New label
        </button>
      </div>
      <p className="text-[12px] text-mute mb-4">
        Color tags applied to work items. Used everywhere — list views, board cards, filters, charts.
      </p>

      {labels.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-faint">
          No labels yet. Create labels to categorize your tasks.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l border-rule">
          {labels.map((label) => (
            <button
              key={label.id}
              onClick={() => setEditingLabel(label)}
              className="flex items-center gap-3 px-4 py-3 border-b border-r border-rule text-left hover:bg-paper/60 transition-colors"
            >
              <span className="w-4 h-4 rounded-[3px] flex-shrink-0" style={{ backgroundColor: label.color }} />
              <span className="text-[13px] font-medium text-text truncate flex-1">{label.name}</span>
              <span className="text-[11px] font-mono text-faint uppercase">{label.color}</span>
            </button>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 border-b border-r border-rule text-[12px] text-mute hover:text-text hover:bg-paper/60 transition-colors"
          >
            + add label
          </button>
        </div>
      )}

      {(showCreate || editingLabel) && (
        <LabelDialog
          projectId={projectId!}
          editing={editingLabel}
          onClose={() => { setShowCreate(false); setEditingLabel(null); }}
          onSaved={() => {
            setShowCreate(false);
            setEditingLabel(null);
            loadLabels();
            toast(editingLabel ? 'Label updated' : 'Label created');
          }}
          onDelete={editingLabel ? () => { setDeletingLabel(editingLabel); setEditingLabel(null); } : undefined}
        />
      )}

      {deletingLabel && (
        <ConfirmDialog
          title="Delete label"
          message={deletingLabel.taskCount > 0
            ? `Delete label '${deletingLabel.name}'? It will be removed from ${deletingLabel.taskCount} task${deletingLabel.taskCount !== 1 ? 's' : ''}.`
            : `Delete label '${deletingLabel.name}'?`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deletingLabel)}
          onCancel={() => setDeletingLabel(null)}
        />
      )}
    </div>
  );
}

function LabelDialog({ projectId, editing, onClose, onSaved, onDelete }: {
  projectId: string;
  editing: LabelRow | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(editing?.name || '');
  const [color, setColor] = useState(editing?.color || '#3B82F6');
  const [customHex, setCustomHex] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (editing) {
        await apiClient.put(`/projects/${projectId}/labels/${editing.id}`, { name: name.trim(), color });
      } else {
        await apiClient.post(`/projects/${projectId}/labels`, { name: name.trim(), color });
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed');
    }
    setLoading(false);
  };

  const applyCustomHex = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) setColor(customHex);
  };

  const titleId = 'label-dialog-title';
  return (
    <Modal
      open
      onClose={onClose}
      titleId={titleId}
      overlayClassName="fixed inset-0 z-50 bg-ink/40"
      contentClassName="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card rounded-lg p-6 shadow-xl focus:outline-none"
    >
      <h2 id={titleId} className="font-serif text-[20px] text-text mb-4">{editing ? 'Edit label' : 'Create label'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[12px] text-danger">{error}</div>}

        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={15} autoFocus />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Color</label>
          <div className="grid grid-cols-6 gap-2 mb-2">
            {PRESET_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-lilac' : 'border-transparent hover:border-mute'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <Input
            value={customHex || color}
            onChange={(e) => setCustomHex(e.target.value)}
            onBlur={applyCustomHex}
            onKeyDown={(e) => e.key === 'Enter' && applyCustomHex()}
            placeholder="#hex"
            maxLength={7}
            className="!w-28 font-mono"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Preview</label>
          <span className="inline-block px-3 py-1 rounded-full text-[12px] text-white truncate" style={{ backgroundColor: color }}>
            {name || 'label'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {editing && onDelete && (
            <button type="button" onClick={onDelete} className="text-[12px] text-danger hover:underline mr-auto">Delete</button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving…' : editing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
