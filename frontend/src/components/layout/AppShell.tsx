import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { apiClient } from '../../api/client';
import { connectSocket, disconnectSocket, joinProject, leaveProject } from '../../lib/socket';

export function AppShell() {
  const [projects, setProjects] = useState<any[]>([]);
  const location = useLocation();
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    const match = location.pathname.match(/\/projects\/(\d+)/);
    const newProjectId = match ? parseInt(match[1]) : null;

    if (newProjectId !== currentProjectId) {
      if (currentProjectId) leaveProject(currentProjectId);
      if (newProjectId) joinProject(newProjectId);
      setCurrentProjectId(newProjectId);
    }
  }, [location.pathname]);

  const loadProjects = () => {
    apiClient.get('/projects?limit=100').then((res) => {
      setProjects(res.data.data.list || []);
    }).catch(() => {});
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const handler = () => loadProjects();
    document.addEventListener('projects-updated', handler);
    return () => document.removeEventListener('projects-updated', handler);
  }, []);

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-dneutral-50">
      {/* Sidebar */}
      <Sidebar projects={projects} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
