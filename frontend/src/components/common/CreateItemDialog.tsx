import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { queryClient } from '../../lib/query-client';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Combobox } from '../ui/Combobox';
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from './Drawer';
import { toast } from './Toast';

// Item type definitions with colors matching the spec
const ITEM_TYPES = [
  { value: 'epic', label: 'Epic', color: '#7C5CFC' },
  { value: 'story', label: 'Story', color: '#88A9D6' },
  { value: 'task', label: 'Task', color: '#D6B588' },
  { value: 'bug', label: 'Bug', color: '#E05252' },
  { value: 'subtask', label: 'Subtask', color: '#A8A19A' },
] as const;

type ItemType = 'epic' | 'story' | 'task' | 'bug' | 'subtask';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

const DEFAULT_EPIC_COLORS = [
  '#7C5CFC', '#88A9D6', '#D688D0', '#E05252',
  '#E88A48', '#D6B588', '#4AADA8', '#88D68E',
];

interface CreateItemDialogProps {
  projectId: number;
  onClose: () => void;
  onCreated: () => void;
  defaultType?: ItemType;
  defaultParentId?: number;
}

interface ParentOption {
  id: number;
  itemType: string;
  itemNumber: number;
  title: string;
}

export function CreateItemDialog({
  projectId,
  onClose,
  onCreated,
  defaultType = 'task',
  defaultParentId,
}: CreateItemDialogProps) {
  const [itemType, setItemType] = useState<ItemType>(defaultType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [parentId, setParentId] = useState<string>(defaultParentId ? String(defaultParentId) : '');
  const [sprintId, setSprintId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [color, setColor] = useState('#7C5CFC');
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [linkedItemId, setLinkedItemId] = useState('');

  // Data
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [linkToOptions, setLinkToOptions] = useState<{ value: string; label: string; prefix?: React.ReactNode }[]>([]);
  const [sprints, setSprints] = useState<{ id: number; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; name: string; category: string }[]>([]);
  const [assignees, setAssignees] = useState<{ value: number; label: string }[]>([]);
  const [labels, setLabels] = useState<{ id: number; name: string; color: string }[]>([]);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignored = false;
    const load = async () => {
      try {
        const [statusRes, sprintRes, assigneeRes, labelRes] = await Promise.all([
          apiClient.get(`/projects/${projectId}/statuses`),
          apiClient.get(`/projects/${projectId}/sprints?limit=100`),
          apiClient.get(`/projects/${projectId}/filters/assignees`),
          apiClient.get(`/projects/${projectId}/labels`),
        ]);
        if (ignored) return;
        setStatuses(statusRes.data.data?.list || statusRes.data.data || []);
        setSprints(sprintRes.data.data?.list || sprintRes.data.data || []);
        setAssignees(assigneeRes.data.data?.list || assigneeRes.data.data || []);
        setLabels(labelRes.data.data?.list || labelRes.data.data || []);
      } catch (err) { console.error(err); }
    };
    load();
    return () => { ignored = true; };
  }, [projectId]);

  useEffect(() => {
    let ignored = false;
    const loadRelated = async () => {
      // Reset both
      setParentOptions([]);
      setLinkToOptions([]);
      setLinkedItemId('');

      if (itemType === 'subtask') {
        // Subtasks need parent selection (task, story, or epic — matches backend validateParentChildType)
        const parentTypes = ['task', 'story', 'epic'];
        try {
          const res = await apiClient.get(`/projects/${projectId}/items?itemType=${parentTypes.join(',')}&limit=100&sort=updatedAt&order=DESC`);
          if (ignored) return;
          const fresh = (res.data.data?.list || []).map((i: any) => ({ id: i.id, itemType: i.itemType, itemNumber: i.itemNumber, title: i.title }));
          setParentOptions(fresh);
          if (parentId) {
            const currentParent = fresh.find((p: ParentOption) => String(p.id) === parentId);
            if (currentParent && !parentTypes.includes(currentParent.itemType)) setParentId('');
          }
        } catch {
          if (!ignored) setParentOptions([]);
        }
      } else if (itemType === 'story' || itemType === 'task' || itemType === 'bug') {
        // Non-subtask, non-epic types get "Link to" options
        setParentId('');
        if (defaultParentId) setLinkedItemId(String(defaultParentId));
        try {
          const res = await apiClient.get(`/projects/${projectId}/items?itemType=epic,story,task&limit=50&sort=updatedAt&order=DESC`);
          if (ignored) return;
          const items = res.data.data?.list || [];
          setLinkToOptions(items.map((i: any) => ({
            value: String(i.id),
            label: `#${i.itemNumber} — ${i.title}`,
            prefix: (<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor(i.itemType) }} />) as React.ReactNode,
          })));
        } catch {
          if (!ignored) setLinkToOptions([]);
        }
      } else {
        // Epic — no parent, no link
        setParentId('');
      }
    };
    loadRelated();
    return () => { ignored = true; };
  }, [itemType, projectId]);

  const assigneeComboOptions = [
    { value: '', label: 'Unassigned' },
    ...assignees.map(a => ({ value: String(a.value), label: a.label })),
  ];

  const typeColor = (t: string) => ITEM_TYPES.find(it => it.value === t)?.color || '#A8A19A';

  const showParent = itemType === 'subtask';
  const showLinkTo = itemType === 'story' || itemType === 'task' || itemType === 'bug';
  const showSprint = itemType !== 'subtask';
  const showColor = itemType === 'epic';
  const parentRequired = itemType === 'subtask';

  const parentComboOptions = [
    ...(!parentRequired ? [{ value: '', label: 'Standalone' }] : []),
    ...parentOptions.map(p => ({
      value: String(p.id),
      label: `#${p.itemNumber} — ${p.title}`,
      prefix: (<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor(p.itemType) }} />) as React.ReactNode,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Title is required'); return; }
    if (parentRequired && !parentId) { setError('Subtasks must have a parent'); return; }

    setLoading(true);
    try {
      const body: any = { itemType, title: title.trim(), priority };
      if (description.trim()) body.description = description.trim();
      if (parentId) body.parentId = parseInt(parentId);
      if (linkedItemId) {
        body.linkedItemId = parseInt(linkedItemId);
        body.linkType = 'belongs_to';
      }
      if (showSprint && sprintId) body.sprintId = parseInt(sprintId);
      if (statusId) body.statusId = parseInt(statusId);
      if (assigneeId) body.assigneeId = parseInt(assigneeId);
      if (storyPoints) body.storyPoints = parseInt(storyPoints);
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      if (showColor) body.color = color;
      if (labelIds.length > 0) body.labelIds = labelIds;

      await apiClient.post(`/projects/${projectId}/items`, body);
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['epics'] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      toast(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} created`);
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to create ${itemType}`);
    } finally { setLoading(false); }
  };

  const labelClass = 'block text-[14px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1';

  return (
    <Drawer open onClose={onClose} width="w-[480px]">
      <DrawerHeader>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[20px] font-bold text-neutral-700 dark:text-dneutral-700">Create new item</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:text-dneutral-400 dark:hover:text-dneutral-600 text-[20px]">&times;</button>
        </div>
      </DrawerHeader>

      <DrawerBody className="px-5 py-4">
        <form id="create-item-form" onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[14px] text-danger">{error}</div>}

          {/* Type selector */}
          <div>
            <label className={labelClass}>Type</label>
            <div className="flex gap-2">
              {ITEM_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setItemType(t.value)}
                  className={`flex items-center gap-1.5 px-3 h-[30px] rounded-md text-[14px] font-medium transition-all ${itemType === t.value ? 'ring-2 ring-offset-1 shadow-sm' : 'opacity-60 hover:opacity-80'}`}
                  style={{ backgroundColor: itemType === t.value ? `${t.color}18` : 'transparent', color: t.color, border: `1px solid ${itemType === t.value ? t.color : '#D1CCC7'}` }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className={labelClass}>Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} title...`} required maxLength={500} autoFocus />
          </div>

          {/* Two-column fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Priority</label>
              <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Assignee</label>
              <Combobox value={assigneeId} onChange={setAssigneeId} options={assigneeComboOptions} placeholder="Search assignees..." emptyLabel="Unassigned" className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <Select value={statusId} onChange={setStatusId} options={[{ value: '', label: 'Default' }, ...statuses.map((s) => ({ value: String(s.id), label: s.name }))]} className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Points</label>
              <Input value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} placeholder="0" className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            </div>
          </div>

          {/* Parent (subtask only) */}
          {showParent && (
            <div>
              <label className={labelClass}>Parent *</label>
              <Combobox value={parentId} onChange={setParentId} options={parentComboOptions} placeholder="Select parent (required)..." emptyLabel="" className="w-full" />
            </div>
          )}

          {/* Link to (story, task, bug) */}
          {showLinkTo && (
            <div>
              <label className={labelClass}>Link to (optional)</label>
              <Combobox value={linkedItemId} onChange={setLinkedItemId} options={linkToOptions} placeholder="Search to link..." emptyLabel="None" className="w-full" />
            </div>
          )}

          {/* Sprint */}
          {showSprint && sprints.length > 0 && (
            <div>
              <label className={labelClass}>Sprint</label>
              <Select value={sprintId} onChange={setSprintId} options={[{ value: '', label: 'No sprint' }, ...sprints.map((s) => ({ value: String(s.id), label: s.name }))]} className="w-full" />
            </div>
          )}

          {/* Color picker (epic only) */}
          {showColor && (
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2 items-center">
                {DEFAULT_EPIC_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" title="Custom color" />
              </div>
            </div>
          )}

          {/* Dates — start + end for all types */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div>
              <label className={labelClass}>Labels</label>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <button key={l.id} type="button" onClick={() => setLabelIds((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                    className={`px-2 py-0.5 rounded-full text-[12px] font-medium transition-all border ${labelIds.includes(l.id) ? 'ring-1 ring-offset-1' : 'opacity-60 hover:opacity-80'}`}
                    style={{ backgroundColor: `${l.color}20`, color: l.color, borderColor: labelIds.includes(l.id) ? l.color : 'transparent' }}>
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Optional description..." maxLength={50000} />
          </div>
        </form>
      </DrawerBody>

      <DrawerFooter>
        <div className="flex justify-end gap-2 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-item-form" variant="primary" disabled={loading}>
            {loading ? 'Creating...' : `Create ${itemType}`}
          </Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}
