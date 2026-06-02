import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { FileText, ListChecks, Settings2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { toast } from '../components/common/Toast';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { TypeTag } from '../components/ui/TypeTag';
import { StatusPill } from '../components/ui/StatusPill';
import type { StatusKey } from '../components/ui/StatusPill';
import { ErrorState } from '../components/common/ErrorState';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { OverviewTab } from './story-detail/OverviewTab';
import { TasksTab } from './story-detail/TasksTab';
import { SettingsTab } from './story-detail/SettingsTab';
import { StoryRightRail } from './story-detail/StoryRightRail';
import type { RailPatch } from './story-detail/StoryRightRail';
import { StoryHeaderActions } from './story-detail/StoryHeaderActions';
import { ReleaseNotesDrawer } from './story-detail/ReleaseNotesDrawer';
import { LinkItemDialog } from './story-detail/LinkItemDialog';
import type { StoryDetail, DetailUser, TaskRow } from './story-detail/types';

interface StatusOption { id: number; name: string; category: string }
type TabKey = 'overview' | 'tasks' | 'settings';

export function StoryDetailPage() {
  const { id: projectId, storyId } = useParams();
  const { canEdit, canManageProject } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const [story, setStory] = useState<StoryDetail | null>(null);
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [sprints, setSprints] = useState<{ id: number; name: string }[]>([]);
  const [members, setMembers] = useState<DetailUser[]>([]);
  const [epics, setEpics] = useState<{ id: number; itemKey: string; title: string }[]>([]);
  const [watchers, setWatchers] = useState<DetailUser[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [projectPrefix, setProjectPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [createType, setCreateType] = useState<'task' | 'bug' | null>(null);
  const [showLinkItem, setShowLinkItem] = useState(false);
  const [topLevel, setTopLevel] = useState<TaskRow[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Map<number, TaskRow[]>>(new Map());

  const tab = (searchParams.get('tab') as TabKey) || 'overview';
  const setTab = (t: TabKey) => { searchParams.set('tab', t); setSearchParams(searchParams, { replace: true }); };

  const loadStory = useCallback(async () => {
    if (!projectId || !storyId) return;
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${storyId}`);
      setStory(data.data);
    } catch (err: any) {
      console.error(err);
      if (err?.response?.status !== 404) setError(true);
      setStory(null);
    }
  }, [projectId, storyId]);

  const loadWatchers = useCallback(async () => {
    if (!projectId || !storyId) return;
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${storyId}/watchers`);
      setWatchers(data.data.watchers || []);
      setIsWatching(!!data.data.byMe);
    } catch { /* non-fatal */ }
  }, [projectId, storyId]);

  const loadAll = useCallback(async () => {
    if (!projectId || !storyId) return;
    setLoading(true);
    setError(false);
    try {
      const [, , statusesRes, sprintsRes, membersRes, epicsRes, projectRes] = await Promise.all([
        loadStory(),
        loadWatchers(),
        apiClient.get(`/projects/${projectId}/statuses`),
        apiClient.get(`/projects/${projectId}/sprints?limit=100`),
        apiClient.get(`/projects/${projectId}/members`),
        apiClient.get(`/projects/${projectId}/epics?limit=200`),
        apiClient.get(`/projects/${projectId}`),
      ]);
      setStatuses((statusesRes.data.data.list || statusesRes.data.data || []).map((s: any) => ({ id: s.id, name: s.name, category: s.category })));
      setSprints(sprintsRes.data.data.list || []);
      setMembers((membersRes.data.data.list || []).map((m: any) => ({
        id: m.userId ?? m.user?.id ?? m.id,
        displayName: m.user?.displayName ?? m.displayName ?? '',
        avatarUrl: m.user?.avatarUrl ?? m.avatarUrl ?? null,
      })));
      setEpics((epicsRes.data.data.list || []).map((e: any) => ({ id: e.id, itemKey: e.itemKey, title: e.title })));
      setProjectPrefix(projectRes.data.data.prefix || '');
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId, storyId, loadStory, loadWatchers]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Build the Tasks-tab rows: top-level tasks/bugs (via belongs_to) + the
  // story's direct subtasks, then fetch each task's own subtasks to nest.
  useEffect(() => {
    if (!story || !projectId) { setTopLevel([]); setSubtasksByParent(new Map()); return; }
    let cancelled = false;
    (async () => {
      const tl: TaskRow[] = [
        ...story.associations.contains.map((a) => ({
          id: a.item.id,
          itemKey: a.item.itemKey,
          itemType: a.item.itemType,
          title: a.item.title,
          status: a.item.status ? { id: a.item.status.id, name: a.item.status.name, category: a.item.status.category } : null,
          storyPoints: a.item.storyPoints,
          assignee: a.item.assignee,
          isSubtask: false,
        })),
        ...story.children.map((c) => ({
          id: c.id,
          itemKey: c.itemKey,
          itemType: c.itemType,
          title: c.title,
          status: c.status ? { id: c.status.id, name: c.status.name, category: c.status.category } : null,
          storyPoints: c.storyPoints,
          assignee: c.assignee,
          isSubtask: true,
        })),
      ];
      const byParent = new Map<number, TaskRow[]>();
      const tasks = tl.filter((r) => r.itemType === 'task');
      await Promise.all(tasks.map(async (t) => {
        try {
          const { data } = await apiClient.get(`/projects/${projectId}/items/${t.id}/children?limit=100`);
          const subs: TaskRow[] = (data.data.list || []).map((st: any) => ({
            id: st.id,
            itemKey: st.itemKey,
            itemType: st.itemType,
            title: st.title,
            status: st.status ? { id: st.status.id, name: st.status.name, category: st.status.category } : null,
            storyPoints: st.storyPoints ?? null,
            assignee: st.assignee ?? null,
            isSubtask: true,
          }));
          if (subs.length > 0) byParent.set(t.id, subs);
        } catch { /* ignore */ }
      }));
      if (!cancelled) { setTopLevel(tl); setSubtasksByParent(byParent); }
    })();
    return () => { cancelled = true; };
  }, [story, projectId]);

  const patch = async (p: RailPatch) => {
    if (!projectId || !storyId) return;
    try {
      await apiClient.put(`/projects/${projectId}/items/${storyId}`, p);
      await loadStory();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to save', 'error');
    }
  };

  const approve = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/items/${storyId}/approve`);
      toast('Story approved');
      await loadStory();
    } catch (err: any) { toast(err.response?.data?.message || 'Failed to approve', 'error'); }
  };
  const reopen = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/items/${storyId}/reopen`);
      toast('Story reopened');
      await loadStory();
    } catch (err: any) { toast(err.response?.data?.message || 'Failed to reopen', 'error'); }
  };
  const toggleWatch = async () => {
    try {
      if (isWatching) await apiClient.delete(`/projects/${projectId}/items/${storyId}/watchers/me`);
      else await apiClient.post(`/projects/${projectId}/items/${storyId}/watchers/me`);
      await loadWatchers();
    } catch { toast('Failed to update watch state', 'error'); }
  };

  const onCreated = async (createdId?: number) => {
    // Link the new task/bug to this story via belongs_to.
    if (createdId && projectId && storyId) {
      try {
        await apiClient.post(`/projects/${projectId}/items/${createdId}/associations`, {
          linkedItemId: parseInt(storyId),
          linkType: 'belongs_to',
        });
      } catch { /* item still created; link failed */ }
    }
    await loadStory();
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 bg-paper-2 rounded w-48" />
        <div className="h-4 bg-paper-2 rounded w-72" />
      </div>
    );
  }
  if (error) {
    return <div className="p-6"><ErrorState message="Failed to load story" onRetry={loadAll} /></div>;
  }
  if (!story) {
    return (
      <div className="p-6 text-center py-12 text-mute">
        <p>Story not found.</p>
        <Link to={`/projects/${projectId}/stories`} className="text-lilac-dark hover:underline mt-2 inline-block text-[14px]">Back to Stories</Link>
      </div>
    );
  }

  const pid = parseInt(projectId!);
  const blockedBy = story.associations.blockedBy[0];
  const taskCount = topLevel.length + Array.from(subtasksByParent.values()).reduce((s, a) => s + a.length, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-mute mb-3 flex-wrap">
          <Link to={`/projects/${projectId}/stories`} className="hover:text-text">Stories</Link>
          {story.epic && (
            <>
              <span className="text-faint">›</span>
              <span className="w-2 h-2 rotate-45 inline-block" style={{ backgroundColor: '#7C3AED' }} />
              <Link to={`/projects/${projectId}/epics/${story.epic.id}`} className="hover:text-text font-mono">{story.epic.itemKey}</Link>
              <span className="hover:text-text">{story.epic.title}</span>
            </>
          )}
          <span className="text-faint">›</span>
          <span className="font-mono text-faint">{story.itemKey}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <TypeTag kind="story" size="md" />
            <h1 className="font-serif text-[26px] text-text truncate">{story.title}</h1>
            {story.status && <StatusPill status={(story.status.category as StatusKey) || 'backlog'} />}
            {blockedBy && (
              <button
                type="button"
                onClick={() => setSelectedTaskId(blockedBy.item.id)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#E0525215', color: '#E05252' }}
              >
                ⊘ blocked by {blockedBy.item.itemKey}
              </button>
            )}
          </div>
          <div className="flex-shrink-0">
            <StoryHeaderActions
              story={story}
              projectId={pid}
              canEdit={canEdit}
              canManageProject={canManageProject}
              statuses={statuses}
              sprints={sprints}
              isWatching={isWatching}
              onPatch={patch}
              onApprove={approve}
              onReopen={reopen}
              onToggleWatch={toggleWatch}
              onOpenReleaseNotes={() => setShowReleaseNotes(true)}
              onChanged={loadStory}
            />
          </div>
        </div>

      </PageHeader>

      <Tabs
        className="px-[28px] flex-shrink-0"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'overview', label: 'Overview', icon: <FileText size={14} /> },
          { key: 'tasks', label: 'Tasks', icon: <ListChecks size={14} />, badge: taskCount },
          { key: 'settings', label: 'Settings', icon: <Settings2 size={14} /> },
        ]}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {tab === 'overview' && (
          <>
            <OverviewTab story={story} projectId={pid} canEdit={canEdit} canManageProject={canManageProject} onChanged={loadStory} onOpenItem={setSelectedTaskId} />
            <StoryRightRail
              story={story} canEdit={canEdit} members={members} sprints={sprints} statuses={statuses}
              watchers={watchers} isWatching={isWatching} onPatch={patch} onToggleWatch={toggleWatch}
            />
          </>
        )}
        {tab === 'tasks' && (
          <>
            <TasksTab
              topLevel={topLevel} subtasksByParent={subtasksByParent} statuses={statuses} canEdit={canEdit}
              onOpenItem={setSelectedTaskId}
              onAddTask={() => setCreateType('task')}
              onReportBug={() => setCreateType('bug')}
              onLinkItem={() => setShowLinkItem(true)}
            />
            <StoryRightRail
              story={story} canEdit={canEdit} members={members} sprints={sprints} statuses={statuses}
              watchers={watchers} isWatching={isWatching} onPatch={patch} onToggleWatch={toggleWatch}
            />
          </>
        )}
        {tab === 'settings' && (
          <SettingsTab
            story={story} projectId={pid} canEdit={canEdit} epics={epics}
            onChanged={loadStory} onOpenItem={setSelectedTaskId}
          />
        )}
      </div>

      {selectedTaskId && (
        <TaskDetailPanel
          projectId={pid}
          taskId={selectedTaskId}
          projectPrefix={projectPrefix}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadStory}
          onNavigateToTask={(id) => setSelectedTaskId(id)}
        />
      )}

      {createType && (
        <CreateItemDialog
          projectId={pid}
          defaultType={createType}
          onClose={() => setCreateType(null)}
          onCreated={onCreated}
        />
      )}

      <ReleaseNotesDrawer
        projectId={pid}
        storyId={story.id}
        storyKey={story.itemKey}
        canEdit={canEdit}
        open={showReleaseNotes}
        onClose={() => setShowReleaseNotes(false)}
      />

      {showLinkItem && (
        <LinkItemDialog
          projectId={pid}
          storyId={story.id}
          onLinked={() => { setShowLinkItem(false); loadStory(); }}
          onClose={() => setShowLinkItem(false)}
        />
      )}
    </div>
  );
}
