import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';

interface Subtask {
  id: number;
  taskNumber: number;
  title: string;
  statusId: number;
  completedAt: string | null;
  checklistItems?: { id: number; title: string; isCompleted: boolean }[];
}

interface Dependency {
  id: number;
  dependsOnTaskId?: number;
  taskId?: number;
  dependencyType: string;
  task?: { id: number; taskNumber: number; title: string };
  dependsOnTask?: { id: number; taskNumber: number; title: string };
}

interface TaskDetail {
  id: number;
  taskNumber: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  statusId: number;
  status?: { id: number; name: string; category: string; color: string };
  storyPoints: number | null;
  assigneeId: number | null;
  epicId: number | null;
  sprintId: number | null;
  dueDate: string | null;
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
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role !== 'viewer';
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([loadTask(), loadComments(), loadAttachments()]);
    };
    loadAll();
  }, [taskId]);

  // Load assignees once per project (not per task)
  useEffect(() => {
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((res) => {
      const opts = (res.data.data.list || []).map((o: any) => ({ value: String(o.value), label: o.label }));
      setAssigneeOptions([{ value: '', label: 'Unassigned' }, ...opts]);
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const handler = async () => {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser || !task) return;
      try {
        await apiClient.put(`/projects/${projectId}/tasks/${taskId}/assign`, { assigneeId: currentUser.id });
        await loadTask();
        onUpdated?.();
      } catch {}
    };
    document.addEventListener('shortcut-assign-to-me', handler as EventListener);
    return () => document.removeEventListener('shortcut-assign-to-me', handler as EventListener);
  }, [projectId, taskId, task]);

  const loadTask = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks/${taskId}`);
      setTask(data.data);
      setTitle(data.data.title);
      setStoryPoints(data.data.storyPoints != null ? String(data.data.storyPoints) : '');
      setChecklistItems(data.data.checklistItems || []);
    } catch {}
  };

  const handleTitleSave = async () => {
    if (!title.trim() || title === task?.title) {
      setEditing(false);
      return;
    }
    try {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}`, { title });
      await loadTask();
      onUpdated?.();
    } catch {}
    setEditing(false);
  };

  const handleFieldChange = async (field: string, value: unknown) => {
    try {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}`, { [field]: value });
      await loadTask();
      onUpdated?.();
      onUpdated?.();
    } catch {}
  };



  const loadComments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks/${taskId}/comments`);
      setComments(data.data.list || []);
    } catch {}
  };

  const loadAttachments = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks/${taskId}/attachments`);
      setAttachments(data.data.list || []);
    } catch {}
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/tasks/${taskId}/comments`, { body: newComment });
      setNewComment('');
      loadComments();
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await apiClient.post(`/projects/${projectId}/tasks/${taskId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      loadAttachments();
    } catch {}
    e.target.value = '';
  };

  const handleDownload = async (attachmentId: number) => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/url`);
      window.open(data.data.url, '_blank');
    } catch {}
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistTitle.trim()) return;
    try {
      await apiClient.post(`/projects/${projectId}/tasks/${taskId}/checklist`, { title: newChecklistTitle.trim() });
      setNewChecklistTitle('');
      setShowAddChecklist(false);
      loadTask();
    } catch {}
  };

  const handleToggleChecklist = async (itemId: number, isCompleted: boolean) => {
    try {
      await apiClient.put(`/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`, { isCompleted: !isCompleted });
      loadTask();
    } catch {}
  };

  const handleDeleteChecklist = async (itemId: number) => {
    try {
      await apiClient.delete(`/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`);
      loadTask();
    } catch {}
  };

  const handleCreateSubtaskAndOpen = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      const { data } = await apiClient.post(`/projects/${projectId}/tasks/${taskId}/subtasks`, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      const newId = data.data.item?.id;
      if (newId) setOpenSubtaskId(newId);
      loadTask();
      onUpdated?.();
    } catch {}
  };

  if (!task) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-neutral-50 dark:bg-dneutral-50 border-l border-neutral-200 dark:border-dneutral-200 shadow-xl z-40 flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  const taskKey = projectPrefix ? `${projectPrefix}-${task.taskNumber}` : `#${task.taskNumber}`;


  const zBase = isSubtask ? 50 : 30;
  const parentKey = parentTaskKey || (task.parentInfo ? task.parentInfo.taskKey : null);

  return (
    <>
      <div className={`fixed inset-0 z-${zBase}`} onClick={openSubtaskId ? undefined : onClose} />
      <div onClick={(e) => e.stopPropagation()} className={`fixed inset-y-0 right-0 bg-neutral-50 dark:bg-dneutral-50 border-l border-neutral-200 dark:border-dneutral-200 shadow-xl flex flex-col overflow-hidden transition-all duration-200 ${
        openSubtaskId ? 'w-[560px] z-[39]' : `w-[480px] z-[${zBase + 10}]`
      }`}>
        {/* Header */}
        <div className="flex flex-col border-b border-neutral-200 dark:border-dneutral-200">
          <div className="flex items-center justify-between px-4 py-2">
            {isSubtask && parentKey ? (
              <div className="flex items-center gap-1.5 text-sm font-mono">
                <button onClick={onClose} className="text-neutral-400 hover:text-primary-500">{parentKey}</button>
                <span className="text-neutral-300 dark:text-dneutral-400">→</span>
                <span className="text-neutral-700 dark:text-dneutral-700">{taskKey}</span>
              </div>
            ) : (
              <span className="text-sm font-mono text-neutral-400">{taskKey}</span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 dark:hover:bg-dneutral-200 rounded text-neutral-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 pb-2 text-sm text-neutral-400 dark:text-dneutral-500">
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Title */}
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              autoFocus
              className="w-full text-lg font-bold bg-transparent border-b border-primary-500 outline-none text-neutral-700 dark:text-dneutral-700"
            />
          ) : (
            <h2
              onClick={() => setEditing(true)}
              className="text-lg font-bold text-neutral-700 dark:text-dneutral-700 cursor-pointer hover:text-primary-500"
            >
              {task.title}
            </h2>
          )}

          {/* Properties */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Priority</span>
              <Select
                value={task.priority}
                onChange={(val) => handleFieldChange('priority', val)}
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Type</span>
              <Select
                value={task.type}
                onChange={(val) => handleFieldChange('type', val)}
                options={[
                  { value: 'task', label: 'Task' },
                  { value: 'bug', label: 'Bug' },
                  { value: 'story', label: 'Story' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Story Points</span>
              <input
                type="text"
                inputMode="numeric"
                value={storyPoints}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) setStoryPoints(v);
                }}
                onBlur={() => {
                  const parsed = storyPoints === '' ? null : parseInt(storyPoints, 10);
                  if (parsed !== (task.storyPoints ?? null)) {
                    handleFieldChange('storyPoints', parsed);
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-20 text-right rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-2 py-1 text-sm text-neutral-700 dark:text-dneutral-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                placeholder="-"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Assignee</span>
              <Select
                value={task.assigneeId ? String(task.assigneeId) : ''}
                onChange={async (val) => {
                  const assigneeId = val ? parseInt(val) : null;
                  try {
                    await apiClient.put(`/projects/${projectId}/tasks/${taskId}/assign`, { assigneeId });
                    await loadTask();
                    onUpdated?.();
                  } catch {}
                }}
                options={assigneeOptions}
                placeholder="Unassigned"
              />
            </div>

          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-neutral-400 mb-2">Description</h3>
            <textarea
              value={task.description || ''}
              onChange={(e) => setTask((prev) => prev ? { ...prev, description: e.target.value } : prev)}
              onBlur={(e) => {
                const newVal = e.target.value || null;
                if (newVal !== (task.description || null)) {
                  handleFieldChange('description', newVal);
                }
              }}
              placeholder="Add a description..."
              rows={3}
              className="w-full text-sm text-neutral-700 dark:text-dneutral-700 min-h-[60px] p-3 rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 placeholder-neutral-400 resize-none focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
            />
          </div>

          {/* Subtasks — only on parent tasks */}
          {!isSubtask && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-neutral-400">
                  Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.length})`}
                </h3>
              </div>
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="space-y-1 mb-2">
                  {task.subtasks.map((st) => (
                    <button key={st.id} onClick={() => setOpenSubtaskId(st.id)} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 w-full text-left">
                      <span className={st.completedAt ? 'text-success' : 'text-neutral-400'}>
                        {st.completedAt ? '☑' : '☐'}
                      </span>
                      <span className={`flex-1 ${st.completedAt ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-dneutral-700'}`}>
                        {st.title}
                      </span>
                      <span className="text-neutral-400 text-sm">→</span>
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
                  <button type="submit" className="text-sm px-2 py-1 bg-primary-500 text-white rounded">Add</button>
                  <button type="button" onClick={() => setShowAddSubtask(false)} className="text-sm px-2 py-1 text-neutral-400">Cancel</button>
                </form>
              ) : (
                <button onClick={() => setShowAddSubtask(true)} className="text-sm text-neutral-400 hover:text-primary-500">
                  + Add subtask
                </button>
              ))}
            </div>
          )}

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-neutral-400">
                Checklist {checklistItems.length > 0 && `(${checklistItems.filter((i) => i.isCompleted).length}/${checklistItems.length})`}
              </h3>
              {canEdit && !showAddChecklist && (
                <button onClick={() => setShowAddChecklist(true)} className="text-sm text-primary-500 hover:underline">+ Add item</button>
              )}
            </div>
            {checklistItems.length > 0 && (
              <div className="space-y-1 mb-2">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200">
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
                      <button onClick={() => handleDeleteChecklist(item.id)} className="text-sm text-neutral-400 hover:text-danger">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {checklistItems.length === 0 && !showAddChecklist && (
              <p className="text-sm text-neutral-400">No checklist items</p>
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
                <button type="submit" className="text-sm px-2 py-1 bg-primary-500 text-white rounded">Add</button>
                <button type="button" onClick={() => setShowAddChecklist(false)} className="text-sm px-2 py-1 text-neutral-400">Cancel</button>
              </form>
            )}
          </div>

          {/* Dependencies */}
          {((task.blockedBy && task.blockedBy.length > 0) || (task.blocks && task.blocks.length > 0)) && (
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2">Dependencies</h3>
              {task.blockedBy && task.blockedBy.length > 0 && (
                <div className="mb-2">
                  <span className="text-sm text-neutral-400 uppercase">Blocked by:</span>
                  {task.blockedBy.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-sm py-1 px-2">
                      <span className="text-danger">🔒</span>
                      <span className="text-neutral-600 dark:text-dneutral-600">
                        #{dep.dependsOnTask?.taskNumber} {dep.dependsOnTask?.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {task.blocks && task.blocks.length > 0 && (
                <div>
                  <span className="text-sm text-neutral-400 uppercase">Blocks:</span>
                  {task.blocks.map((dep) => (
                    <div key={dep.id} className="flex items-center gap-2 text-sm py-1 px-2">
                      <span className="text-warning">⏳</span>
                      <span className="text-neutral-600 dark:text-dneutral-600">
                        #{dep.task?.taskNumber} {dep.task?.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-neutral-400">Attachments</h3>
              {canEdit && (
                <label className="text-sm text-primary-500 hover:underline cursor-pointer">
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
              <p className="text-sm text-neutral-400">No attachments</p>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="text-sm font-medium text-neutral-400 mb-2">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>
            {comments.length > 0 && (
              <div className="space-y-3 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-neutral-700 dark:text-dneutral-700">
                        {c.author?.displayName || 'Unknown'}
                      </span>
                      <span className="text-sm text-neutral-400">
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
                  className="flex-1 text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-300 bg-transparent text-neutral-700 dark:text-dneutral-700"
                />
                <button type="submit" className="text-sm px-3 py-1.5 bg-primary-500 text-white rounded">Post</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Stacked subtask drawer */}
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
    apiClient.get(`/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/url`)
      .then((res) => setPreviewUrl(res.data.data.url))
      .catch(() => {});
  }, [attachment.id, isImage, projectId, taskId]);

  return (
    <button
      onClick={() => onDownload(attachment.id)}
      className="flex items-start gap-2 w-full text-left text-sm p-2 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200"
    >
      {isImage && previewUrl ? (
        <img src={previewUrl} alt={attachment.originalFilename} className="w-12 h-12 rounded object-cover flex-shrink-0 border border-neutral-200 dark:border-dneutral-300" />
      ) : (
        <span className="text-neutral-400 flex-shrink-0 mt-0.5">&#x1F4CE;</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-700 dark:text-dneutral-700 truncate">{attachment.originalFilename}</p>
        <p className="text-sm text-neutral-400 dark:text-dneutral-500">{(attachment.sizeBytes / 1024).toFixed(0)} KB</p>
      </div>
    </button>
  );
}
