import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { Input } from '../ui/Input';
import DragHandleDots from '@/assets/icons/drag-handle.svg?react';
import EllipsisDots from '@/assets/icons/ellipsis.svg?react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { Button } from '../ui/Button';
import { createPortal } from 'react-dom';
import { ErrorState } from '../common/ErrorState';

interface Status {
  id: number;
  name: string;
  category: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  wipLimit: number;
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#22C55E',
  '#14B8A6', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#6B7280', '#78716C', '#1E2A35',
];

const CATEGORY_OPTIONS = [
  { value: 'backlog', label: 'backlog' },
  { value: 'in_progress', label: 'in progress' },
  { value: 'done', label: 'done' },
];

function ColorPickerDot({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-3 h-3 rounded-full hover:ring-2 hover:ring-lilac/40 flex-shrink-0"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed z-[61] p-2 rounded-lg bg-card shadow-lg" style={{ top: pos.top, left: pos.left }}>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-lilac' : 'border-transparent hover:border-mute'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

const CATEGORY_DISPLAY: Record<string, string> = {
  backlog: 'backlog',
  in_progress: 'in progress',
  done: 'done',
};

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_DISPLAY[category] ?? category.replace(/_/g, ' ');
  return (
    <span className="text-[11px] font-mono text-mute border border-rule rounded-[var(--radius)] px-2 py-0.5 whitespace-nowrap">
      {label}
    </span>
  );
}

function SortableStatusRow({ status, onUpdate, onDelete, onSaveWip }: {
  status: Status;
  onUpdate: (id: number, data: Partial<Status>) => void;
  onDelete: (id: number) => void;
  onSaveWip: (id: number, val: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(status.name);
  const [wipVal, setWipVal] = useState(String(status.wipLimit || 0));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWipVal(String(status.wipLimit || 0));
  }, [status.wipLimit]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSaveName = () => {
    if (editName.trim() && editName !== status.name) {
      onUpdate(status.id, { name: editName.trim() });
    }
    setEditing(false);
  };

  const handleWipBlur = () => {
    const n = parseInt(wipVal) || 0;
    if (n !== (status.wipLimit || 0)) onSaveWip(status.id, n);
  };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[20px_16px_1fr_auto_auto_28px] gap-3 items-center py-3 border-b border-rule last:border-b-0">
      <span {...listeners} {...attributes} className="cursor-grab text-faint hover:text-mute text-[12px] flex-shrink-0 flex items-center justify-center">
        <DragHandleDots width={8} height={14} aria-hidden />
      </span>

      <ColorPickerDot color={status.color} onChange={(c) => onUpdate(status.id, { color: c })} />

      {editing ? (
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditName(status.name); setEditing(false); } }}
          autoFocus
          className="!h-[28px] !text-[13px] !px-2 !w-40"
        />
      ) : (
        <span onClick={() => setEditing(true)} className="text-[13px] font-medium text-text cursor-text truncate">
          {status.name}
        </span>
      )}

      <div className="flex items-center gap-3">
        <CategoryBadge category={status.category} />
        <span className="text-[11px] font-mono text-faint uppercase">WIP</span>
        <input
          type="text"
          value={parseInt(wipVal) === 0 ? '—' : wipVal}
          onFocus={(e) => { if (e.target.value === '—') { setWipVal(''); } }}
          onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setWipVal(v); }}
          onBlur={handleWipBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-10 h-7 text-center text-[13px] font-mono text-text bg-transparent border border-rule rounded-[var(--radius)] outline-none focus:border-lilac"
        />
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper text-faint hover:text-text"
        >
          <EllipsisDots className="w-[14px] h-[14px]" aria-hidden />
        </button>
        {menuOpen && (
          <div className="dropdown-panel absolute right-0 mt-1 w-36 bg-card z-50 py-1">
            <button
              onClick={() => { setMenuOpen(false); onUpdate(status.id, { category: status.category === 'backlog' ? 'in_progress' : status.category === 'in_progress' ? 'done' : 'backlog' }); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-paper"
            >
              Change category
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(status.id); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardTab() {
  const { id: projectId } = useParams();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const statusRes = await apiClient.get(`/projects/${projectId}/statuses`);
      const s = Array.isArray(statusRes.data.data) ? statusRes.data.data : statusRes.data.data.list || [];
      setStatuses(s);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpdateStatus = async (statusId: number, data: Partial<Status>) => {
    try {
      await apiClient.put(`/projects/${projectId}/statuses/${statusId}`, data);
      loadData();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update', 'error');
    }
  };

  const handleSaveWip = async (statusId: number, val: number) => {
    try {
      await apiClient.put(`/projects/${projectId}/statuses/${statusId}`, { wipLimit: val });
      loadData();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to save WIP', 'error');
    }
  };

  const handleDeleteStatus = async (statusId: number) => {
    setDeletingStatusId(null);
    try {
      await apiClient.delete(`/projects/${projectId}/statuses/${statusId}`);
      loadData();
      toast('Status deleted');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Cannot delete', 'error');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(statuses, oldIndex, newIndex);
    setStatuses(reordered);
    try {
      await apiClient.put(`/projects/${projectId}/statuses/reorder`, {
        statusIds: reordered.map((s) => s.id),
      });
    } catch {
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-neutral-200 rounded" />)}
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load board settings" onRetry={loadData} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-[20px] text-text">Board statuses</h2>
        <button
          onClick={() => setShowAddStatus(true)}
          className="text-[12px] font-medium text-text border border-rule rounded-[var(--radius)] px-3 py-1.5 hover:bg-paper transition-colors"
        >
          + New status
        </button>
      </div>
      <p className="text-[12px] text-mute mb-4">
        The columns on every board. Drag to reorder. Categorize each as backlog, in-progress, or done — Trackero uses categories for charts and progress.
      </p>

      {/* Status rows */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {statuses.map((st) => (
            <SortableStatusRow
              key={st.id}
              status={st}
              onUpdate={handleUpdateStatus}
              onDelete={(id) => setDeletingStatusId(id)}
              onSaveWip={handleSaveWip}
            />
          ))}
        </SortableContext>
      </DndContext>

      {showAddStatus && (
        <AddStatusDialog
          projectId={projectId!}
          onClose={() => setShowAddStatus(false)}
          onCreated={() => { setShowAddStatus(false); loadData(); toast('Status created'); }}
        />
      )}
      {deletingStatusId !== null && (
        <ConfirmDialog
          title="Delete status"
          message="Are you sure you want to delete this status?"
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteStatus(deletingStatusId)}
          onCancel={() => setDeletingStatusId(null)}
        />
      )}
    </div>
  );
}

function AddStatusDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6B7280');
  const [category, setCategory] = useState('backlog');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.post(`/projects/${projectId}/statuses`, { name: name.trim(), color, category });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed');
    }
    setLoading(false);
  };

  const titleId = 'add-status-dialog-title';
  return (
    <Modal
      open
      onClose={onClose}
      titleId={titleId}
      overlayClassName="fixed inset-0 z-50 bg-ink/40"
      contentClassName="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card rounded-lg p-6 shadow-xl focus:outline-none"
    >
      <h2 id={titleId} className="font-serif text-[20px] text-text mb-4">Add status</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Color</label>
          <div className="grid grid-cols-6 gap-2 mb-2">
            {PRESET_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-lilac' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-mute mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-9 px-3 text-[13px] text-text bg-transparent border border-rule rounded-[var(--radius)] outline-none focus:border-lilac"
          >
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Creating…' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}
