import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { MetricNumber } from '../../components/ui/MetricNumber';
import { ScopeTimeline, type ScopeEntry } from '../../components/sprints/ScopeTimeline';
import { OverviewSidebar } from './OverviewSidebar';
import type { SprintDetail } from '../SprintDetailPage';

interface ScopeData {
  summary: { ptsAdded: number; ptsDropped: number; itemsAdded: number; itemsDropped: number };
  entries: ScopeEntry[];
}

export function ScopeChangesTab({ sprint }: { sprint: SprintDetail }) {
  const [data, setData] = useState<ScopeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get(`/projects/${sprint.projectId}/sprints/${sprint.id}/scope-changes`)
      .then((r) => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sprint.id, sprint.projectId]);

  if (loading) return <p className="text-[13px] text-mute py-8 text-center">Loading…</p>;
  if (!data) return <p className="text-[13px] text-mute py-8 text-center">Failed to load scope changes.</p>;

  const { summary, entries } = data;
  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 min-w-0 overflow-y-auto px-[28px] py-6">
        <div className="grid grid-cols-4 border border-rule">
          <StatBox value={summary.ptsAdded}     sign="+" label="Pts added"     color="text-c-forest" px={44} />
          <StatBox value={summary.ptsDropped}   sign="−" label="Pts dropped"   color="text-lilac"    px={30} />
          <StatBox value={summary.itemsAdded}   sign="+" label="Items added"   color="text-c-sky"    px={30} />
          <StatBox value={summary.itemsDropped} sign="−" label="Items dropped" color="text-lilac"    px={30} last />
        </div>

        <h2 className="font-serif text-[16px] text-text mt-6 mb-3">Timeline</h2>
        {entries.length > 0 ? (
          <ScopeTimeline entries={entries} />
        ) : (
          <p className="text-[13px] text-mute text-center py-8">
            No scope changes yet. Additions or removals will appear here.
          </p>
        )}
      </main>
      <OverviewSidebar sprint={sprint} />
    </div>
  );
}

function StatBox({ value, sign, label, color, px, last }: {
  value: number;
  sign: '+' | '−';
  label: string;
  color: string;
  px: number;
  last?: boolean;
}) {
  return (
    <div className={`px-[18px] py-4 ${last ? '' : 'border-r border-rule'}`}>
      <MetricNumber size={px} className={color}>{sign}{Math.abs(value)}</MetricNumber>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mt-1">{label}</p>
    </div>
  );
}
