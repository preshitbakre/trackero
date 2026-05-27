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
    <div className="flex gap-6">
      <main className="flex-1">
        <div className="flex gap-6 py-4 border-b border-rule">
          <StatBox value={summary.ptsAdded}     label="Pts added"     mode="positive" />
          <StatBox value={summary.ptsDropped}   label="Pts dropped"   mode="negative" />
          <StatBox value={summary.itemsAdded}   label="Items added"   mode="positive" />
          <StatBox value={summary.itemsDropped} label="Items dropped" mode="negative" />
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

function StatBox({ value, label, mode }: { value: number; label: string; mode: 'positive' | 'negative' }) {
  const color = mode === 'positive' ? 'text-mint-dark' : 'text-danger';
  const sign  = mode === 'positive' ? '+' : '−';
  return (
    <div className={`flex-1 text-center ${color}`}>
      <MetricNumber size="lg">{sign}{Math.abs(value)}</MetricNumber>
      <p className="text-[10px] tracking-[0.12em] uppercase text-mute mt-1">{label}</p>
    </div>
  );
}
