import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button } from '../ui/Button';
import { createPortal } from 'react-dom';

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
  { value: 'backlog', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

// ─── Color Picker Dot ─────────────────────────────────────────
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
        className="w-4 h-4 rounded-full border border-neutral-300 dark:border-dneutral-300 hover:ring-2 hover:ring-peri/40 flex-shrink-0"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed z-[61] p-2 rounded-lg bg-white dark:bg-dneutral-100 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]" style={{ top: pos.top, left: pos.left }}>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-peri' : 'border-transparent hover:border-neutral-400'}`}
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

// ─── Sortable Status Row ──────────────────────────────────────
function SortableStatusRow({ status, onUpdate, onDelete }: {
  status: Status;
  onUpdate: (id: number, data: Partial<Status>) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(status.name);

  const handleSaveName = () => {
    if (editName.trim() && editName !== status.name) {
      onUpdate(status.id, { name: editName.trim() });
    }
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 h-[38px] border-b border-neutral-100 dark:border-dneutral-200 last:border-b-0">
      <span {...listeners} {...attributes} className="cursor-grab text-neutral-400 hover:text-neutral-600 text-[16px] flex-shrink-0">&#x2807;</span>

      {/* Color dot — clickable */}
      <ColorPickerDot color={status.color} onChange={(c) => onUpdate(status.id, { color: c })} />

      {/* Name — inline edit */}
      {editing ? (
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditName(status.name); setEditing(false); } }}
          autoFocus
          className="!w-28 !h-[26px] !text-[16px] !px-1.5"
        />
      ) : (
        <span onClick={() => setEditing(true)} className="text-[16px] text-neutral-700 dark:text-dneutral-700 cursor-text hover:text-peri truncate w-28 flex-shrink-0 group/name inline-flex items-center gap-1">
          {status.name}
          <svg className="w-3 h-3 text-neutral-300 opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
      )}

      {/* Category */}
      <Select
        value={status.category}
        onChange={(val) => onUpdate(status.id, { category: val })}
        options={CATEGORY_OPTIONS}
      />

      {/* Default indicator */}
      {status.isDefault && (
        <span className="text-[16px] px-1.5 py-0.5 rounded bg-peri-light dark:bg-peri-dm/30 text-peri dark:text-peri-dm flex-shrink-0">default</span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button onClick={() => onDelete(status.id)} className="text-[16px] text-neutral-400 hover:text-danger" title="Delete">&#x2715;</button>
      </div>
    </div>
  );
}

// ─── Main Board Tab ───────────────────────────────────────────
export function BoardTab() {
  const { id: projectId } = useParams();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [wipValues, setWipValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState<number | null>(null);
  // Statuses whose WIP input has unsaved user edits. Stored in a ref so
  // loadData() doesn't need to be re-created when the set changes.
  const dirtyWipIdsRef = useRef<Set<number>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const statusRes = await apiClient.get(`/projects/${projectId}/statuses`);
      const s = Array.isArray(statusRes.data.data) ? statusRes.data.data : statusRes.data.data.list || [];
      setStatuses(s);
      // Preserve any in-progress WIP edits the user has made; only overwrite
      // entries that are NOT marked dirty.
      setWipValues((prev) => {
        const next: Record<number, string> = {};
        s.forEach((st: Status) => {
          next[st.id] = dirtyWipIdsRef.current.has(st.id) && prev[st.id] != null
            ? prev[st.id]
            : String(st.wipLimit || 0);
        });
        return next;
      });
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Status handlers ───
  const handleUpdateStatus = async (statusId: number, data: Partial<Status>) => {
    try {
      await apiClient.put(`/projects/${projectId}/statuses/${statusId}`, data);
      loadData();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update', 'error');
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

  // ─── WIP handlers ───
  const handleSaveWip = async () => {
    const failed: Array<{ statusName: string; message: string }> = [];
    for (const st of statuses) {
      const newVal = parseInt(wipValues[st.id] || '0') || 0;
      if (newVal !== (st.wipLimit || 0)) {
        try {
          await apiClient.put(`/projects/${projectId}/statuses/${st.id}`, { wipLimit: newVal });
          // Success — clear the dirty mark so loadData picks up the new server value.
          dirtyWipIdsRef.current.delete(st.id);
        } catch (err: any) {
          // Keep dirty so the user's failed input is preserved across the
          // subsequent loadData() and remains visible for retry.
          failed.push({ statusName: st.name, message: err?.response?.data?.message || 'save failed' });
        }
      } else {
        // No-op save: nothing to keep dirty.
        dirtyWipIdsRef.current.delete(st.id);
      }
    }
    await loadData();
    if (failed.length === 0) toast('WIP limits saved');
    else if (failed.length === 1) toast(`Failed to save ${failed[0].statusName}: ${failed[0].message}`, 'error');
    else toast(`${failed.length} WIP limits failed to save`, 'error');
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-neutral-200 dark:bg-dneutral-200 rounded" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* ─── Section 1: Status Columns ─── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">Status columns</h2>
          <button onClick={() => setShowAddStatus(true)} className="text-[16px] font-medium text-peri hover:underline">+ Add status</button>
        </div>
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-3">Drag to reorder. Category determines board behavior.</p>

        <div className="rounded-lg shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {statuses.map((st) => (
                <SortableStatusRow key={st.id} status={st} onUpdate={handleUpdateStatus} onDelete={(id) => setDeletingStatusId(id)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </section>

      {/* ─── Section 2: WIP Limits ─── */}
      <section>
        <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-2">WIP limits</h2>
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mb-3">Set max tasks per column. 0 = no limit.</p>

        <div className="space-y-1.5">
          {statuses.map((st) => (
            <div key={st.id} className="flex items-center gap-3 h-[30px]">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
              <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 w-28 truncate">{st.name}</span>
              <Input
                value={wipValues[st.id] || '0'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) {
                    dirtyWipIdsRef.current.add(st.id);
                    setWipValues({ ...wipValues, [st.id]: v });
                  }
                }}
                className="!w-16 !text-center !text-[16px]"
              />
              {(parseInt(wipValues[st.id] || '0') || 0) === 0 && (
                <span className="text-[16px] text-neutral-400 dark:text-dneutral-500">(no limit)</span>
              )}
            </div>
          ))}
        </div>
        <Button variant="primary" onClick={handleSaveWip} className="mt-3">Save WIP limits</Button>
      </section>

      {/* ─── Dialogs ─── */}
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

// ─── Add Status Dialog ────────────────────────────────────────
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-sm shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Add status</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[16px] text-danger">{error}</div>}
          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus />
          </div>
          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-peri' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Category</label>
            <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="w-full" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Creating...' : 'Add'}</Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

