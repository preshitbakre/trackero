import type { EpicDetail } from '../../api/epics';
import { MetricNumber } from '../ui/MetricNumber';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Five-cell stat strip on the epic detail Overview. */
export function EpicDetailStatStrip({ epic }: { epic: EpicDetail }) {
  const cells = [
    { value: String(epic.stats.itemsDone), label: 'items done' },
    { value: String(epic.stats.inProgress), label: 'in progress' },
    { value: String(epic.stats.open), label: 'open' },
    { value: `${epic.stats.completedPoints}/${epic.stats.totalPoints}`, label: 'story points' },
    { value: fmtDate(epic.endDate), label: 'target date', small: true },
  ];
  return (
    <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] grid grid-cols-5">
      {cells.map((c, i) => (
        <div key={i} className={`px-5 py-4 ${i > 0 ? 'border-l border-rule' : ''}`}>
          <MetricNumber size={c.small ? 'sm' : 'md'} className="text-text">
            {c.value}
          </MetricNumber>
          <p className="mt-1 text-[11px] tracking-[0.14em] uppercase text-faint">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
