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

// Type colors matching the spec
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
  assignee: { id: number; displayName: string; avatarUrl?: string | null } | null;
  completedAt: string | null;
  sprintId?: number | null;
  // For stories: their own progress
  progress?: { totalItems: number; completedItems: number; progressPercent: number } | null;
  labels?: { id: number; name: string; color: string }[];
  // Nesting depth for indentation
  depth: number;
  parentItemType?: string;
}

interface EpicDetail {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  description: string | null;
  priority: string;
  color: string;
  status: { id: number; name: string; category: string; color: string } | null;
  assignee: { id: number; displayName: string } | null;
  sprint: { id: number; name: string } | null;
  endDate: string | null;
  storyPoints: number | null;
  progress: {
    totalItems: number;
    completedItems: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
  } | null;
  children: ChildItem[];
  commentCount: number;
  attachmentCount: number;
}

interface Sprint {
  id: number;
  name: string;
  status: string;
}

const SPRINT_STATUS_ORDER: Record<string, number> = {
  active: 0,
  planning: 1,
  completed: 2,
};

export function EpicDetailPage() {
  const { id: projectId, epicId } = useParams();
  const [epic, setEpic] = useState<EpicDetail | null>(null);
  const [allItems, setAllItems] = useState<ChildItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projectPrefix, setProjectPrefix] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState<'story' | 'task' | null>(null);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const navigate = useNavigate();
  const [addExistingSearch, setAddExistingSearch] = useState('');
  const [addExistingResults, setAddExistingResults] = useState<{ id: number; itemKey: string; itemType: string; title: string }[]>([]);
  const [addExistingLoading, setAddExistingLoading] = useState(false);
  const { canEdit } = useRole();

  const loadData = useCallback(async () => {
    if (!projectId || !epicId) return;
    setLoading(true);
    setError(false);
    try {
      const [epicRes, sprintsRes, projectRes] = await Promise.all([
        apiClient.get(`/projects/${projectId}/items/${epicId}`),
        apiClient.get(`/projects/${projectId}/sprints?limit=100`),
        apiClient.get(`/projects/${projectId}`),
      ]);

      const epicData = epicRes.data.data;
      setEpic(epicData);
      setSprints(sprintsRes.data.data.list || []);
      setProjectPrefix(projectRes.data.data.prefix || '');

      // Fetch associations — "members" = items that belong_to this epic
      const assocRes = await apiClient.get(`/projects/${projectId}/items/${epicId}/associations`);
      const members: ChildItem[] = (assocRes.data.data?.members || []).map((a: any) => ({
        ...a.item,
        depth: 0,
        sprintId: a.item.sprintId ?? null,
        labels: a.item.labels || [],
      }));

      // For tasks: fetch subtasks (via parentId)
      const taskMembers = members.filter(m => m.itemType === 'task');
      const subtaskArrays = await Promise.all(
        taskMembers.map(async (task) => {
          try {
            const res = await apiClient.get(`/projects/${projectId}/items/${task.id}/children?limit=100`);
            return (res.data.data.list || []).map((st: any) => ({ ...st, depth: 1, sprintId: null }));
          } catch { return []; }
        }),
      );

      // For stories: fetch their members (items that belong_to the story)
      const storyMembers = members.filter(m => m.itemType === 'story');
      const storyChildArrays = await Promise.all(
        storyMembers.map(async (story) => {
          try {
            const res = await apiClient.get(`/projects/${projectId}/items/${story.id}/associations`);
            return (res.data.data?.members || []).map((a: any) => ({ ...a.item, depth: 1, sprintId: a.item.sprintId ?? null, labels: a.item.labels || [] }));
          } catch { return []; }
        }),
      );

      // Build flat list
      const flat: ChildItem[] = [];
      for (const member of members) {
        flat.push(member);
        if (member.itemType === 'task') {
          const idx = taskMembers.indexOf(member);
          if (idx !== -1) flat.push(...subtaskArrays[idx]);
        } else if (member.itemType === 'story') {
          const idx = storyMembers.indexOf(member);
          if (idx !== -1) flat.push(...storyChildArrays[idx]);
        }
      }
      setAllItems(flat);
    } catch (err: any) {
      console.error(err);
      // 404 = not found, falls through to !epic branch. Other errors = real failure.
      if (err?.response?.status !== 404) setError(true);
    }
    setLoading(false);
  }, [projectId, epicId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Search for orphan stories/tasks to add to this epic
  const searchExistingItems = useCallback(async (query: string) => {
    if (!projectId) return;
    setAddExistingSearch(query);
    if (query.length < 1) {
      // Show recent orphans when search is empty
      setAddExistingLoading(true);
      try {
        const res = await apiClient.get(
          `/projects/${projectId}/items?itemType=story,task&parentId=null&limit=15&sort=updatedAt&order=DESC`,
        );
        setAddExistingResults(
          (res.data.data.list || []).map((i: any) => ({
            id: i.id, itemKey: i.itemKey, itemType: i.itemType, title: i.title,
          })),
        );
      } catch {
        setAddExistingResults([]);
      }
      setAddExistingLoading(false);
      return;
    }
    setAddExistingLoading(true);
    try {
      const res = await apiClient.get(
        `/projects/${projectId}/items?itemType=story,task&parentId=null&limit=15&search=${encodeURIComponent(query)}`,
      );
      setAddExistingResults(
        (res.data.data.list || []).map((i: any) => ({
          id: i.id, itemKey: i.itemKey, itemType: i.itemType, title: i.title,
        })),
      );
    } catch {
      setAddExistingResults([]);
    }
    setAddExistingLoading(false);
  }, [projectId]);

  // Load orphans when popover opens
  useEffect(() => {
    if (showAddExisting) searchExistingItems('');
  }, [showAddExisting, searchExistingItems]);

  const handleDeleteEpic = async () => {
    if (!projectId || !epicId) return;
    try {
      await apiClient.delete(`/projects/${projectId}/items/${epicId}`);
      toast('Epic deleted');
      navigate(`/projects/${projectId}/epics`);
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete epic', 'error');
      setShowDeleteConfirm(false);
    }
  };

  const handleAddExistingItem = async (itemId: number) => {
    if (!projectId || !epicId) return;
    try {
      await apiClient.post(`/projects/${projectId}/items/${itemId}/associations`, { linkedItemId: parseInt(epicId), linkType: 'belongs_to' });
      toast('Item added to epic');
      // Remove from results list immediately
      setAddExistingResults((prev) => prev.filter((r) => r.id !== itemId));
      loadData();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add item', 'error');
    }
  };

  // Group items by sprint
  const sprintMap = new Map(sprints.map((s) => [s.id, s]));
  const groups = new Map<number | null, ChildItem[]>();
  for (const item of allItems) {
    // Subtasks inherit sprint from parent — use null for grouping
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
          <div className="h-3 bg-neutral-200 dark:bg-dneutral-200 rounded w-full max-w-md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load epic" onRetry={loadData} />
      </div>
    );
  }

  if (!epic) {
    return (
      <div className="p-6 text-center py-12 text-neutral-400 dark:text-dneutral-500">
        <p>Epic not found.</p>
        <Link to={`/projects/${projectId}/epics`} className="text-peri hover:underline mt-2 inline-block text-[16px]">
          Back to Epics
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="mb-6">
          <Link
            to={`/projects/${projectId}/epics`}
            className="text-[14px] text-neutral-400 dark:text-dneutral-400 hover:text-neutral-500 dark:hover:text-dneutral-500 mb-3 inline-block"
          >
            &larr; Back to Epics
          </Link>

          <div className="flex items-center gap-3 mb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#7C5CFC' }} />
            <span className="text-[14px] text-neutral-400 dark:text-dneutral-400">{epic.itemKey}</span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h1 className="text-[22px] font-bold text-neutral-700 dark:text-dneutral-700">{epic.title}</h1>
            {canEdit && (
              <div className="flex gap-2 relative flex-shrink-0">
                <Button size="sm" variant="secondary" onClick={() => setShowCreate('story')}>+ Add story</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowCreate('task')}>+ Add task</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddExisting(!showAddExisting)}>
                  + Add existing
                </Button>
                <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                  Delete epic
                </Button>

                {/* Add existing dropdown */}
                {showAddExisting && (
                  <>
                    <div className="fixed inset-0 z-[9]" onClick={() => { setShowAddExisting(false); setAddExistingSearch(''); }} />
                    <div className="absolute top-full right-0 mt-2 w-[420px] bg-white dark:bg-dneutral-100 rounded-lg shadow-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-neutral-200 dark:border-dneutral-200 z-10 overflow-hidden">
                      <div className="p-3 border-b border-neutral-100 dark:border-dneutral-200">
                        <input
                          type="text"
                          value={addExistingSearch}
                          onChange={(e) => searchExistingItems(e.target.value)}
                          placeholder="Search standalone stories and tasks..."
                          autoFocus
                          className="w-full rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 px-3 py-2 text-[14px] text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-peri dark:focus:border-peri-dm focus:outline-none focus:ring-2 focus:ring-peri-light dark:focus:ring-peri-dm/20 h-[30px]"
                        />
                      </div>
                      <div className="max-h-[280px] overflow-y-auto">
                        {addExistingLoading && (
                          <div className="px-4 py-3 text-[14px] text-neutral-400">Searching...</div>
                        )}
                        {!addExistingLoading && addExistingResults.length === 0 && (
                          <div className="px-4 py-3 text-[14px] text-neutral-400">
                            {addExistingSearch ? 'No matching standalone items found' : 'No standalone stories or tasks in this project'}
                          </div>
                        )}
                        {!addExistingLoading && addExistingResults.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleAddExistingItem(item.id)}
                            className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-peri/10 dark:hover:bg-peri-dm/10 transition-colors border-b border-neutral-50 dark:border-dneutral-200/30 last:border-b-0"
                          >
                            <span
                              className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: (ITEM_TYPE_STYLES[item.itemType] || ITEM_TYPE_STYLES.subtask).bg,
                                color: (ITEM_TYPE_STYLES[item.itemType] || ITEM_TYPE_STYLES.subtask).text,
                              }}
                            >
                              {item.itemType}
                            </span>
                            <span className="text-[14px] text-neutral-400 dark:text-dneutral-400 flex-shrink-0">
                              {item.itemKey}
                            </span>
                            <span className="text-[14px] text-neutral-700 dark:text-dneutral-700 truncate">
                              {item.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {epic.description && (
            <p className="text-[16px] text-neutral-500 dark:text-dneutral-500 mb-3 whitespace-pre-wrap">
              {epic.description}
            </p>
          )}

          {/* Progress */}
          {epic.progress && (
            <div className="mb-4">
              <p className="text-[14px] text-neutral-500 dark:text-dneutral-500 mb-1">
                Progress: {epic.progress.completedItems}/{epic.progress.totalItems} items
                &middot; {epic.progress.completedPoints}/{epic.progress.totalPoints} pts
                &middot; {epic.progress.progressPercent}%
              </p>
              <div className="w-full max-w-md h-2 rounded-full bg-neutral-100 dark:bg-dneutral-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${epic.progress.progressPercent}%`, backgroundColor: epic.color }}
                />
              </div>
            </div>
          )}

          {/* Properties row */}
          <div className="flex flex-wrap gap-3 text-[14px] text-neutral-500 dark:text-dneutral-500">
            {epic.status && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: `${epic.status.color}20`, color: epic.status.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: epic.status.color }} />
                {epic.status.name}
              </span>
            )}
            {epic.assignee && <span>Assigned: {epic.assignee.displayName}</span>}
            {epic.endDate && <span>End: {new Date(epic.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            {epic.sprint && <span>Sprint: {epic.sprint.name}</span>}
          </div>
        </div>

        {/* Children grouped by sprint */}
        {allItems.length === 0 ? (
          <div className="text-center py-12 text-neutral-400 dark:text-dneutral-500">
            <p className="text-[16px]">No items in this epic yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sortedGroupKeys.map((sprintId) => {
              const sprint = sprintId !== null ? sprintMap.get(sprintId) : null;
              const groupItems = groups.get(sprintId) || [];
              const groupName = sprint ? sprint.name : 'Backlog';
              const sprintStatus = sprint?.status || '';

              return (
                <div
                  key={sprintId ?? 'backlog'}
                  className="bg-white dark:bg-dneutral-100 rounded-xl shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 dark:bg-dneutral-50">
                    <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">
                      {groupName}
                    </h2>
                    {sprintStatus && (
                      <span className={`text-[12px] px-2 py-0.5 rounded-full ${
                        sprintStatus === 'active'
                          ? 'bg-tan-light text-neutral-600 dark:bg-tan-dm/30 dark:text-tan-dm'
                          : sprintStatus === 'planning'
                            ? 'bg-peri-light text-peri dark:bg-peri-dm/30 dark:text-peri-dm'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-dneutral-200 dark:text-dneutral-500'
                      }`}>
                        {sprintStatus}
                      </span>
                    )}
                    <span className="text-[14px] text-neutral-400 dark:text-dneutral-400 ml-auto">
                      {groupItems.length} items
                    </span>
                  </div>

                  {/* Item rows */}
                  {groupItems.map((item) => {
                    const statusBadge = STATUS_BADGE_COLORS[item.status?.category || 'backlog'] || STATUS_BADGE_COLORS.backlog;
                    const priorityBadge = PRIORITY_BADGE_COLORS[item.priority];
                    const avatarColor = item.assignee ? AVATAR_COLORS[item.assignee.id % AVATAR_COLORS.length] : null;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedTaskId(item.id)}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-dneutral-200/50 last:border-b-0 hover:bg-neutral-50/50 dark:hover:bg-dneutral-100/50 cursor-pointer transition-colors"
                        style={{ paddingLeft: `${16 + item.depth * 24}px` }}
                      >
                        {/* Type pill */}
                        <span
                          className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: (ITEM_TYPE_STYLES[item.itemType] || ITEM_TYPE_STYLES.subtask).bg,
                            color: (ITEM_TYPE_STYLES[item.itemType] || ITEM_TYPE_STYLES.subtask).text,
                          }}
                        >
                          {item.itemType}
                        </span>

                        {/* Item key */}
                        <span className="font-mono text-[14px] text-neutral-400 dark:text-dneutral-400 shrink-0 w-20">
                          {item.itemKey}
                        </span>

                        {/* Title */}
                        <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate flex-1 min-w-0">
                          {item.title}
                        </span>

                        <LabelList labels={item.labels || []} max={2} />

                        {/* Story progress (inline) */}
                        {item.itemType === 'story' && item.progress && (
                          <span className="text-[12px] text-neutral-400 shrink-0">
                            {item.progress.progressPercent}%
                          </span>
                        )}

                        {/* Status badge */}
                        <span className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full shrink-0" style={{ background: statusBadge?.bg, color: statusBadge?.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusBadge?.dot }} />
                          {item.status?.name || '--'}
                        </span>

                        {/* Priority badge */}
                        {item.priority !== 'none' && priorityBadge ? (
                          <span className="text-[12px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                          </span>
                        ) : (
                          <span className="w-10 shrink-0" />
                        )}

                        {/* Assignee avatar */}
                        <div className="shrink-0 w-6">
                          {item.assignee && avatarColor ? (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium"
                              style={{ background: avatarColor.bg, color: avatarColor.color }}
                              title={item.assignee.displayName}
                            >
                              {item.assignee.displayName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          ) : null}
                        </div>
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
      {showCreate && projectId && epicId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType={showCreate}
          defaultParentId={parseInt(epicId)}
          onClose={() => setShowCreate(null)}
          onCreated={() => {
            setShowCreate(null);
            loadData();
          }}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete epic"
          message={`Are you sure you want to delete "${epic.title}"? Children will become standalone items.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteEpic}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
