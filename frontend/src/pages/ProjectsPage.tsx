import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Eyebrow, MetricNumber } from '../components/ui';
import { PROJECT_DOT_COLORS } from '../lib/colors';

type FilterKey = 'all' | 'active' | 'planning' | 'archived';

interface DirProject {
  id: number;
  name: string;
  prefix: string;
  description?: string | null;
  memberCount: number;
  role: string | null;
  activeSprint: {
    id: number;
    name: string;
    sprintNumber: number;
    totalPoints: number;
    completedPoints: number;
    endDate?: string | null;
  } | null;
  status:
    | 'archived'
    | 'planning'
    | 'no_sprint'
    | 'ends_today'
    | 'ends_in_days'
    | 'idle'
    | 'on_track';
  statusMeta: Record<string, unknown> & { days?: number };
  lastActivityAt: string | null;
  archivedAt: string | null;
  isPinned: boolean;
}

interface DirResp {
  counts: { active: number; planning: number; archived: number; all: number };
  projects: DirProject[];
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'planning', label: 'Planning' },
  { key: 'archived', label: 'Archived' },
];

export function ProjectsPage() {
  const [filter, setFilter] = useState<FilterKey>('active');
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<DirResp>({
    queryKey: ['projects-directory', filter, search, mineOnly],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filter !== 'all') qs.set('filter', filter);
      if (search) qs.set('search', search);
      if (mineOnly) qs.set('mineOnly', 'true');
      const res = await apiClient.get(`/directory/projects?${qs.toString()}`);
      return res.data.data;
    },
    staleTime: 15_000,
  });

  const pinMutation = useMutation({
    mutationFn: async ({ projectId, pin }: { projectId: number; pin: boolean }) => {
      if (pin) {
        await apiClient.post('/me/pinned-projects', { projectId });
      } else {
        await apiClient.delete(`/me/pinned-projects/${projectId}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects-directory'] });
      qc.invalidateQueries({ queryKey: ['sidebar-recent-projects'] });
    },
  });

  const counts = data?.counts ?? { active: 0, planning: 0, archived: 0, all: 0 };
  const projects = data?.projects ?? [];

  const grouped = useMemo(() => {
    const pinned = projects.filter((p) => p.isPinned);
    const rest = projects.filter((p) => !p.isPinned);
    return { pinned, rest };
  }, [projects]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <h1 className="font-serif italic text-[42px] leading-[1.1] text-ink mt-1">
            Projects
          </h1>
          <p className="text-mute text-[14px] mt-1">
            Every project you can see, with live status, sprint health, and your pins.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <CountStat label="Active" value={counts.active} />
          <CountStat label="Planning" value={counts.planning} />
          <CountStat label="Archived" value={counts.archived} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-rule">
        <div className="flex items-center gap-1 bg-paper rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 text-[12px] uppercase tracking-[0.16em] font-semibold rounded-full transition-colors ${
                filter === f.key ? 'bg-card text-ink shadow-sm' : 'text-mute hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or prefix…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-[13px] bg-paper rounded-md placeholder-faint focus:outline-none focus:ring-1 focus:ring-lilac"
        />

        <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] font-semibold text-mute cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="accent-lilac w-4 h-4"
          />
          Mine only
        </label>
      </div>

      {/* Content */}
      {isLoading && <SkeletonGrid />}
      {isError && (
        <div className="py-12 text-center text-mute">
          Couldn't load the project directory. Refresh or try again later.
        </div>
      )}
      {!isLoading && !isError && projects.length === 0 && (
        <div className="py-16 text-center">
          <div className="font-serif italic text-[28px] text-ink">No projects yet.</div>
          <p className="text-mute mt-2">
            {mineOnly
              ? 'You haven\'t joined any matching projects.'
              : 'Ask an admin to invite you, or create one if you have permission.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <>
          {grouped.pinned.length > 0 && (
            <Section title="Pinned">
              <ProjectGrid
                items={grouped.pinned}
                onTogglePin={(id, isPinned) =>
                  pinMutation.mutate({ projectId: id, pin: !isPinned })
                }
                pinPending={pinMutation.isPending}
              />
            </Section>
          )}
          <Section title={grouped.pinned.length > 0 ? 'All projects' : null}>
            <ProjectGrid
              items={grouped.rest}
              onTogglePin={(id, isPinned) =>
                pinMutation.mutate({ projectId: id, pin: !isPinned })
              }
              pinPending={pinMutation.isPending}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <Eyebrow>{label}</Eyebrow>
      <MetricNumber>{value}</MetricNumber>
    </div>
  );
}

function Section({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      {title && <Eyebrow>{title}</Eyebrow>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ProjectGrid({
  items,
  onTogglePin,
  pinPending,
}: {
  items: DirProject[];
  onTogglePin: (id: number, isPinned: boolean) => void;
  pinPending: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((p, i) => (
        <ProjectCard
          key={p.id}
          project={p}
          dotColor={PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}
          onTogglePin={onTogglePin}
          pinPending={pinPending}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  dotColor,
  onTogglePin,
  pinPending,
}: {
  project: DirProject;
  dotColor: string;
  onTogglePin: (id: number, isPinned: boolean) => void;
  pinPending: boolean;
}) {
  const sprint = project.activeSprint;
  const sprintPct =
    sprint && sprint.totalPoints > 0
      ? Math.min(100, Math.round((sprint.completedPoints / sprint.totalPoints) * 100))
      : 0;

  return (
    <div className="bg-card rounded-lg p-4 border border-rule hover:border-lilac/40 transition-colors flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-md flex items-center justify-center text-[16px] font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        >
          {project.name[0]?.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <Link
            to={`/projects/${project.id}/board`}
            className="block text-[15px] font-semibold text-text hover:text-lilac-dark truncate"
          >
            {project.name}
          </Link>
          <div className="text-[11px] uppercase tracking-[0.14em] text-faint mt-0.5">
            {project.prefix} · {project.memberCount}{' '}
            {project.memberCount === 1 ? 'member' : 'members'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onTogglePin(project.id, project.isPinned)}
          disabled={pinPending}
          title={project.isPinned ? 'Unpin' : 'Pin'}
          aria-label={project.isPinned ? 'Unpin project' : 'Pin project'}
          className={`text-[16px] leading-none transition-colors ${
            project.isPinned ? 'text-lilac' : 'text-faint hover:text-lilac'
          } disabled:opacity-50`}
        >
          {project.isPinned ? '★' : '☆'}
        </button>
      </div>

      <StatusBadge status={project.status} statusMeta={project.statusMeta} />

      {sprint ? (
        <div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-medium text-text truncate">{sprint.name}</span>
            <span className="text-mute">
              {sprint.completedPoints}/{sprint.totalPoints} pts
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-rule overflow-hidden">
            <div className="h-full bg-lilac" style={{ width: `${sprintPct}%` }} />
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-mute italic">No active sprint.</div>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-rule text-[11px] uppercase tracking-[0.14em] text-faint">
        <span>{project.role ? project.role.replace(/_/g, ' ') : '—'}</span>
        <span>{formatLastTouch(project.lastActivityAt)}</span>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  statusMeta,
}: {
  status: DirProject['status'];
  statusMeta: DirProject['statusMeta'];
}) {
  const days = typeof statusMeta?.days === 'number' ? statusMeta.days : null;
  const map: Record<DirProject['status'], { label: string; tone: string }> = {
    archived: { label: 'Archived', tone: 'bg-paper text-mute' },
    planning: { label: 'Planning', tone: 'bg-mint-light text-mint-dark' },
    no_sprint: { label: 'No sprint', tone: 'bg-paper text-mute' },
    ends_today: { label: 'Ends today', tone: 'bg-amber/15 text-amber-dark' },
    ends_in_days: { label: days ? `Ends in ${days}d` : 'Ending soon', tone: 'bg-lilac-tint text-lilac-dark' },
    idle: { label: 'Idle', tone: 'bg-paper text-mute' },
    on_track: { label: 'On track', tone: 'bg-mint-light text-mint-dark' },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold w-fit ${m.tone}`}
    >
      {m.label}
    </span>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-lg p-4 border border-rule animate-pulse h-[180px]" />
      ))}
    </div>
  );
}

function formatLastTouch(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default ProjectsPage;
