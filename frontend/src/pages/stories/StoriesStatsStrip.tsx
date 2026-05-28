import { MetricNumber } from '../../components/ui/MetricNumber';
import type { StoryStats } from './types';

interface Props {
  stats: StoryStats;
}

interface Cell {
  value: React.ReactNode;
  label: string;
}

/**
 * Full-width stat band shown above the story table — Total / Open / In flight /
 * Done / Story points. Mirrors the editorial numeral treatment used on the
 * Sprints + Dashboard surfaces.
 */
export function StoriesStatsStrip({ stats }: Props) {
  const cells: Cell[] = [
    { value: stats.total, label: 'Total stories' },
    { value: stats.open, label: 'Open' },
    { value: stats.inFlight, label: 'In flight' },
    { value: stats.done, label: 'Done' },
    {
      value: (
        <span className="inline-flex items-baseline gap-1">
          <MetricNumber size="lg">{stats.completedPoints}</MetricNumber>
          <span className="font-serif italic text-[20px] text-mute">/</span>
          <MetricNumber size="lg">{stats.totalPoints}</MetricNumber>
        </span>
      ),
      label: 'Story points',
    },
  ];

  return (
    <div className="flex border-b border-rule bg-lilac-tint/30">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`flex-1 px-6 py-5 ${i > 0 ? 'border-l border-rule' : ''}`}
        >
          <div className="text-text leading-none">
            {typeof c.value === 'number' ? <MetricNumber size="lg">{c.value}</MetricNumber> : c.value}
          </div>
          <div className="smallcaps mt-2">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
