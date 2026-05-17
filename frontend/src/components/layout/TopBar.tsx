import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from '../notifications/NotificationBell';

export function TopBar() {
  return (
    <header className="h-14 border-b border-neutral-200 dark:border-dneutral-200 bg-neutral-50 dark:bg-dneutral-50 flex items-center justify-end px-4">
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-primary-100 dark:bg-dprimary-100 flex items-center justify-center text-sm font-medium text-primary-500 dark:text-dprimary-500 hover:ring-2 hover:ring-primary-400/40"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-dneutral-200">
            <p className="text-sm font-medium text-neutral-700 dark:text-dneutral-700 truncate">{user?.displayName}</p>
            <p className="text-sm text-neutral-400 dark:text-dneutral-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/profile'); }}
            className="w-full text-left px-4 py-2.5 text-sm text-neutral-600 dark:text-dneutral-600 hover:bg-neutral-100 dark:hover:bg-dneutral-200"
          >
            Profile
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10"
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
      className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-400"
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
