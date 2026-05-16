import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '../common/CommandPalette';
import { apiClient } from '../../api/client';
import { connectSocket, disconnectSocket, joinProject, leaveProject } from '../../lib/socket';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [projects, setProjects] = useState<any[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const location = useLocation();
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    // Extract project ID from URL
    const match = location.pathname.match(/\/projects\/(\d+)/);
    const newProjectId = match ? parseInt(match[1]) : null;

    if (newProjectId !== currentProjectId) {
      if (currentProjectId) leaveProject(currentProjectId);
      if (newProjectId) joinProject(newProjectId);
      setCurrentProjectId(newProjectId);
    }
  }, [location.pathname]);

  useEffect(() => {
    apiClient.get('/projects?limit=-1').then((res) => {
      setProjects(res.data.data.list || []);
    }).catch(() => {});
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <Sidebar projects={projects} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuToggle={toggleSidebar} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
    </div>
  );
}
