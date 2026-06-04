import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, AlertCircle, Eye, Trash2, Link2, Plus, FileText } from 'lucide-react';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { useAuthStore } from '../store/auth.store';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { useTaskAutoSave } from '../hooks/useTaskAutoSave';
import { SaveStatusIndicator } from '../components/common/SaveStatusIndicator';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';
import { LabelPicker } from '../components/ui/LabelPicker';
import { LabelList } from '../components/ui/LabelBadge';
import { TypeTag } from '../components/ui';
import { Avatar } from '../components/ui/Avatar';
import { STATUS_BADGE_COLORS, PRIORITY_DOT_COLORS } from '../lib/colors';
import { MarkdownField } from '../components/ui/MarkdownField';
import { MentionTextarea } from '../components/ui/MentionTextarea';
import { CommentBody } from '../components/ui/CommentBody';
import type { TypeTagKind } from '../components/ui';
import { LINK_TYPE_OPTIONS } from '../lib/associations';

interface Subtask {
  id: number;
  itemNumber: number;
  title: string;
  itemType?: string;
  statusId: number;
  completedAt: string | null;
  status?: { id: number; name: string; category: string; color: string };
  assignee?: { id: number; displayName: string; avatarUrl: string | null };
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
  assignee?: { id: number; displayName: string; avatarUrl: string | null };
  reporterId?: number | null;
  reporter?: { id: number; displayName: string; avatarUrl: string | null };
  sprintId: number | null;
  sprint?: { id: number; name: string };
  parentSprintId?: number | null;
  parentSprintName?: string | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  parentId?: number | null;
  parentInfo?: { id: number; taskKey: string; title: string } | null;
  breadcrumb?: { id: number; itemKey: string; itemType: string; title: string }[];
  subtasks?: Subtask[];
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
  blockedBy?: Dependency[];
  blocks?: Dependency[];
  subtaskCount?: number;
  labels?: { id: number; name: string; color: string }[];
}

interface CommentItem {
  id: number;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author?: { id: number; displayName: string; avatarUrl: string | null };
  reactions?: { emoji: string; count: number; byMe: boolean }[];
  mentions?: { id: number; displayName: string }[];
}

interface AttachmentItem {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface ActivityItem {
  id: number;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user?: { id: number; displayName: string; avatarUrl: string | null };
}

function statusCategory(status?: { category: string }): string {
  return status?.category?.toLowerCase().replace(/\s+/g, '_') || 'backlog';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function daysUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  return `in ${days}d`;
}

export function TaskDetailPage() {
  const { id: projectId, taskId: taskIdParam } = useParams();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const tid = Number(taskIdParam);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [projectPrefix, setProjectPrefix] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [checklistItems, setChecklistItems] = useState<{ id: number; title: string; isCompleted: boolean }[]>([]);
  const [watcherCount, setWatcherCount] = useState<number>(0);
  const [byMeWatching, setByMeWatching] = useState<boolean>(false);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [sprintOptions, setSprintOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusOptions, setStatusOptions] = useState<{ value: string; label: string }[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [associations, setAssociations] = useState<any>(null);
  const [discussionTab, setDiscussionTab] = useState<'comments' | 'activity'>('comments');
  const [showAddAssociation, setShowAddAssociation] = useState(false);
  const [addAssocLinkType, setAddAssocLinkType] = useState<string>('belongs_to');
  const [assocSearchQuery, setAssocSearchQuery] = useState('');
  const [assocSearchResults, setAssocSearchResults] = useState<any[]>([]);
  const [assocSearching, setAssocSearching] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{ id: number; displayName: string; avatarUrl: string | null }[]>([]);

  const { canEdit, canManageProject, canAdminister } = useRole();
  const currentUser = useAuthStore((s) => s.user);

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');

  const { saveStatus, flushDebounce, debouncedFieldChange, handleFieldChange, saveAssignee } = useTaskAutoSave({
    projectId: pid,
    taskId: tid,
  });

  useEffect(() => {
    loadTask();
    loadComments();
    loadAttachments();
    loadActivity();
    loadAssociations();
    loadWatchers();
  }, [tid]);

  useEffect(() => {
    apiClient.get(`/projects/${pid}`).then((res) => {
      setProjectPrefix(res.data.data.prefix || '');
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${pid}/filters/assignees`).then((res) => {
      const opts = (res.data.data.list || []).map((o: any) => ({ value: String(o.value), label: o.label }));
      setAssigneeOptions([{ value: '', label: 'Unassigned' }, ...opts]);
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${pid}/members`).then((res) => {
      const list = res.data.data?.list || res.data.data || [];
      setProjectMembers(list.map((m: any) => ({
        id: m.user?.id ?? m.userId ?? m.id,
        displayName: m.user?.displayName ?? m.displayName ?? '',
        avatarUrl: m.user?.avatarUrl ?? m.avatarUrl ?? null,
      })));
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${pid}/sprints?limit=100`).then((res) => {
      const list = res.data.data.list || [];
      setSprintOptions([{ value: '', label: 'Backlog' }, ...list.map((s: any) => ({ value: String(s.id), label: s.name }))]);
    }).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${pid}/statuses`).then((res) => {
      const list = res.data.data?.list || res.data.data || [];
      setStatusOptions(list.map((s: any) => ({ value: String(s.id), label: s.name })));
    }).catch((err) => { console.error(err); });
  }, [pid]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}`);
      const item = data.data;
      if (item.children && !item.subtasks) {
        item.subtasks = item.children;
      }
      if (!item.parentInfo && item.breadcrumb && item.breadcrumb.length > 1) {
        const parent = item.breadcrumb[item.breadcrumb.length - 2];
        item.parentInfo = { id: parent.id, taskKey: parent.itemKey, title: parent.title };
      }
      setTask(item);
      setTitle(item.title);
      setStoryPoints(item.storyPoints != null ? String(item.storyPoints) : '');
      setChecklistItems(item.checklistItems || []);
    } catch (err) { console.error(err); }
  };

  const loadComments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/comments`);
      setComments(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const loadWatchers = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/watchers`);
      setWatcherCount(data.data?.watcherCount ?? 0);
      setByMeWatching(!!data.data?.byMe);
    } catch {
      setWatcherCount(0);
      setByMeWatching(false);
    }
  };

  const toggleWatch = async () => {
    try {
      const url = `/projects/${pid}/items/${tid}/watchers/me`;
      const { data } = byMeWatching
        ? await apiClient.delete(url)
        : await apiClient.post(url);
      setByMeWatching(!!data.data?.watching);
      setWatcherCount(data.data?.watcherCount ?? 0);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Could not update watching status', 'error');
    }
  };

  const toggleReaction = async (commentId: number, emoji: string) => {
    try {
      const { data } = await apiClient.post(
        `/projects/${pid}/items/${tid}/comments/${commentId}/reactions`,
        { emoji },
      );
      setComments((prev) => prev.map((c) =>
        c.id === commentId ? { ...c, reactions: data.data } : c,
      ));
    } catch (err: any) {
      toast(err.response?.data?.message || 'Could not toggle reaction', 'error');
    }
  };

  const loadAttachments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/attachments`);
      setAttachments(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const loadActivity = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/activity?limit=50`);
      setActivity(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const loadAssociations = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/associations`);
      setAssociations(data.data);
    } catch (err) { console.error(err); }
  };

  const handleAssocSearch = async (q: string) => {
    setAssocSearchQuery(q);
    if (q.length < 2) { setAssocSearchResults([]); return; }
    setAssocSearching(true);
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items?search=${encodeURIComponent(q)}&limit=10`);
      setAssocSearchResults((data.data.list || []).filter((t: any) => t.id !== tid));
    } catch (err) { console.error(err); }
    setAssocSearching(false);
  };

  const handleAddAssociation = async (linkedItemId: number) => {
    try {
      await apiClient.post(`/projects/${pid}/items/${tid}/associations`, { linkedItemId, linkType: addAssocLinkType });
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
      await apiClient.delete(`/projects/${pid}/items/${tid}/associations/${assocId}`);
      loadAssociations();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to remove link', 'error');
    }
  };

  const handleDeleteItem = async (hard = false) => {
    try {
      const query = hard ? '?hard=true' : '';
      await apiClient.delete(`/projects/${pid}/items/${tid}${query}`);
      toast(hard ? 'Item permanently deleted' : 'Item deleted');
      navigate(`/projects/${pid}/backlog`);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete', 'error');
      setShowDeleteConfirm(false);
    }
  };

  const handleTitleBlur = () => {
    flushDebounce();
    setEditing(false);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const { data } = await apiClient.post(`/projects/${pid}/items/${tid}/comments`, { body: newComment });
      setNewComment('');
      setComments(data.data.list || []);
      loadActivity();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to post comment', 'error');
    }
  };

  const handleEditComment = async (commentId: number) => {
    if (!editCommentBody.trim()) return;
    try {
      await apiClient.put(`/projects/${pid}/items/${tid}/comments/${commentId}`, { body: editCommentBody.trim() });
      setEditingCommentId(null);
      loadComments();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to edit comment', 'error');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await apiClient.delete(`/projects/${pid}/items/${tid}/comments/${commentId}`);
      loadComments();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete comment', 'error');
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      await apiClient.delete(`/projects/${pid}/items/${tid}/attachments/${attachmentId}`);
      loadAttachments();
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
      const { data } = await apiClient.post(`/projects/${pid}/items/${tid}/attachments`, formData);
      setAttachments(data.data.list || []);
      loadActivity();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to upload', 'error');
    }
    e.target.value = '';
  };

  const handleDownload = async (attachmentId: number) => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/attachments/${attachmentId}/url`);
      window.open(data.data.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to download', 'error');
    }
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${pid}/items/${tid}/checklist`, { title: newChecklistTitle.trim() });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add checklist item', 'error');
    }
  };

  const handleToggleChecklist = async (itemId: number, isCompleted: boolean) => {
    try {
      await apiClient.put(`/projects/${pid}/items/${tid}/checklist/${itemId}`, { isCompleted: !isCompleted });
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update checklist', 'error');
    }
  };

  const handleDeleteChecklist = async (itemId: number) => {
    try {
      await apiClient.delete(`/projects/${pid}/items/${tid}/checklist/${itemId}`);
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete checklist item', 'error');
    }
  };

  const handleCreateSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${pid}/items`, { itemType: 'subtask', parentId: tid, title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      loadTask();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to create subtask', 'error');
    }
  };

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div style={{ color: 'var(--ink-4)' }}>Loading...</div>
      </div>
    );
  }

  const taskKey = projectPrefix ? `${projectPrefix}-${task.itemNumber}` : `#${task.itemNumber}`;
  const subtasks = task.subtasks || [];
  const statusKey = statusCategory(task.status);
  const statusColors = STATUS_BADGE_COLORS[statusKey] || STATUS_BADGE_COLORS.backlog;

  const allAssocRows: { type: string; item: any; id: number }[] = [];
  if (associations) {
    (associations.blockedBy || []).forEach((a: any) => allAssocRows.push({ type: 'blocked by', item: a.item, id: a.id }));
    (associations.blocks || []).forEach((a: any) => allAssocRows.push({ type: 'blocks', item: a.item, id: a.id }));
    (associations.relatesTo || []).forEach((a: any) => allAssocRows.push({ type: 'relates to', item: a.item, id: a.id }));
    (associations.belongsTo || []).forEach((a: any) => allAssocRows.push({ type: 'part of', item: a.item, id: a.id }));
    (associations.causedBy || []).forEach((a: any) => allAssocRows.push({ type: 'caused by', item: a.item, id: a.id }));
  }

  return (
    <div className="flex flex-col h-full">
      <ReadOnlyBanner />

      <PageHeader className="flex items-center gap-3 flex-wrap">
          {/* Breadcrumb */}
          <div
            className="flex items-center gap-1.5"
            style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: '16.8px' }}
          >
            {task.parentInfo ? (
              <>
                <span className="mono" style={{ fontWeight: 500 }}>
                  <Link to={`/projects/${pid}/tasks/${task.parentInfo.id}`} className="hover:underline" style={{ color: 'var(--ink-3)' }}>
                    {task.parentInfo.taskKey}
                  </Link>
                </span>
                <span>{task.parentInfo.title}</span>
                <ChevronRight size={12} />
              </>
            ) : (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 hover:underline"
                style={{ color: 'var(--ink-3)' }}
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>

          {/* Meta row — type chip + key + status + blockers + watcher + actions */}
          <div
            className="flex items-center gap-2 flex-1"
            style={{ fontSize: '13.5px', height: 26 }}
          >
            {task.itemType && (
              <TypeTag kind={task.itemType as TypeTagKind} size="sm" />
            )}
            <span className="mono" style={{ fontWeight: 500, fontSize: 12, color: 'var(--ink-3)' }}>{taskKey}</span>
            <span style={{ color: 'var(--ink-4)' }}>·</span>
            {task.status && (
              <span className="status">
                <span className="dot" style={{ backgroundColor: statusColors.dot }} />
                <span>{task.status.name}</span>
              </span>
            )}
            {task.blockedBy && task.blockedBy.length > 0 && (
              <>
                <span style={{ color: 'var(--ink-4)' }}>·</span>
                <span className="chip chip-accent" style={{ height: 20, fontSize: 11 }}>
                  <AlertCircle size={12} strokeWidth={2.5} />
                </span>
              </>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={toggleWatch}
              className="chip"
              style={{
                height: 22,
                fontSize: 11,
                background: byMeWatching ? 'var(--accent-bg)' : undefined,
                color: byMeWatching ? 'var(--accent-ink)' : undefined,
                borderColor: byMeWatching ? 'transparent' : undefined,
              }}
            >
              <Eye size={14} />
              {watcherCount} watching
            </button>
            <SaveStatusIndicator status={saveStatus} />
            {canEdit && (
              <button
                className=""
                style={{ width: 30, height: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#E53E3E', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
      </PageHeader>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left column — main content ── */}
        <div
          className="flex flex-col flex-1 overflow-y-auto"
          style={{ padding: '24px 28px' }}
        >
          {/* Title */}
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
              className="w-full serif bg-transparent outline-none"
              style={{
                fontSize: 38,
                lineHeight: '39.9px',
                marginBottom: 18,
                borderBottom: '1px solid var(--accent)',
                paddingBottom: 4,
              }}
            />
          ) : (
            <div
              onClick={() => canEdit && setEditing(true)}
              className={`serif ${canEdit ? 'cursor-pointer' : ''}`}
              style={{
                fontSize: 38,
                lineHeight: '39.9px',
                marginBottom: 18,
              }}
            >
              {task.title}
            </div>
          )}

          {/* Description */}
          <div style={{ maxWidth: 720, marginBottom: 0 }}>
            <MarkdownField
              value={task.description || ''}
              onChange={(val) => {
                setTask((prev) => prev ? { ...prev, description: val } : prev);
                debouncedFieldChange('description', val || null, loadTask);
              }}
              onBlur={() => flushDebounce()}
              placeholder="Add a description..."
              readOnly={!canEdit}
            />
          </div>

          {/* Subtasks — hidden for subtask items (no nesting) */}
          {task.itemType !== 'subtask' && <div style={{ marginTop: 22 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="smallcaps">
                Subtasks{subtasks.length > 0 && ` (${subtasks.length})`}
              </div>
              {canEdit && !showAddSubtask && (
                <button
                  onClick={() => setShowAddSubtask(true)}
                  style={{ fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  + Add subtask
                </button>
              )}
            </div>

            {subtasks.length > 0 && (
              <div className="flex flex-col" style={{ gap: 1 }}>
                {subtasks.map((st) => {
                  const stKey = projectPrefix ? `${projectPrefix}-${st.itemNumber}` : `#${st.itemNumber}`;
                  const stStatusKey = statusCategory(st.status);
                  const stStatusColors = STATUS_BADGE_COLORS[stStatusKey] || STATUS_BADGE_COLORS.backlog;
                  const stType = st.itemType || 'task';
                  return (
                    <Link
                      key={st.id}
                      to={`/projects/${pid}/tasks/${st.id}`}
                      className="flex items-center gap-2 hover:bg-[var(--shade)]"
                      style={{ padding: '6px 4px', borderRadius: 4, fontSize: '13.5px' }}
                    >
                      <input
                        type="checkbox"
                        checked={!!st.completedAt}
                        readOnly
                        style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <TypeTag kind={(stType || 'task') as TypeTagKind} size="sm" />
                      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>{stKey}</span>
                      <span className={`flex-1 truncate ${st.completedAt ? 'line-through' : ''}`} style={{ color: st.completedAt ? 'var(--ink-4)' : 'var(--ink)' }}>
                        {st.title}
                      </span>
                      <span className="status">
                        <span className="dot" style={{ backgroundColor: stStatusColors.dot }} />
                      </span>
                      {st.assignee && (
                        <Avatar user={st.assignee} size="xs" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {subtasks.length === 0 && !showAddSubtask && (
              <p style={{ fontSize: '13.5px', color: 'var(--ink-4)' }}>No subtasks</p>
            )}

            {canEdit && showAddSubtask && (
              <form onSubmit={(e) => { e.preventDefault(); handleCreateSubtask(); }} className="flex gap-1" style={{ marginTop: 8 }}>
                <Input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="Subtask title..." autoFocus className="flex-1" />
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddSubtask(false)}>Cancel</Button>
              </form>
            )}
          </div>}

          {/* Checklist */}
          <div style={{ marginTop: 22 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="smallcaps">
                Checklist{checklistItems.length > 0 && ` (${checklistItems.filter(i => i.isCompleted).length}/${checklistItems.length})`}
              </div>
              {canEdit && !showAddChecklist && (
                <button
                  onClick={() => setShowAddChecklist(true)}
                  style={{ fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  + Add item
                </button>
              )}
            </div>

            {checklistItems.length > 0 && (
              <div className="flex flex-col" style={{ gap: 1 }}>
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2" style={{ padding: '4px 4px', fontSize: '13.5px' }}>
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
              <p style={{ fontSize: '13.5px', color: 'var(--ink-4)' }}>No checklist items</p>
            )}

            {canEdit && showAddChecklist && (
              <form onSubmit={handleAddChecklistItem} className="flex gap-1" style={{ marginTop: 8 }}>
                <Input value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)} placeholder="Checklist item..." autoFocus className="flex-1" />
                <Button type="submit" variant="primary" size="sm">Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddChecklist(false)}>Cancel</Button>
              </form>
            )}
          </div>

          {/* Comments / Activity — tabbed */}
          <div style={{ marginTop: 24, marginBottom: 24, display: 'flex', flexDirection: 'column', height: 420, flexShrink: 0, border: '1px solid var(--line-2)', borderRadius: 0, overflow: 'hidden' }}>
            {/* Tab bar */}
            <div className="flex" style={{ borderBottom: '1px solid var(--line-2)', flexShrink: 0 }}>
              <button
                onClick={() => setDiscussionTab('comments')}
                className="smallcaps"
                style={{
                  padding: '10px 16px',
                  fontSize: 11,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: discussionTab === 'comments' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: discussionTab === 'comments' ? 'var(--ink)' : 'var(--ink-3)',
                  marginBottom: -1,
                }}
              >
                Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
              </button>
              <button
                onClick={() => setDiscussionTab('activity')}
                className="smallcaps"
                style={{
                  padding: '10px 16px',
                  fontSize: 11,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: discussionTab === 'activity' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: discussionTab === 'activity' ? 'var(--ink)' : 'var(--ink-3)',
                  marginBottom: -1,
                }}
              >
                Activity{activity.length > 0 ? ` · ${activity.length}` : ''}
              </button>
            </div>

            {/* Comments tab */}
            {discussionTab === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {comments.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>No comments yet</p>
                  )}
                  {comments.map((c) => {
                    const isAuthor = !!currentUser && c.author?.id === currentUser.id;
                    const canDeleteThis = isAuthor || canManageProject;
                    return (
                    <div key={`c-${c.id}`} className="flex gap-3 group" style={{ fontSize: '13.5px' }}>
                      {c.author && <Avatar user={c.author} size="sm" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{c.author?.displayName || 'Unknown'}</span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{timeAgo(c.createdAt)}{c.editedAt && ' (edited)'}</span>
                          {canEdit && editingCommentId !== c.id && canDeleteThis && (
                            <span className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                              {isAuthor && <button type="button" onClick={() => { setEditingCommentId(c.id); setEditCommentBody(c.body); }} style={{ fontSize: 11, color: 'var(--ink-4)' }}>edit</button>}
                              <button type="button" onClick={() => handleDeleteComment(c.id)} style={{ fontSize: 11, color: 'var(--danger)' }}>delete</button>
                            </span>
                          )}
                        </div>
                        {editingCommentId === c.id ? (
                          <div style={{ marginTop: 4 }}>
                            <MentionTextarea value={editCommentBody} onChange={setEditCommentBody} onSubmit={() => handleEditComment(c.id)} members={projectMembers} />
                            <div className="flex gap-2" style={{ marginTop: 4 }}>
                              <Button variant="ink" size="sm" onClick={() => handleEditComment(c.id)}>Save</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                        <>
                        <CommentBody body={c.body} />
                        <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
                          {(c.reactions ?? []).map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => toggleReaction(c.id, r.emoji)}
                              disabled={!canEdit}
                              style={{
                                padding: '2px 6px',
                                borderRadius: 999,
                                fontSize: 12,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: r.byMe ? 'var(--accent-bg)' : 'var(--shade)',
                                color: r.byMe ? 'var(--accent-ink)' : 'var(--ink-2)',
                                border: r.byMe ? '1px solid var(--accent-2)' : '1px solid transparent',
                                cursor: canEdit ? 'pointer' : 'default',
                              }}
                            >
                              {r.emoji} <span style={{ fontWeight: 500 }}>{r.count}</span>
                            </button>
                          ))}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => toggleReaction(c.id, '👍')}
                              style={{ fontSize: 12, color: 'var(--ink-4)', padding: '2px 4px' }}
                              title="React with 👍"
                            >
                              + 👍
                            </button>
                          )}
                        </div>
                        </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Comment input — pinned at bottom */}
                {canEdit && (
                  <form
                    onSubmit={handleAddComment}
                    className="flex items-center gap-3"
                    style={{
                      padding: '10px 12px',
                      borderTop: '1px solid var(--line-2)',
                      background: 'var(--card-bg, #fff)',
                      flexShrink: 0,
                    }}
                  >
                    <MentionTextarea
                      value={newComment}
                      onChange={setNewComment}
                      onSubmit={() => { if (newComment.trim()) handleAddComment({ preventDefault: () => {} } as any); }}
                      members={projectMembers}
                    />
                    <span className="flex items-center gap-1">
                      <span className="kbd">@</span>
                      <span className="kbd">/</span>
                    </span>
                    <button
                      type="submit"
                      className="btn"
                      style={{ height: 26, padding: '0 10px', fontSize: '12px' }}
                    >
                      <span className="kbd" style={{ marginRight: 4 }}>⌘↵</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Activity tab */}
            {discussionTab === 'activity' && (
              <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>No activity yet</p>
                )}
                {activity.map((a) => (
                  <div key={`a-${a.id}`} className="flex items-center gap-3" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {a.user && <Avatar user={a.user} size="xs" />}
                    <span>
                      <strong style={{ fontWeight: 500 }}>{a.user?.displayName || 'Unknown'}</strong>
                      {' '}
                      <ActivityDescription action={a.action} field={a.fieldChanged} oldValue={a.oldValue} newValue={a.newValue} />
                    </span>
                    <span className="mono" style={{ fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column — properties sidebar ── */}
        <div
          className="flex flex-col overflow-y-auto border-l border-rule"
          style={{
            width: 280,
            minWidth: 280,
            padding: '24px 22px',
            background: 'var(--paper-2)',
            flexShrink: 0,
            gap: 16,
          }}
        >
          {/* Status */}
          <PropertyRow label="Status">
            {canEdit ? (
              <Select
                value={task.statusId != null ? String(task.statusId) : ''}
                onChange={(val) => {
                  handleFieldChange('statusId', parseInt(val), loadTask);
                }}
                options={statusOptions}
              />
            ) : (
              <span className="status">
                <span className="dot" style={{ backgroundColor: statusColors.dot }} />
                <span>{task.status?.name || 'Unknown'}</span>
              </span>
            )}
          </PropertyRow>

          {/* Assignee */}
          <PropertyRow label="Assignee">
            {canEdit ? (
              <Select
                value={task.assigneeId ? String(task.assigneeId) : ''}
                onChange={(val) => {
                  const assigneeId = val ? parseInt(val) : null;
                  saveAssignee(assigneeId, loadTask);
                }}
                options={assigneeOptions}
                placeholder="Unassigned"
              />
            ) : (
              <div className="flex items-center gap-2">
                {task.assignee ? (
                  <>
                    <Avatar user={task.assignee} size="xs" />
                    <span>{task.assignee.displayName}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--ink-4)' }}>Unassigned</span>
                )}
              </div>
            )}
          </PropertyRow>

          {/* Reporter */}
          <PropertyRow label="Reporter">
            <div className="flex items-center gap-2">
              {task.reporter ? (
                <>
                  <Avatar user={task.reporter} size="xs" />
                  <span>{task.reporter.displayName}</span>
                </>
              ) : (
                <span style={{ color: 'var(--ink-4)' }}>—</span>
              )}
            </div>
          </PropertyRow>

          {/* Sprint — subtasks inherit from parent (display only, never editable). */}
          <PropertyRow label="Sprint">
            {task.itemType === 'subtask' ? (
              <span className="flex items-center gap-1.5" title="Inherited from parent">
                <span className="dot" style={{ backgroundColor: 'var(--accent)' }} />
                <span>{task.parentSprintName || 'Backlog'}</span>
              </span>
            ) : canEdit ? (
              <Select
                value={task.sprintId ? String(task.sprintId) : ''}
                onChange={(val) => {
                  handleFieldChange('sprintId', val ? parseInt(val) : null, loadTask);
                }}
                options={sprintOptions}
                placeholder="Backlog"
              />
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="dot" style={{ backgroundColor: 'var(--accent)' }} />
                <span>{task.sprint?.name || 'Backlog'}</span>
              </span>
            )}
          </PropertyRow>

          {/* Story Points */}
          <PropertyRow label="Story points">
            {canEdit ? (
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
                className="mono"
                style={{
                  width: 40,
                  fontSize: '13.5px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--ink)',
                  padding: 0,
                }}
                placeholder="—"
              />
            ) : (
              <span className="mono">{storyPoints || '—'}</span>
            )}
          </PropertyRow>

          {/* Priority */}
          <PropertyRow label="Priority">
            {canEdit ? (
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
              />
            ) : (
              <span className="flex items-center gap-2">
                <PriorityBars level={task.priority} />
                <span>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
              </span>
            )}
          </PropertyRow>

          {/* Due date */}
          <PropertyRow label="Due">
            {task.endDate ? (
              <span className="mono" style={{ fontSize: '13.5px' }}>
                {new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {daysUntil(task.endDate)}
              </span>
            ) : (
              <span style={{ color: 'var(--ink-4)' }}>—</span>
            )}
          </PropertyRow>

          {/* Labels */}
          <PropertyRow label="Labels">
            {canEdit ? (
              <LabelPicker
                projectId={pid}
                selectedIds={(task.labels || []).map(l => l.id)}
                onChange={async (ids) => {
                  try {
                    await apiClient.put(`/projects/${pid}/items/${tid}`, { labelIds: ids });
                    await loadTask();
                  } catch (err: any) {
                    toast(err.response?.data?.message || 'Failed to update labels', 'error');
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                <LabelList labels={task.labels || []} max={10} size="md" />
              </div>
            )}
          </PropertyRow>

          {/* Associations */}
          <div>
            <div className="smallcaps" style={{ marginBottom: 4 }}>Associations</div>
            {allAssocRows.length > 0 && (
              <div className="flex flex-col" style={{ gap: 6 }}>
                {allAssocRows.map((row) => {
                  if (!row.item) return null;
                  return (
                    <div key={row.id} className="group flex items-center gap-1.5" style={{ fontSize: '13.5px' }}>
                      <span style={{ color: 'var(--ink-3)', fontSize: 12, flexShrink: 0 }}>{row.type}</span>
                      <Link
                        to={`/projects/${pid}/tasks/${row.item.id}`}
                        className="mono hover:underline"
                        style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, flexShrink: 0 }}
                      >
                        {row.item.itemKey}
                      </Link>
                      <span className="truncate" style={{ color: 'var(--ink)' }}>{row.item.title}</span>
                      {canEdit && (
                        <button
                          onClick={() => handleRemoveAssociation(row.id)}
                          className="opacity-0 group-hover:opacity-100"
                          style={{ color: 'var(--ink-4)', fontSize: 12, flexShrink: 0 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {canEdit && !showAddAssociation && (
              <button
                onClick={() => setShowAddAssociation(true)}
                style={{ fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Link2 size={12} />
                Link an item
              </button>
            )}
            {showAddAssociation && canEdit && (
              <div style={{ marginTop: 8, padding: 10, background: 'var(--card-bg, #fff)', borderRadius: 'var(--radius)', border: '1px solid var(--line-2)' }}>
                <div className="flex gap-1 flex-wrap" style={{ marginBottom: 8 }}>
                  {LINK_TYPE_OPTIONS.map((lt) => (
                    <button
                      key={lt.value}
                      onClick={() => setAddAssocLinkType(lt.value)}
                      className="chip"
                      style={{
                        height: 22,
                        fontSize: 11,
                        background: addAssocLinkType === lt.value ? 'var(--accent)' : undefined,
                        color: addAssocLinkType === lt.value ? '#fff' : undefined,
                        borderColor: addAssocLinkType === lt.value ? 'transparent' : undefined,
                      }}
                    >
                      {lt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={assocSearchQuery}
                  onChange={(e) => handleAssocSearch(e.target.value)}
                  placeholder="Search items..."
                  autoFocus
                  className="input"
                  style={{ fontSize: 13, marginBottom: 6 }}
                />
                {assocSearching && <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Searching...</p>}
                {assocSearchResults.length > 0 && (
                  <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                    {assocSearchResults.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => handleAddAssociation(t.id)}
                        className="w-full text-left flex items-center gap-2 hover:bg-[var(--shade)]"
                        style={{ padding: '4px 6px', borderRadius: 4, fontSize: '13.5px' }}
                      >
                        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.itemKey}</span>
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {assocSearchQuery.length >= 2 && !assocSearching && assocSearchResults.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>No items found</p>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setShowAddAssociation(false); setAssocSearchQuery(''); setAssocSearchResults([]); }}>Cancel</Button>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <div className="smallcaps" style={{ marginBottom: 4 }}>
              Attachments{attachments.length > 0 && ` · ${attachments.length}`}
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-col" style={{ gap: 6 }}>
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 group" style={{ padding: '4px 0', fontSize: '13.5px' }}>
                    <button
                      onClick={() => handleDownload(att.id)}
                      className="flex items-center gap-2 text-left hover:bg-[var(--shade)] flex-1 min-w-0"
                      style={{ borderRadius: 4 }}
                    >
                      <FileText size={16} stroke="var(--ink-3)" strokeWidth={1.5} className="flex-shrink-0" />
                      <span className="truncate flex-1">{att.originalFilename}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{formatFileSize(att.sizeBytes)}</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ fontSize: 11, color: 'var(--danger)' }}
                        title="Delete attachment"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <label
                style={{ fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Plus size={12} />
                Upload
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
            )}
          </div>

          {/* Parent link (for subtasks) */}
          {task.itemType === 'subtask' && task.parentInfo && (
            <PropertyRow label="Parent">
              <Link
                to={`/projects/${pid}/tasks/${task.parentInfo.id}`}
                className="mono hover:underline"
                style={{ fontSize: '13.5px', color: 'var(--accent)' }}
              >
                {task.parentInfo.taskKey}
              </Link>
            </PropertyRow>
          )}
        </div>
      </div>

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
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="smallcaps" style={{ lineHeight: '14px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '13.5px', lineHeight: '18.9px' }}>{children}</div>
    </div>
  );
}

function PriorityBars({ level }: { level: string }) {
  const filled = level === 'urgent' ? 4 : level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0;
  const color = PRIORITY_DOT_COLORS[level] || PRIORITY_DOT_COLORS.none;
  return (
    <span className="inline-flex items-end gap-0.5" style={{ height: 14 }}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 4 + i * 2.5,
            borderRadius: 1,
            backgroundColor: i <= filled ? color : 'var(--paper-3)',
          }}
        />
      ))}
    </span>
  );
}

function ActivityDescription({ action, field, newValue }: { action: string; field: string | null; oldValue: string | null; newValue: string | null }) {
  switch (action) {
    case 'created':
      return <>created this item</>;
    case 'updated':
      return <>updated {field || 'this item'}</>;
    case 'status_changed':
      return <>changed status</>;
    case 'assigned':
      return <>{newValue ? 'assigned this item' : 'unassigned this item'}</>;
    case 'comment_added':
      return <>added a comment</>;
    case 'attachment_added':
      return <>uploaded an attachment</>;
    default:
      return <>{action.replace(/_/g, ' ')}</>;
  }
}
