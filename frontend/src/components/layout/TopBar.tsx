import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useRole } from '../../hooks/useRole';
import { NotificationBell } from '../notifications/NotificationBell';
import { Avatar } from '../ui';
import { Logo } from '../ui/Logo';

interface Project {
  id: number;
  name: string;
  prefix: string;
}

interface TopBarProps {
  currentProjectId?: number | null;
  projects?: Project[];
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

/**
 * Top bar: wordmark + breadcrumb + jump-to-anything + bell + avatar.
 * Project switcher pill is on the Sidebar (per the design exploration), not here.
 */
export function TopBar({ currentProjectId, projects = [], onToggleSidebar, sidebarOpen = false }: TopBarProps) {
  const location = useLocation();
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  // Build breadcrumb segments from the URL relative to /projects/:id
  const segments = breadcrumbSegments(location.pathname, currentProject);

  // T1.2 — AppShell owns the ⌘K listener and the palette state; we just
  // dispatch the open event from the visible Jump-to-anything button.
  const openCommandPalette = () => {
    document.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  return (
    <header className="h-[49px] bg-[var(--paper)] flex items-center gap-4 border-b border-[var(--line)] z-30 relative" style={{ paddingLeft: 18, paddingRight: 18 }}>
      {/* Mobile sidebar toggle */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="lg:hidden w-9 h-9 rounded-[var(--radius)] flex items-center justify-center text-[var(--ink-3)] hover:bg-[var(--paper-2)] flex-shrink-0"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" /> : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
          </svg>
        </button>
      )}

      {/* Wordmark — design (Today _ signature moment.html) draws this as
          three SVG shapes on a 32×32 viewBox: an ink-outline circle
          (r=13, stroke 2), a 3.5px lilac quarter-arc from 12-o'clock
          clockwise to ~1:30, and a lilac dot capping the end of the arc.
          Plus the serif italic "trackero" wordmark with lilac period. */}
      <Link to="/today" className="flex items-center group flex-shrink-0">
        <Logo height={20} variant="dark" />
      </Link>

      {/* Breadcrumb. Design pattern: <Project ▾> · / · <Page>. The chevron
          next to the project name implies it's the click target for the
          project switcher; on Today (no project context) only the page
          label is shown. */}
      <nav className="flex items-center gap-2 text-[14px] flex-1 min-w-0 overflow-hidden">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-[var(--ink-4)]">/</span>}
            {seg.to ? (
              <Link to={seg.to} className="text-[var(--ink-2)] hover:text-ink truncate flex items-center gap-1">
                {seg.label}
                {seg.dropdown && (
                  <svg className="w-3 h-3 text-[var(--ink-4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </Link>
            ) : (
              <span className="text-ink truncate font-medium">{seg.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Jump-to-anything search button — design uses a wide pill with paper-2
          background, magnifier icon, placeholder text, and a .kbd at the right. */}
      <button
        onClick={openCommandPalette}
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-[var(--radius)] bg-[var(--paper-2)] hover:bg-[var(--paper-3)] text-[var(--ink-3)] text-[13px] min-w-[280px] transition-colors flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left">Jump to anything…</span>
        <span className="kbd">⌘K</span>
      </button>

      {/* Mobile search icon (replaces full jump-to) */}
      <button
        onClick={openCommandPalette}
        className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-mute hover:bg-paper flex-shrink-0"
        aria-label="Search"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
      </button>

      <NotificationBell />
      <AvatarMenu />
    </header>
  );
}

// `dropdown: true` renders a chevron after the segment label so the user
// knows it's a click target for the project switcher.
function breadcrumbSegments(
  pathname: string,
  currentProject: Project | null,
): { label: string; to?: string; dropdown?: boolean }[] {
  const segs: { label: string; to?: string; dropdown?: boolean }[] = [];
  if (pathname === '/dashboard' || pathname === '/today') {
    segs.push({ label: 'Today' });
    return segs;
  }
  if (pathname.startsWith('/projects/') && currentProject) {
    segs.push({
      label: currentProject.name,
      to: `/projects/${currentProject.id}/board`,
      dropdown: true,
    });
    // Sub-page label from URL
    const parts = pathname.split('/').filter(Boolean); // projects, :id, page, ...
    const page = parts[2];
    if (page) {
      segs.push({ label: page.charAt(0).toUpperCase() + page.slice(1) });
    }
    return segs;
  }
  if (pathname === '/profile') segs.push({ label: 'Profile' });
  else if (pathname === '/settings') segs.push({ label: 'Instance settings' });
  else if (pathname === '/projects') segs.push({ label: 'All projects' });
  return segs;
}

function AvatarMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { canAdminister: isAdmin } = useRole();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full hover:ring-2 hover:ring-lilac/40 transition-all duration-100"
        aria-label="User menu"
      >
        <Avatar
          user={{
            id: user?.id ?? 0,
            displayName: user?.displayName ?? '?',
            avatarUrl: (user as any)?.avatarUrl ?? null,
          }}
          size="md"
        />
      </button>

      {open && (
        <div className="dropdown-panel absolute right-0 mt-2 w-48 bg-card dark:bg-dneutral-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-rule dark:border-dneutral-200">
            <p className="text-[14px] font-medium text-text dark:text-dneutral-700 truncate">{user?.displayName}</p>
            <p className="text-[13px] text-faint dark:text-dneutral-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/profile'); }}
            className="w-full text-left px-4 py-2.5 text-[14px] text-mute hover:bg-lilac-tint hover:text-lilac-dark transition-colors"
          >
            Profile
          </button>
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); navigate('/settings'); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-mute hover:bg-lilac-tint hover:text-lilac-dark transition-colors"
            >
              Instance settings
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-[14px] text-danger hover:bg-danger/10 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
