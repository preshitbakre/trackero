import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AVATAR_COLORS, PRIORITY_BADGE_COLORS, STATUS_BADGE_COLORS } from '../lib/colors';
import { toast } from '../components/common/Toast';
import { LabelList } from '../components/ui/LabelBadge';
import { ErrorState } from '../components/common/ErrorState';

const ITEM_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#7C5CFC35', text: '#4A2FC0' },
  story:   { bg: '#88A9D640', text: '#2E5A8E' },
  task:    { bg: '#D6B58840', text: '#7A5E2A' },
  subtask: { bg: '#A8A19A35', text: '#5C5650' },
};

interface ChildItem {
  id: number;
  itemKey: string;
  itemNumber: number;
  itemType: string;
  title: string;
  priority: string;
  storyPoints: number | null;
  status: { id: number; name: string; category: string; color: string } | null;
  assignee: { id: number; displayName: string } | null;
  completedAt: string | null;
  sprintId?: number | null;
  labels?: { id: number; name: string; color: string }[];
}

interface StoryDetail {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  description: string | null;
  priority: string;
  status: { id: number; name: string; category: string; color: string } | null;
  assignee: { id: number; displayName: string } | null;
  sprint: { id: number; name: string } | null;
  storyPoints: number | null;
  startDate: string | null;
  endDate: string | null;
  labels: { id: number; name: string; color: string }[];
  progress: {
    totalItems: number;
    completedItems: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
  } | null;
  breadcrumb: { id: number; itemKey: string; itemType: string; title: string; color: string }[];
  children: ChildItem[];
  commentCount: number;
  attachmentCount: number;
}

interface Sprint {
  id: number;
  name: string;
  status: string;
}

const SPRINT_STATUS_ORDER: Record<string, number> = { active: 0, planning: 1, completed: 2 };

export function StoryDetailPage() {
  const { id: projectId, storyId } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [allItems, setAllItems] = useState<ChildItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projectPrefix, setProjectPrefix] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState<'task' | 'subtask' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { canEdit } = useRole();

  const loadData = useCallback(async () => {
    if (!projectId || !storyId) return;
    setLoading(true);
    setError(false);
    try {
      const [storyRes, sprintsRes, projectRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/items/${storyId}`),
        apiClient.get(`/projects/${projectId}/sprints?limit=100`),
        apiClient.get(`/projects/${projectId}`),
      ]);

      const storyData = storyRes.data.data;
      setStory(storyData);
      setSprints(sprintsRes.data.data.list || []);
      setProjectPrefix(projectRes.data.data.prefix || '');

      // Fetch associations — "members" = items that belong_to this story
      const assocRes = await apiClient.get(`/projects/${projectId}/items/${storyId}/associations`);
      const members: ChildItem[] = (assocRes.data.data?.members || []).map((a: any) => ({
        ...a.item,
        sprintId: a.item.sprintId ?? null,
      }));

      // Also include direct children via parentId (subtasks of the story itself)
      const directSubtasks: ChildItem[] = ((storyData.children || []) as any[])
        .filter((c: any) => c.itemType === 'subtask')
        .map((c: any) => ({ ...c, sprintId: c.sprintId ?? null }));

      // Merge — deduplicate by id
      const seenIds = new Set(members.map(m => m.id));
      for (const sub of directSubtasks) {
        if (!seenIds.has(sub.id)) {
          members.push(sub);
          seenIds.add(sub.id);
        }
      }

      // For tasks, fetch their subtasks
      const tasks = members.filter(c => c.itemType === 'task');
      const subtaskArrays = await Promise.all(
        tasks.map(async (task) => {
          try {
            const res = await apiClient.get(`/projects/${projectId}/items/${task.id}/children?limit=100`);
            return (res.data.data.list || []).map((st: any) => ({
              ...st,
              sprintId: null,
            }));
          } catch { return []; }
        }),
      );

      // Build flat list with tasks followed by their subtasks
      const flat: ChildItem[] = [];
      for (const child of members) {
        flat.push(child);
        if (child.itemType === 'task') {
          const idx = tasks.indexOf(child);
          if (idx !== -1) {
            for (const st of subtaskArrays[idx]) {
              if (!seenIds.has(st.id)) {
                flat.push(st);
                seenIds.add(st.id);
              }
            }
          }
        }
      }
      setAllItems(flat);
    } catch (err: any) {
      console.error(err);
      if (err?.response?.status !== 404) setError(true);
    }
    setLoading(false);
  }, [projectId, storyId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async () => {
    if (!projectId || !storyId) return;
    try {
      await apiClient.delete(`/projects/${projectId}/items/${storyId}`);
      toast('Story deleted');
      navigate(`/projects/${projectId}/stories`);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete', 'error');
      setShowDeleteConfirm(false);
    }
  };

  // Group by sprint
  const sprintMap = new Map(sprints.map((s) => [s.id, s]));
  const groups = new Map<number | null, ChildItem[]>();
  for (const item of allItems) {
    const key = item.itemType === 'subtask' ? null : (item.sprintId ?? null);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const sa = sprintMap.get(a);
    const sb = sprintMap.get(b);
    return (SPRINT_STATUS_ORDER[sa?.status || ''] ?? 3) - (SPRINT_STATUS_ORDER[sb?.status || ''] ?? 3);
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 dark:bg-dneutral-200 rounded w-48" />
          <div className="h-4 bg-neutral-200 dark:bg-dneutral-200 rounded w-72" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load story" onRetry={loadData} />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="p-6 text-center py-12 text-neutral-400 dark:text-dneutral-500">
        <p>Story not found.</p>
        <Link to={`/projects/${projectId}/stories`} className="text-lilac-dark hover:underline mt-2 inline-block text-[16px]">Back to Stories</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="mb-6">
          <Link to={`/projects/${projectId}/stories`} className="text-[14px] text-neutral-400 hover:text-neutral-500 mb-3 inline-block">&larr; Back to Stories</Link>

          {/* Breadcrumb */}
          {story.breadcrumb && story.breadcrumb.length > 1 && (
            <div className="flex items-center gap-1.5 text-[13px] text-neutral-400 mb-2">
              {story.breadcrumb.map((bc, i) => (
                <span key={bc.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-neutral-300">›</span>}
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: bc.color }} />
                  <span>{bc.title}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#88A9D6' }} />
                <span className="text-[14px] text-neutral-400">{story.itemKey}</span>
              </div>
              <h1 className="text-[22px] font-bold text-neutral-700 dark:text-dneutral-700">{story.title}</h1>
            </div>
            {canEdit && (
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="secondary" onClick={() => setShowCreate('task')}>+ Add task</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowCreate('subtask')}>+ Add subtask</Button>
                <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
              </div>
            )}
          </div>

          {story.description && (
            <p className="text-[16px] text-neutral-500 mb-3 whitespace-pre-wrap">{story.description}</p>
          )}

          {/* Progress */}
          {story.progress && (
            <div className="mb-4">
              <p className="text-[14px] text-neutral-500 mb-1">
                Progress: {story.progress.completedItems}/{story.progress.totalItems} items
                &middot; {story.progress.completedPoints}/{story.progress.totalPoints} pts
                &middot; {story.progress.progressPercent}%
              </p>
              <div className="w-full max-w-md h-2 rounded-full bg-neutral-100 dark:bg-dneutral-200 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${story.progress.progressPercent}%`, backgroundColor: '#88A9D6' }} />
              </div>
            </div>
          )}

          {/* Properties */}
          <div className="flex flex-wrap gap-3 text-[14px] text-neutral-500">
            {story.status && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: `${story.status.color}20`, color: story.status.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: story.status.color }} />
                {story.status.name}
              </span>
            )}
            {story.assignee && <span>Assigned: {story.assignee.displayName}</span>}
            {story.sprint && <span>Sprint: {story.sprint.name}</span>}
            {story.storyPoints != null && <span>{story.storyPoints} pts</span>}
          </div>

          {/* Labels */}
          {story.labels && story.labels.length > 0 && (
            <div className="mt-2"><LabelList labels={story.labels} max={6} size="md" /></div>
          )}
        </div>

        {/* Children grouped by sprint */}
        {allItems.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">No items in this story yet.</div>
        ) : (
          <div className="space-y-5">
            {sortedGroupKeys.map((sprintId) => {
              const sprint = sprintId !== null ? sprintMap.get(sprintId) : null;
              const groupItems = groups.get(sprintId) || [];
              const groupName = sprint ? sprint.name : 'Backlog';
              const sprintStatus = sprint?.status || '';

              return (
                <div key={sprintId ?? 'backlog'} className="bg-white dark:bg-dneutral-100 rounded-xl shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 dark:bg-dneutral-50">
                    <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">{groupName}</h2>
                    {sprintStatus && (
                      <span className={`text-[12px] px-2 py-0.5 rounded-full ${
                        sprintStatus === 'active' ? 'bg-tan-light text-neutral-600' : sprintStatus === 'planning' ? 'bg-lilac-tint text-lilac-dark' : 'bg-neutral-100 text-neutral-500'
                      }`}>{sprintStatus}</span>
                    )}
                    <span className="text-[14px] text-neutral-400 ml-auto">{groupItems.length} items</span>
                  </div>

                  {groupItems.map((item) => {
                    const statusBadge = STATUS_BADGE_COLORS[item.status?.category || 'backlog'] || STATUS_BADGE_COLORS.backlog;
                    const priorityBadge = PRIORITY_BADGE_COLORS[item.priority];
                    const avatarColor = item.assignee ? AVATAR_COLORS[item.assignee.id % AVATAR_COLORS.length] : null;
                    const typeStyle = ITEM_TYPE_STYLES[item.itemType] || ITEM_TYPE_STYLES.subtask;
                    const isSubtask = item.itemType === 'subtask';

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedTaskId(item.id)}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-dneutral-200/50 last:border-b-0 hover:bg-neutral-50/50 cursor-pointer transition-colors"
                        style={{ paddingLeft: isSubtask ? '40px' : '16px' }}
                      >
                        <span className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}>
                          {item.itemType === 'subtask' ? 'sub' : item.itemType}
                        </span>
                        <span className="font-mono text-[14px] text-neutral-400 shrink-0 w-20">{item.itemKey}</span>
                        <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate flex-1 min-w-0">{item.title}</span>
                        <LabelList labels={item.labels || []} max={2} />
                        <span className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full shrink-0" style={{ background: statusBadge?.bg, color: statusBadge?.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusBadge?.dot }} />
                          {item.status?.name || '--'}
                        </span>
                        {priorityBadge && item.priority !== 'none' && (
                          <span className="text-[12px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                          </span>
                        )}
                        {item.assignee && avatarColor && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0" style={{ background: avatarColor.bg, color: avatarColor.color }}>
                            {item.assignee.displayName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task detail panel */}
      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix={projectPrefix}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadData}
        />
      )}

      {/* Create dialog */}
      {showCreate && projectId && storyId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType={showCreate}
          defaultParentId={parseInt(storyId)}
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); loadData(); }}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete story"
          message={`Delete "${story.title}"? Tasks will become standalone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
