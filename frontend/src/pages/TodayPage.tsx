import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { TypeTag } from '../components/ui/TypeTag';
import type { TypeTagKind } from '../components/ui/TypeTag';

interface TodayPayload {
  greeting: {
    name: string;
    partOfDay: 'morning' | 'afternoon' | 'evening';
    localDate: string;
    localTime: string;
  };
  summary: {
    reviewCardCount: number;
    blockingBugCount: number;
    blockingBugItemKey: string | null;
    pointsDone: number | null;
    pointsTotal: number | null;
    pace: 'ahead' | 'on pace' | 'behind' | null;
  };
  triage: Array<{
    id: number;
    projectId: number;
    itemKey: string;
    itemType: string;
    title: string;
    points: number | null;
    lastTouchedAt: string;
    assignee: { id: number; displayName: string; avatarUrl: string | null } | null;
    priorityTier: string;
    reasonChips: string[];
  }>;
  reviewing: Array<{
    id: number;
    itemKey: string;
    title: string;
    author: { id: number; displayName: string; avatarUrl: string | null };
    lastTouchedAt: string;
  }>;
  dueSoon: Array<{
    id: number;
    itemKey: string;
    title: string;
    dueInDays: number;
    sprintId: number | null;
  }>;
  dueSoonTotalAssigned: number;
  currentSprint: {
    id: number;
    projectId: number;
    projectName: string;
    name: string;
    goal: string | null;
    dayOf: number;
    length: number;
    pointsDone: number;
    pointsTotal: number;
    pointsInProgress: number;
    endDate: string;
    // Phase 5 — snapshot-backed burndown, one entry per sprint day.
    burndown?: Array<{ day: string; completed: number; ideal: number; scope: number }>;
  } | null;
  presence: {
    count: number;
    users: Array<{
      id: number;
      displayName: string;
      avatarUrl: string | null;
      activity: string;
      lastSeenAt: string;
    }>;
  };
  activity: Array<{
    id: number;
    ts: string;
    actor: { id: number; displayName: string; avatarUrl: string | null };
    sentence: string;
    item: { id: number; itemKey: string; title: string } | null;
  }>;
}

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

const formatEyebrowDate = (iso: string, partOfDay: string, time: string): string => {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday} — ${month} ${day}, ${year} · ${time} · ${partOfDay}`;
};

export function TodayPage() {
  // Today is per-project. The route /projects/:id/today carries the
  // scope; the legacy ?projectId= query string still works for any
  // callers that haven't migrated yet, but the URL param wins when
  // both are present. /today (no projectId) routes via TodayRedirect.
  const { id: idFromRoute } = useParams<{ id?: string }>();
  const [search] = useSearchParams();
  const projectId = idFromRoute ?? search.get('projectId');
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  const { data, isLoading, isError } = useQuery<TodayPayload>({
    queryKey: ['today', projectId, tz],
    queryFn: async () => {
      const qs = new URLSearchParams({ timezone: tz });
      if (projectId) qs.set('projectId', projectId);
      const res = await apiClient.get(`/today?${qs.toString()}`);
      return res.data.data;
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-screen-2xl">
        <p className="text-faint text-[14px]">Loading your day…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-8 max-w-screen-2xl">
        <p className="text-danger text-[14px]">Could not load Today. Try again.</p>
      </div>
    );
  }

  // Design measurements at 1440 viewport (re-extracted from
  // docs/design-html/Today _ signature moment.html via
  // getBoundingClientRect on the actual rail+main split):
  //   main column:  878px wide  (transparent bg, children carry padding)
  //   right rail:   340px wide  (--paper-2 tint, border-l --line, no gap;
  //                              internal sections own their own padding
  //                              and are separated by 1px --line dividers)
  // The main column stays flex-1 and the rail is pinned at 340px.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] h-full overflow-hidden">
      {/* Main column. Width comes from the grid (100vw − sidebar − rail).
          The page is broken into stacked <section>s — each section owns
          its OWN horizontal padding (px-9) and brings its own top
          divider when needed. That keeps the divider spanning the full
          main-column width instead of being indented by an outer
          padded wrapper. */}
      <main className="overflow-y-auto">
        <section className="px-9 pt-7 pb-8">
          <GreetingHero
            greeting={data.greeting}
            summary={data.summary}
            sprintName={data.currentSprint?.name ?? null}
          />
        </section>
        <section className="px-9 py-8 border-t border-[var(--line)]">
          <ThreeThings
            items={data.triage}
            assignedCount={data.triage.length}
          />
        </section>
        <section className="px-9 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            <ReviewingPanel items={data.reviewing} />
            <DueSoonPanel items={data.dueSoon} total={data.dueSoonTotalAssigned} />
          </div>
        </section>
      </main>
      <aside className="bg-[var(--paper-2)] border-l border-[var(--line)] overflow-y-auto">
        <SprintCard sprint={data.currentSprint} summary={data.summary} projectId={projectId} />
        <LiveRail presence={data.presence} />
        <ActivityRail activity={data.activity} />
      </aside>
    </div>
  );
}

function GreetingHero({ greeting, summary, sprintName }: {
  greeting: TodayPayload['greeting'];
  summary: TodayPayload['summary'];
  sprintName: string | null;
}) {
  const partOfDayWord =
    greeting.partOfDay === 'morning' ? 'morning' :
    greeting.partOfDay === 'afternoon' ? 'afternoon' : 'evening';

  // Match the design's exact subline pattern (frame 1, line ~270 of the
  // clean markup):
  //   <span>3 cards</span> need your review, <span>1 bug</span> is blocking
  //   <span class="mono">BST-104</span>, and the team is <span>14 of 38
  //   points</span> through Sprint 27 — <span class="serif-i">on pace</span>.
  // Each `<span>` is bold-weight ink; the mono is the item key; the closing
  // pace word is serif italic.
  const hasReview = summary.reviewCardCount > 0;
  const hasBlocker = summary.blockingBugCount > 0;
  const hasPace = summary.pointsTotal !== null && summary.pointsTotal !== undefined && summary.pointsTotal > 0;

  return (
    <section>
      <div className="smallcaps mb-3">
        {formatEyebrowDate(greeting.localDate, partOfDayWord, greeting.localTime)}
      </div>
      {/* Design measurements (from getComputedStyle on the design HTML):
          font-size 70px, line-height 64.4px (≈0.92x), letter-spacing -2.1px
          (-0.03em), Instrument Serif. The italic name sits on its own line
          and a lilac em-dash trails it on the same line. */}
      <h1
        className="serif text-ink"
        style={{ fontSize: 70, lineHeight: '64.4px', letterSpacing: '-0.03em' }}
      >
        Good {partOfDayWord},<br />
        <span className="serif-i">{greeting.name}.</span>
        <span className="text-[var(--accent)] ml-2 align-middle" style={{ fontSize: 50 }}>—</span>
      </h1>
      <p className="mt-5 text-[16px] text-ink max-w-2xl leading-relaxed">
        {hasReview ? (
          <>
            <span className="font-semibold">
              {summary.reviewCardCount} {summary.reviewCardCount === 1 ? 'card' : 'cards'}
            </span>{' '}
            need your review
          </>
        ) : (
          <span className="serif-i text-ink-2">nothing waits for your review</span>
        )}
        {hasBlocker && (
          <>
            ,{' '}
            <span className="font-semibold">
              {summary.blockingBugCount} {summary.blockingBugCount === 1 ? 'bug' : 'bugs'}
            </span>{' '}
            {summary.blockingBugCount === 1 ? 'is' : 'are'} blocking
            {summary.blockingBugItemKey && (
              <> <span className="mono text-ink">{summary.blockingBugItemKey}</span></>
            )}
          </>
        )}
        {hasPace && (
          <>
            , and the team is{' '}
            <span className="font-semibold">
              {summary.pointsDone} of {summary.pointsTotal} points
            </span>
            {sprintName ? <> through {sprintName}</> : null}
            {summary.pace && (
              <>
                {' '}—{' '}
                <span
                  className={`serif-i ${
                    summary.pace === 'behind' ? 'text-[var(--accent)]' :
                    summary.pace === 'ahead' ? 'text-[var(--c-forest)]' :
                    'text-ink'
                  }`}
                >
                  {summary.pace}
                </span>
              </>
            )}
          </>
        )}
        .
      </p>
    </section>
  );
}

function ThreeThings({ items, assignedCount }: { items: TodayPayload['triage']; assignedCount: number }) {
  // Map item type to design's .tmark variant. The design uses
  // E/S/T/B/s — `subtask` lowercases to 's' inside .tmark.subtask.
  return (
    // The outer page section owns the horizontal divider so it spans
    // the full main-column width edge-to-edge. This component just
    // renders its own header + list.
    <section>
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="serif text-[28px] text-ink">Your three things</h2>
          <span className="text-[12px] text-[var(--ink-3)]">auto-prioritized</span>
        </div>
        {assignedCount > 0 && (
          <Link to="/today?filter=assigned" className="btn-ghost text-[12px]">
            See all {assignedCount} assigned <span aria-hidden="true">→</span>
          </Link>
        )}
      </header>
      {items.length === 0 ? (
        <p className="serif-i text-[var(--ink-4)] text-[14px]">Nothing urgent — go ship something.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((t, i) => (
            <li key={t.id} className="bg-[var(--card-bg)] border border-[var(--line)] px-6 py-5 flex items-start gap-6">
              {/* Big serif rank numeral — design uses 1/2/3 in italic-serif at ~52px in muted ink-4 */}
              <span className="serif text-[52px] leading-none text-[var(--ink-4)] w-10 flex-shrink-0 text-center">{i + 1}</span>

              <div className="flex-1 min-w-0">
                {/* Meta row: tmark + key + status pill + optional blocker chip */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <TypeTag kind={(t.itemType || 'task') as TypeTagKind} size="sm" />
                  <span className="mono num text-[12px] text-[var(--ink-3)]">{t.itemKey}</span>
                  <span className="text-[var(--ink-4)]">·</span>
                  <span className="status">
                    <span className="dot" style={{ backgroundColor: 'var(--c-mustard)' }} />
                    {t.reasonChips?.find((c) => /progress|review|todo|done/i.test(c)) ?? 'open'}
                  </span>
                  {(t.reasonChips ?? [])
                    .filter((c) => /blocked/i.test(c))
                    .slice(0, 1)
                    .map((c) => (
                      <span key={c} className="chip chip-accent">{c}</span>
                    ))}
                </div>

                {/* Title — sans-bold ~19px per design (not serif). The
                    editorial weight comes from the surrounding rank
                    numeral; the title itself stays a calm sans block. */}
                <div className="text-[19px] font-semibold text-ink leading-snug">{t.title}</div>

                {/* Meta footer: label chip + pts + last touched */}
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[12px]">
                  <span className="chip">
                    <span className="dot" style={{ backgroundColor: 'var(--c-sky)' }} />
                    {t.priorityTier}
                  </span>
                  {t.points !== null && (
                    <span className="mono num text-[var(--ink-3)]">{t.points} pts</span>
                  )}
                  <span className="mono num text-[var(--ink-4)]">· last touched {formatRelativeTime(t.lastTouchedAt)}</span>
                </div>
              </div>

              {/* Right column: avatar on top, Open button stacked beneath
                  it — per design (image #18) the action stack reads
                  top-down, not side-by-side. */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {t.assignee && (
                  <span
                    className="avatar"
                    style={{
                      background: 'var(--c-plum)',
                      width: 36,
                      height: 36,
                      fontSize: 13,
                    }}
                  >
                    {(t.assignee.displayName?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
                <Link
                  to={`/projects/${t.projectId}/tasks/${t.id}`}
                  className="btn"
                >
                  Open <span className="kbd ml-1">↵</span>
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewingPanel({ items }: { items: TodayPayload['reviewing'] }) {
  return (
    <section>
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="serif text-[20px] text-ink">Reviewing</h2>
        <span className="mono text-[12px] text-[var(--ink-3)]">
          · {items.length} {items.length === 1 ? 'PR' : 'PRs'}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-3)]">Nothing to review right now.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-[var(--line)]">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="mono num text-[12px] text-[var(--ink-3)] w-[64px] flex-shrink-0">{r.itemKey}</span>
              <span className="flex-1 truncate text-ink">{r.title}</span>
              <span className="avatar" style={{ background: 'var(--c-sky)' }} title={r.author.displayName}>
                {(r.author.displayName?.[0] ?? '?').toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DueSoonPanel({ items, total }: { items: TodayPayload['dueSoon']; total: number }) {
  return (
    <section>
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="serif text-[20px] text-ink">Due soon</h2>
        <span className="mono text-[12px] text-[var(--ink-3)]">· ends with sprint · {total} assigned</span>
      </header>
      {items.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-3)]">Nothing due this week.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-[var(--line)]">
          {items.map((d) => {
            const label = d.dueInDays <= 0 ? `${-d.dueInDays}d over` : d.dueInDays === 0 ? 'today' : `${d.dueInDays}d`;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="mono num text-[12px] text-[var(--ink-3)] w-[64px] flex-shrink-0">{d.itemKey}</span>
                <span className="flex-1 truncate text-ink">{d.title}</span>
                <span className="mono num text-[12px] text-[var(--ink-3)]">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SprintCard({ sprint, summary, projectId }: {
  sprint: TodayPayload['currentSprint'];
  summary: TodayPayload['summary'];
  projectId: string | null;
}) {
  // Design (rail at 340px): the sprint surface is THREE sibling sections
  // separated by 1px --line dividers, not one bordered card.
  //   Section 1 — sprint header: pad 24/24/18, smallcaps + goal pull-quote
  //   Section 2 — burndown:      pad 20/24/18, eyebrow + sparkline + dates
  //   Section 3 — 2×2 metrics:   pad 0 (full-bleed), cells own their pad,
  //                              the inner grid lines also use --line.
  if (!sprint) {
    const sprintsHref = projectId ? `/projects/${projectId}/sprints` : '/projects';
    return (
      <section className="px-6 py-6 border-b border-[var(--line)]">
        <div className="smallcaps mb-2">No active sprint</div>
        <p className="text-[13px] text-[var(--ink-4)]">
          Open <Link to={sprintsHref} className="text-[var(--accent)] hover:underline">Sprints</Link> and start one.
        </p>
      </section>
    );
  }

  // Date labels under the sparkline mirror the design's MAY 19 / TODAY /
  // MAY 30 strip. Computed from the sprint's start/end via burndown[0]
  // and the last entry.
  const burndown = sprint.burndown ?? [];
  const startLabel = burndown[0]?.day
    ? new Date(burndown[0].day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    : null;
  const endLabel = sprint.endDate
    ? new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    : null;

  return (
    <>
      {/* 1. Sprint header — design padding 24px 24px 18px */}
      <section className="px-6 pt-6 pb-[18px] border-b border-[var(--line)]">
        <div className="smallcaps mb-2">
          {sprint.projectName} · day {sprint.dayOf} of {sprint.length}
        </div>
        <p className="serif-i text-[20px] leading-snug text-ink">
          {sprint.goal ? `"${sprint.goal}"` : `"${sprint.name}"`}
        </p>
      </section>

      {/* 2. Burndown — design padding 20px 24px 18px */}
      <section className="px-6 pt-5 pb-[18px] border-b border-[var(--line)]">
        <div className="flex items-center justify-between mb-2">
          <span className="smallcaps">Burndown</span>
          <span className="mono num text-[12px] text-[var(--ink-3)]">
            {sprint.pointsDone}/{sprint.pointsTotal} pts
          </span>
        </div>
        {burndown.length >= 2 ? (
          <BurndownSparkline points={burndown} />
        ) : (
          <div className="h-9 flex items-center justify-center text-[11px] serif-i text-[var(--ink-4)]">
            Snapshots arrive after the sprint's first cron tick.
          </div>
        )}
        {(startLabel || endLabel) && (
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--ink-4)] font-mono">
            <span>{startLabel ?? ''}</span>
            <span>TODAY</span>
            <span>{endLabel ?? ''}</span>
          </div>
        )}
      </section>

      {/* 3. 2×2 metric grid — design padding 0 (full-bleed) with --line
          dividers between cells. Cells use their own internal padding. */}
      <section className="grid grid-cols-2 border-b border-[var(--line)]">
        <MetricCell
          label="Done"
          value={sprint.pointsDone}
          className="border-b border-r border-[var(--line)]"
        />
        <MetricCell
          label="In progress"
          value={sprint.pointsInProgress}
          muted
          className="border-b border-[var(--line)]"
        />
        <MetricCell
          label="Blocked"
          value={summary.blockingBugCount ?? 0}
          muted
          className="border-r border-[var(--line)]"
        />
        <MetricCell
          label="Awaiting review"
          value={summary.reviewCardCount ?? 0}
          muted
        />
      </section>
    </>
  );
}

function MetricCell({ label, value, muted = false, className = '' }: {
  label: string;
  value: number;
  muted?: boolean;
  className?: string;
}) {
  // Design metric cell: 18px top/left/right pad, 14px bottom; the .stat-num
  // .smaller variant drops to 36px so 4 cells fit comfortably in the
  // 340px rail.
  return (
    <div className={`px-[18px] pt-[18px] pb-[14px] ${className}`}>
      <div className={`stat-num smaller ${muted ? 'text-[var(--ink-3)]' : 'text-ink'}`}>
        {value}
      </div>
      <div className="smallcaps mt-0.5">{label}</div>
    </div>
  );
}

function BurndownSparkline({ points, className = '' }: {
  points: NonNullable<TodayPayload['currentSprint']>['burndown'];
  className?: string;
}) {
  if (!points || points.length < 2) return null;
  const w = 220;
  const h = 36;
  const maxScope = Math.max(...points.map((p) => p.scope), 1);
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * w;
  const y = (v: number) => h - (v / maxScope) * (h - 4) - 2;
  const idealPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ideal).toFixed(1)}`)
    .join(' ');
  const actualPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.scope - p.completed).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      role="img"
      aria-label="Sprint burndown"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      className={`text-faint ${className}`}
    >
      {/* Ideal line — thin dashed, hairline weight */}
      <path d={idealPath} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
      {/* Actual line — lilac, the line that matters */}
      <path d={actualPath} fill="none" stroke="rgb(124 58 237)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LiveRail({ presence }: { presence: TodayPayload['presence'] }) {
  // Design row: avatar + bold first-name + light "<activity>" + right-side
  // mono status. Each row reads as a single sentence so the rail tells a
  // story rather than just listing names. Section padding 20px 24px 14px
  // matches the design dump; border-b separates from the activity rail.
  const presenceColors = ['var(--c-sky)', 'var(--c-forest)', 'var(--c-plum)', 'var(--c-clay)', 'var(--c-sage)'];
  return (
    <section className="px-6 pt-5 pb-[14px] border-b border-[var(--line)]">
      <div className="smallcaps mb-3">Live · {presence.count} here now</div>
      {presence.users.length === 0 ? (
        <p className="serif-i text-[13px] text-[var(--ink-4)]">It&apos;s quiet in here.</p>
      ) : (
        <ul className="space-y-2.5">
          {presence.users.slice(0, 6).map((u, i) => {
            const first = (u.displayName || `User ${u.id}`).split(' ')[0];
            const initial = (u.displayName?.[0] ?? '?').toUpperCase();
            return (
              <li key={u.id} className="flex items-center gap-2.5 text-[12px]">
                <span
                  className="avatar"
                  style={{ background: presenceColors[i % presenceColors.length] }}
                  title={u.displayName}
                >
                  {initial}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-semibold text-ink">{first}</span>{' '}
                  <span className="text-[var(--ink-3)]">{u.activity}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActivityRail({ activity }: { activity: TodayPayload['activity'] }) {
  // Design row: mono "<relative time>" + avatar + sentence body.
  // The avatar maps each actor to one of the signal palette colours so
  // the same person reads consistently across the rail. Section padding
  // 16/24/24 matches the design dump; no border-b — this is the last
  // section, so the trailing space is just the rail's --paper-2 tint.
  const colorFor = (id: number) => {
    const palette = ['var(--c-sky)', 'var(--c-forest)', 'var(--c-plum)', 'var(--c-clay)', 'var(--c-sage)', 'var(--c-mustard)'];
    return palette[id % palette.length];
  };
  return (
    <section className="px-6 pt-4 pb-6">
      <div className="smallcaps mb-3">Activity</div>
      {activity.length === 0 ? (
        <p className="serif-i text-[13px] text-[var(--ink-4)]">No activity in the last 24h.</p>
      ) : (
        <ul className="space-y-2">
          {activity.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 text-[12px]">
              <span className="mono num text-[11px] text-[var(--ink-4)] w-[44px] flex-shrink-0 pt-[3px]">
                {formatRelativeTime(a.ts)}
              </span>
              <span
                className="avatar flex-shrink-0"
                style={{ background: colorFor(a.actor.id), width: 18, height: 18, fontSize: 9 }}
                title={a.actor.displayName}
              >
                {(a.actor.displayName?.[0] ?? '?').toUpperCase()}
              </span>
              <span className="text-[var(--ink-2)] leading-snug">{a.sentence}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
