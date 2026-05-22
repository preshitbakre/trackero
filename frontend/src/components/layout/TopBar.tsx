import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useNavigate, Link } from 'react-router-dom';
import { useRole } from '../../hooks/useRole';
import { NotificationBell } from '../notifications/NotificationBell';

const AVATAR_COLORS = [
  { bg: 'bg-peri-light dark:bg-peri-dm/30', text: 'text-peri dark:text-peri-dm' },
  { bg: 'bg-mint-light dark:bg-mint-dm/30', text: 'text-mint dark:text-mint-dm' },
  { bg: 'bg-tan-light dark:bg-tan-dm/30', text: 'text-tan dark:text-tan-dm' },
  { bg: 'bg-orchid-light dark:bg-orchid-dm/30', text: 'text-orchid dark:text-orchid-dm' },
  { bg: 'bg-pink-300/20 dark:bg-pink-100', text: 'text-pink-500 dark:text-pink-300' },
  { bg: 'bg-peri-light dark:bg-peri-dm/30', text: 'text-peri dark:text-peri-dm' },
];

export function TopBar() {
  return (
    <header className="h-14 bg-[#DFF0E0] dark:bg-dneutral-100/80 dark:backdrop-blur-sm flex items-center justify-between px-4 shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] z-30 relative">
      <Link to="/dashboard" className="text-[22px] font-bold text-[#252220] dark:text-dneutral-700">Trackero</Link>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationBell />
        <AvatarMenu />
      </div>
    </header>
  );
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
  const avatarColor = user ? AVATAR_COLORS[(user.id) % AVATAR_COLORS.length] : AVATAR_COLORS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-[16px] font-medium hover:ring-2 hover:ring-peri dark:hover:ring-peri-dm transition-all duration-100 ${avatarColor.bg} ${avatarColor.text}`}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg bg-white dark:bg-dneutral-200 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-dneutral-200">
            <p className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 truncate">{user?.displayName}</p>
            <p className="text-[14px] text-neutral-400 dark:text-dneutral-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/profile'); }}
            className="w-full text-left px-4 py-2.5 text-[16px] text-neutral-600 dark:text-dneutral-600 hover:bg-orchid-light dark:hover:bg-orchid-dm/15 transition-colors duration-100"
          >
            Profile
          </button>
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); navigate('/settings'); }}
              className="w-full text-left px-4 py-2.5 text-[16px] text-neutral-600 dark:text-dneutral-600 hover:bg-orchid-light dark:hover:bg-orchid-dm/15 transition-colors duration-100"
            >
              Settings
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-[16px] text-danger hover:bg-danger/10 transition-colors duration-100"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 dark:text-dneutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200 transition-colors duration-100"
      title="Toggle theme"
    >
      <svg className="w-4 h-4 dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg className="w-4 h-4 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    </button>
  );
}
