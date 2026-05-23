import { useEffect, useState } from 'react';
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
}

interface SidebarProps {
  projects: Project[];
  currentProjectId: number | null;
  onNavigate?: () => void;
}

type WorkLink = { key: string; label: string; icon: string };

const WORK_LINKS: WorkLink[] = [
  { key: 'board', label: 'Board', icon: '▦' },
  { key: 'backlog', label: 'Backlog', icon: '☰' },
  { key: 'sprints', label: 'Sprints', icon: '⟳' },
  { key: 'epics', label: 'Epics', icon: '◈' },
  { key: 'stories', label: 'Stories', icon: '◇' },
  { key: 'charts', label: 'Charts', icon: '◩' },
  { key: 'retro', label: 'Retro', icon: '⌗' },
];

const PROJECT_LINKS: WorkLink[] = [
  { key: 'members', label: 'Members', icon: '◌' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar({ projects, currentProjectId, onNavigate }: SidebarProps) {
  const location = useLocation();
  const { canAdminister: isAdmin, canManageProject } = useRole();
  const [showCreate, setShowCreate] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Close switcher on route change
  useEffect(() => { setSwitcherOpen(false); }, [location.pathname]);

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
    if (!currentProject) return key === 'today' && location.pathname === '/dashboard';
    const root = `/projects/${currentProject.id}`;
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
      <aside className="flex flex-col bg-cream dark:bg-dneutral-100 w-[240px] h-full shadow-[4px_0_12px_rgba(26,20,36,0.04)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.3)] flex-shrink-0">
        {/* Project switcher header card */}
        <div className="relative p-3 border-b border-rule">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-paper transition-colors"
          >
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center text-[14px] font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: currentDotColor }}
            >
              {currentProject?.name?.[0]?.toUpperCase() ?? 'T'}
            </span>
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-[14px] font-semibold text-text truncate">
                {currentProject?.name ?? 'Trackero'}
              </span>
              <span className="block text-[11px] text-mute truncate">
                {currentProject ? `${currentProject.prefix} · ${currentProject.memberCount ?? '—'} members` : 'no project'}
              </span>
            </span>
            <svg className="w-3 h-3 text-faint flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {switcherOpen && (
            <div className="absolute left-3 right-3 top-[60px] bg-card rounded-lg z-30 max-h-[440px] overflow-y-auto custom-scrollbar shadow-lg">
              <div className="p-2">
                <input
                  type="text"
                  autoFocus
                  value={switcherSearch}
                  onChange={(e) => setSwitcherSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full px-3 py-2 text-[13px] bg-paper rounded-md placeholder-faint focus:outline-none focus:ring-1 focus:ring-lilac"
                />
              </div>

              {!switcherSearchNorm && pinnedIds.size > 0 && (
                <>
                  <SwitcherSectionLabel>Pinned</SwitcherSectionLabel>
                  <div className="px-1 pb-1">
                    {recent.filter((r) => r.isPinned).map((p, i) => (
                      <SwitcherRow
                        key={p.id}
                        to={`/projects/${p.id}/board`}
                        name={p.name}
                        prefix={p.prefix}
                        active={p.id === currentProjectId}
                        dotColor={PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}
                        glyph="★"
                        onClick={() => { setSwitcherOpen(false); onNavigate?.(); }}
                      />
                    ))}
                  </div>
                </>
              )}

              {!switcherSearchNorm && recent.filter((r) => !r.isPinned).length > 0 && (
                <>
                  <SwitcherSectionLabel>Recent</SwitcherSectionLabel>
                  <div className="px-1 pb-1">
                    {recent.filter((r) => !r.isPinned).map((p, i) => (
                      <SwitcherRow
                        key={p.id}
                        to={`/projects/${p.id}/board`}
                        name={p.name}
                        prefix={p.prefix}
                        active={p.id === currentProjectId}
                        dotColor={PROJECT_DOT_COLORS[(pinnedIds.size + i) % PROJECT_DOT_COLORS.length]}
                        onClick={() => { setSwitcherOpen(false); onNavigate?.(); }}
                      />
                    ))}
                  </div>
                </>
              )}

              <SwitcherSectionLabel>{switcherSearchNorm ? 'Results' : 'All projects'}</SwitcherSectionLabel>
              <div className="px-1 pb-2">
                {filteredAll.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-mute italic">No projects match.</div>
                ) : (
                  filteredAll.map((p, i) => (
                    <SwitcherRow
                      key={p.id}
                      to={`/projects/${p.id}/board`}
                      name={p.name}
                      prefix={p.prefix}
                      active={p.id === currentProjectId}
                      dotColor={PROJECT_DOT_COLORS[i % PROJECT_DOT_COLORS.length]}
                      glyph={pinnedIds.has(p.id) ? '★' : undefined}
                      onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); onNavigate?.(); }}
                    />
                  ))
                )}
              </div>

              <div className="border-t border-rule px-1 py-2">
                <Link
                  to="/projects"
                  onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); onNavigate?.(); }}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] text-text hover:bg-paper"
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[12px] text-faint">▦</span>
                  <span>Browse all projects…</span>
                </Link>
                <Link
                  to="/dashboard"
                  onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); onNavigate?.(); }}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] text-text hover:bg-paper"
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] text-faint">◐</span>
                  <span>Today (home)</span>
                </Link>
                {isAdmin && (
                  <button
                    onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); setShowCreate(true); }}
                    className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] text-mute hover:bg-paper"
                  >
                    <span className="w-5 h-5 flex items-center justify-center text-[12px] text-faint">+</span>
                    <span>New project</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 px-2">
          {/* WORK section */}
          <SectionHeader>Work</SectionHeader>
          <NavItem
            to="/dashboard"
            icon="◐"
            label="Today"
            active={location.pathname === '/dashboard'}
            onClick={onNavigate}
          />
          {currentProject && WORK_LINKS.map((item) => (
            <NavItem
              key={item.key}
              to={link(currentProject, item.key)}
              icon={item.icon}
              label={item.label}
              active={isLinkActive(item.key)}
              onClick={onNavigate}
            />
          ))}

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
                    icon={item.icon}
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
  return (
    <div className={`px-3 mt-2 mb-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-faint ${className}`}>
      {children}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md mx-1 text-[14px] transition-colors ${
        active
          ? 'bg-lilac-tint text-lilac-dark font-semibold'
          : 'text-text/80 hover:bg-paper hover:text-text'
      }`}
    >
      <span className={`w-4 text-center text-[14px] ${active ? 'text-lilac' : 'text-faint'}`}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function SwitcherSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-faint">
      {children}
    </div>
  );
}

function SwitcherRow({
  to,
  name,
  prefix,
  active,
  dotColor,
  glyph,
  onClick,
}: {
  to: string;
  name: string;
  prefix: string;
  active: boolean;
  dotColor: string;
  glyph?: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-2 py-1.5 rounded-md text-[13px] ${active ? 'bg-lilac-tint text-lilac-dark' : 'text-text hover:bg-paper'}`}
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      >
        {name[0]?.toUpperCase()}
      </span>
      <span className="flex-1 truncate font-medium">{name}</span>
      {glyph && <span className="text-lilac text-[12px] leading-none">{glyph}</span>}
      <span className="text-faint text-[11px] tracking-wider uppercase">{prefix}</span>
    </Link>
  );
}

function SprintFooter({ sprint }: { sprint: any }) {
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
  const endLabel = endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : '—';

  return (
    <div className="px-3 py-3 border-t border-rule">
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-faint mb-1">Current sprint</div>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-text">{sprint.name ?? `Sprint ${sprint.number}`}</span>
        {dayOf && length && (
          <span className="text-[11px] text-mute">d{dayOf}/{length}</span>
        )}
      </div>
      <div className="mt-2 h-1 rounded-full bg-rule overflow-hidden">
        <div className="h-full bg-lilac" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-mute">
        {donePts}/{totalPts} DONE · {endLabel}
      </div>
    </div>
  );
}
