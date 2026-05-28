import type { AcrossSprints, EpicDisplayState } from '../../api/epics';
import { Eyebrow } from '../ui/Eyebrow';

const STATUS_DOTS: { key: keyof AcrossSprints['sprints'][number]['rollup']; label: string; color: string }[] = [
  { key: 'done', label: 'done', color: '#88D68E' },
  { key: 'inProg', label: 'in prog', color: '#D6B588' },
  { key: 'review', label: 'review', color: '#D688D0' },
  { key: 'open', label: 'open', color: '#A8A1B5' },
];

const ACCENTS: Record<string, string> = {
  in_flight: '#7C3AED',
  at_risk: '#E88A48',
  blocked: '#E05252',
  shipped: '#3E8E44',
};

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Dominant status color for a sprint cell. */
function dominant(rollup: AcrossSprints['sprints'][number]['rollup']): string {
  const order: [number, string][] = [
    [rollup.done, '#88D68E'],
    [rollup.inProg, '#D6B588'],
    [rollup.review, '#D688D0'],
    [rollup.open, '#A8A1B5'],
  ];
  order.sort((a, b) => b[0] - a[0]);
  return order[0][0] > 0 ? order[0][1] : '#E8E3F0';
}

interface Props {
  data: AcrossSprints;
  displayState: EpicDisplayState;
}

/** Horizontal sprint band shared by Overview + Timeline tabs. */
export function AcrossSprintsTimeline({ data, displayState }: Props) {
  const accent = ACCENTS[displayState] ?? '#7C3AED';
  if (data.count === 0) {
    return (
      <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-4">
        <Eyebrow size="sm">Across sprints</Eyebrow>
        <p className="mt-2 text-[13px] text-faint">No sprints span this epic yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-4">
      <div className="flex items-center justify-between">
        <Eyebrow size="sm">
          Across sprints · {data.fromKey} → {data.toKey} · {data.count} sprints
        </Eyebrow>
        {data.target && (
          <span className="text-[11px] tracking-[0.14em] uppercase text-faint">target · {fmtDate(data.target)}</span>
        )}
      </div>

      {/* Axis */}
      <div className="relative mt-5 mb-2">
        <div className="absolute left-0 right-0 top-1/2 h-px" style={{ backgroundColor: accent, opacity: 0.4 }} />
        <div className="relative flex justify-between">
          {data.sprints.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10px] text-mute">{s.key}</span>
              <span
                className="w-3 h-3 rounded-full ring-2 ring-card"
                style={{ backgroundColor: dominant(s.rollup) }}
                title={`${s.name}: ${s.rollup.done} done · ${s.rollup.inProg} in prog · ${s.rollup.review} review · ${s.rollup.open} open`}
              />
              <span className={`text-[10px] ${i === data.todayIndex ? 'font-semibold' : 'text-faint'}`}>
                {i === data.todayIndex ? '● today' : fmtDate(s.startDate)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-mute">
        {STATUS_DOTS.map((d) => (
          <span key={d.key} className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} /> {d.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7C3AED' }} /> today
        </span>
      </div>
    </div>
  );
}
