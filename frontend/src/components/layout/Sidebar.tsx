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

const subNavItems = [
  { path: 'board', label: 'Board', icon: '▦' },
  { path: 'backlog', label: 'Backlog', icon: '☰' },
  { path: 'sprints', label: 'Sprints', icon: '⟳' },
  { path: 'epics', label: 'Epics', icon: '◈' },
  { path: 'charts', label: 'Charts', icon: '◩' },
  { path: 'tasks', label: 'Tasks', icon: '☑' },
];

export function Sidebar({ projects, collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  return (
    <aside
      className={`flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-all duration-200 h-full ${
        collapsed ? 'w-[60px]' : 'w-[260px]'
      }`}
    >
      <div className="flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <Link to="/dashboard" className="text-lg font-bold text-brand" onClick={() => onNavigate?.()}>Trackero</Link>
        )}
        {collapsed && <Link to="/dashboard" className="text-lg font-bold text-brand" onClick={() => onNavigate?.()}>T</Link>}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <div className="px-2 mb-2 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
          {!collapsed && 'Projects'}
        </div>
        {projects.map((project) => {
          const isActive = location.pathname.startsWith(`/projects/${project.id}`);
          return (
            <div key={project.id}>
              <Link
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

              {/* Sub-navigation when project is selected */}
              {isActive && !collapsed && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {subNavItems.map((item) => {
                    const itemPath = `/projects/${project.id}/${item.path}`;
                    const isItemActive = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
                    return (
                      <Link
                        key={item.path}
                        to={itemPath}
                        onClick={() => onNavigate?.()}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                          isItemActive
                            ? 'text-brand font-medium bg-brand/5'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="w-4 text-center">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Collapsed: show icons only when active */}
              {isActive && collapsed && (
                <div className="mt-1 space-y-0.5">
                  {subNavItems.map((item) => {
                    const itemPath = `/projects/${project.id}/${item.path}`;
                    const isItemActive = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
                    return (
                      <Link
                        key={item.path}
                        to={itemPath}
                        onClick={() => onNavigate?.()}
                        title={item.label}
                        className={`flex items-center justify-center py-1 rounded text-xs ${
                          isItemActive ? 'text-brand' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {item.icon}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                location.pathname === '/settings'
                  ? 'bg-brand/10 text-brand font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {collapsed ? '⚙' : <><span className="w-4 text-center">⚙</span><span>Settings</span></>}
            </Link>
          </>
        )}
      </nav>

      <div className="p-2 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={onToggle}
          className="w-full px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </div>
    </aside>
  );
}
