import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { CreateProjectDialog } from '../common/CreateProjectDialog';

interface Project {
  id: number;
  name: string;
  prefix: string;
}

interface SidebarProps {
  projects: Project[];
  onNavigate?: () => void;
}

const subNavItems = [
  { path: 'board', label: 'Board', icon: '▦', adminOnly: false },
  { path: 'backlog', label: 'Backlog', icon: '☰', adminOnly: false },
  { path: 'sprints', label: 'Sprints', icon: '⟳', adminOnly: false },
  { path: 'epics', label: 'Epics', icon: '◈', adminOnly: false },
  { path: 'charts', label: 'Charts', icon: '◩', adminOnly: false },
  { path: 'tasks', label: 'Tasks', icon: '☑', adminOnly: false },
  { path: 'settings', label: 'Settings', icon: '⚙', adminOnly: true },
];

export function Sidebar({ projects, onNavigate }: SidebarProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <aside className="flex flex-col border-r border-neutral-200 dark:border-dneutral-200 bg-neutral-50 dark:bg-dneutral-100 w-[260px] h-full">
        <div className="flex items-center h-14 px-4 border-b border-neutral-200 dark:border-dneutral-200">
          <Link to="/dashboard" className="text-lg font-bold text-primary-500" onClick={() => onNavigate?.()}>Trackero</Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-sm font-semibold uppercase text-neutral-400 dark:text-dneutral-400">Projects</span>
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-neutral-400 hover:text-primary-500 hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-sm"
                title="Create project"
              >
                +
              </button>
            )}
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
                      ? 'bg-primary-50 text-primary-500 font-medium'
                      : 'text-neutral-600 dark:text-dneutral-600 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                  <span className="truncate">{project.name}</span>
                </Link>

                {isActive && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {subNavItems.filter((item) => !item.adminOnly || user?.role !== 'viewer').map((item) => {
                      const itemPath = `/projects/${project.id}/${item.path}`;
                      const isItemActive = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
                      return (
                        <Link
                          key={item.path}
                          to={itemPath}
                          onClick={() => onNavigate?.()}
                          className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
                            isItemActive
                              ? 'text-primary-500 font-medium bg-primary-50'
                              : 'text-neutral-400 dark:text-dneutral-500 hover:text-neutral-600 dark:hover:text-dneutral-600 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
                          }`}
                        >
                          <span className="w-4 text-center">{item.icon}</span>
                          <span>{item.label}</span>
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
              <div className="my-4 border-t border-neutral-200 dark:border-dneutral-300" />
              <div className="px-2 mb-2 text-sm font-semibold uppercase text-neutral-400 dark:text-dneutral-400">
                Admin
              </div>
              <Link
                to="/settings"
                onClick={() => onNavigate?.()}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                  location.pathname === '/settings'
                    ? 'bg-primary-50 text-primary-500 font-medium'
                    : 'text-neutral-600 dark:text-dneutral-600 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
                }`}
              >
                <span className="w-4 text-center">⚙</span><span>Settings</span>
              </Link>
            </>
          )}
        </nav>
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
