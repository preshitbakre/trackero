import type { EpicForecastData } from '../../api/epics';

type Verdict = EpicForecastData['verdict'];

const VERDICT_COLOR: Record<Verdict, string> = {
  on_track: 'var(--c-forest)',
  ahead:    'var(--c-forest)',
  at_risk:  'var(--c-mustard)',
  behind:   'var(--accent)',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  on_track: 'On track',
  ahead:    'Ahead',
  at_risk:  'At risk',
  behind:   'Behind',
};

function slack(finishSprint: string, targetSprint: string): string {
  const finish = parseInt(finishSprint.replace('S-', ''), 10);
  const target = parseInt(targetSprint.replace('S-', ''), 10);
  const diff = target - finish;
  if (diff === 0) return 'right at';
  const n = Math.abs(diff);
  const word = n === 1 ? 'sprint' : 'sprints';
  return diff > 0 ? `${n} ${word} before` : `${n} ${word} after`;
}

function verdictNote(d: EpicForecastData): string {
  const s = slack(d.finishSprint, d.targetSprint);
  switch (d.verdict) {
    case 'on_track':
      return `Finishing ~${d.finishSprint}, ${s} the ${d.target} target.`;
    case 'ahead':
      return `Tracking ${d.finishSprint} — comfortably before ${d.target}.`;
    case 'at_risk':
      return `Projected ${d.finishSprint}, right up against ${d.target}. Watch the slip.`;
    case 'behind':
      return `At ${d.velocity} pts/sprint this lands after ${d.target}. Cut scope or add a sprint.`;
  }
}

interface Props {
  data: EpicForecastData;
}

export function EpicForecast({ data }: Props) {
  const pctDone = data.ptsTotal > 0 ? Math.round((data.ptsDone / data.ptsTotal) * 100) : 0;
  const pctWip = data.ptsTotal > 0 ? Math.round((data.ptsWip / data.ptsTotal) * 100) : 0;
  const remaining = data.ptsTotal - data.ptsDone - data.ptsWip;
  const color = VERDICT_COLOR[data.verdict];

  return (
    <div
      className="border overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 280px',
        background: 'var(--card-bg-2)',
        borderColor: 'var(--line)',
        borderRadius: 4,
      }}
    >
      {/* Left cell */}
      <div style={{ padding: '18px 22px' }}>
        {/* Headline number row */}
        <div className="flex items-baseline" style={{ gap: 10, marginBottom: 14 }}>
          <span className="font-serif" style={{ fontSize: 52, lineHeight: 0.9, letterSpacing: '-0.04em', color: 'var(--ink)' }}>
            {pctDone}<span style={{ fontSize: 26 }}>%</span>
          </span>
          <div className="flex flex-col">
            <span className="font-serif italic" style={{ fontSize: 18, color: 'var(--ink-3)' }}>complete</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              {data.ptsDone} of {data.ptsTotal} pts · {data.ptsWip} in flight
            </span>
          </div>
        </div>

        {/* Segmented progress bar */}
        <div style={{ height: 10, background: 'var(--paper-3)', display: 'flex' }}>
          <div style={{ width: `${pctDone}%`, background: 'var(--c-forest)' }} />
          <div style={{ width: `${pctWip}%`, background: 'var(--accent)' }} />
        </div>

        {/* Legend */}
        <div className="flex items-center font-mono" style={{ marginTop: 8, gap: 16, fontSize: 11, color: 'var(--ink-3)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, background: 'var(--c-forest)', display: 'inline-block' }} />
            {data.ptsDone} done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, background: 'var(--accent)', display: 'inline-block' }} />
            {data.ptsWip} in progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, background: 'var(--paper-3)', display: 'inline-block' }} />
            {remaining} remaining
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ background: 'var(--line)' }} />

      {/* Right cell — verdict */}
      <div
        className="flex flex-col justify-center"
        style={{ padding: '18px 20px', background: 'var(--paper-2)', gap: 8 }}
      >
        {/* Verdict header */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color }}>{VERDICT_LABEL[data.verdict]}</span>
          <span className="font-mono ml-auto uppercase" style={{ fontSize: 10, color: 'var(--ink-4)' }}>
            Forecast
          </span>
        </div>

        {/* Verdict note */}
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>
          {verdictNote(data)}
        </p>

        {/* Footer */}
        <p className="font-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
          velocity {data.velocity} pts/sprint · target{' '}
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{data.target}</span>
        </p>
      </div>
    </div>
  );
}
