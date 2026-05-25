import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { CreateProjectDialog } from '../common/CreateProjectDialog';
import { useRole } from '../../hooks/useRole';
import { PROJECT_DOT_COLORS } from '../../lib/colors';

interface Project {
  id: number;
  name: string;
  prefix: string;
  memberCount?: number;
}

interface RecentProject {
  id: number;
  name: string;
  prefix: string;
  isPinned: boolean;
  role: string | null;
  lastActivityAt: string | null;
  activeSprint: {
    id: number;
    name: string;
    status: string;
    pointsDone: number;
    pointsTotal: number;
  } | null;
}

/** Convert a RecentProject row into the design's "PREFIX · <state>" subline. */
function describeProject(p: RecentProject): string {
  if (p.role === 'viewer') return `${p.prefix} · Viewer · read-only`;
  if (p.activeSprint) {
    return `${p.prefix} · ${p.activeSprint.name} · ${p.activeSprint.pointsDone}/${p.activeSprint.pointsTotal} pts`;
  }
  if (p.lastActivityAt) {
    const days = Math.floor((Date.now() - new Date(p.lastActivityAt).getTime()) / 86_400_000);
    if (days >= 1) return `${p.prefix} · ${days} day${days === 1 ? '' : 's'} idle`;
  }
  return `${p.prefix} · No active sprint`;
}

interface SidebarProps {
  projects: Project[];
  currentProjectId: number | null;
  onNavigate?: () => void;
}

// Design-system nav icons. All extracted from the canonical design
// HTML (docs/design-html/Today _ signature moment.html): 14×14 with a
// 16×16 viewBox, 1.5px stroke, round caps/joins, currentColor — so the
// active/inactive text colour drives the icon colour for free.
type NavKey =
  | 'today'
  | 'board'
  | 'backlog'
  | 'sprints'
  | 'epics'
  | 'stories'
  | 'charts'
  | 'retro'
  | 'members'
  | 'settings';

const ICON_SVG_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function NavIcon({ name }: { name: NavKey }) {
  switch (name) {
    case 'today':
      return (
        <svg {...ICON_SVG_PROPS}>
          <path d="M2.5 8L8 3l5.5 5" />
          <path d="M3.5 7.5v6h9v-6" />
        </svg>
      );
    case 'board':
      return (
        <svg {...ICON_SVG_PROPS}>
          <rect x="2.5" y="2.5" width="3" height="11" />
          <rect x="6.5" y="2.5" width="3" height="7" />
          <rect x="10.5" y="2.5" width="3" height="9" />
        </svg>
      );
    case 'backlog':
      return (
        <svg {...ICON_SVG_PROPS}>
          <path d="M3 4h10M3 8h10M3 12h7" />
        </svg>
      );
    case 'sprints':
      return (
        <svg {...ICON_SVG_PROPS}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 4v4l2.5 2" />
        </svg>
      );
    case 'epics':
      return (
        <svg {...ICON_SVG_PROPS}>
          <path d="M3.5 13.5V3" />
          <path d="M3.5 3h7l-1 2 1 2h-7" />
        </svg>
      );
    case 'stories':
      // Stories isn't in the canonical design HTML (it lists Today/Board/
      // Backlog/Sprints/Epics/Charts/Retro under WORK). Render a card icon
      // tuned to the same 14×14 / 1.5px stroke / 16-viewBox grid so it
      // sits visually alongside the others without looking off.
      return (
        <svg {...ICON_SVG_PROPS}>
          <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
          <path d="M5 7h6M5 9.5h4" />
        </svg>
      );
    case 'charts':
      return (
        <svg {...ICON_SVG_PROPS}>
          <path d="M2.5 13.5h11" />
          <path d="M4 11V8M7 11V4.5M10 11V7M13 11V9.5" />
        </svg>
      );
    case 'retro':
      return (
        <svg {...ICON_SVG_PROPS}>
          <path d="M2.5 4.5h11v6h-4l-2.5 2.5V10.5h-4.5z" />
        </svg>
      );
    case 'members':
      return (
        <svg {...ICON_SVG_PROPS}>
          <circle cx="6" cy="6" r="2.5" />
          <path d="M2 13c.5-2.2 2.2-3.5 4-3.5s3.5 1.3 4 3.5" />
          <path d="M10.5 4a2 2 0 0 1 0 4M13.5 13c-.3-1.6-1.2-2.7-2.5-3.2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...ICON_SVG_PROPS}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
        </svg>
      );
  }
}

type WorkLink = { key: string; iconKey: NavKey; label: string };

const WORK_LINKS: WorkLink[] = [
  { key: 'today', iconKey: 'today', label: 'Today' },
  { key: 'board', iconKey: 'board', label: 'Board' },
  { key: 'backlog', iconKey: 'backlog', label: 'Backlog' },
  { key: 'sprints', iconKey: 'sprints', label: 'Sprints' },
  { key: 'epics', iconKey: 'epics', label: 'Epics' },
  { key: 'stories', iconKey: 'stories', label: 'Stories' },
  { key: 'charts', iconKey: 'charts', label: 'Charts' },
  { key: 'retro', iconKey: 'retro', label: 'Retro' },
];

const PROJECT_LINKS: WorkLink[] = [
  { key: 'settings', iconKey: 'settings', label: 'Settings' },
];

export function Sidebar({ projects, currentProjectId, onNavigate }: SidebarProps) {
  const location = useLocation();
  const { canAdminister: isAdmin, canManageProject } = useRole();
  const [showCreate, setShowCreate] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Close switcher on route change.
  useEffect(() => { setSwitcherOpen(false); }, [location.pathname]);

  // ⌘P / Ctrl+P toggles the project switcher (the kbd hint inside the
  // search row advertises this shortcut). Escape closes it. We
  // preventDefault so the browser's native "print" dialog doesn't pop.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSwitcherOpen((v) => !v);
      } else if (e.key === 'Escape' && switcherOpen) {
        setSwitcherOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [switcherOpen]);

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const currentIdx = currentProject ? projects.findIndex((p) => p.id === currentProject.id) : 0;
  const currentDotColor = PROJECT_DOT_COLORS[currentIdx % PROJECT_DOT_COLORS.length];

  // Phase 3 — Pinned + Recent rails for the switcher dropdown.
  // /me/projects/recent already returns: pinned first, then last-visit DESC,
  // capped at 8 with the `isPinned` flag set. Re-fetch only when the
  // dropdown opens so we don't bombard the API on every layout render.
  const { data: recentResp } = useQuery({
    queryKey: ['sidebar-recent-projects'],
    enabled: switcherOpen,
    queryFn: async () => {
      const res = await apiClient.get('/me/projects/recent');
      return (res.data?.data?.projects ?? []) as RecentProject[];
    },
    staleTime: 30_000,
  });
  const recent = recentResp ?? [];
  const pinnedIds = new Set(recent.filter((r) => r.isPinned).map((r) => r.id));

  // Project search inside the switcher dropdown.
  const [switcherSearch, setSwitcherSearch] = useState('');
  const switcherSearchNorm = switcherSearch.trim().toLowerCase();
  const filteredAll = switcherSearchNorm
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(switcherSearchNorm) ||
          p.prefix.toLowerCase().includes(switcherSearchNorm),
      )
    : projects;

  // Fetch active sprint summary for footer card
  const { data: activeSprint } = useQuery({
    queryKey: ['active-sprint-footer', currentProjectId],
    enabled: !!currentProjectId,
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/projects/${currentProjectId}/sprints/active`);
        return res.data?.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  // T1.4 — Members lives as a tab inside the Settings page (no
  // standalone /projects/:id/members route exists). Resolve it as a
  // deep link to Settings with ?tab=members; treat the active-state
  // check accordingly so Members and Settings don't both highlight.
  const settingsTab = (): string => {
    if (location.search.includes('tab=')) {
      const sp = new URLSearchParams(location.search);
      return sp.get('tab') ?? 'general';
    }
    return 'general';
  };

  const isLinkActive = (key: string): boolean => {
    if (!currentProject) {
      // No project scoped: only the legacy landing routes can be "today".
      return key === 'today' && (location.pathname === '/dashboard' || location.pathname === '/today');
    }
    const root = `/projects/${currentProject.id}`;
    if (key === 'today') return location.pathname === `${root}/today`;
    if (key === 'board') return location.pathname.startsWith(`${root}/board`) || location.pathname.startsWith(`${root}/tasks/`);
    if (key === 'members') {
      return (
        location.pathname.startsWith(`${root}/settings`) && settingsTab() === 'members'
      );
    }
    if (key === 'settings') {
      if (!location.pathname.startsWith(`${root}/settings`)) return false;
      // Settings is "active" only when no Members-tab override is set;
      // otherwise Members owns the highlight.
      return settingsTab() !== 'members';
    }
    if (key === 'retro') {
      // Retro routes live under a sprint (/sprints/:sprintId/retro);
      // sprintsList/retro page is also handled by the sprint flow.
      return /\/sprints\/\d+\/retro\b/.test(location.pathname);
    }
    return location.pathname.startsWith(`${root}/${key}`);
  };

  const link = (project: Project | null, key: string): string => {
    if (!project) return '/dashboard';
    if (key === 'members') return `/projects/${project.id}/settings?tab=members`;
    if (key === 'retro') {
      // Retro page is per-sprint (route /sprints/:sprintId/retro). When
      // an active sprint exists, deep-link to its retro; otherwise route
      // to the sprints list where the user can pick a completed sprint.
      if (activeSprint?.id) {
        return `/projects/${project.id}/sprints/${activeSprint.id}/retro`;
      }
      return `/projects/${project.id}/sprints`;
    }
    return `/projects/${project.id}/${key}`;
  };

  return (
    <>
      <aside className="flex flex-col bg-[var(--paper)] w-[220px] h-full border-r border-[var(--line)] flex-shrink-0">
        {/* Project switcher header card. Design frame 1: dark ink-filled
            32px square with the project's first letter in paper colour,
            then name + "PREFIX · N members" mono subtitle, then a
            dropdown chevron at the far right. The entire row is the
            click target that opens the project dropdown. */}
        <div className="relative px-4 py-4 border-b border-[var(--line)]">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="w-full flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
            aria-label="Switch project"
          >
            <span
              className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-[14px] font-semibold text-[var(--paper)] flex-shrink-0"
              style={{ backgroundColor: currentProject ? currentDotColor : 'var(--ink)' }}
            >
              {currentProject?.name?.[0]?.toUpperCase() ?? 'T'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold text-ink truncate">
                {currentProject?.name ?? 'Trackero'}
              </span>
              <span className="block mono text-[11px] text-[var(--ink-3)] truncate">
                {currentProject
                  ? `${currentProject.prefix} · ${currentProject.memberCount ?? '—'} members`
                  : 'no project'}
              </span>
            </span>
            <svg className="w-3 h-3 text-[var(--ink-4)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {switcherOpen && createPortal(
            <>
              {/* Backdrop + panel both portal to document.body so they
                  escape the sidebar's `transform`-induced stacking
                  context — that's what was confining `fixed inset-0` to
                  the 220px sidebar instead of the viewport. */}
              <div
                className="fixed inset-0 bg-[var(--ink)]/40 z-40"
                onClick={() => setSwitcherOpen(false)}
                aria-hidden="true"
              />
              {/* Panel — extracted from docs/design-html/Project switcher
                  _ sidebar dropdown.html: width 360, border 1px solid
                  --ink, NO border-radius (sharp corners), strong shadow.
                  Bg --paper. Padding 0 (sections own their own). */}
              <div
                className="fixed left-2 top-2 w-[360px] bg-[var(--paper)] z-50 max-h-[600px] overflow-y-auto custom-scrollbar border border-[var(--ink)] shadow-[0_16px_50px_rgba(20,14,30,0.18),0_4px_10px_rgba(20,14,30,0.1)]"
                role="dialog"
                aria-label="Switch project"
              >
                {/* Search row — design: 360x46, padding 12px 14px,
                    border-bottom 1px rgb(207,194,221) (mauve), text 13px
                    mute, kbd ⌘P on the right. */}
                <div className="relative flex items-center gap-2 px-[14px] py-3 border-b border-[rgb(207,194,221)]">
                  <svg
                    className="w-3.5 h-3.5 text-[var(--mute)] flex-shrink-0"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="M10.5 10.5L14 14" />
                  </svg>
                  <input
                    type="text"
                    autoFocus
                    value={switcherSearch}
                    onChange={(e) => setSwitcherSearch(e.target.value)}
                    placeholder="Switch project…"
                    className="flex-1 text-[13px] bg-transparent placeholder-[var(--mute)] focus:outline-none"
                  />
                  <span
                    className="font-mono font-semibold text-[10px] text-[var(--ink-2)] bg-[var(--paper)] border-l border-t border-[rgb(207,194,221)] border-b-2 border-r border-[rgb(207,194,221)] px-1 rounded-[3px] flex-shrink-0"
                  >
                    ⌘P
                  </span>
                </div>

                {(() => {
                  // Surface the ACTIVE project in PINNED even when the
                  // user hasn't explicitly pinned it — that's how the
                  // design (image #15) puts the current project under
                  // the PINNED label with the HERE badge.
                  const pinnedRows = recent.filter((r) => r.isPinned || r.id === currentProjectId);
                  const pinnedIdsForSection = new Set(pinnedRows.map((r) => r.id));
                  const recentRows = recent.filter((r) => !pinnedIdsForSection.has(r.id));
                  if (switcherSearchNorm) return null;
                  return (
                    <>
                      {pinnedRows.length > 0 && (
                        <>
                          <SwitcherSectionLabel>Pinned</SwitcherSectionLabel>
                          <div className="pb-1">
                            {pinnedRows.map((p, i) => (
                              <SwitcherRow
                                key={p.id}
                                to={`/projects/${p.id}/today`}
                                project={p}
                                active={p.id === currentProjectId}
                                dotColor={PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}
                                onClick={() => { setSwitcherOpen(false); onNavigate?.(); }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                      {recentRows.length > 0 && (
                        <>
                          <SwitcherSectionLabel>Recent</SwitcherSectionLabel>
                          <div className="pb-1">
                            {recentRows.map((p, i) => (
                              <SwitcherRow
                                key={p.id}
                                to={`/projects/${p.id}/today`}
                                project={p}
                                active={p.id === currentProjectId}
                                dotColor={PROJECT_DOT_COLORS[(pinnedRows.length + i) % PROJECT_DOT_COLORS.length]}
                                onClick={() => { setSwitcherOpen(false); onNavigate?.(); }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}

                {(switcherSearchNorm || recent.length === 0) && (
                  <>
                    <SwitcherSectionLabel>{switcherSearchNorm ? 'Results' : 'All projects'}</SwitcherSectionLabel>
                    <div className="pb-2">
                      {filteredAll.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-[var(--ink-4)] italic">No projects match.</div>
                      ) : (
                        filteredAll.map((p, i) => {
                          // The "All projects" path comes from /projects (no
                          // sprint/role joins). Build a minimal RecentProject
                          // record so the row renders gracefully without the
                          // editorial subline.
                          const stub: RecentProject = {
                            id: p.id,
                            name: p.name,
                            prefix: p.prefix,
                            isPinned: pinnedIds.has(p.id),
                            role: null,
                            lastActivityAt: null,
                            activeSprint: null,
                          };
                          return (
                            <SwitcherRow
                              key={p.id}
                              to={`/projects/${p.id}/today`}
                              project={stub}
                              active={p.id === currentProjectId}
                              dotColor={PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}
                              onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); onNavigate?.(); }}
                            />
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                {/* Footer — design measurements: 35px tall, padding
                    10px 14px, bg --paper-2 (tinted, not the panel's
                    --paper). Top border 1px --line. "+ New project"
                    12px / 600 / ink ; "See all N projects →" 12px /
                    500 / --ink-2 with light chip-like padding. */}
                <div className="flex items-center justify-between bg-[var(--paper-2)] border-t border-[var(--line)] px-[14px] py-[10px] text-[12px]">
                  {isAdmin ? (
                    <button
                      onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); setShowCreate(true); }}
                      className="flex items-center gap-1.5 font-semibold text-[var(--ink)] hover:opacity-80"
                    >
                      <span className="text-[14px] leading-none">+</span>
                      <span>New project</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <Link
                    to="/projects"
                    onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); onNavigate?.(); }}
                    className="flex items-center gap-1 font-medium text-[var(--ink-2)] hover:text-[var(--ink)]"
                  >
                    <span>See all {projects.length} projects</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </>,
            document.body,
          )}
        </div>

        {/* Navigation. Design measures (re-extracted from the canonical
            HTML at 1440x900): rows are 204px wide in a 221px sidebar →
            8px inset on each side, so the nav has px-2. Section headers
            sit at the sidebar's true left edge with their own 16px text
            inset, so the header gets px-2 too (8px nav + 8px header =
            16px total). Rows render position:relative so the active rail
            can absolute-position itself OUTSIDE the row (left: -8px) and
            land flush against the sidebar's actual left edge — that's
            the editorial "page bookmark" detail of the design. */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2">
          {/* WORK section. Today is the first row inside the project
              scope (Today is per-project now — no global Today). When
              no project is selected, the empty state below replaces
              this list with a "pick a project" nudge. */}
          <SectionHeader>Work</SectionHeader>
          {currentProject ? (
            WORK_LINKS.map((item) => (
              <NavItem
                key={item.key}
                to={link(currentProject, item.key)}
                iconKey={item.iconKey}
                label={item.label}
                active={isLinkActive(item.key)}
                onClick={onNavigate}
              />
            ))
          ) : (
            <p className="px-3 py-2 text-[12px] text-[var(--ink-4)] italic">
              Pick a project to see Today and the rest.
            </p>
          )}

          {/* PROJECT section */}
          {currentProject && (
            <>
              <SectionHeader className="mt-4">Project</SectionHeader>
              {PROJECT_LINKS.map((item) => {
                // T1.4 — Members + Settings are PM/admin-only. Viewers and
                // plain members don't see either entry; non-members of this
                // project see neither (the parent guard skips the whole
                // section), and admins see both via canManageProject.
                if (
                  (item.key === 'settings' || item.key === 'members') &&
                  !canManageProject
                ) {
                  return null;
                }
                return (
                  <NavItem
                    key={item.key}
                    to={link(currentProject, item.key)}
                    iconKey={item.iconKey}
                    label={item.label}
                    active={isLinkActive(item.key)}
                    onClick={onNavigate}
                  />
                );
              })}
            </>
          )}
        </nav>

        {/* Footer: current sprint card */}
        {activeSprint && (
          <SprintFooter sprint={activeSprint} />
        )}
      </aside>

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            document.dispatchEvent(new CustomEvent('projects-updated'));
          }}
        />
      )}
    </>
  );
}

function SectionHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  // Design: .smallcaps section labels (10px / 600 / letter-spacing
  // 0.12em / uppercase / --ink-3). Sits at the sidebar's true left
  // edge with 8px text inset (so combined with the nav's 8px padding
  // the label starts 16px from the sidebar edge — the design's spec).
  return (
    <div className={`smallcaps px-2 mt-4 mb-2 ${className}`}>
      {children}
    </div>
  );
}

function NavItem({
  to,
  iconKey,
  label,
  active,
  onClick,
}: {
  to: string;
  iconKey: NavKey;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  // Design's active state (re-measured from Today _ signature moment.html
  // at 1440×900):
  //   row     — h-7, px-3, gap-2.5 (10px), 12.5px / 500, rounded-[4px]
  //   bg      — --paper-2 (#F1ECF7) when active, transparent otherwise
  //   color   — --ink when active, --ink-2 when inactive
  //   active marker — a 2×20px --accent vertical rail rendered as an
  //                   absolutely-positioned element at left: -8px so it
  //                   sits at the sidebar's true left edge, OUTSIDE the
  //                   row's bg. With nav px-2 + row inset, -8px places
  //                   the rail flush with the sidebar's left border.
  //                   This is the editorial "page bookmark" treatment.
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative flex items-center gap-2.5 h-7 px-3 text-[12.5px] font-medium rounded-[4px] transition-colors ${
        active
          ? 'bg-[var(--paper-2)] text-[var(--ink)]'
          : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-[-8px] top-1/2 -translate-y-1/2 block w-[2px] h-5 bg-[var(--accent)]"
        />
      )}
      <NavIcon name={iconKey} />
      <span>{label}</span>
    </Link>
  );
}

function SwitcherSectionLabel({ children }: { children: React.ReactNode }) {
  // Design: 10px / 600 / mute / uppercase, padding 10px 14px 4px.
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mute)] px-[14px] pt-[10px] pb-1">
      {children}
    </div>
  );
}

function SwitcherRow({
  to,
  project,
  active,
  dotColor,
  onClick,
}: {
  to: string;
  project: RecentProject;
  active: boolean;
  dotColor: string;
  onClick: () => void;
}) {
  // Design (extracted from docs/design-html/Project switcher.html):
  //   row     — h-[42px], padding 0 14px
  //   active  — bg #ECE0FA (lilac-tint), border-left 2px --accent,
  //             avatar bg = --ink (dark square with paper letter),
  //             lowercase "here" badge in dark-purple ink (#3A1078)
  //   inactive — transparent bg + 2px transparent border-left (so the
  //             content origin doesn't jump on activation), avatar uses
  //             the project's color, a small chevron SVG sits at right.
  //   avatar  — 22×22 square with slight rounding (~3px), 11px / 700.
  //   name    — 13px / 600 / --ink ; subline — 10.5px / 400 / --mute.
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`group flex items-center gap-[10px] h-[42px] px-[14px] ${
        active
          ? 'bg-[#ECE0FA] border-l-2 border-[var(--accent)] pl-[12px]'
          : 'border-l-2 border-transparent hover:bg-[var(--paper-2)]'
      }`}
    >
      <span
        className="w-[22px] h-[22px] rounded-[3px] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: active ? 'var(--ink)' : dotColor }}
      >
        {project.name[0]?.toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--ink)] truncate">{project.name}</span>
          {active && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#3A1078]">
              here
            </span>
          )}
          {project.role === 'viewer' && !active && (
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] bg-[var(--paper-3)] text-[var(--ink-2)] px-1.5 py-px rounded-[2px]">
              VIEWER
            </span>
          )}
        </span>
        <span className="block text-[10.5px] text-[var(--mute)] truncate">
          {describeProject(project)}
        </span>
      </span>
      {!active && (
        // Enter-key glyph — paths copied verbatim from the design HTML
        // (Project switcher _ sidebar dropdown.html). viewBox 0 0 16 16,
        // 11x11 render, 1.5 stroke, round caps.
        <svg
          className="w-[11px] h-[11px] text-[var(--faint)] flex-shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M13 4v3.5a2 2 0 0 1-2 2H3" />
          <path d="M5.5 7L3 9.5l2.5 2.5" />
        </svg>
      )}
    </Link>
  );
}

function SprintFooter({ sprint }: { sprint: any }) {
  // Design's sidebar footer card (frame 1, .pbar.accent variant):
  //   Current sprint                       <-- .smallcaps
  //   Sprint 27                d4/10       <-- name + .mono.num
  //   ▓▓▓▓░░░░░░                           <-- .pbar.accent
  //   14/38 done · May 30                  <-- .mono.num
  const totalPts: number = sprint.totalPoints ?? sprint.total_points ?? 0;
  const donePts: number = sprint.donePoints ?? sprint.done_points ?? 0;
  const startDate = sprint.startDate ?? sprint.start_date;
  const endDate = sprint.endDate ?? sprint.end_date;
  const today = new Date();
  let dayOf: number | null = null;
  let length: number | null = null;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    length = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
    dayOf = Math.max(1, Math.min(length, Math.round((today.getTime() - s.getTime()) / 86400000) + 1));
  }
  const pct = totalPts ? Math.min(100, Math.round((donePts / totalPts) * 100)) : 0;
  const endLabel = endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="px-4 py-4 border-t border-[var(--line)]">
      <div className="smallcaps mb-1.5">Current sprint</div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-ink">
          {sprint.name ?? `Sprint ${sprint.number}`}
        </span>
        {dayOf && length && (
          <span className="mono num text-[11px] text-[var(--ink-3)]">d{dayOf}/{length}</span>
        )}
      </div>
      {/* .pbar.accent — full-height fill in --accent, track in --paper-3. */}
      <div className="pbar accent mt-2" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="mono num text-[11px] text-[var(--ink-3)] mt-2">
        {donePts}/{totalPts} done · {endLabel}
      </div>
    </div>
  );
}
