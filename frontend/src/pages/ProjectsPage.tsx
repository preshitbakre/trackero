import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Eyebrow, PageHeader } from '../components/ui';
import { Input } from '../components/ui/Input';
import { PROJECT_DOT_COLORS } from '../lib/colors';
import { useRole } from '../hooks/useRole';
import { CreateProjectDialog } from '../components/common/CreateProjectDialog';

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

// Tabs are rendered in this fixed order per frame 3 (Active · n /
// Planning · n / Archived · n / All · n). Counts come from the API
// response and are embedded inside the tab pill.
const FILTERS: { key: FilterKey; label: string; countKey: 'active' | 'planning' | 'archived' | 'all' }[] = [
  { key: 'active', label: 'Active', countKey: 'active' },
  { key: 'planning', label: 'Planning', countKey: 'planning' },
  { key: 'archived', label: 'Archived', countKey: 'archived' },
  { key: 'all', label: 'All', countKey: 'all' },
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('active');
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { canAdminister } = useRole();

  const qc = useQueryClient();

  useEffect(() => {
    if (!canAdminister) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        setShowCreate(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canAdminister]);

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
    <>
      {/* Header — instance eyebrow + italic-serif hero + right-side actions
          (Mine-only pill, search input, + New project button) per frame 3. */}
      <PageHeader className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <Eyebrow>Workspace</Eyebrow>
          <h1 className="font-serif text-[36px] text-text mt-1">
            Projects
          </h1>
          <p className="text-mute text-[14px] mt-1">
            Every project you can see, with live status, sprint health, and your pins.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search projects…"
            className="!w-[220px] !py-1.5 !text-[13px] !bg-paper"
          />
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] uppercase tracking-[0.14em] font-semibold transition-colors ${
              mineOnly ? 'bg-lilac-tint text-lilac-dark' : 'bg-paper text-mute hover:bg-rule'
            }`}
            aria-pressed={mineOnly}
          >
            <span
              aria-hidden="true"
              className={`w-3 h-3 rounded-sm border ${mineOnly ? 'bg-lilac border-lilac' : 'border-mute'}`}
            />
            Mine only
          </button>
          {canAdminister && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-lilac text-white text-[13px] font-medium hover:bg-lilac-dark transition-colors"
            >
              <span aria-hidden="true">+</span>
              <span>New project</span>
            </button>
          )}
        </div>
      </PageHeader>

      <div className="px-[28px] py-6">
      {/* Filter tabs — counts embedded per frame 3
          (Active · 5 | Planning · 2 | Archived · 1 | All · 8). */}
      <div className="flex items-center gap-1 mb-6 pb-2">
        {FILTERS.map((f) => {
          const count = counts[f.countKey] ?? 0;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 text-[11px] uppercase tracking-[0.16em] font-semibold transition-colors border-b-2 ${
                isActive
                  ? 'text-ink border-lilac'
                  : 'text-mute border-transparent hover:text-text'
              }`}
            >
              {f.label} <span className="text-faint">· {count}</span>
            </button>
          );
        })}
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
          <div className="font-serif text-[28px] text-text">No projects yet.</div>
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
                trailingCta={null}
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
              trailingCta={
                canAdminister ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="bg-card p-4 border border-dashed border-rule hover:border-lilac/40 hover:bg-paper/40 transition-colors flex flex-col items-center justify-center text-center min-h-[160px]"
                  >
                    <span className="w-10 h-10 rounded-full border border-rule flex items-center justify-center text-faint text-[18px] mb-2">
                      +
                    </span>
                    <span className="text-[14px] text-text font-medium">New project</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-faint mt-1">
                      Or press C
                    </span>
                  </button>
                ) : null
              }
            />
          </Section>
        </>
      )}

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['projects-directory'] });
            qc.invalidateQueries({ queryKey: ['sidebar-recent-projects'] });
            document.dispatchEvent(new CustomEvent('projects-updated'));
            if (project?.id) navigate(`/projects/${project.id}/today`);
          }}
        />
      )}
      </div>
    </>
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
  trailingCta,
}: {
  items: DirProject[];
  onTogglePin: (id: number, isPinned: boolean) => void;
  pinPending: boolean;
  // Optional trailing tile rendered after the last project — used by the
  // "All projects" section to surface the "+ New project" CTA per frame 3.
  trailingCta?: React.ReactNode;
}) {
  if (items.length === 0 && !trailingCta) return null;
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
      {trailingCta}
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
    <div className="bg-card p-4 border border-rule hover:border-lilac/40 transition-colors flex flex-col gap-3">
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

      <div className="flex items-center justify-between mt-auto pt-2 text-[11px] uppercase tracking-[0.14em] text-faint">
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
        <div key={i} className="bg-card p-4 border border-rule animate-pulse h-[180px]" />
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
