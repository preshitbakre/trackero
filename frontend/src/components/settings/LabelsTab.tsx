import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

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
    } catch (err) { console.error(err); }
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
        <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">Labels ({labels.length})</h2>
        <button onClick={() => setShowCreate(true)} className="text-[16px] font-medium text-peri hover:underline">+ Create label</button>
      </div>

      {labels.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 dark:text-dneutral-500">
          <p>No labels yet. Create labels to categorize your tasks.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-dneutral-100 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 truncate">{label.name}</p>
                <p className="text-[16px] text-neutral-400 dark:text-dneutral-500">{label.taskCount} task{label.taskCount !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setEditingLabel(label)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-400 hover:text-neutral-600" title="Edit">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => setDeletingLabel(label)} className="p-1 rounded hover:bg-danger/10 text-neutral-400 hover:text-danger" title="Delete">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-sm shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold mb-4 text-neutral-700 dark:text-dneutral-700">{editing ? 'Edit label' : 'Create label'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[16px] text-danger">{error}</div>}

          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={15} autoFocus />
          </div>

          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-3 mb-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-peri' : 'border-transparent hover:border-neutral-400'}`} style={{ backgroundColor: c }} />
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
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Preview</label>
            <div className="overflow-hidden">
              <span className="inline-block max-w-full px-3 py-1 rounded-full text-[16px] text-white truncate" style={{ backgroundColor: color }}>
                {name || 'label'}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Saving...' : editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
