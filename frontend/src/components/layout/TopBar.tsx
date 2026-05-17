import { useAuthStore } from '../../store/auth.store';
import { useNavigate, Link } from 'react-router-dom';
import { NotificationBell } from '../notifications/NotificationBell';

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 border-b border-neutral-200 dark:border-dneutral-200 bg-neutral-50 dark:bg-dneutral-50 flex items-center justify-end px-4">
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-medium text-primary-500">
            {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <Link to="/profile" className="text-sm text-neutral-400 dark:text-dneutral-500 hover:text-neutral-700 dark:hover:text-dneutral-700">Profile</Link>
          <button
            onClick={handleLogout}
            className="text-sm text-neutral-400 dark:text-dneutral-500 hover:text-neutral-700 dark:hover:text-dneutral-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
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
