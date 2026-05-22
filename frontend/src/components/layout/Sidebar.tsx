import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreateProjectDialog } from '../common/CreateProjectDialog';
import { useRole } from '../../hooks/useRole';

interface Project {
  id: number;
  name: string;
  prefix: string;
}

interface SidebarProps {
  projects: Project[];
  onNavigate?: () => void;
}

const PROJECT_DOT_COLORS = ['#88A9D6', '#88D68E', '#D6B588', '#D688D0'];

const subNavItems = [
  { path: 'board', label: 'Board', icon: '▦' },
  { path: 'backlog', label: 'Backlog', icon: '☰' },
  { path: 'sprints', label: 'Sprints', icon: '⟳' },
  { path: 'epics', label: 'Epics', icon: '◈' },
  { path: 'stories', label: 'Stories', icon: '◇', color: '#88A9D6' },
  { path: 'charts', label: 'Charts', icon: '◩' },
  { path: 'settings', label: 'Settings', icon: '⚙', adminOnly: true },
];

export function Sidebar({ projects, onNavigate }: SidebarProps) {
  const location = useLocation();
  const { canAdminister: isAdmin, canManageProject } = useRole();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <aside className="flex flex-col bg-[#FAF7F2] dark:bg-dneutral-100 w-[260px] h-full shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.3)]">
        <nav className="flex-1 overflow-y-auto custom-scrollbar py-4 px-2 space-y-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[12px] uppercase tracking-widest text-[#A8A19A] dark:text-dneutral-400">Projects</span>
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-[14px] text-[#A8A19A] dark:text-dneutral-500 hover:text-[#5C5650] dark:hover:text-dneutral-700 transition-colors duration-100"
                title="Create project"
              >
                + New
              </button>
            )}
          </div>
          {projects.map((project, idx) => {
            const isActive = location.pathname.startsWith(`/projects/${project.id}`);
            return (
              <div key={project.id}>
                <Link
                  to={`/projects/${project.id}/board`}
                  onClick={() => onNavigate?.()}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mx-2 text-[16px] transition-colors duration-100 ${
                    isActive
                      ? 'bg-[#88A9D618] text-[#3F5E8E] font-medium dark:bg-dneutral-300/30 dark:text-dneutral-700'
                      : 'text-[#5C5650] hover:text-[#252220] hover:bg-[#F0EBE3] dark:text-dneutral-500 dark:hover:text-dneutral-700 dark:hover:bg-dneutral-200/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PROJECT_DOT_COLORS[idx % 4] }} />
                  <span className="truncate">{project.name}</span>
                </Link>

                {isActive && (
                  <div className="mt-1 ml-[1.35rem] mr-2 border-l border-[#D1CCC7] dark:border-dneutral-300 pl-4 space-y-0.5">
                    {subNavItems.filter((item) => !item.adminOnly || canManageProject).map((item) => {
                      const itemPath = `/projects/${project.id}/${item.path}`;
                      const isItemActive = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
                      return (
                        <Link
                          key={item.path}
                          to={itemPath}
                          onClick={() => onNavigate?.()}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded-md text-[14px] transition-colors duration-100 ${
                            isItemActive
                              ? 'bg-[#88A9D620] text-[#3F5E8E] font-medium dark:bg-dneutral-300/20 dark:text-dneutral-700'
                              : 'text-[#7E7770] hover:text-[#5C5650] hover:bg-[#F0EBE3] dark:text-dneutral-400 dark:hover:text-dneutral-700 dark:hover:bg-dneutral-200/50'
                          }`}
                        >
                          <span className={`w-3.5 text-center text-[16px] ${isItemActive ? 'text-[#88A9D6]' : 'text-[#A8A19A] dark:text-dneutral-400'}`}>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Divider */}
          <div className="mx-3 my-2 border-t border-[#E8E2D8] dark:border-dneutral-200" />
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
