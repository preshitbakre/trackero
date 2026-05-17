import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Input } from '../ui/Input';

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
  const [editingLabel, setEditingLabel] = useState<LabelRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState<LabelRow | null>(null);

  const loadLabels = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/labels`);
      setLabels(Array.isArray(data.data) ? data.data : data.data.list || []);
    } catch {}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-neutral-200 dark:bg-dneutral-200 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700">Labels ({labels.length})</h2>
        <button onClick={() => setShowCreate(true)} className="text-sm font-medium text-primary-500 hover:underline">+ Create label</button>
      </div>

      {labels.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 dark:text-dneutral-500">
          <p>No labels yet. Create labels to categorize your tasks.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-200 dark:border-dneutral-200">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-700 dark:text-dneutral-700 truncate">{label.name}</p>
                <p className="text-sm text-neutral-400 dark:text-dneutral-500">{label.taskCount} task{label.taskCount !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setEditingLabel(label)} className="text-sm text-neutral-400 hover:text-primary-500">Edit</button>
              <button onClick={() => setDeletingLabel(label)} className="text-sm text-neutral-400 hover:text-danger">Delete</button>
            </div>
          ))}
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

function LabelDialog({ projectId, editing, onClose, onSaved }: {
  projectId: string;
  editing: LabelRow | null;
  onClose: () => void;
  onSaved: () => void;
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
    if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
      setColor(customHex);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">{editing ? 'Edit label' : 'Create label'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-danger">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={15} autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-3 mb-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-primary-500' : 'border-transparent hover:border-neutral-400'}`} style={{ backgroundColor: c }} />
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
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Preview</label>
            <div className="overflow-hidden">
              <span className="inline-block max-w-full px-3 py-1 rounded-full text-sm text-white truncate" style={{ backgroundColor: color }}>
                {name || 'label'}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-500">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md disabled:opacity-50">
              {loading ? 'Saving...' : editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
