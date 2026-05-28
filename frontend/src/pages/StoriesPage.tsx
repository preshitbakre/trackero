import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { User } from 'lucide-react';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { useAuthStore } from '../store/auth.store';
import { PageHeader } from '../components/ui/PageHeader';
import { Eyebrow } from '../components/ui/Eyebrow';
import { KbdKey } from '../components/ui/KbdKey';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { StoriesStatsStrip } from './stories/StoriesStatsStrip';
import { StoriesViewToggle } from './stories/StoriesViewToggle';
import { StoriesTable } from './stories/StoriesTable';
import { StoriesEmptyState } from './stories/StoriesEmptyState';
import { StoriesFilterPopover } from './stories/StoriesFilterPopover';
import { groupStories, filterStories } from './stories/helpers';
import type { StoryFilters } from './stories/helpers';
import type { StoryListItem, StoryStats, EpicListItem, StoryView } from './stories/types';

const EMPTY_STATS: StoryStats = { total: 0, open: 0, inFlight: 0, done: 0, totalPoints: 0, completedPoints: 0 };

/** Fetch every story across pages (grouping/stats-by-group need the full set). */
async function fetchAllStories(projectId: string): Promise<StoryListItem[]> {
  const out: StoryListItem[] = [];
  let page = 1;
  const limit = 200;
  // Cap at 20 pages (4000 stories) as a safety bound.
  for (; page <= 20; page++) {
    const { data } = await apiClient.get(`/projects/${projectId}/stories?page=${page}&limit=${limit}`);
    const list: StoryListItem[] = data.data.list || [];
    out.push(...list);
    if (!data.data.hasNext || list.length === 0) break;
  }
  return out;
}

export function StoriesPage() {
  const { id: projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const { canEdit } = useRole();

  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [stats, setStats] = useState<StoryStats>(EMPTY_STATS);
  const [epicsById, setEpicsById] = useState<Map<number, EpicListItem>>(new Map());
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const view = (searchParams.get('view') as StoryView) || 'epic';
  const setView = (v: StoryView) => {
    searchParams.set('view', v);
    setSearchParams(searchParams, { replace: true });
  };

  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [facets, setFacets] = useState<Omit<StoryFilters, 'search' | 'mineUserId'>>({
    assigneeIds: [],
    labelIds: [],
    priorities: [],
    sprintIds: [],
  });

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const [allStories, statsRes, epicsRes, projectRes] = await Promise.all([
        fetchAllStories(projectId),
        apiClient.get(`/projects/${projectId}/stories/stats`),
        apiClient.get(`/projects/${projectId}/epics?limit=200`),
        apiClient.get(`/projects/${projectId}`),
      ]);
      setStories(allStories);
      setStats(statsRes.data.data || EMPTY_STATS);
      const epicMap = new Map<number, EpicListItem>();
      for (const e of epicsRes.data.data.list || []) epicMap.set(e.id, e);
      setEpicsById(epicMap);
      setProjectName(projectRes.data.data.name || '');
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Keyboard shortcut: C opens the create dialog.
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setShowCreate(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit]);

  const filters: StoryFilters = useMemo(
    () => ({ search, mineUserId: mine ? currentUser?.id ?? null : null, ...facets }),
    [search, mine, currentUser?.id, facets],
  );

  const filtered = useMemo(() => filterStories(stories, filters), [stories, filters]);
  const groups = useMemo(() => groupStories(filtered, view, epicsById), [filtered, view, epicsById]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return <div className="p-6"><ErrorState message="Failed to load stories" onRetry={load} /></div>;
  }

  const isEmpty = stories.length === 0;

  return (
    <>
      <PageHeader className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Project · {projectName || '—'} · {stats.total} stor{stats.total === 1 ? 'y' : 'ies'}</Eyebrow>
          <h1 className="font-serif text-[36px] text-text mt-1">
            Stories
            <span className="font-serif italic text-[20px] text-faint ml-3">— what we're shipping for our users.</span>
          </h1>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2 flex-wrap">
            <StoriesViewToggle view={view} onChange={setView} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter stories…"
              className="input h-[30px] w-[160px] text-[13px]"
            />
            <button
              type="button"
              onClick={() => setMine((v) => !v)}
              className={`btn-ghost inline-flex items-center gap-1.5 ${mine ? 'bg-shade' : ''}`}
            >
              <User size={14} /> Mine
            </button>
            <StoriesFilterPopover
              stories={stories}
              filters={filters}
              onChange={(f) => setFacets({ assigneeIds: f.assigneeIds, labelIds: f.labelIds, priorities: f.priorities, sprintIds: f.sprintIds })}
            />
            {canEdit && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn btn-accent inline-flex items-center gap-2">
                + New story
                <KbdKey tone="on-accent">C</KbdKey>
              </button>
            )}
          </div>
        )}
        {isEmpty && canEdit && (
          <button type="button" onClick={() => setShowCreate(true)} className="btn btn-accent inline-flex items-center gap-2">
            + New story
            <KbdKey tone="on-accent">C</KbdKey>
          </button>
        )}
      </PageHeader>

      {isEmpty ? (
        <StoriesEmptyState canEdit={canEdit} onCreate={() => setShowCreate(true)} />
      ) : (
        <>
          <StoriesStatsStrip stats={stats} />
          <div className="px-[28px] py-6">
            {groups.length === 0 ? (
              <div className="text-center py-12 text-mute text-[14px]">No stories match your filters.</div>
            ) : (
              <StoriesTable groups={groups} />
            )}
          </div>
        </>
      )}

      {showCreate && projectId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType="story"
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </>
  );
}
