import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { Select } from '../ui/Select';
import { Combobox } from '../ui/Combobox';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Drawer, DrawerHeader, DrawerBody } from '../common/Drawer';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { toast } from '../common/Toast';
import { useTaskAutoSave } from '../../hooks/useTaskAutoSave';
import { useRole } from '../../hooks/useRole';
import { SaveStatusIndicator } from '../common/SaveStatusIndicator';
import { LabelPicker } from '../ui/LabelPicker';
import { LabelList } from '../ui/LabelBadge';

interface Subtask {
  id: number;
  itemNumber: number;
  title: string;
  statusId: number;
  completedAt: string | null;
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
}

interface Dependency {
  id: number;
  workItemId?: number;
  dependencyType: string;
  item?: { id: number; itemKey: string; itemType: string; title: string; status?: any };
  dependsOnItem?: { id: number; itemKey: string; itemType: string; title: string; status?: any };
}

interface TaskDetail {
  id: number;
  itemNumber: number;
  title: string;
  description: string | null;
  itemType?: string;
  priority: string;
  statusId: number;
  status?: { id: number; name: string; category: string; color: string };
  storyPoints: number | null;
  assigneeId: number | null;
  sprintId: number | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  parentId?: number | null;
  parentInfo?: { id: number; taskKey: string; title: string } | null;
  subtasks?: Subtask[];
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
  blockedBy?: Dependency[];
  blocks?: Dependency[];
  subtaskCount?: number;
  labels?: { id: number; name: string; color: string }[];
}

interface TaskDetailPanelProps {
  projectId: number;
  taskId: number;
  projectPrefix: string;
  onClose: () => void;
  onUpdated?: () => void;
  isSubtask?: boolean;
  parentTaskKey?: string;
  defaultSubtaskId?: number;
}

interface CommentItem {
  id: number;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author?: { id: number; displayName: string; avatarUrl: string | null };
}

interface AttachmentItem {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function TaskDetailPanel({ projectId, taskId, projectPrefix, onClose, onUpdated, isSubtask, parentTaskKey, defaultSubtaskId }: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [storyPoints, setStoryPoints] = useState<string>('');
  const [openSubtaskId, setOpenSubtaskId] = useState<number | null>(defaultSubtaskId || null);
  const [checklistItems, setChecklistItems] = useState<{ id: number; title: string; isCompleted: boolean }[]>([]);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { canEdit } = useRole();
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [parentOptions, setParentOptions] = useState<{ value: string; label: string; data?: any }[]>([]);
  const [sprintOptions, setSprintOptions] = useState<{ value: string; label: string }[]>([]);
  const [parentSprintName, setParentSprintName] = useState<string>('');
  const [associations, setAssociations] = useState<any>(null);
  const [showAddAssociation, setShowAddAssociation] = useState(false);
  const [addAssocLinkType, setAddAssocLinkType] = useState<string>('belongs_to');
  const [assocSearchQuery, setAssocSearchQuery] = useState('');
  const [assocSearchResults, setAssocSearchResults] = useState<any[]>([]);
  const [assocSearching, setAssocSearching] = useState(false);
  const assocSearchSeqRef = useRef(0);
  const { saveStatus, flushDebounce, debouncedFieldChange, handleFieldChange, saveAssignee } = useTaskAutoSave({ projectId, taskId, onUpdated });

  // Race-protected loader for the current taskId. Inlined ignore-aware wrappers
  // so we don't have to change the signature of the top-level helpers
  // (loadTask/loadAssociations) which are also called from event handlers.
  useEffect(() => {
    let ignored = false;
    const loadTaskGuarded = async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}`);
        if (ignored) return;
        setTask(data.data);
        setTitle(data.data.title);
        setStoryPoints(data.data.storyPoints != null ? String(data.data.storyPoints) : '');
        setChecklistItems(data.data.checklistItems || []);
      } catch (err) { console.error(err); }
    };
    const loadCommentsGuarded = async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/comments`);
        if (ignored) return;
        setComments(data.data.list || []);
      } catch (err) { console.error(err); }
    };
    const loadAttachmentsGuarded = async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/attachments`);
        if (ignored) return;
        setAttachments(data.data.list || []);
      } catch (err) { console.error(err); }
    };
    const loadAssociationsGuarded = async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/associations`);
        if (ignored) return;
        setAssociations(data.data);
      } catch (err) { console.error(err); }
    };
    Promise.all([loadTaskGuarded(), loadCommentsGuarded(), loadAttachmentsGuarded(), loadAssociationsGuarded()]);
    return () => { ignored = true; };
  }, [taskId, projectId]);

  // Load assignees once per project (not per task)
  useEffect(() => {
    let ignored = false;
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((res) => {
      if (ignored) return;
      const opts = (res.data.data.list || []).map((o: any) => ({ value: String(o.value), label: o.label }));
      setAssigneeOptions([{ value: '', label: 'Unassigned' }, ...opts]);
    }).catch((err) => { console.error(err); });
    // Parent options loaded after task is fetched (depends on itemType)
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((res) => {
      if (ignored) return;
      const list = res.data.data.list || [];
      setSprintOptions([{ value: '', label: 'Backlog' }, ...list.map((s: any) => ({ value: String(s.id), label: `${s.name} (${s.status})` }))]);
    }).catch((err) => { console.error(err); });
    return () => { ignored = true; };
  }, [projectId]);

  // For subtasks, fetch parent's sprint name
  useEffect(() => {
    if (!task || task.itemType !== 'subtask' || !task.parentId) {
      setParentSprintName('');
      return;
    }
    let ignored = false;
    apiClient.get(`/projects/${projectId}/items/${task.parentId}`)
      .then((res) => {
        if (ignored) return;
        const parent = res.data.data;
        setParentSprintName(parent?.sprint?.name || 'Backlog');
      })
      .catch(() => { if (!ignored) setParentSprintName(''); });
    return () => { ignored = true; };
  }, [task?.itemType, task?.parentId, projectId]);

  // Load parent options — only for subtasks
  useEffect(() => {
    if (!task) return;
    const itemType = task.itemType || 'task';

    if (itemType !== 'subtask') {
      setParentOptions([]);
      return;
    }

    let ignored = false;
    // Subtask parents: tasks + stories + epics (Task 5.6 alignment)
    apiClient.get(`/projects/${projectId}/items?itemType=task,story,epic&limit=100&sort=updatedAt&order=DESC`)
      .then((res) => {
        if (ignored) return;
        const list = res.data.data?.list || [];
        const opts = list
          .filter((i: any) => i.id !== taskId)
          .map((i: any) => ({
            value: String(i.id),
            label: `${i.itemKey || '#' + i.itemNumber} ${i.title}`,
            data: {
              itemType: i.itemType,
              itemKey: i.itemKey || `#${i.itemNumber}`,
              title: i.title,
            },
          }));
        setParentOptions(opts);
      })
      .catch(() => { if (!ignored) setParentOptions([]); });
    return () => { ignored = true; };
  }, [task?.itemType, projectId, taskId]);

  useEffect(() => {
    const handler = async () => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser || !task) return;
      try {
        await apiClient.put(`/projects/${projectId}/items/${taskId}`, { assigneeId: currentUser.id });
        await loadTask();
        onUpdated?.();
      } catch (err: any) {
        toast(err.response?.data?.message || 'Failed to assign', 'error');
      }
    };
    document.addEventListener('shortcut-assign-to-me', handler as EventListener);
    return () => document.removeEventListener('shortcut-assign-to-me', handler as EventListener);
  }, [projectId, taskId, task]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}`);
      setTask(data.data);
      setTitle(data.data.title);
      setStoryPoints(data.data.storyPoints != null ? String(data.data.storyPoints) : '');
      setChecklistItems(data.data.checklistItems || []);
    } catch (err) { console.error(err); }
  };

  const loadAssociations = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/associations`);
      setAssociations(data.data);
    } catch (err) { console.error(err); }
  };

  const handleAssocSearch = async (q: string) => {
    setAssocSearchQuery(q);
    setAssocSearching(true);
    const seq = ++assocSearchSeqRef.current;
    try {
      const params = q.length >= 2 ? `search=${encodeURIComponent(q)}&limit=20` : 'limit=20&sort=updatedAt&order=DESC';
      const { data } = await apiClient.get(`/projects/${projectId}/items?${params}`);
      if (seq !== assocSearchSeqRef.current) return;
      setAssocSearchResults((data.data.list || []).filter((t: any) => t.id !== taskId));
    } catch (err) { console.error(err); }
    if (seq === assocSearchSeqRef.current) setAssocSearching(false);
  };

  const handleAddAssociation = async (linkedItemId: number) => {
    try {
      await apiClient.post(`/projects/${projectId}/items/${taskId}/associations`, { linkedItemId, linkType: addAssocLinkType });
      setShowAddAssociation(false);
      setAssocSearchQuery('');
      setAssocSearchResults([]);
      loadAssociations();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to link item', 'error');
    }
  };

  const handleRemoveAssociation = async (assocId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}/associations/${assocId}`);
      loadAssociations();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to remove link', 'error');
    }
  };

  const handleTitleBlur = () => {
    flushDebounce();
    setEditing(false);
  };

  const handleDeleteItem = async () => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}`);
      toast('Item deleted');
      setShowDeleteConfirm(false);
      onClose();
      onUpdated?.();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete', 'error');
      setShowDeleteConfirm(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const { data } = await apiClient.post(`/projects/${projectId}/items/${taskId}/comments`, { body: newComment });
      setNewComment('');
      setComments(data.data.list || []);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to post comment', 'error');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await apiClient.post(`/projects/${projectId}/items/${taskId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachments(data.data.list || []);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to upload', 'error');
    }
    e.target.value = '';
  };

  const handleDownload = async (attachmentId: number) => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/attachments/${attachmentId}/url`);
      // 'noopener,noreferrer' prevents the new tab from accessing window.opener
      // (reverse tabnabbing) and strips the Referer header to the presigned URL.
      window.open(data.data.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to download', 'error');
    }
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/items/${taskId}/checklist`, { title: newChecklistTitle.trim() });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add checklist item', 'error');
    }
  };

  const handleToggleChecklist = async (itemId: number, isCompleted: boolean) => {
    try {
      await apiClient.put(`/projects/${projectId}/items/${taskId}/checklist/${itemId}`, { isCompleted: !isCompleted });
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update checklist', 'error');
    }
  };

  const handleDeleteChecklist = async (itemId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}/checklist/${itemId}`);
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete checklist item', 'error');
    }
  };

  const handleCreateSubtaskAndOpen = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      const { data } = await apiClient.post(`/projects/${projectId}/items`, { itemType: 'subtask', parentId: taskId, title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      const newId = data.data.item?.id;
      if (newId) setOpenSubtaskId(newId);
      loadTask();
      onUpdated?.();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to create subtask', 'error');
    }
  };

  const taskKey = task ? (projectPrefix ? `${projectPrefix}-${task.itemNumber}` : `#${task.itemNumber}`) : '';
  const level = isSubtask ? 1 : 0;
  const parentKey = task ? (parentTaskKey || (task.parentInfo ? task.parentInfo.taskKey : null)) : null;

  return (
    <>
      <Drawer
        open
        onClose={() => { setOpenSubtaskId(null); onClose(); }}
        level={level}
        pushed={!!openSubtaskId}
      >
        {!task ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-neutral-400">Loading...</div>
          </div>
        ) : (
          <>
        <DrawerHeader>
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              {(() => {
                const typeColors: Record<string, { bg: string; text: string }> = {
                  epic: { bg: '#7C5CFC35', text: '#4A2FC0' },
                  story: { bg: '#88A9D640', text: '#2E5A8E' },
                  task: { bg: '#D6B58840', text: '#7A5E2A' },
                  subtask: { bg: '#A8A19A35', text: '#5C5650' },
                  bug: { bg: '#FF634735', text: '#CC3300' },
                };
                const t = task.itemType || 'task';
                const style = typeColors[t] || typeColors.task;
                return (
                  <span
                    className="px-2 py-0.5 rounded text-[12px] font-semibold uppercase leading-none"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {t}
                  </span>
                );
              })()}
              {isSubtask && parentKey ? (
                <div className="flex items-center gap-1.5 text-[16px] font-mono">
                  <button onClick={onClose} className="text-neutral-400 hover:text-lilac-dark">{parentKey}</button>
                  <span className="text-neutral-300 dark:text-dneutral-400">→</span>
                  <span className="text-neutral-700 dark:text-dneutral-700">{taskKey}</span>
                </div>
              ) : (
                <span className="text-[16px] font-mono text-neutral-400">{taskKey}</span>
              )}
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1 hover:bg-danger/10 rounded text-neutral-400 hover:text-danger"
                  title="Delete"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              {!isSubtask && (
                <button
                  onClick={() => { onClose(); navigate(`/projects/${projectId}/tasks/${taskId}`); }}
                  className="p-1 hover:bg-neutral-100 dark:hover:bg-dneutral-200 rounded text-neutral-400"
                  title="Open full screen"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </button>
              )}
              <button onClick={onClose} className="p-1 hover:bg-neutral-100 dark:hover:bg-dneutral-200 rounded text-neutral-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 pb-2 text-[16px] text-neutral-400 dark:text-dneutral-500">
            <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            {task.status && (
              <span className="flex items-center gap-1.5">
                ·
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.status.color }} />
                <span style={{ color: task.status.color }}>{task.status.name}</span>
                {task.statusChangedAt && (
                  <span className="text-neutral-400 dark:text-dneutral-500">since {new Date(task.statusChangedAt).toLocaleDateString()}</span>
                )}
              </span>
            )}
          </div>
        </DrawerHeader>

        <DrawerBody className="p-5 space-y-6">
          {/* Title — italic-serif hero per frame 6, scaled down to 32px so it
              still feels like a hero inside the slide-over without dominating.
              Click-to-edit preserved. */}
          {editing ? (
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim() && e.target.value !== task?.title) {
                  debouncedFieldChange('title', e.target.value, loadTask);
                }
              }}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              autoFocus
              className="w-full serif-i text-[32px] leading-[1.05] bg-transparent border-b border-[var(--accent)] outline-none text-ink"
            />
          ) : (
            <h2
              onClick={() => setEditing(true)}
              className="serif-i text-[32px] leading-[1.05] text-ink cursor-pointer hover:text-[var(--accent)]"
            >
              {task.title}
            </h2>
          )}

          {/* Properties — 2 columns. Labels use .smallcaps (10px / 600 /
              tracking 0.12em / uppercase / --ink-3) per the design canon. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
            <div>
              <span className="smallcaps block mb-1.5">Priority</span>
              <Select
                value={task.priority}
                onChange={(val) => handleFieldChange('priority', val, loadTask)}
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                  { value: 'none', label: 'None' },
                ]}
                className="w-full"
              />
            </div>

            <div>
              <span className="smallcaps block mb-1.5">Story Points</span>
              <input
                type="text"
                inputMode="numeric"
                value={storyPoints}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) {
                    setStoryPoints(v);
                    const parsed = v === '' ? null : parseInt(v, 10);
                    if (parsed !== (task.storyPoints ?? null)) {
                      debouncedFieldChange('storyPoints', parsed, loadTask);
                    }
                  }
                }}
                onBlur={() => flushDebounce()}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-full rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 px-3 py-1 text-[16px] text-neutral-700 dark:text-dneutral-700 focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac/30 h-[30px]"
                placeholder="-"
              />
            </div>

            <div>
              <span className="smallcaps block mb-1.5">Assignee</span>
              <Select
                value={task.assigneeId ? String(task.assigneeId) : ''}
                onChange={(val) => {
                  const assigneeId = val ? parseInt(val) : null;
                  saveAssignee(assigneeId, loadTask);
                }}
                options={assigneeOptions}
                placeholder="Unassigned"
                className="w-full"
              />
            </div>

            {/* Parent — only for subtasks */}
            {task.itemType === 'subtask' && (
              <div>
                <span className="smallcaps block mb-1.5">Parent</span>
                <Combobox
                  value={task.parentId ? String(task.parentId) : ''}
                  onChange={async (val) => {
                    const parentId = val ? parseInt(val) : null;
                    try {
                      await apiClient.put(`/projects/${projectId}/items/${taskId}/move`, { parentId });
                      await loadTask();
                      onUpdated?.();
                    } catch (err: any) {
                      toast(err.response?.data?.message || 'Failed to update parent', 'error');
                    }
                  }}
                  options={parentOptions}
                  placeholder="Select parent..."
                  emptyLabel=""
                  className="w-full"
                  renderOption={(opt, isHighlighted, isSelected) => {
                    if (!opt.data) {
                      return <span className="text-[14px] text-neutral-500">{opt.label}</span>;
                    }
                    const typeStyles: Record<string, { bg: string; text: string }> = {
                      epic: { bg: '#7C5CFC35', text: '#4A2FC0' },
                      story: { bg: '#88A9D640', text: '#2E5A8E' },
                      task: { bg: '#D6B58840', text: '#7A5E2A' },
                      subtask: { bg: '#A8A19A35', text: '#5C5650' },
                    };
                    const style = typeStyles[opt.data.itemType] || typeStyles.subtask;
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: style.bg, color: style.text }}
                          >
                            {opt.data.itemType}
                          </span>
                          <span className="text-[13px] font-mono text-neutral-400">{opt.data.itemKey}</span>
                        </div>
                        <p className={`text-[14px] line-clamp-2 ${isHighlighted ? 'text-lilac-dark' : isSelected ? 'text-neutral-700 dark:text-dneutral-700 font-medium' : 'text-neutral-600 dark:text-dneutral-600'}`}>
                          {opt.data.title}
                        </p>
                      </div>
                    );
                  }}
                />
              </div>
            )}

            {/* Sprint */}
            <div>
              <span className="smallcaps block mb-1.5">Sprint</span>
              {task.itemType === 'subtask' ? (
                <div className="h-[30px] flex items-center px-3 rounded-md border border-neutral-200 dark:border-dneutral-200 bg-neutral-100 dark:bg-dneutral-200 text-[16px] text-neutral-500 dark:text-dneutral-500 cursor-not-allowed">
                  {parentSprintName || 'Inherited'}
                </div>
              ) : (
                <Select
                  value={task.sprintId ? String(task.sprintId) : ''}
                  onChange={async (val) => {
                    const sprintId = val ? parseInt(val) : null;
                    try {
                      await apiClient.put(`/projects/${projectId}/items/${taskId}/sprint`, { sprintId });
                      await loadTask();
                      onUpdated?.();
                    } catch (err: any) {
                      toast(err.response?.data?.message || 'Failed to update sprint', 'error');
                    }
                  }}
                  options={sprintOptions}
                  placeholder="Backlog"
                  className="w-full"
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="smallcaps mb-2">Description</h3>
            <textarea
              value={task.description || ''}
              onChange={(e) => {
                const val = e.target.value;
                setTask((prev) => prev ? { ...prev, description: val } : prev);
                debouncedFieldChange('description', val || null, loadTask);
              }}
              onBlur={() => flushDebounce()}
              placeholder="Add a description..."
              rows={3}
              className="w-full text-[16px] text-neutral-700 dark:text-dneutral-700 min-h-[60px] p-3 rounded border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 placeholder-neutral-400 resize-none focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac/30"
            />
          </div>

          {/* Labels */}
          <div>
            <h3 className="smallcaps mb-2">Labels</h3>
            {canEdit ? (
              <LabelPicker
                projectId={projectId}
                selectedIds={(task.labels || []).map(l => l.id)}
                onChange={async (ids) => {
                  try {
                    await apiClient.put(`/projects/${projectId}/items/${taskId}`, { labelIds: ids });
                    await loadTask();
                    onUpdated?.();
                  } catch (err: any) {
                    toast(err.response?.data?.message || 'Failed to update labels', 'error');
                  }
                }}
              />
            ) : (
              <LabelList labels={task.labels || []} max={10} size="md" />
            )}
          </div>

          {/* Associations */}
          <div>
            <h3 className="smallcaps mb-2">Associations</h3>
            {associations && (
              <div className="space-y-2">
                {associations.belongsTo?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-neutral-400 uppercase">Part of</span>
                    {associations.belongsTo.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                    ))}
                  </div>
                )}
                {associations.blocks?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-neutral-400 uppercase">Blocks</span>
                    {associations.blocks.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                    ))}
                  </div>
                )}
                {associations.blockedBy?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-neutral-400 uppercase">Blocked by</span>
                    {associations.blockedBy.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                    ))}
                  </div>
                )}
                {associations.relatesTo?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-neutral-400 uppercase">Related</span>
                    {associations.relatesTo.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                    ))}
                  </div>
                )}
                {associations.causedBy?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-neutral-400 uppercase">Caused by</span>
                    {associations.causedBy.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {canEdit && !showAddAssociation && (
              <button onClick={() => setShowAddAssociation(true)} className="text-[14px] text-lilac-dark hover:underline mt-2">
                + Link item
              </button>
            )}
            {showAddAssociation && canEdit && (
              <div className="mt-2 p-3 rounded-lg bg-neutral-50 dark:bg-dneutral-100 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'belongs_to', label: 'Part of' },
                    { value: 'relates_to', label: 'Related' },
                    { value: 'blocks', label: 'Blocks' },
                    { value: 'caused_by', label: 'Caused by' },
                  ].map((lt) => (
                    <button
                      key={lt.value}
                      onClick={() => setAddAssocLinkType(lt.value)}
                      className={`text-[14px] px-2 py-1 rounded ${addAssocLinkType === lt.value ? 'bg-lilac text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200'}`}
                    >
                      {lt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={assocSearchQuery}
                  onChange={(e) => handleAssocSearch(e.target.value)}
                  onFocus={() => { if (assocSearchResults.length === 0) handleAssocSearch(''); }}
                  placeholder="Search items..."
                  autoFocus
                  className="w-full text-[14px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-lilac focus:outline-none h-[30px]"
                />
                {assocSearching && <p className="text-[12px] text-neutral-400">Searching...</p>}
                <div className="max-h-[240px] overflow-y-auto border border-neutral-200 dark:border-dneutral-200 rounded">
                  {assocSearchResults.map((t: any) => {
                    const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
                      epic: { bg: '#7C5CFC35', text: '#4A2FC0' }, story: { bg: '#88A9D640', text: '#2E5A8E' },
                      task: { bg: '#D6B58840', text: '#7A5E2A' }, bug: { bg: '#E0525235', text: '#A03030' }, subtask: { bg: '#A8A19A35', text: '#5C5650' },
                    };
                    const ts = TYPE_STYLES[t.itemType] || TYPE_STYLES.task;
                    return (
                      <button key={t.id} onClick={() => handleAddAssociation(t.id)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-dneutral-200/30 last:border-b-0 hover:bg-lilac-tint transition-colors">
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: ts.bg, color: ts.text }}>
                          {t.itemType === 'subtask' ? 'sub' : t.itemType}
                        </span>
                        <span className="font-mono text-[12px] text-neutral-400 flex-shrink-0">{t.itemKey || `#${t.itemNumber}`}</span>
                        <span className="text-[14px] text-neutral-700 dark:text-dneutral-700 truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {!assocSearching && assocSearchResults.length === 0 && (
                    <p className="text-[12px] text-neutral-400 px-3 py-2">No items found</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowAddAssociation(false); setAssocSearchQuery(''); setAssocSearchResults([]); }}>Cancel</Button>
              </div>
            )}
          </div>

          {/* Subtasks — only on parent tasks */}
          {!isSubtask && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[16px] font-medium text-neutral-400">
                  Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.length})`}
                </h3>
              </div>
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="space-y-1 mb-2">
                  {task.subtasks.map((st) => (
                    <button key={st.id} onClick={() => setOpenSubtaskId(st.id)} className="flex items-center gap-2 text-[16px] py-1.5 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 w-full text-left">
                      <span className={st.completedAt ? 'text-success' : 'text-neutral-400'}>
                        {st.completedAt ? '☑' : '☐'}
                      </span>
                      <span className={`flex-1 ${st.completedAt ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-dneutral-700'}`}>
                        {st.title}
                      </span>
                      <span className="text-neutral-400 text-[16px]">→</span>
                    </button>
                  ))}
                </div>
              )}
              {canEdit && (showAddSubtask ? (
                <form onSubmit={(e) => { e.preventDefault(); handleCreateSubtaskAndOpen(); }} className="flex gap-1">
                  <Input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Subtask title..."
                    autoFocus
                    className="flex-1"
                  />
                  <Button type="submit" variant="primary" size="sm">Add</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddSubtask(false)}>Cancel</Button>
                </form>
              ) : (
                <button onClick={() => setShowAddSubtask(true)} className="text-[16px] text-neutral-400 hover:text-lilac-dark">
                  + Add subtask
                </button>
              ))}
            </div>
          )}

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-medium text-neutral-400">
                Checklist {checklistItems.length > 0 && `(${checklistItems.filter((i) => i.isCompleted).length}/${checklistItems.length})`}
              </h3>
              {canEdit && !showAddChecklist && (
                <button onClick={() => setShowAddChecklist(true)} className="text-[16px] text-lilac-dark hover:underline">+ Add item</button>
              )}
            </div>
            {checklistItems.length > 0 && (
              <div className="space-y-1 mb-2">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[16px] py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => canEdit && handleToggleChecklist(item.id, item.isCompleted)}
                      className="w-4 h-4 rounded border-neutral-200"
                    />
                    <span className={`flex-1 ${item.isCompleted ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-dneutral-700'}`}>
                      {item.title}
                    </span>
                    {canEdit && (
                      <button onClick={() => handleDeleteChecklist(item.id)} className="text-[16px] text-neutral-400 hover:text-danger">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {checklistItems.length === 0 && !showAddChecklist && (
              <p className="text-[16px] text-neutral-400">No checklist items</p>
            )}
            {showAddChecklist && canEdit && (
              <form onSubmit={handleAddChecklistItem} className="flex gap-1">
                <Input
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Checklist item..."
                  autoFocus
                  className="flex-1"
                />
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddChecklist(false)}>Cancel</Button>
              </form>
            )}
          </div>

          {/* Dependencies */}
          <DependencySection
            projectId={projectId}
            taskId={taskId}
            blockedBy={task.blockedBy || []}
            blocks={task.blocks || []}
            canEdit={canEdit}
            onChanged={loadTask}
          />
          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-medium text-neutral-400">Attachments</h3>
              {canEdit && (
                <label className="text-[16px] text-lilac-dark hover:underline cursor-pointer">
                  + Upload
                  <input type="file" className="hidden" onChange={handleUpload} />
                </label>
              )}
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <AttachmentRow key={att.id} attachment={att} projectId={projectId} taskId={taskId} onDownload={handleDownload} />
                ))}
              </div>
            ) : (
              <p className="text-[16px] text-neutral-400">No attachments</p>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="smallcaps mb-2">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>
            {comments.length > 0 && (
              <div className="space-y-3 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-[16px]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-neutral-700 dark:text-dneutral-700">
                        {c.author?.displayName || 'Unknown'}
                      </span>
                      <span className="text-[16px] text-neutral-400">
                        {new Date(c.createdAt).toLocaleString()}
                        {c.editedAt && ' (edited)'}
                      </span>
                    </div>
                    <p className="text-neutral-600 dark:text-dneutral-600 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <form onSubmit={handleAddComment} className="flex gap-1">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 text-[16px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-300 bg-transparent text-neutral-700 dark:text-dneutral-700"
                />
                <Button type="submit" variant="primary" size="sm">Post</Button>
              </form>
            )}
          </div>
        </DrawerBody>
          </>
        )}
      </Drawer>

      {/* Stacked subtask drawer */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete item"
          message={`Are you sure you want to delete "${task?.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteItem}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {openSubtaskId && !isSubtask && (
        <TaskDetailPanel
          projectId={projectId}
          taskId={openSubtaskId}
          projectPrefix={projectPrefix}
          isSubtask
          parentTaskKey={taskKey}
          onClose={() => setOpenSubtaskId(null)}
          onUpdated={() => { loadTask(); onUpdated?.(); }}
        />
      )}
    </>
  );
}

function AssociationRow({ assoc, onRemove }: { assoc: any; onRemove?: () => void }) {
  const item = assoc.item;
  if (!item) return null;

  const typeColors: Record<string, { bg: string; text: string }> = {
    epic: { bg: '#7C5CFC35', text: '#4A2FC0' },
    story: { bg: '#88A9D640', text: '#2E5A8E' },
    task: { bg: '#D6B58840', text: '#7A5E2A' },
    subtask: { bg: '#A8A19A35', text: '#5C5650' },
    bug: { bg: '#FF634735', text: '#CC3300' },
  };
  const style = typeColors[item.itemType] || typeColors.task;

  return (
    <div className="group flex items-center gap-2 text-[16px] py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
      <span
        className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {item.itemType}
      </span>
      <span className="font-mono text-[14px] text-neutral-400 flex-shrink-0">{item.itemKey}</span>
      <span className="text-neutral-600 dark:text-dneutral-600 truncate flex-1">{item.title}</span>
      {onRemove && (
        <button onClick={onRemove} className="text-neutral-400 hover:text-danger opacity-0 group-hover:opacity-100 text-[14px]">x</button>
      )}
    </div>
  );
}

function DependencySection({ projectId, taskId, blockedBy, blocks, canEdit, onChanged }: {
  projectId: number; taskId: number; blockedBy: Dependency[]; blocks: Dependency[]; canEdit: boolean; onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<'blocks' | 'blocked_by'>('blocked_by');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: number; itemNumber: number; itemKey: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeqRef = useRef(0);

  const existingIds = new Set([
    taskId,
    ...blockedBy.map((d) => d.dependsOnItem?.id).filter(Boolean),
    ...blocks.map((d) => d.item?.id).filter(Boolean),
  ]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items?search=${encodeURIComponent(q)}&limit=10`);
      if (seq !== searchSeqRef.current) return;
      setSearchResults((data.data.list || []).filter((t: any) => !existingIds.has(t.id)));
    } catch (err) { console.error(err); }
    if (seq === searchSeqRef.current) setSearching(false);
  };

  const handleAdd = async (targetTaskId: number) => {
    try {
      if (addType === 'blocked_by') {
        await apiClient.post(`/projects/${projectId}/items/${taskId}/associations`, { linkedItemId: targetTaskId, linkType: 'blocks' });
      } else {
        await apiClient.post(`/projects/${projectId}/items/${targetTaskId}/associations`, { linkedItemId: taskId, linkType: 'blocks' });
      }
      setShowAdd(false);
      setSearchQuery('');
      setSearchResults([]);
      onChanged();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add dependency', 'error');
    }
  };

  const handleRemove = async (depId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}/associations/${depId}`);
      onChanged();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to remove dependency', 'error');
    }
  };

  const unresolvedCount = blockedBy.filter((d) => d.dependsOnItem).length;
  const hasDeps = blockedBy.length > 0 || blocks.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[16px] font-medium text-neutral-400">Dependencies</h3>
        {canEdit && !showAdd && (
          <button onClick={() => setShowAdd(true)} className="text-[16px] text-lilac-dark hover:underline">+ Add</button>
        )}
      </div>

      {blockedBy.length > 0 && (
        <div className="mb-2">
          <span className={`text-[14px] font-medium uppercase ${unresolvedCount > 0 ? 'text-danger' : 'text-neutral-400'}`}>
            Blocked by ({unresolvedCount > 0 ? `${unresolvedCount} unresolved` : blockedBy.length})
          </span>
          {blockedBy.map((dep) => (
            <div key={dep.id} className="group flex items-center gap-2 text-[16px] py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
              <span className="text-danger text-[14px]">🔒</span>
              <span className="text-neutral-600 dark:text-dneutral-600 truncate flex-1">
                #{dep.dependsOnItem?.itemKey} {dep.dependsOnItem?.title}
              </span>
              {canEdit && (
                <button onClick={() => handleRemove(dep.id)} className="text-neutral-400 hover:text-danger opacity-0 group-hover:opacity-100 text-[14px]">×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mb-2">
          <span className="text-[14px] font-medium uppercase text-neutral-400">Blocks ({blocks.length})</span>
          {blocks.map((dep) => (
            <div key={dep.id} className="group flex items-center gap-2 text-[16px] py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
              <span className="text-tan text-[14px]">⏳</span>
              <span className="text-neutral-600 dark:text-dneutral-600 truncate flex-1">
                #{dep.item?.itemKey} {dep.item?.title}
              </span>
              {canEdit && (
                <button onClick={() => handleRemove(dep.id)} className="text-neutral-400 hover:text-danger opacity-0 group-hover:opacity-100 text-[14px]">×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasDeps && !showAdd && <p className="text-[16px] text-neutral-400">No dependencies</p>}

      {showAdd && (
        <div className="mt-2 p-3 rounded-lg bg-neutral-50 dark:bg-dneutral-100 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setAddType('blocked_by')} className={`text-[14px] px-2 py-1 rounded ${addType === 'blocked_by' ? 'bg-lilac text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200'}`}>Blocked by</button>
            <button onClick={() => setAddType('blocks')} className={`text-[14px] px-2 py-1 rounded ${addType === 'blocks' ? 'bg-lilac text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200'}`}>Blocks</button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search tasks..."
            autoFocus
            className="w-full text-[16px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-lilac focus:outline-none"
          />
          {searching && <p className="text-[14px] text-neutral-400">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="max-h-[160px] overflow-y-auto space-y-1">
              {searchResults.map((t) => (
                <button key={t.id} onClick={() => handleAdd(t.id)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-[16px]">
                  <span className="font-mono text-[14px] text-neutral-400">{t.itemKey}</span>
                  <span className="text-neutral-700 dark:text-dneutral-700 truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-[14px] text-neutral-400">No tasks found</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setSearchQuery(''); setSearchResults([]); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function AttachmentRow({ attachment, projectId, taskId, onDownload }: {
  attachment: AttachmentItem;
  projectId: number;
  taskId: number;
  onDownload: (id: number) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let ignored = false;
    apiClient.get(`/projects/${projectId}/items/${taskId}/attachments/${attachment.id}/url`)
      .then((res) => {
        if (ignored) return;
        setPreviewUrl(res.data.data.url);
      })
      .catch((err) => { console.error(err); });
    return () => { ignored = true; };
  }, [attachment.id, isImage, projectId, taskId]);

  return (
    <button
      onClick={() => onDownload(attachment.id)}
      className="flex items-start gap-2 w-full text-left text-[16px] p-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200"
    >
      {isImage && previewUrl ? (
        <img src={previewUrl} alt={attachment.originalFilename} className="w-12 h-12 rounded object-cover flex-shrink-0 border border-neutral-200 dark:border-dneutral-300" />
      ) : (
        <span className="text-neutral-400 flex-shrink-0 mt-0.5">&#x1F4CE;</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{attachment.originalFilename}</p>
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500">{(attachment.sizeBytes / 1024).toFixed(0)} KB</p>
      </div>
    </button>
  );
}
