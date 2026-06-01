import type { AcrossSprints, EpicDisplayState, EpicMilestone } from '../../api/epics';

function Tip({ text, children, className = '', style }: {
  text: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`group/tip relative ${className}`} style={style}>
      {children}
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-75 z-50"
        style={{
          background: 'var(--ink)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 500,
          padding: '3px 8px',
          borderRadius: 4,
          lineHeight: '16px',
          letterSpacing: '0.01em',
        }}
      >
        {text}
      </span>
    </span>
  );
}

type StatusKey = 'done' | 'inProg' | 'review' | 'open';

const COLOR: Record<StatusKey, string> = {
  done: 'var(--c-forest)',
  inProg: 'var(--accent)',
  review: 'var(--c-sky)',
  open: 'var(--ink-4)',
};

const LEGEND: { key: StatusKey; label: string }[] = [
  { key: 'done', label: 'done' },
  { key: 'inProg', label: 'in prog' },
  { key: 'review', label: 'review' },
  { key: 'open', label: 'open' },
];

type Story = AcrossSprints['stories'][number];

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateUpper(d: string | null): string {
  return fmtDate(d).toUpperCase();
}

function xPct(i: number, n: number): number {
  if (n <= 1) return 50;
  return (i / (n - 1)) * 100;
}

function groupBySprint(stories: Story[], n: number): Story[][] {
  const buckets: Story[][] = Array.from({ length: n }, () => []);
  for (const s of stories) {
    const idx = Math.max(0, Math.min(n - 1, s.sprintIndex));
    buckets[idx].push(s);
  }
  return buckets;
}

function statusLabel(s: StatusKey): string {
  if (s === 'inProg') return 'in prog';
  return s;
}

function tipFor(story: Story): string {
  return `${story.itemKey}: ${story.title} · ${statusLabel(story.status)}`;
}

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

function Header({ data, mode }: { data: AcrossSprints; mode: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 14 }}>
      <p
        className="uppercase font-semibold"
        style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-3)' }}
      >
        Across sprints
        <span
          className="font-mono ml-2"
          style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none' }}
        >
          {data.fromKey} → {data.toKey} · {data.count} sprints
        </span>
        <span
          className="font-mono ml-2"
          style={{ fontSize: 9, letterSpacing: '0.04em', color: 'var(--ink-4)', fontWeight: 400, textTransform: 'none' }}
        >
          {mode}
        </span>
      </p>
      {data.target && (
        <span
          className="font-mono uppercase whitespace-nowrap"
          style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-4)' }}
        >
          Target ·{' '}
          <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{fmtDateUpper(data.target)}</span>
        </span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4" style={{ marginTop: 16, fontSize: 11, color: 'var(--ink-3)' }}>
      {LEGEND.map((l) => (
        <span key={l.key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, background: COLOR[l.key] }}
            aria-hidden
          />
          {l.label}
        </span>
      ))}
      <span
        className="font-mono ml-auto inline-flex items-center gap-1.5"
        style={{ color: 'var(--accent)', fontWeight: 600 }}
      >
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: 'var(--accent)' }}
          aria-hidden
        />
        today
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout A — STATIONS (≤ 5 sprints)
// ---------------------------------------------------------------------------

function Stations({ data, buckets }: { data: AcrossSprints; buckets: Story[][] }) {
  const n = data.sprints.length;
  const todayIdx = data.todayIndex;

  return (
    <div>
      {/* Connecting rail */}
      <div className="relative" style={{ height: 2, margin: '0 calc(50% / ' + n + ')' }}>
        <div className="absolute inset-0" style={{ background: 'var(--paper-3)' }} />
        {todayIdx >= 0 && (
          <div
            className="absolute top-0 left-0 h-full"
            style={{ width: `${xPct(todayIdx, n)}%`, background: 'var(--accent)' }}
          />
        )}
      </div>

      {/* Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 0 }}>
        {data.sprints.map((sprint, i) => {
          const isToday = i === todayIdx;
          const stories = buckets[i];
          return (
            <div
              key={sprint.id}
              className="flex flex-col items-center"
              style={{
                borderLeft: i > 0 ? '1px dashed var(--line)' : 'none',
                padding: '8px 4px 0',
              }}
            >
              {/* Station node */}
              <span
                className="block rounded-full"
                style={{
                  width: isToday ? 12 : 9,
                  height: isToday ? 12 : 9,
                  background: isToday ? 'var(--accent)' : 'var(--ink-3)',
                  boxShadow: '0 0 0 2px var(--paper-2)',
                }}
              />
              <span
                className="font-mono mt-1"
                style={{
                  fontSize: 10,
                  fontWeight: isToday ? 700 : 600,
                  color: isToday ? 'var(--accent)' : 'var(--ink-3)',
                  letterSpacing: '0.04em',
                }}
              >
                {sprint.key}
              </span>
              {isToday && (
                <span
                  className="uppercase"
                  style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--accent)', fontWeight: 600 }}
                >
                  today
                </span>
              )}
              <span
                className="font-mono"
                style={{ fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.04em' }}
              >
                {fmtDate(sprint.startDate)}
              </span>

              {/* Story chips */}
              <div className="flex flex-col gap-1 mt-2 w-full">
                {stories.length === 0 ? (
                  <span className="text-center" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                    —
                  </span>
                ) : (
                  stories.map((story) => (
                    <Tip key={story.id} text={tipFor(story)} className="block">
                      <div
                        className="flex items-center gap-1.5 px-1.5 py-0.5 border"
                        style={{
                          background: 'var(--card-bg, #fff)',
                          borderColor: 'var(--line)',
                          borderRadius: 3,
                        }}
                      >
                      <span
                        className="shrink-0 rounded-full"
                        style={{ width: 7, height: 7, background: COLOR[story.status] }}
                      />
                      <span
                        className="font-mono truncate"
                        style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.02em' }}
                      >
                        {story.itemKey}
                      </span>
                    </div>
                    </Tip>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout B — HIGHWAY (6–10 sprints)
// ---------------------------------------------------------------------------

function Highway({ data, buckets }: { data: AcrossSprints; buckets: Story[][] }) {
  const n = data.sprints.length;
  const todayIdx = data.todayIndex;
  const maxStack = Math.min(4, Math.max(...buckets.map((b) => b.length)));
  const headroom = maxStack * 17 + 18;

  const LINE_Y = headroom;
  const DOT_SIZE = 12;
  const TODAY_SIZE = 16;

  return (
    <div className="relative" style={{ height: LINE_Y + 40, overflow: 'visible' }}>
      {/* Base line */}
      <div
        className="absolute left-0 right-0"
        style={{ top: LINE_Y, height: 2, background: 'var(--paper-3)' }}
      />
      {/* Accent overlay */}
      {todayIdx >= 0 && (
        <div
          className="absolute left-0"
          style={{
            top: LINE_Y,
            height: 2,
            width: `${xPct(todayIdx, n)}%`,
            background: 'var(--accent)',
          }}
        />
      )}

      {/* Dot stacks */}
      {buckets.map((cluster, i) => {
        if (cluster.length === 0) return null;
        const left = xPct(i, n);
        const visible = cluster.slice(0, 4);
        const overflow = cluster.length - visible.length;
        return (
          <div
            key={`stack-${i}`}
            className="absolute flex flex-col-reverse items-center"
            style={{
              left: `${left}%`,
              bottom: `calc(100% - ${LINE_Y}px + 4px)`,
              transform: 'translateX(-50%)',
              gap: 5,
              zIndex: 2,
            }}
          >
            {visible.map((story) => (
              <Tip key={story.id} text={tipFor(story)}>
                <span
                  className="block rounded-full"
                  style={{
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    background: COLOR[story.status],
                    boxShadow: '0 0 0 2px var(--paper-2)',
                    cursor: 'default',
                  }}
                />
              </Tip>
            ))}
            {overflow > 0 && (
              <span
                className="font-mono"
                style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 600 }}
              >
                +{overflow}
              </span>
            )}
          </div>
        );
      })}

      {/* Today marker */}
      {todayIdx >= 0 && (
        <span
          className="absolute block rounded-full"
          style={{
            left: `${xPct(todayIdx, n)}%`,
            top: LINE_Y + 1 - TODAY_SIZE / 2,
            width: TODAY_SIZE,
            height: TODAY_SIZE,
            background: 'var(--accent)',
            boxShadow: '0 0 0 3px var(--paper-2), 0 0 0 4px var(--accent)',
            transform: 'translateX(-50%)',
            zIndex: 4,
          }}
        />
      )}

      {/* Sprint labels below line */}
      <div className="absolute left-0 right-0 flex justify-between" style={{ top: LINE_Y + 6 }}>
        {data.sprints.map((s, i) => {
          const isToday = i === todayIdx;
          return (
            <div key={s.id} className="flex flex-col items-center" style={{ width: 0 }}>
              <span
                className="font-mono whitespace-nowrap"
                style={{
                  fontSize: 9.5,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? 'var(--accent)' : 'var(--ink-3)',
                  background: 'var(--paper-2)',
                  padding: '0 3px',
                  letterSpacing: '0.04em',
                  lineHeight: '14px',
                }}
              >
                {s.key}
              </span>
              <span
                className="font-mono whitespace-nowrap"
                style={{ fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.04em' }}
              >
                {fmtDate(s.startDate)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout C — DENSITY (11+ sprints)
// ---------------------------------------------------------------------------

function Density({ data, buckets }: { data: AcrossSprints; buckets: Story[][] }) {
  const n = data.sprints.length;
  const todayIdx = data.todayIndex;
  const maxCount = Math.max(1, ...buckets.map((b) => b.length));
  const BAR_MAX = 64;
  const thinInterval = Math.ceil(n / 8);

  return (
    <div>
      {/* Bars */}
      <div className="flex items-end" style={{ height: BAR_MAX + 16, gap: 1 }}>
        {buckets.map((cluster, i) => {
          const isToday = i === todayIdx;
          const total = cluster.length;
          const barH = total > 0 ? (total / maxCount) * BAR_MAX : 2;
          const done = cluster.filter((s) => s.status === 'done').length;
          const prog = cluster.filter((s) => s.status === 'inProg').length;
          const review = cluster.filter((s) => s.status === 'review').length;
          const open = cluster.filter((s) => s.status === 'open').length;

          const segments = ([
            { key: 'done' as StatusKey, count: done },
            { key: 'inProg' as StatusKey, count: prog },
            { key: 'review' as StatusKey, count: review },
            { key: 'open' as StatusKey, count: open },
          ]).filter((s) => s.count > 0);

          return (
            <div
              key={data.sprints[i].id}
              className="flex-1 flex flex-col items-center"
              style={{ position: 'relative' }}
            >
              {/* Count above bar */}
              {total > 0 && (
                <span
                  className="font-mono"
                  style={{ fontSize: 8, color: 'var(--ink-4)', lineHeight: '12px', marginBottom: 2 }}
                >
                  {total}
                </span>
              )}

              {/* Bar */}
              <Tip text={`${data.sprints[i].key}: ${done} done, ${prog} in prog, ${review} review, ${open} open`} className="w-full">
              <div
                className="w-full flex flex-col-reverse"
                style={{
                  height: barH,
                  outline: isToday ? '1.5px solid var(--accent)' : 'none',
                  outlineOffset: isToday ? 1 : 0,
                }}
              >
                {total > 0 ? (
                  segments.map((seg) => (
                    <div
                      key={seg.key}
                      style={{
                        flex: seg.count,
                        background: COLOR[seg.key],
                        minHeight: 1,
                      }}
                    />
                  ))
                ) : (
                  <div style={{ height: 2, background: 'var(--paper-3)' }} />
                )}
              </div>
              </Tip>

              {/* Today flag */}
              {isToday && (
                <div
                  className="absolute"
                  style={{
                    top: 0,
                    bottom: 0,
                    left: '50%',
                    width: 0,
                    borderLeft: '1px dashed var(--accent)',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Baseline */}
      <div style={{ height: 1, background: 'var(--line)' }} />

      {/* Label row — thinned */}
      <div className="flex" style={{ gap: 1 }}>
        {data.sprints.map((s, i) => {
          const isToday = i === todayIdx;
          const isLast = i === n - 1;
          const show = isToday || isLast || i % thinInterval === 0;
          return (
            <div key={s.id} className="flex-1 flex flex-col items-center" style={{ minWidth: 0 }}>
              {show ? (
                <>
                  <span
                    className="font-mono whitespace-nowrap"
                    style={{
                      fontSize: 8.5,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? 'var(--accent)' : 'var(--ink-3)',
                      letterSpacing: '0.04em',
                      marginTop: 3,
                    }}
                  >
                    {s.key}
                  </span>
                  <span
                    className="font-mono whitespace-nowrap"
                    style={{ fontSize: 7.5, color: 'var(--ink-4)', letterSpacing: '0.02em' }}
                  >
                    {fmtDate(s.startDate)}
                  </span>
                </>
              ) : (
                <span style={{ height: 20 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  data: AcrossSprints;
  displayState?: EpicDisplayState;
  milestones?: EpicMilestone[];
}

export function AcrossSprintsTimeline({ data }: Props) {
  if (data.count === 0) {
    return (
      <div
        className="border border-rule"
        style={{ background: 'var(--paper-2)', borderRadius: 4, padding: '14px 16px' }}
      >
        <p
          className="uppercase font-semibold"
          style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-3)' }}
        >
          Across sprints
        </p>
        <p className="mt-2" style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          No sprints span this epic yet.
        </p>
      </div>
    );
  }

  const n = data.sprints.length;
  const buckets = groupBySprint(data.stories, n);
  const mode = n <= 5 ? 'stations' : n <= 10 ? 'highway' : 'density';

  return (
    <div
      className="border border-rule"
      style={{ background: 'var(--paper-2)', borderRadius: 4, padding: '14px 16px' }}
    >
      <Header data={data} mode={mode} />
      {mode === 'stations' && <Stations data={data} buckets={buckets} />}
      {mode === 'highway' && <Highway data={data} buckets={buckets} />}
      {mode === 'density' && <Density data={data} buckets={buckets} />}
      <Legend />
    </div>
  );
}
