import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Eyebrow } from '../components/ui/Eyebrow';
import { KbdKey } from '../components/ui/KbdKey';
import { Select } from '../components/ui/Select';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { EpicCard } from '../components/epics/EpicCard';
import { EpicStatStrip } from '../components/epics/EpicStatStrip';
import { EpicsEmptyState } from '../components/epics/EpicsEmptyState';
import { getEpics, getEpicsSummary } from '../api/epics';
import type { EpicListItem, EpicsSummary, EpicDisplayState } from '../api/epics';

const SECTIONS: { key: string; label: string; accent: string; states: EpicDisplayState[]; collapsible?: boolean }[] = [
  { key: 'in_flight', label: 'In flight', accent: 'text-lilac', states: ['in_flight', 'at_risk', 'blocked'] },
  { key: 'planning', label: 'Planning · queued for later', accent: 'text-mute', states: ['planning', 'draft'] },
  { key: 'shipped', label: 'Shipped', accent: 'text-[#3E8E44]', states: ['shipped'] },
  { key: 'archive', label: 'Archive', accent: 'text-faint', states: ['archived'], collapsible: true },
];

const FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'in_flight', label: 'In flight' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'planning', label: 'Planning' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'archived', label: 'Archived' },
];

export function EpicsPage() {
  const { id: projectId } = useParams();
  const [epics, setEpics] = useState<EpicListItem[]>([]);
  const [summary, setSummary] = useState<EpicsSummary | null>(null);
  const [projectName, setProjectName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { canEdit } = useRole();

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const [list, sum, projRes] = await Promise.all([
        getEpics(projectId, { includeArchived: true }),
        getEpicsSummary(projectId),
        apiClient.get(`/projects/${projectId}`),
      ]);
      setEpics(list);
      setSummary(sum);
      setProjectName(projRes.data.data.name || '');
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = filter ? epics.filter((e) => e.displayState === filter) : epics;
  const isEmpty = !loading && !error && summary?.totalEpics === 0;

  return (
    <>
      <PageHeader className="flex items-end justify-between">
        <div>
          <Eyebrow>
            Project · {projectName || '…'} · {summary?.totalEpics ?? epics.length} epics
          </Eyebrow>
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <h1 className="font-serif text-[36px] text-text">Epics</h1>
            {!isEmpty && (
              <span className="text-[15px] text-mute">— the big rocks. Each spans many sprints.</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Select
              value={filter}
              onChange={setFilter}
              options={FILTER_OPTIONS}
              className="w-[130px]"
            />
          )}
          {canEdit && (
            <Button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
              + New epic <KbdKey tone="on-accent">E</KbdKey>
            </Button>
          )}
        </div>
      </PageHeader>

      {loading ? (
        <div className="px-[28px] py-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="px-[28px] py-6">
          <ErrorState message="Failed to load epics" onRetry={load} />
        </div>
      ) : isEmpty ? (
        <EpicsEmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="px-[28px] py-6 space-y-8">
          {summary && <EpicStatStrip summary={summary} />}

          {SECTIONS.map((section) => {
            const items = visible.filter((e) => section.states.includes(e.displayState));
            if (items.length === 0) return null;
            const collapsed = section.collapsible && !archiveOpen;
            return (
              <section key={section.key}>
                <button
                  type="button"
                  className={`text-[12px] tracking-[0.14em] uppercase font-semibold ${section.accent} ${
                    section.collapsible ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={() => section.collapsible && setArchiveOpen((v) => !v)}
                  disabled={!section.collapsible}
                >
                  {section.label} {section.collapsible && `(${items.length}) ${collapsed ? '▸' : '▾'}`}
                </button>
                {!collapsed && (
                  <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {items.map((epic) => (
                      <EpicCard key={epic.id} epic={epic} projectId={projectId!} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showCreate && projectId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType="epic"
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </>
  );
}
