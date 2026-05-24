import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Eyebrow, KbdKey, MetricNumber, TypeTag, Avatar } from '../components/ui';
import type { TypeTagKind } from '../components/ui';

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
  const [params] = useSearchParams();
  const projectId = params.get('projectId');
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  const { data, isLoading, isError } = useQuery<TodayPayload>({
    queryKey: ['today', projectId, tz],
    queryFn: async () => {
      const qs = new URLSearchParams({ timezone: tz });
      if (projectId) qs.set('projectId', projectId);
      const res = await apiClient.get(`/today?${qs.toString()}`);
      return res.data.data;
    },
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

  return (
    <div className="p-8 max-w-screen-2xl grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      <main>
        <GreetingHero greeting={data.greeting} summary={data.summary} />
        <ThreeThings items={data.triage} />
        <ReviewingPanel items={data.reviewing} />
        <DueSoonPanel items={data.dueSoon} total={data.dueSoonTotalAssigned} />
      </main>
      <aside className="space-y-6">
        <SprintCard sprint={data.currentSprint} />
        <LiveRail presence={data.presence} />
        <ActivityRail activity={data.activity} />
      </aside>
    </div>
  );
}

function GreetingHero({ greeting, summary }: {
  greeting: TodayPayload['greeting'];
  summary: TodayPayload['summary'];
}) {
  const partOfDayWord =
    greeting.partOfDay === 'morning' ? 'morning' :
    greeting.partOfDay === 'afternoon' ? 'afternoon' : 'evening';

  return (
    <section className="mb-10">
      <Eyebrow className="mb-3">
        {formatEyebrowDate(greeting.localDate, partOfDayWord, greeting.localTime)}
      </Eyebrow>
      <h1 className="font-serif text-[48px] leading-[1.05] text-text">
        Good {partOfDayWord}, <span className="italic">{greeting.name}.</span>
      </h1>
      <p className="mt-4 text-[16px] text-mute max-w-2xl">
        {summary.reviewCardCount > 0 ? (
          <><MetricNumber size="sm" italic>{summary.reviewCardCount}</MetricNumber> {summary.reviewCardCount === 1 ? 'card' : 'cards'} await your review</>
        ) : (
          <span className="italic">nothing waits for your review</span>
        )}
        {summary.blockingBugItemKey && (
          <> · <span className="font-medium">{summary.blockingBugItemKey}</span> is blocking work</>
        )}
        {summary.pointsTotal !== null && summary.pointsTotal > 0 && (
          <> · the team is <MetricNumber size="sm" italic>{summary.pointsDone}</MetricNumber> of {summary.pointsTotal} pts
            <span className={`ml-1 italic font-serif ${summary.pace === 'behind' ? 'text-danger' : summary.pace === 'ahead' ? 'text-success' : 'text-mute'}`}>{summary.pace}</span>
          </>
        )}
        .
      </p>
    </section>
  );
}

function ThreeThings({ items }: { items: TodayPayload['triage'] }) {
  return (
    <section className="mb-10">
      <header className="mb-4 flex items-baseline gap-3">
        <h2 className="font-serif text-[26px] text-text">Your three things</h2>
        <span className="text-[11px] text-mute">
          auto-prioritized · <KbdKey>⌥</KbdKey> to re-rank
        </span>
      </header>
      {items.length === 0 ? (
        <p className="italic text-faint text-[13px]">Nothing urgent — go ship something.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((t, i) => (
            <li key={t.id} className="bg-card rounded-xl p-4 shadow-[0_1px_2px_rgba(26,20,36,0.04)] lift-on-hover flex items-center gap-4">
              <span className="font-serif italic text-[36px] text-faint w-10 flex-shrink-0 text-center">{i + 1}</span>
              <TypeTag kind={t.itemType as TypeTagKind} size="md" />
              <span className="font-mono text-[11px] text-mute">{t.itemKey}</span>
              <span className="font-serif text-[15px] text-text flex-1 truncate">{t.title}</span>
              {t.points !== null && (
                <MetricNumber size="sm" italic className="text-mute">{t.points}</MetricNumber>
              )}
              {t.points !== null && <span className="text-[11px] text-faint">pts</span>}
              <span className="text-[11px] text-faint">· last touched {formatRelativeTime(t.lastTouchedAt)}</span>
              {t.assignee && <Avatar user={t.assignee} size="xs" />}
              <Link
                to={`/projects/${(t as any).projectId ?? ''}/tasks/${t.id}`}
                className="text-[12px] text-lilac-dark hover:underline whitespace-nowrap"
              >
                Open ↵
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewingPanel({ items }: { items: TodayPayload['reviewing'] }) {
  return (
    <section className="mb-10">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="font-serif text-[20px] text-text">Reviewing</h2>
        <span className="text-[11px] text-mute">· {items.length} {items.length === 1 ? 'card' : 'cards'}</span>
      </header>
      {items.length === 0 ? (
        <p className="text-[13px] text-mute">Nothing to review right now.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-[14px]">
              <span className="font-mono text-[11px] text-mute">{r.itemKey}</span>
              <span className="flex-1 truncate">{r.title}</span>
              <Avatar user={r.author} size="xs" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DueSoonPanel({ items, total }: { items: TodayPayload['dueSoon']; total: number }) {
  return (
    <section className="mb-10">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="font-serif text-[20px] text-text">Due soon</h2>
        <span className="text-[11px] text-mute">· {items.length} of {total} assigned</span>
      </header>
      {items.length === 0 ? (
        <p className="text-[13px] text-mute">Nothing due this week.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => {
            const tone = d.dueInDays <= 0
              ? 'bg-danger/10 text-danger'
              : d.dueInDays <= 2
              ? 'bg-warning/10 text-warning'
              : 'bg-lilac-tint text-lilac-dark';
            const label = d.dueInDays <= 0 ? `overdue ${-d.dueInDays}d` : d.dueInDays === 0 ? 'today' : `${d.dueInDays}d`;
            return (
              <li key={d.id} className="flex items-center gap-3 text-[14px]">
                <span className="flex-1 truncate">{d.title}</span>
                <span className="font-mono text-[11px] text-mute">{d.itemKey}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SprintCard({ sprint }: { sprint: TodayPayload['currentSprint'] }) {
  if (!sprint) {
    return (
      <section className="bg-card rounded-xl p-5 shadow-[0_1px_2px_rgba(26,20,36,0.04)]">
        <Eyebrow size="sm" className="mb-2">No active sprint</Eyebrow>
        <p className="text-[13px] text-faint">
          Open <Link to="/projects" className="text-lilac-dark hover:underline">Projects</Link> and start one.
        </p>
      </section>
    );
  }

  // Editorial pull-quote header: prefer the sprint goal in italic-serif
  // (matches frame 1's "Ship door-list export and fix the bursty webhooks"
  // pattern); fall back to the sprint name when no goal is set.
  const remaining = Math.max(0, sprint.pointsTotal - sprint.pointsDone - sprint.pointsInProgress);
  const blocked = 0; // backend doesn't carry per-status counts on /today yet
  const reviewing = 0;

  return (
    <section className="bg-card rounded-xl p-5 shadow-[0_1px_2px_rgba(26,20,36,0.04)]">
      <Eyebrow size="sm" className="mb-2">
        {sprint.projectName} · day {sprint.dayOf} of {sprint.length}
      </Eyebrow>
      <p className="font-serif italic text-[22px] text-text leading-snug">
        {sprint.goal ? `"${sprint.goal}"` : sprint.name}
      </p>

      {/* Inline burndown sparkline — snapshot-backed via Phase 5.
          The chart is purely informational; the metric grid below
          surfaces the numbers anyone reading needs to act on. */}
      {sprint.burndown && sprint.burndown.length >= 2 && (
        <BurndownSparkline points={sprint.burndown} className="mt-3" />
      )}

      {/* 2×2 metric grid per frame 1 — italic-serif numerals + eyebrow labels. */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <MetricCell label="Done" value={sprint.pointsDone} />
        <MetricCell label="In progress" value={sprint.pointsInProgress} muted />
        <MetricCell label="Remaining" value={remaining} muted />
        <MetricCell label="Of total" value={sprint.pointsTotal} muted />
      </div>

      {/* These cells stay rendered (zeroed) so the layout doesn't reflow
          once the backend starts surfacing blocked + reviewing counts. */}
      <div className="mt-3 hidden">
        <span>{blocked}</span>
        <span>{reviewing}</span>
      </div>
    </section>
  );
}

function MetricCell({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <MetricNumber size="md" italic={muted} className={muted ? 'text-mute' : undefined}>
        {value}
      </MetricNumber>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-faint font-semibold">
        {label}
      </div>
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
  return (
    <section>
      <Eyebrow size="sm" className="mb-2">Live · {presence.count} here now</Eyebrow>
      {presence.users.length === 0 ? (
        <p className="text-[11px] text-faint italic">It&apos;s quiet in here.</p>
      ) : (
        <>
          {/* Overlapping avatar stack — visual cue that someone's around.
              Caps at the first 8 visible bubbles; the count in the eyebrow
              still tells the full story. */}
          <div className="flex items-center mb-2.5">
            {presence.users.slice(0, 8).map((u, i) => (
              <span
                key={u.id}
                className="rounded-full ring-2 ring-card"
                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}
                title={u.displayName}
              >
                <Avatar
                  user={{ id: u.id, displayName: u.displayName || `User ${u.id}`, avatarUrl: u.avatarUrl }}
                  size="sm"
                />
              </span>
            ))}
            {presence.users.length > 8 && (
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-paper ring-2 ring-card text-[10px] font-semibold text-mute"
                style={{ marginLeft: -6, zIndex: 0 }}
              >
                +{presence.users.length - 8}
              </span>
            )}
          </div>
          <ul className="space-y-1">
            {presence.users.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-[12px] text-mute">
                <span className="text-text font-medium">{u.displayName.split(' ')[0]}</span>
                <span className="text-faint">·</span>
                <span className="truncate">{u.activity}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ActivityRail({ activity }: { activity: TodayPayload['activity'] }) {
  return (
    <section>
      <Eyebrow size="sm" className="mb-2">Activity</Eyebrow>
      {activity.length === 0 ? (
        <p className="text-[11px] text-faint italic">No activity in the last 24h.</p>
      ) : (
        <ul className="space-y-1.5">
          {activity.slice(0, 5).map((a) => (
            <li key={a.id} className="text-[13px] text-mute">
              <span className="font-mono text-[10px] text-faint mr-2">{formatRelativeTime(a.ts)}</span>
              <span>{a.actor.displayName.split(' ')[0]} {a.sentence}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
