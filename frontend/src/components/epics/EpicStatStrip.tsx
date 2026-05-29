import type { EpicsSummary } from '../../api/epics';
import { MetricNumber } from '../ui/MetricNumber';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Cell {
  value: string;
  label: string;
  accent?: boolean;
  small?: boolean;
}

/** Five-cell summary strip above the epics list. */
export function EpicStatStrip({ summary }: { summary: EpicsSummary }) {
  const attentionLabel =
    summary.needsAttention > 0
      ? `${summary.blocked} blocked · ${summary.atRisk} at risk`
      : 'all clear';

  const cells: Cell[] = [
    { value: String(summary.totalEpics), label: 'total epics' },
    { value: String(summary.inFlight), label: 'in flight' },
    { value: String(summary.needsAttention), label: attentionLabel, accent: true },
    { value: `${summary.childrenDone.completed}/${summary.childrenDone.total}`, label: 'children done' },
    {
      value: fmtDate(summary.nextTarget?.date ?? null),
      label: summary.nextTarget ? `next target · ${summary.nextTarget.epicKey}` : 'next target',
      small: true,
    },
  ];

  return (
    <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] grid grid-cols-5">
      {cells.map((c, i) => (
        <div
          key={i}
          className={`px-5 py-4 ${i > 0 ? 'border-l border-rule' : ''} ${c.accent ? 'bg-lilac-tint/40' : ''}`}
        >
          <MetricNumber size={c.small ? 'sm' : 'md'} className={c.accent ? 'text-lilac' : 'text-text'}>
            {c.value}
          </MetricNumber>
          <p className="mt-1 text-[11px] tracking-[0.14em] uppercase text-faint">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
