import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useRole } from '../../hooks/useRole';
import { NotificationBell } from '../notifications/NotificationBell';
import { AVATAR_COLORS } from '../../lib/colors';

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

  const openCommandPalette = () => {
    document.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  // ⌘K / Ctrl+K -> open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <header className="h-14 bg-card/70 backdrop-blur-md dark:bg-dneutral-100/80 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 border-b border-rule dark:border-dneutral-200 z-30 relative">
      {/* Mobile sidebar toggle */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="lg:hidden w-9 h-9 rounded-md flex items-center justify-center text-mute hover:bg-paper flex-shrink-0"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" /> : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
          </svg>
        </button>
      )}

      {/* Wordmark */}
      <Link to="/dashboard" className="flex items-center gap-2 group flex-shrink-0">
        <span className="w-5 h-5 rounded-full border-2 border-text inline-block group-hover:rotate-12 transition-transform" />
        <span className="font-serif italic text-[20px] leading-none text-text tracking-tight hidden sm:inline">
          trackero<span className="text-lilac">.</span>
        </span>
      </Link>

      {/* Breadcrumb */}
      <div className="h-5 w-px bg-rule mx-1 hidden md:block" />
      <nav className="flex items-center gap-1.5 text-[14px] flex-1 min-w-0 overflow-hidden">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="text-faint">/</span>}
            {seg.to ? (
              <Link to={seg.to} className="text-mute hover:text-text truncate">{seg.label}</Link>
            ) : (
              <span className="text-text truncate font-medium">{seg.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Jump-to-anything */}
      <button
        onClick={openCommandPalette}
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg bg-paper hover:bg-rule text-mute text-[13px] min-w-[240px] transition-colors flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left">Jump to anything…</span>
        <kbd className="text-[11px] font-mono text-faint">⌘K</kbd>
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

function breadcrumbSegments(pathname: string, currentProject: Project | null): { label: string; to?: string }[] {
  const segs: { label: string; to?: string }[] = [];
  if (pathname === '/dashboard') {
    segs.push({ label: 'Today' });
    return segs;
  }
  if (pathname.startsWith('/projects/') && currentProject) {
    segs.push({ label: currentProject.name, to: `/projects/${currentProject.id}/board` });
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

  const initial = user?.displayName?.charAt(0)?.toUpperCase() || '?';
  const avatarColor = user ? AVATAR_COLORS[user.id % AVATAR_COLORS.length] : AVATAR_COLORS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-medium hover:ring-2 hover:ring-lilac/40 transition-all duration-100"
        style={{ backgroundColor: avatarColor.bg, color: avatarColor.color }}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg bg-card dark:bg-dneutral-200 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
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
