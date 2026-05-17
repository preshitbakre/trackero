import { useState, useEffect, useCallback } from 'react';
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

interface TaskTypeRow {
  id: number;
  name: string;
  color: string;
  icon: string;
  isBuiltin: boolean;
  sortOrder: number;
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#22C55E',
  '#14B8A6', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#6B7280', '#78716C', '#1E2A35',
];

const CATEGORY_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const ICON_PRESETS = [
  'circle-dot', 'bug', 'book', 'wrench', 'zap', 'bolt',
  'flag', 'star', 'diamond', 'triangle', 'square', 'hexagon',
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
        className="w-4 h-4 rounded-full border border-neutral-300 dark:border-dneutral-300 hover:ring-2 hover:ring-primary-400/40 flex-shrink-0"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed z-[61] p-2 rounded-lg border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 shadow-lg" style={{ top: pos.top, left: pos.left }}>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-primary-500' : 'border-transparent hover:border-neutral-400'}`}
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
      <span {...listeners} {...attributes} className="cursor-grab text-neutral-400 hover:text-neutral-600 text-sm flex-shrink-0">&#x2807;</span>

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
          className="!w-28 !h-[26px] !text-sm !px-1.5"
        />
      ) : (
        <span onClick={() => setEditing(true)} className="text-sm text-neutral-700 dark:text-dneutral-700 cursor-text hover:text-primary-500 truncate w-28 flex-shrink-0">{status.name}</span>
      )}

      {/* Category */}
      <Select
        value={status.category}
        onChange={(val) => onUpdate(status.id, { category: val })}
        options={CATEGORY_OPTIONS}
      />

      {/* Default indicator */}
      {status.isDefault && (
        <span className="text-sm px-1.5 py-0.5 rounded bg-primary-50 dark:bg-dprimary-50 text-primary-500 dark:text-dprimary-500 flex-shrink-0">default</span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button onClick={() => onDelete(status.id)} className="text-sm text-neutral-400 hover:text-danger" title="Delete">&#x2715;</button>
      </div>
    </div>
  );
}

// ─── Main Board Tab ───────────────────────────────────────────
export function BoardTab() {
  const { id: projectId } = useParams();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeRow[]>([]);
  const [wipValues, setWipValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [editingType, setEditingType] = useState<TaskTypeRow | null>(null);
  const [deletingStatusId, setDeletingStatusId] = useState<number | null>(null);
  const [deletingTypeId, setDeletingTypeId] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [statusRes, typeRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/statuses`),
        apiClient.get(`/projects/${projectId}/task-types`),
      ]);
      const s = Array.isArray(statusRes.data.data) ? statusRes.data.data : statusRes.data.data.list || [];
      setStatuses(s);
      const wip: Record<number, string> = {};
      s.forEach((st: Status) => { wip[st.id] = String(st.wipLimit || 0); });
      setWipValues(wip);
      setTaskTypes(typeRes.data.data.list || []);
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
    for (const st of statuses) {
      const newVal = parseInt(wipValues[st.id] || '0') || 0;
      if (newVal !== (st.wipLimit || 0)) {
        await apiClient.put(`/projects/${projectId}/statuses/${st.id}`, { wipLimit: newVal }).catch(() => {});
      }
    }
    loadData();
    toast('WIP limits saved');
  };

  // ─── Task type handlers ───
  const handleDeleteType = async (typeId: number) => {
    setDeletingTypeId(null);
    try {
      await apiClient.delete(`/projects/${projectId}/task-types/${typeId}`);
      loadData();
      toast('Task type deleted');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Cannot delete', 'error');
    }
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
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700">Status columns</h2>
          <button onClick={() => setShowAddStatus(true)} className="text-sm font-medium text-primary-500 hover:underline">+ Add status</button>
        </div>
        <p className="text-sm text-neutral-400 dark:text-dneutral-500 mb-3">Drag to reorder. Category determines board behavior.</p>

        <div className="border border-neutral-200 dark:border-dneutral-200 rounded-lg overflow-hidden">
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
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700 mb-2">WIP limits</h2>
        <p className="text-sm text-neutral-400 dark:text-dneutral-500 mb-3">Set max tasks per column. 0 = no limit.</p>

        <div className="space-y-1.5">
          {statuses.map((st) => (
            <div key={st.id} className="flex items-center gap-3 h-[30px]">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
              <span className="text-sm text-neutral-700 dark:text-dneutral-700 w-28 truncate">{st.name}</span>
              <Input
                value={wipValues[st.id] || '0'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) setWipValues({ ...wipValues, [st.id]: v });
                }}
                className="!w-16 !text-center !text-sm"
              />
              {(parseInt(wipValues[st.id] || '0') || 0) === 0 && (
                <span className="text-sm text-neutral-400 dark:text-dneutral-500">(no limit)</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={handleSaveWip} className="mt-3 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600">
          Save WIP limits
        </button>
      </section>

      {/* ─── Section 3: Task Types ─── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700">Task types</h2>
          <button onClick={() => setShowAddType(true)} className="text-sm font-medium text-primary-500 hover:underline">+ Add type</button>
        </div>
        <p className="text-sm text-neutral-400 dark:text-dneutral-500 mb-3">Configure the types available when creating tasks.</p>

        <div className="border border-neutral-200 dark:border-dneutral-200 rounded-lg overflow-hidden">
          {taskTypes.map((tt, i) => (
            <div key={tt.id} className={`flex items-center gap-3 px-3 h-[38px] ${i > 0 ? 'border-t border-neutral-100 dark:border-dneutral-200' : ''}`}>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tt.color }} />
              <span className="text-sm text-neutral-700 dark:text-dneutral-700 flex-1">{tt.name}</span>
              {tt.isBuiltin && (
                <span className="text-sm px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dneutral-200 text-neutral-400 dark:text-dneutral-500">built-in</span>
              )}
              <button onClick={() => setEditingType(tt)} className="text-sm text-neutral-400 hover:text-primary-500">Edit</button>
              {!tt.isBuiltin && (
                <button onClick={() => setDeletingTypeId(tt.id)} className="text-sm text-neutral-400 hover:text-danger">Delete</button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Dialogs ─── */}
      {showAddStatus && (
        <AddStatusDialog
          projectId={projectId!}
          onClose={() => setShowAddStatus(false)}
          onCreated={() => { setShowAddStatus(false); loadData(); toast('Status created'); }}
        />
      )}
      {(showAddType || editingType) && (
        <TaskTypeDialog
          projectId={projectId!}
          editing={editingType}
          onClose={() => { setShowAddType(false); setEditingType(null); }}
          onSaved={() => { setShowAddType(false); setEditingType(null); loadData(); toast(editingType ? 'Task type updated' : 'Task type created'); }}
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

      {deletingTypeId !== null && (
        <ConfirmDialog
          title="Delete task type"
          message="Are you sure you want to delete this task type?"
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteType(deletingTypeId)}
          onCancel={() => setDeletingTypeId(null)}
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
      <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Add status</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-danger">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-primary-500' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Category</label>
            <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="w-full" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-500">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md disabled:opacity-50">{loading ? 'Creating...' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ─── Task Type Dialog (Create + Edit) ─────────────────────────
function TaskTypeDialog({ projectId, editing, onClose, onSaved }: {
  projectId: string;
  editing: TaskTypeRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name || '');
  const [color, setColor] = useState(editing?.color || '#6B7280');
  const [icon, setIcon] = useState(editing?.icon || 'circle-dot');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (editing) {
        await apiClient.put(`/projects/${projectId}/task-types/${editing.id}`, { name: name.trim(), color, icon });
      } else {
        await apiClient.post(`/projects/${projectId}/task-types`, { name: name.trim(), color, icon });
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed');
    }
    setLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">{editing ? 'Edit task type' : 'Add task type'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-danger">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {ICON_PRESETS.map((ic) => (
                <button key={ic} type="button" onClick={() => setIcon(ic)} className={`px-2 py-1.5 text-sm rounded border text-center truncate ${icon === ic ? 'border-primary-500 bg-primary-50 dark:bg-dprimary-50 text-primary-500' : 'border-neutral-200 dark:border-dneutral-300 text-neutral-500 dark:text-dneutral-500'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-primary-500' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-500">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md disabled:opacity-50">{loading ? 'Saving...' : editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
