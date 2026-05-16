import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

interface Project {
  id: number;
  name: string;
  prefix: string;
}

interface SidebarProps {
  projects: Project[];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ projects, collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  return (
    <aside
      className={`flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-all duration-200 ${
        collapsed ? 'w-[60px]' : 'w-[260px]'
      }`}
    >
      <div className="flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <span className="text-lg font-bold text-brand">Trackero</span>
        )}
        {collapsed && <span className="text-lg font-bold text-brand">T</span>}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <div className="px-2 mb-2 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
          {!collapsed && 'Projects'}
        </div>
        {projects.map((project) => {
          const isActive = location.pathname.startsWith(`/projects/${project.id}`);
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}/board`}
              onClick={() => onNavigate?.()}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                isActive
                  ? 'bg-brand/10 text-brand font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-brand flex-shrink-0" />
              {!collapsed && <span className="truncate">{project.name}</span>}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="my-4 border-t border-gray-200 dark:border-gray-700" />
            <div className="px-2 mb-2 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
              {!collapsed && 'Admin'}
            </div>
            <Link
              to="/settings"
              onClick={() => onNavigate?.()}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {!collapsed && <span>Settings</span>}
            </Link>
          </>
        )}
      </nav>

      <div className="p-2 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={onToggle}
          className="w-full px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          {collapsed ? '>>' : '<< Collapse'}
        </button>
      </div>
    </aside>
  );
}
