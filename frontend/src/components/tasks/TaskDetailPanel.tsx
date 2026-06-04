import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Maximize2, X, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';
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
import { MarkdownField } from '../ui/MarkdownField';
import { LINK_TYPE_OPTIONS } from '../../lib/associations';
import { MentionTextarea } from '../ui/MentionTextarea';
import { CommentBody } from '../ui/CommentBody';
import { TypeTag } from '../ui/TypeTag';
import type { TypeTagKind } from '../ui/TypeTag';
import { LabelList } from '../ui/LabelBadge';

interface Subtask {
  id: number;
  itemNumber: number;
  title: string;
  statusId: number;
  completedAt: string | null;
  sortOrder: string;
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
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
  parentSprintId?: number | null;
  parentSprintName?: string | null;
  subtasks?: Subtask[];
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
  subtaskCount?: number;
  labels?: { id: number; name: string; color: string }[];
}

interface TaskDetailPanelProps {
  projectId: number;
  taskId: number;
  projectPrefix: string;
  onClose: () => void;
  onUpdated?: () => void;
  onNavigateToTask?: (taskId: number) => void;
  /** When true, renders content without its own Drawer wrapper (caller provides the Drawer). */
  bare?: boolean;
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

export function TaskDetailPanel({ projectId, taskId, projectPrefix, onClose, onUpdated, onNavigateToTask, bare = false }: TaskDetailPanelProps) {
  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
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
  const [checklistItems, setChecklistItems] = useState<{ id: number; title: string; isCompleted: boolean }[]>([]);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const { canEdit, canManageProject, canAdminister } = useRole();
  const currentUser = useAuthStore((s) => s.user);
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
  const [assocHasMore, setAssocHasMore] = useState(false);
  const [assocPage, setAssocPage] = useState(1);
  const [assocLoadingMore, setAssocLoadingMore] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{ id: number; displayName: string; avatarUrl: string | null }[]>([]);
  const assocSearchSeqRef = useRef(0);
  const assocListRef = useRef<HTMLDivElement>(null);
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
        const taskData = data.data;
        if (taskData.children && !taskData.subtasks) {
          taskData.subtasks = taskData.children;
        }
        setTask(taskData);
        setTitle(taskData.title);
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
    apiClient.get(`/projects/${projectId}/members`).then((res) => {
      if (ignored) return;
      const list = res.data.data?.list || res.data.data || [];
      setProjectMembers(list.map((m: any) => ({
        id: m.user?.id ?? m.userId ?? m.id,
        displayName: m.user?.displayName ?? m.displayName ?? '',
        avatarUrl: m.user?.avatarUrl ?? m.avatarUrl ?? null,
      })));
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((res) => {
      if (ignored) return;
      const list = res.data.data.list || [];
      setSprintOptions([{ value: '', label: 'Backlog' }, ...list.map((s: any) => ({ value: String(s.id), label: `${s.name} (${s.status})` }))]);
    }).catch((err) => { console.error(err); });
    return () => { ignored = true; };
  }, [projectId]);

  // For subtasks, display the parent's sprint (provided by the API as
  // parentSprintName). Fall back to an extra fetch for older payloads.
  useEffect(() => {
    if (!task || task.itemType !== 'subtask' || !task.parentId) {
      setParentSprintName('');
      return;
    }
    if (task.parentSprintName !== undefined) {
      setParentSprintName(task.parentSprintName || 'Backlog');
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
  }, [task?.itemType, task?.parentId, task?.parentSprintName, projectId]);

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
    apiClient.get(`/projects/${projectId}/items?itemType=task,story,epic,bug&limit=100&sort=updatedAt&order=DESC`)
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

  useEffect(() => {
    const socket = getSocket();
    const currentUserId = useAuthStore.getState().user?.id;

    const handleMoved = (data: { itemId: number; actorId?: number }) => {
      if (data.itemId !== taskId || data.actorId === currentUserId) return;
      loadTask();
    };
    const handleUpdated = (data: { itemId: number; actorId?: number }) => {
      if (data.itemId !== taskId || data.actorId === currentUserId) return;
      loadTask();
    };

    socket.on('board:moved', handleMoved);
    socket.on('work-item:updated', handleUpdated);
    return () => {
      socket.off('board:moved', handleMoved);
      socket.off('work-item:updated', handleUpdated);
    };
  }, [taskId, projectId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.itemId === taskId) loadTask();
    };
    document.addEventListener('board:item-moved', handler);
    return () => document.removeEventListener('board:item-moved', handler);
  }, [taskId, projectId]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}`);
      if (data.data.children && !data.data.subtasks) {
        data.data.subtasks = data.data.children;
      }
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

  const ASSOC_PAGE_SIZE = 20;

  const fetchAssocPage = async (q: string, page: number, seq: number) => {
    const base = q.length >= 2
      ? `search=${encodeURIComponent(q)}&limit=${ASSOC_PAGE_SIZE}&page=${page}`
      : `limit=${ASSOC_PAGE_SIZE}&page=${page}&sort=updatedAt&order=DESC`;
    const params = `${base}&excludeAssociationsOf=${taskId}`;
    const { data } = await apiClient.get(`/projects/${projectId}/items?${params}`);
    if (seq !== assocSearchSeqRef.current) return null;
    const list = data.data.list || [];
    const total = data.data.total ?? 0;
    return { list, hasMore: page * ASSOC_PAGE_SIZE < total };
  };

  const handleAssocSearch = async (q: string) => {
    setAssocSearchQuery(q);
    setAssocSearching(true);
    setAssocPage(1);
    const seq = ++assocSearchSeqRef.current;
    try {
      const result = await fetchAssocPage(q, 1, seq);
      if (!result) return;
      setAssocSearchResults(result.list);
      setAssocHasMore(result.hasMore);
    } catch (err) { console.error(err); }
    if (seq === assocSearchSeqRef.current) setAssocSearching(false);
  };

  const handleAssocLoadMore = async () => {
    if (assocLoadingMore || !assocHasMore) return;
    setAssocLoadingMore(true);
    const nextPage = assocPage + 1;
    const seq = assocSearchSeqRef.current;
    try {
      const result = await fetchAssocPage(assocSearchQuery, nextPage, seq);
      if (!result) return;
      setAssocSearchResults((prev) => [...prev, ...result.list]);
      setAssocHasMore(result.hasMore);
      setAssocPage(nextPage);
    } catch (err) { console.error(err); }
    setAssocLoadingMore(false);
  };

  const handleAddAssociation = async (linkedItemId: number) => {
    try {
      if (addAssocLinkType === 'contains') {
        await apiClient.post(`/projects/${projectId}/items/${linkedItemId}/associations`, { linkedItemId: taskId, linkType: 'belongs_to' });
      } else if (addAssocLinkType === 'blocked_by') {
        await apiClient.post(`/projects/${projectId}/items/${linkedItemId}/associations`, { linkedItemId: taskId, linkType: 'blocks' });
      } else {
        await apiClient.post(`/projects/${projectId}/items/${taskId}/associations`, { linkedItemId, linkType: addAssocLinkType });
      }
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

  const handleDeleteItem = async (hard = false) => {
    try {
      const query = hard ? '?hard=true' : '';
      await apiClient.delete(`/projects/${projectId}/items/${taskId}${query}`);
      toast(hard ? 'Item permanently deleted' : 'Item deleted');
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

  const reloadComments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/comments`);
      setComments(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const reloadAttachments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${taskId}/attachments`);
      setAttachments(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const handleEditComment = async (commentId: number) => {
    if (!editCommentBody.trim()) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/${taskId}/comments/${commentId}`, { body: editCommentBody.trim() });
      setEditingCommentId(null);
      reloadComments();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to edit comment', 'error');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}/comments/${commentId}`);
      reloadComments();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete comment', 'error');
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/items/${taskId}/attachments/${attachmentId}`);
      reloadAttachments();
      toast('Attachment deleted');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete attachment', 'error');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await apiClient.post(`/projects/${projectId}/items/${taskId}/attachments`, formData);
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
      await apiClient.post(`/projects/${projectId}/items`, { itemType: 'subtask', parentId: taskId, title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      loadTask();
      onUpdated?.();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to create subtask', 'error');
    }
  };

  const handleSubtaskReorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !task?.subtasks) return;
    const oldIndex = task.subtasks.findIndex((s) => s.id === active.id);
    const newIndex = task.subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...task.subtasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    const reorders = reordered.map((st, i) => ({ itemId: st.id, sortOrder: String(i).padStart(6, '0') }));
    setTask({ ...task, subtasks: reordered });
    try {
      await apiClient.put(`/projects/${projectId}/items/reorder`, { reorders });
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to reorder', 'error');
      loadTask();
    }
  };

  const taskKey = task ? (projectPrefix ? `${projectPrefix}-${task.itemNumber}` : `#${task.itemNumber}`) : '';

  const innerContent = (
    <>
        {!task ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-neutral-400">Loading...</div>
          </div>
        ) : (
          <>
        <DrawerHeader>
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <TypeTag kind={(task.itemType || 'task') as TypeTagKind} size="md" />
              <span className="text-[16px] font-mono text-neutral-400">{taskKey}</span>
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1 hover:bg-danger/10 rounded text-neutral-400 hover:text-danger"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button
                onClick={() => { onClose(); navigate(`/projects/${projectId}/tasks/${taskId}`); }}
                className="p-1 hover:bg-neutral-100 rounded text-neutral-400"
                title="Open full screen"
              >
                <Maximize2 size={20} />
              </button>
              <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded text-neutral-400">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 pb-2 text-[16px] text-neutral-400">
            <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            {task.status && (
              <span className="flex items-center gap-1.5">
                ·
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.status.color }} />
                <span style={{ color: task.status.color }}>{task.status.name}</span>
                {task.statusChangedAt && (
                  <span className="text-neutral-400">since {new Date(task.statusChangedAt).toLocaleDateString()}</span>
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
            <Input
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
              className="w-full serif-i text-[32px] leading-[1.05] !bg-transparent !border-none !border-b !border-[var(--accent)] !rounded-none !shadow-none !ring-0 !outline-none !px-0 !py-0 text-text"
            />
          ) : (
            <h2
              onClick={() => setEditing(true)}
              className="serif-i text-[32px] leading-[1.05] text-text cursor-pointer hover:text-[var(--accent)]"
            >
              {title || task.title}
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
              <Input
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
                className="w-full !py-1 !text-[16px] h-[30px]"
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
                      return <span className="text-[14px] text-mute">{opt.label}</span>;
                    }
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <TypeTag kind={(opt.data.itemType || 'task') as TypeTagKind} size="sm" />
                          <span className="text-[13px] font-mono text-mute">{opt.data.itemKey}</span>
                        </div>
                        <p className={`text-[14px] line-clamp-2 ${isHighlighted ? 'text-lilac-dark' : isSelected ? 'text-text font-medium' : 'text-text'}`}>
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
                <div className="h-[30px] flex items-center px-3 rounded-md border border-neutral-200 bg-neutral-100 text-[16px] text-neutral-500 cursor-not-allowed">
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
            <MarkdownField
              value={task.description || ''}
              onChange={(val) => {
                setTask((prev) => prev ? { ...prev, description: val } : prev);
                debouncedFieldChange('description', val || null, loadTask);
              }}
              onBlur={() => flushDebounce()}
              placeholder="Add a description..."
              readOnly={!canEdit}
              minHeight={60}
            />
          </div>

          {/* Labels */}
          <div>
            <h3 className="smallcaps mb-2">Labels</h3>
            {canEdit && (
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
            )}
            {!canEdit && (task.labels || []).length > 0 && (
              <LabelList labels={task.labels || []} max={10} size="md" />
            )}
            {(task.labels || []).length === 0 && (
              <p className="text-[13px] text-[var(--ink-4)]">No labels</p>
            )}
          </div>

          {/* Associations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="smallcaps">Associations</h3>
              {canEdit && !showAddAssociation && (
                <button onClick={() => setShowAddAssociation(true)} className="text-[11.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">
                  + Link item
                </button>
              )}
            </div>
            {associations && (
              <div className="space-y-2">
                {associations.belongsTo?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Part of</span>
                    {associations.belongsTo.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
                {/* Subtasks render in the dedicated Subtasks list below — filter
                    them out of the virtual "contains" group to avoid duplication. */}
                {(() => {
                  const containsNonSubtasks = (associations.contains || []).filter(
                    (a: any) => a.item?.itemType !== 'subtask',
                  );
                  if (containsNonSubtasks.length === 0) return null;
                  return (
                    <div>
                      <span className="text-[12px] text-faint uppercase">Contains</span>
                      {containsNonSubtasks.map((a: any) => (
                        <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                      ))}
                    </div>
                  );
                })()}
                {associations.blocks?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Blocks</span>
                    {associations.blocks.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
                {associations.blockedBy?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Blocked by</span>
                    {associations.blockedBy.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
                {associations.relatesTo?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Related</span>
                    {associations.relatesTo.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
                {associations.causedBy?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Caused by</span>
                    {associations.causedBy.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
                {associations.causes?.length > 0 && (
                  <div>
                    <span className="text-[12px] text-faint uppercase">Causes</span>
                    {associations.causes.map((a: any) => (
                      <AssociationRow key={a.id} assoc={a} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} onClick={() => onNavigateToTask?.(a.item?.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {(() => {
              const hasAny = associations && (
                (associations.belongsTo?.length > 0) ||
                ((associations.contains || []).some((a: any) => a.item?.itemType !== 'subtask')) ||
                (associations.blocks?.length > 0) ||
                (associations.blockedBy?.length > 0) ||
                (associations.relatesTo?.length > 0) ||
                (associations.causedBy?.length > 0) ||
                (associations.causes?.length > 0)
              );
              if (!hasAny && !showAddAssociation) return <p className="text-[13px] text-[var(--ink-4)]">No associations</p>;
              return null;
            })()}
            {showAddAssociation && canEdit && (
              <div className="mt-2 p-3 rounded-lg bg-paper shadow-sm space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={addAssocLinkType}
                    onChange={setAddAssocLinkType}
                    options={LINK_TYPE_OPTIONS}
                    className="flex-shrink-0"
                  />
                  <Input
                    value={assocSearchQuery}
                    onChange={(e) => handleAssocSearch(e.target.value)}
                    onFocus={() => { if (assocSearchResults.length === 0) handleAssocSearch(''); }}
                    placeholder="Search items..."
                    autoFocus
                    className="!text-[13px] !py-1.5 !h-[32px] flex-1"
                  />
                </div>
                {assocSearching && <p className="text-[12px] text-faint">Searching...</p>}
                <div
                  ref={assocListRef}
                  className="max-h-[240px] overflow-y-auto border border-rule rounded"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) handleAssocLoadMore();
                  }}
                >
                  {assocSearchResults.map((t: any) => (
                    <button key={t.id} onClick={() => handleAddAssociation(t.id)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 border-b border-rule/60 last:border-b-0 hover:bg-lilac-tint transition-colors">
                      <TypeTag kind={(t.itemType || 'task') as TypeTagKind} size="sm" />
                      <span className="font-mono text-[12px] text-mute flex-shrink-0">{t.itemKey || `#${t.itemNumber}`}</span>
                      <span className="text-[14px] text-text truncate">{t.title}</span>
                    </button>
                  ))}
                  {assocLoadingMore && <p className="text-[12px] text-faint px-3 py-2 text-center">Loading more...</p>}
                  {!assocSearching && !assocLoadingMore && assocSearchResults.length === 0 && (
                    <p className="text-[12px] text-faint px-3 py-2">No items found</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowAddAssociation(false); setAssocSearchQuery(''); setAssocSearchResults([]); }}>Cancel</Button>
              </div>
            )}
          </div>

          {/* Subtasks — only on parent tasks */}
          {task.itemType !== 'subtask' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="smallcaps">
                  Subtasks{task.subtasks && task.subtasks.length > 0 ? ` · ${task.subtasks.length}` : ''}
                </h3>
                {canEdit && !showAddSubtask && (
                  <button onClick={() => setShowAddSubtask(true)} className="text-[11.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">
                    + Add subtask
                  </button>
                )}
              </div>
              {task.subtasks && task.subtasks.length > 0 && (
                <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskReorder}>
                  <SortableContext items={task.subtasks.map((st) => st.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1 mb-2">
                      {task.subtasks.map((st) => (
                        <SortableSubtaskRow key={st.id} subtask={st} canEdit={canEdit} onNavigate={() => onNavigateToTask?.(st.id)} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {(!task.subtasks || task.subtasks.length === 0) && !showAddSubtask && (
                <p className="text-[13px] text-[var(--ink-4)]">No subtasks</p>
              )}
              {canEdit && showAddSubtask && (
                <form onSubmit={(e) => { e.preventDefault(); handleCreateSubtaskAndOpen(); }} className="flex gap-1 mt-2">
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
              )}
            </div>
          )}

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="smallcaps">
                Checklist{checklistItems.length > 0 ? ` · ${checklistItems.filter((i) => i.isCompleted).length}/${checklistItems.length}` : ''}
              </h3>
              {canEdit && !showAddChecklist && (
                <button onClick={() => setShowAddChecklist(true)} className="text-[11.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">+ Add item</button>
              )}
            </div>
            {checklistItems.length > 0 && (
              <div className="space-y-1 mb-2">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[13px] py-1 px-2 hover:bg-[var(--shade)]">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => canEdit && handleToggleChecklist(item.id, item.isCompleted)}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                    />
                    <span className={`flex-1 ${item.isCompleted ? 'line-through' : ''}`} style={{ color: item.isCompleted ? 'var(--ink-4)' : 'var(--ink)' }}>
                      {item.title}
                    </span>
                    {canEdit && (
                      <button onClick={() => handleDeleteChecklist(item.id)} style={{ color: 'var(--ink-4)', fontSize: 14 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {checklistItems.length === 0 && !showAddChecklist && (
              <p className="text-[13px] text-[var(--ink-4)]">No checklist items</p>
            )}
            {showAddChecklist && canEdit && (
              <form onSubmit={handleAddChecklistItem} className="flex gap-1 mt-2">
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

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="smallcaps">
                Attachments{attachments.length > 0 ? ` · ${attachments.length}` : ''}
              </h3>
              {canEdit && (
                <label className="text-[11.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] cursor-pointer">
                  + Upload
                  <input type="file" className="hidden" onChange={handleUpload} />
                </label>
              )}
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <AttachmentRow key={att.id} attachment={att} projectId={projectId} taskId={taskId} onDownload={handleDownload} onDelete={canEdit ? () => handleDeleteAttachment(att.id) : undefined} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[var(--ink-4)]">No attachments</p>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="smallcaps mb-2">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>
            {comments.length > 0 && (
              <div className="space-y-3 mb-3">
                {comments.map((c) => {
                  const isAuthor = !!currentUser && c.author?.id === currentUser.id;
                  const canDeleteThis = isAuthor || canManageProject;
                  return (
                  <div key={c.id} className="text-[16px] group">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-neutral-700">
                        {c.author?.displayName || 'Unknown'}
                      </span>
                      <span className="text-[16px] text-neutral-400">
                        {new Date(c.createdAt).toLocaleString()}
                        {c.editedAt && ' (edited)'}
                      </span>
                      {canEdit && editingCommentId !== c.id && canDeleteThis && (
                        <span className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                          {isAuthor && <button type="button" onClick={() => { setEditingCommentId(c.id); setEditCommentBody(c.body); }} className="text-[11px] text-neutral-400 hover:text-neutral-700">edit</button>}
                          <button type="button" onClick={() => handleDeleteComment(c.id)} className="text-[11px] text-neutral-400 hover:text-red-600">delete</button>
                        </span>
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="mt-1">
                        <MentionTextarea value={editCommentBody} onChange={setEditCommentBody} onSubmit={() => handleEditComment(c.id)} members={projectMembers} />
                        <div className="flex gap-2 mt-1">
                          <Button variant="primary" size="sm" onClick={() => handleEditComment(c.id)}>Save</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <CommentBody body={c.body} style={{ color: undefined }} />
                    )}
                  </div>
                  );
                })}
              </div>
            )}
            {canEdit && (
              <form onSubmit={handleAddComment} className="flex items-center gap-1">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  onSubmit={() => { if (newComment.trim()) handleAddComment({ preventDefault: () => {} } as any); }}
                  members={projectMembers}
                  placeholder="Add a comment..."
                  className="text-[16px] px-2 py-1.5 rounded border border-neutral-200 bg-transparent text-neutral-700"
                />
                <Button type="submit" variant="primary" size="sm">Post</Button>
              </form>
            )}
          </div>
        </DrawerBody>
          </>
        )}
    </>
  );

  return (
    <>
      {bare ? innerContent : (
        <Drawer open onClose={onClose}>
          {innerContent}
        </Drawer>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete item"
          message={canAdminister
            ? `Are you sure you want to delete "${task?.title}"? As admin, this will permanently remove the item.`
            : `Are you sure you want to delete "${task?.title}"? The item can be restored within 7 days.`}
          confirmLabel={canAdminister ? 'Delete permanently' : 'Delete'}
          danger
          onConfirm={() => handleDeleteItem(canAdminister)}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

function AssociationRow({ assoc, onRemove, onClick }: { assoc: any; onRemove?: () => void; onClick?: () => void }) {
  const item = assoc.item;
  if (!item) return null;

  return (
    <div className="group flex items-center gap-2 text-[14px] py-1 px-2 rounded hover:bg-lilac-tint cursor-pointer" onClick={onClick}>
      <TypeTag kind={(item.itemType || 'task') as TypeTagKind} size="sm" />
      <span className="font-mono text-[12px] text-mute flex-shrink-0">{item.itemKey}</span>
      <span className="text-text truncate flex-1">{item.title}</span>
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-faint hover:text-danger opacity-0 group-hover:opacity-100 text-[14px]">x</button>
      )}
    </div>
  );
}

function AttachmentRow({ attachment, projectId, taskId, onDownload, onDelete }: {
  attachment: AttachmentItem;
  projectId: number;
  taskId: number;
  onDownload: (id: number) => void;
  onDelete?: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');

  useEffect(() => {
    if (!isImage && !isVideo) return;
    let ignored = false;
    apiClient.get(`/projects/${projectId}/items/${taskId}/attachments/${attachment.id}/url`)
      .then((res) => {
        if (ignored) return;
        setPreviewUrl(res.data.data.url);
      })
      .catch((err) => { console.error(err); });
    return () => { ignored = true; };
  }, [attachment.id, isImage, isVideo, projectId, taskId]);

  return (
    <div className="flex items-start gap-2 w-full text-[16px] p-2 rounded hover:bg-neutral-100 group">
      <button
        onClick={() => onDownload(attachment.id)}
        className="flex items-start gap-2 flex-1 min-w-0 text-left"
      >
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={attachment.originalFilename} className="w-12 h-12 rounded object-cover flex-shrink-0 border border-neutral-200" />
        ) : isVideo && previewUrl ? (
          <video src={previewUrl} className="w-16 h-12 rounded object-cover flex-shrink-0 border border-neutral-200" muted />
        ) : (
          <span className="text-neutral-400 flex-shrink-0 mt-0.5">&#x1F4CE;</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[16px] text-neutral-700 truncate">{attachment.originalFilename}</p>
          <p className="text-[16px] text-neutral-400">{attachment.sizeBytes >= 1024 * 1024 ? `${(attachment.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${(attachment.sizeBytes / 1024).toFixed(0)} KB`}</p>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
          title="Delete attachment"
        >
          <Trash2 size={14} className="text-neutral-400 hover:text-red-600" />
        </button>
      )}
    </div>
  );
}

function SortableSubtaskRow({ subtask, canEdit, onNavigate }: { subtask: Subtask; canEdit: boolean; onNavigate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 text-[13px] py-1.5 px-2 hover:bg-[var(--shade)] group">
      {canEdit && (
        <span {...attributes} {...listeners} className="cursor-grab text-[var(--ink-4)] opacity-0 group-hover:opacity-100 flex-shrink-0">
          <GripVertical size={12} />
        </span>
      )}
      <button onClick={onNavigate} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <span style={{ color: subtask.completedAt ? 'var(--accent)' : 'var(--ink-4)' }}>
          {subtask.completedAt ? '☑' : '☐'}
        </span>
        <span className={`flex-1 truncate ${subtask.completedAt ? 'line-through' : ''}`} style={{ color: subtask.completedAt ? 'var(--ink-4)' : 'var(--ink)' }}>
          {subtask.title}
        </span>
      </button>
    </div>
  );
}
