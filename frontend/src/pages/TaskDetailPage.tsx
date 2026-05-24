import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { useTaskAutoSave } from '../hooks/useTaskAutoSave';
import { SaveStatusIndicator } from '../components/common/SaveStatusIndicator';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';
import { LabelPicker } from '../components/ui/LabelPicker';
import { LabelList } from '../components/ui/LabelBadge';
import { TypeTag } from '../components/ui';
import type { TypeTagKind } from '../components/ui';

interface Subtask {
  id: number;
  itemNumber: number;
  title: string;
  statusId: number;
  completedAt: string | null;
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

interface ActivityItem {
  id: number;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user?: { id: number; displayName: string; avatarUrl: string | null };
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
  // Phase 7 — watcher state for the "N watching" badge in the header.
  const [watcherCount, setWatcherCount] = useState<number>(0);
  const [byMeWatching, setByMeWatching] = useState<boolean>(false);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [associations, setAssociations] = useState<any>(null);
  const [showAddAssociation, setShowAddAssociation] = useState(false);
  const [addAssocLinkType, setAddAssocLinkType] = useState<string>('belongs_to');
  const [assocSearchQuery, setAssocSearchQuery] = useState('');
  const [assocSearchResults, setAssocSearchResults] = useState<any[]>([]);
  const [assocSearching, setAssocSearching] = useState(false);

  const PREVIEW_LIMIT = 5;
  const isSectionExpanded = (key: string) => expandedSections[key] ?? false;
  const isSectionCollapsed = (key: string) => collapsedSections[key] ?? false;
  const toggleExpand = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleCollapse = (key: string) => setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const { canEdit } = useRole();

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
  }, [pid]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}`);
      setTask(data.data);
      setTitle(data.data.title);
      setStoryPoints(data.data.storyPoints != null ? String(data.data.storyPoints) : '');
      setChecklistItems(data.data.checklistItems || []);
    } catch (err) { console.error(err); }
  };

  const loadComments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${pid}/items/${tid}/comments`);
      setComments(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  // Phase 7 — watcher state + toggle.
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

  const handleDeleteItem = async () => {
    try {
      await apiClient.delete(`/projects/${pid}/items/${tid}`);
      toast('Item deleted');
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await apiClient.post(`/projects/${pid}/items/${tid}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  const taskKey = projectPrefix ? `${projectPrefix}-${task.itemNumber}` : `#${task.itemNumber}`;

  return (
    <div className="flex flex-col h-full">
      <ReadOnlyBanner />
      {/* Header — type chip · itemKey · status · blocker · "N watching" inline */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-rule">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="p-1 hover:bg-paper rounded text-faint"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {task.itemType && (
            <TypeTag kind={task.itemType as TypeTagKind} size="sm" />
          )}
          {task.parentInfo ? (
            <div className="flex items-center gap-1.5 text-[12px] font-mono tracking-wide">
              <Link to={`/projects/${pid}/tasks/${task.parentInfo.id}`} className="text-faint hover:text-lilac-dark">
                {task.parentInfo.taskKey}
              </Link>
              <span className="text-faint">›</span>
              <span className="text-text">{taskKey}</span>
            </div>
          ) : (
            <span className="text-[12px] font-mono tracking-wide text-faint">{taskKey}</span>
          )}
          {task.status && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-paper text-[11px] tracking-wide">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.status.color }} />
              <span style={{ color: task.status.color }}>{task.status.name}</span>
            </span>
          )}
          {/* Blocker chip: surface the first blocking item inline so the gate is visible without scrolling. */}
          {task.blockedBy && task.blockedBy.length > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber/15 text-amber-dark text-[11px] tracking-wide"
              title={`Blocked by ${task.blockedBy.length} item${task.blockedBy.length === 1 ? '' : 's'}`}
            >
              <span>blocked by</span>
              {task.blockedBy[0].dependsOnItem?.itemKey && (
                <span className="font-mono">{task.blockedBy[0].dependsOnItem.itemKey}</span>
              )}
            </span>
          )}
          {/* "N watching" badge — moved from the right rail so the social
              footprint reads next to the title block per frame 6. */}
          <button
            type="button"
            onClick={toggleWatch}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] tracking-wide transition-colors ${
              byMeWatching ? 'bg-lilac-tint text-lilac-dark' : 'bg-paper text-mute hover:bg-rule'
            }`}
            title={byMeWatching ? 'Stop watching' : 'Watch this item'}
          >
            <span>{byMeWatching ? '★' : '☆'}</span>
            <span>{watcherCount} watching</span>
          </button>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-faint">
            <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            {task.statusChangedAt && (
              <span>· Status {new Date(task.statusChangedAt).toLocaleDateString()}</span>
            )}
          </div>
          {canEdit && (
            <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — main content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-neutral-200 dark:border-dneutral-200" style={{ flexBasis: '60%' }}>
          {/* Title — italic serif hero per frame 6. Click-to-edit keeps the
              autosave UX; the editing input matches the hero's font size so
              the visual switch isn't jarring. */}
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
              className="w-full font-serif italic text-[40px] leading-[1.1] tracking-tight bg-transparent border-b border-lilac outline-none text-ink dark:text-dneutral-700"
            />
          ) : (
            <h1
              onClick={() => canEdit && setEditing(true)}
              className={`font-serif italic text-[40px] leading-[1.1] tracking-tight text-ink dark:text-dneutral-700 ${canEdit ? 'cursor-pointer hover:text-lilac-dark' : ''}`}
            >
              {task.title}
            </h1>
          )}

          {/* Description */}
          <div>
            <h3 className="text-[16px] font-medium text-neutral-400 mb-2">Description</h3>
            <textarea
              value={task.description || ''}
              onChange={(e) => {
                if (!canEdit) return;
                const val = e.target.value;
                setTask((prev) => prev ? { ...prev, description: val } : prev);
                debouncedFieldChange('description', val || null, loadTask);
              }}
              onBlur={() => flushDebounce()}
              placeholder={canEdit ? 'Add a description...' : 'No description'}
              rows={5}
              disabled={!canEdit}
              className={`w-full text-[16px] text-neutral-700 dark:text-dneutral-700 min-h-[100px] p-3 rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 placeholder-neutral-400 resize-y focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac/40 ${!canEdit ? 'opacity-75 cursor-default' : ''}`}
            />
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => toggleCollapse('subtasks')} className="flex items-center gap-1.5 text-[16px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600">
                <svg className={`w-3.5 h-3.5 transition-transform ${isSectionCollapsed('subtasks') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.length})`}
              </button>
            </div>
            {!isSectionCollapsed('subtasks') && (
              <>
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {(isSectionExpanded('subtasks') ? task.subtasks : task.subtasks.slice(0, PREVIEW_LIMIT)).map((st) => (
                      <Link
                        key={st.id}
                        to={`/projects/${pid}/tasks/${st.id}`}
                        className="flex items-center gap-2 text-[16px] py-1.5 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200"
                      >
                        <span className={st.completedAt ? 'text-success' : 'text-neutral-400'}>
                          {st.completedAt ? '☑' : '☐'}
                        </span>
                        <span className={`flex-1 ${st.completedAt ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-dneutral-700'}`}>
                          {st.title}
                        </span>
                        <span className="text-neutral-400 text-[16px]">→</span>
                      </Link>
                    ))}
                    {task.subtasks.length > PREVIEW_LIMIT && (
                      <button onClick={() => toggleExpand('subtasks')} className="text-[16px] text-lilac-dark hover:underline px-2 py-1">
                        {isSectionExpanded('subtasks') ? 'Show less' : `Show all (${task.subtasks.length})`}
                      </button>
                    )}
                  </div>
                )}
                {canEdit && (showAddSubtask ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleCreateSubtask(); }} className="flex gap-1">
                    <Input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="Subtask title..." autoFocus className="flex-1" />
                    <Button type="submit" variant="primary" size="sm">Add</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddSubtask(false)}>Cancel</Button>
                  </form>
                ) : (
                  <button onClick={() => setShowAddSubtask(true)} className="text-[16px] text-neutral-400 hover:text-lilac-dark">+ Add subtask</button>
                ))}
              </>
            )}
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => toggleCollapse('checklist')} className="flex items-center gap-1.5 text-[16px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600">
                <svg className={`w-3.5 h-3.5 transition-transform ${isSectionCollapsed('checklist') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Checklist {checklistItems.length > 0 && `(${checklistItems.filter((i) => i.isCompleted).length}/${checklistItems.length})`}
              </button>
              {canEdit && !showAddChecklist && !isSectionCollapsed('checklist') && (
                <button onClick={() => setShowAddChecklist(true)} className="text-[16px] text-lilac-dark hover:underline">+ Add item</button>
              )}
            </div>
            {!isSectionCollapsed('checklist') && (
              <>
                {checklistItems.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {(isSectionExpanded('checklist') ? checklistItems : checklistItems.slice(0, PREVIEW_LIMIT)).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-[16px] py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
                        <input type="checkbox" checked={item.isCompleted} onChange={() => canEdit && handleToggleChecklist(item.id, item.isCompleted)} className="w-4 h-4 rounded border-neutral-200" />
                        <span className={`flex-1 ${item.isCompleted ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-dneutral-700'}`}>{item.title}</span>
                        {canEdit && <button onClick={() => handleDeleteChecklist(item.id)} className="text-[16px] text-neutral-400 hover:text-danger">×</button>}
                      </div>
                    ))}
                    {checklistItems.length > PREVIEW_LIMIT && (
                      <button onClick={() => toggleExpand('checklist')} className="text-[16px] text-lilac-dark hover:underline px-2 py-1">
                        {isSectionExpanded('checklist') ? 'Show less' : `Show all (${checklistItems.length})`}
                      </button>
                    )}
                  </div>
                )}
                {checklistItems.length === 0 && !showAddChecklist && <p className="text-[16px] text-neutral-400">No checklist items</p>}
                {showAddChecklist && canEdit && (
                  <form onSubmit={handleAddChecklistItem} className="flex gap-1">
                    <Input value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)} placeholder="Checklist item..." autoFocus className="flex-1" />
                    <Button type="submit" variant="primary" size="sm">Add</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddChecklist(false)}>Cancel</Button>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Dependencies */}
          {((task.blockedBy && task.blockedBy.length > 0) || (task.blocks && task.blocks.length > 0)) && (
            <div>
              <h3 className="text-[16px] font-medium text-neutral-400 mb-2">Dependencies</h3>
              {task.blockedBy && task.blockedBy.length > 0 && (
                <div className="mb-2">
                  <span className="text-[16px] text-neutral-400 uppercase">Blocked by:</span>
                  {task.blockedBy.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-[16px] py-1 px-2">
                      <span className="text-danger">🔒</span>
                      <span className="text-neutral-600 dark:text-dneutral-600">#{dep.dependsOnItem?.itemKey} {dep.dependsOnItem?.title}</span>
                    </div>
                  ))}
                </div>
              )}
              {task.blocks && task.blocks.length > 0 && (
                <div>
                  <span className="text-[16px] text-neutral-400 uppercase">Blocks:</span>
                  {task.blocks.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-[16px] py-1 px-2">
                      <span className="text-warning">⏳</span>
                      <span className="text-neutral-600 dark:text-dneutral-600">#{dep.item?.itemKey} {dep.item?.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => toggleCollapse('attachments')} className="flex items-center gap-1.5 text-[16px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600">
                <svg className={`w-3.5 h-3.5 transition-transform ${isSectionCollapsed('attachments') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </button>
              {canEdit && !isSectionCollapsed('attachments') && (
                <label className="text-[16px] text-lilac-dark hover:underline cursor-pointer">
                  + Upload
                  <input type="file" className="hidden" onChange={handleUpload} />
                </label>
              )}
            </div>
            {!isSectionCollapsed('attachments') && (
              <>
                {attachments.length > 0 ? (
                  <div className="space-y-2">
                    {(isSectionExpanded('attachments') ? attachments : attachments.slice(0, PREVIEW_LIMIT)).map((att) => (
                      <button key={att.id} onClick={() => handleDownload(att.id)} className="flex items-start gap-2 w-full text-left text-[16px] p-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
                        <span className="text-neutral-400 flex-shrink-0 mt-0.5">📎</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{att.originalFilename}</p>
                          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500">{(att.sizeBytes / 1024).toFixed(0)} KB</p>
                        </div>
                      </button>
                    ))}
                    {attachments.length > PREVIEW_LIMIT && (
                      <button onClick={() => toggleExpand('attachments')} className="text-[16px] text-lilac-dark hover:underline px-2 py-1">
                        {isSectionExpanded('attachments') ? 'Show less' : `Show all (${attachments.length})`}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[16px] text-neutral-400">No attachments</p>
                )}
              </>
            )}
          </div>

          {/* Comments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => toggleCollapse('comments')} className="flex items-center gap-1.5 text-[16px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600">
                <svg className={`w-3.5 h-3.5 transition-transform ${isSectionCollapsed('comments') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Comments {comments.length > 0 && `(${comments.length})`}
              </button>
            </div>
            {!isSectionCollapsed('comments') && (
              <>
                {comments.length > 0 && (
                  <div className="space-y-3 mb-3">
                    {(isSectionExpanded('comments') ? comments : comments.slice(0, PREVIEW_LIMIT)).map((c) => (
                      <div key={c.id} className="text-[16px]">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-neutral-700 dark:text-dneutral-700">{c.author?.displayName || 'Unknown'}</span>
                          <span className="text-[16px] text-neutral-400">{new Date(c.createdAt).toLocaleString()}{c.editedAt && ' (edited)'}</span>
                        </div>
                        <p className="text-neutral-600 dark:text-dneutral-600 whitespace-pre-wrap">{c.body}</p>
                        {/* Phase 7 — reactions + quick-react row. Clicking
                            an existing reaction toggles the caller's stance. */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {((c as any).reactions ?? []).map((r: any) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => toggleReaction(c.id, r.emoji)}
                              disabled={!canEdit}
                              className={`px-1.5 py-0.5 rounded-full text-[12px] inline-flex items-center gap-1 transition-colors ${
                                r.byMe
                                  ? 'bg-lilac-tint text-lilac-dark border border-lilac/30'
                                  : 'bg-paper text-mute hover:bg-rule'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span className="font-medium">{r.count}</span>
                            </button>
                          ))}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => toggleReaction(c.id, '👍')}
                              className="px-1.5 py-0.5 rounded-full text-[12px] text-faint hover:bg-paper hover:text-text"
                              title="React with 👍"
                            >
                              + 👍
                            </button>
                          )}
                          {((c as any).mentions ?? []).length > 0 && (
                            <span className="text-[11px] italic text-faint ml-1">
                              mentions: {((c as any).mentions as Array<any>).map((m: any) => `@${m.displayName}`).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {comments.length > PREVIEW_LIMIT && (
                      <button onClick={() => toggleExpand('comments')} className="text-[16px] text-lilac-dark hover:underline px-2 py-1">
                        {isSectionExpanded('comments') ? 'Show less' : `Show all (${comments.length})`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {canEdit && (
              <form onSubmit={handleAddComment} className="flex gap-1">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    // Phase 7 — ⌘↵ / Ctrl+↵ submits the comment from the
                    // textarea so users don't have to leave the keyboard.
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleAddComment(e as any);
                    }
                  }}
                  rows={2}
                  placeholder="Add a comment… (⌘↵ to post, @ to mention)"
                  className="flex-1 text-[16px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-300 bg-transparent text-neutral-700 dark:text-dneutral-700 resize-none"
                />
                <Button type="submit" variant="primary" size="sm">Post</Button>
              </form>
            )}
          </div>
        </div>

        {/* Right column — properties + activity. The watcher control + count
            moved up to the header strip (frame 6) so the right rail can lean
            on Properties first; nothing duplicate-renders. */}
        <div className="flex flex-col overflow-hidden p-6" style={{ flexBasis: '40%', maxWidth: '400px' }}>
          {/* Properties */}
          <div className="space-y-3 text-[16px] flex-shrink-0">
            <h3 className="text-[16px] font-medium text-neutral-400 uppercase">Properties</h3>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Priority</span>
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
                <span className="text-neutral-700 dark:text-dneutral-700">{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Story Points</span>
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
                  className="w-20 text-right rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-2 py-1 text-[16px] text-neutral-700 dark:text-dneutral-700 focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac/40"
                  placeholder="-"
                />
              ) : (
                <span className="text-neutral-700 dark:text-dneutral-700">{storyPoints || '-'}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Assignee</span>
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
                <span className="text-neutral-700 dark:text-dneutral-700">
                  {assigneeOptions.find((o) => o.value === String(task.assigneeId))?.label || 'Unassigned'}
                </span>
              )}
            </div>

            {task.itemType === 'subtask' && task.parentInfo && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Parent</span>
                <Link to={`/projects/${pid}/tasks/${task.parentInfo.id}`} className="text-[16px] text-lilac-dark hover:underline">
                  {task.parentInfo.taskKey}
                </Link>
              </div>
            )}

            {/* Labels */}
            <div>
              <h3 className="text-[16px] font-medium text-neutral-400 mb-2">Labels</h3>
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
                <LabelList labels={task.labels || []} max={10} size="md" />
              )}
            </div>
            {/* Associations */}
            <div>
              <h3 className="text-[16px] font-medium text-neutral-400 mb-2">Associations</h3>
              {associations && (
                <div className="space-y-2">
                  {associations.belongsTo?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-neutral-400 uppercase">Part of</span>
                      {associations.belongsTo.map((a: any) => (
                        <PageAssociationRow key={a.id} assoc={a} pid={pid} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                      ))}
                    </div>
                  )}
                  {associations.blocks?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-neutral-400 uppercase">Blocks</span>
                      {associations.blocks.map((a: any) => (
                        <PageAssociationRow key={a.id} assoc={a} pid={pid} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                      ))}
                    </div>
                  )}
                  {associations.blockedBy?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-neutral-400 uppercase">Blocked by</span>
                      {associations.blockedBy.map((a: any) => (
                        <PageAssociationRow key={a.id} assoc={a} pid={pid} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                      ))}
                    </div>
                  )}
                  {associations.relatesTo?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-neutral-400 uppercase">Related</span>
                      {associations.relatesTo.map((a: any) => (
                        <PageAssociationRow key={a.id} assoc={a} pid={pid} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
                      ))}
                    </div>
                  )}
                  {associations.causedBy?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-neutral-400 uppercase">Caused by</span>
                      {associations.causedBy.map((a: any) => (
                        <PageAssociationRow key={a.id} assoc={a} pid={pid} onRemove={canEdit ? () => handleRemoveAssociation(a.id) : undefined} />
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
                    placeholder="Search items..."
                    autoFocus
                    className="w-full text-[16px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-lilac focus:outline-none"
                  />
                  {assocSearching && <p className="text-[14px] text-neutral-400">Searching...</p>}
                  {assocSearchResults.length > 0 && (
                    <div className="max-h-[160px] overflow-y-auto space-y-1">
                      {assocSearchResults.map((t: any) => (
                        <button key={t.id} onClick={() => handleAddAssociation(t.id)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-[16px]">
                          <span className="font-mono text-[14px] text-neutral-400">{t.itemKey}</span>
                          <span className="text-neutral-700 dark:text-dneutral-700 truncate">{t.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {assocSearchQuery.length >= 2 && !assocSearching && assocSearchResults.length === 0 && (
                    <p className="text-[14px] text-neutral-400">No items found</p>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setShowAddAssociation(false); setAssocSearchQuery(''); setAssocSearchResults([]); }}>Cancel</Button>
                </div>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="flex flex-col flex-1 overflow-hidden mt-6">
            <h3 className="text-[16px] font-medium text-neutral-400 uppercase mb-3 flex-shrink-0">Activity</h3>
            {activity.length > 0 ? (
              <div className="space-y-3 overflow-y-auto flex-1">
                {activity.map((a) => (
                  <div key={a.id} className="flex gap-2 text-[16px]">
                    <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-dneutral-300 flex items-center justify-center text-neutral-500 text-[16px] flex-shrink-0">
                      {a.user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-neutral-600 dark:text-dneutral-600">
                        <span className="font-medium text-neutral-700 dark:text-dneutral-700">{a.user?.displayName || 'Unknown'}</span>
                        {' '}
                        <ActivityDescription action={a.action} field={a.fieldChanged} oldValue={a.oldValue} newValue={a.newValue} />
                      </p>
                      <p className="text-neutral-400 dark:text-dneutral-500 text-[16px]">{new Date(a.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[16px] text-neutral-400">No activity yet</p>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}

function PageAssociationRow({ assoc, pid, onRemove }: { assoc: any; pid: number; onRemove?: () => void }) {
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
      <Link to={`/projects/${pid}/tasks/${item.id}`} className="font-mono text-[14px] text-neutral-400 flex-shrink-0 hover:text-lilac-dark">{item.itemKey}</Link>
      <span className="text-neutral-600 dark:text-dneutral-600 truncate flex-1">{item.title}</span>
      {onRemove && (
        <button onClick={onRemove} className="text-neutral-400 hover:text-danger opacity-0 group-hover:opacity-100 text-[14px]">x</button>
      )}
    </div>
  );
}

function ActivityDescription({ action, field, newValue }: { action: string; field: string | null; oldValue: string | null; newValue: string | null }) {
  switch (action) {
    case 'created':
      return <>created this task</>;
    case 'updated':
      return <>updated {field || 'this task'}</>;
    case 'status_changed':
      return <>changed status</>;
    case 'assigned':
      return <>{newValue ? 'assigned this task' : 'unassigned this task'}</>;
    case 'comment_added':
      return <>added a comment</>;
    case 'attachment_added':
      return <>uploaded an attachment</>;
    default:
      return <>{action.replace(/_/g, ' ')}</>;
  }
}
