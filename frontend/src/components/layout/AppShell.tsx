import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { connectSocket, disconnectSocket, joinProject, leaveProject } from '../../lib/socket';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { CreateItemDialog } from '../common/CreateItemDialog';

export function AppShell() {
  const [projects, setProjects] = useState<any[]>([]);
  const location = useLocation();
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const user = useAuthStore((s) => s.user);

  // Ensure user is loaded
  useEffect(() => {
    if (!user) {
      apiClient.get('/auth/me').then((res) => {
        useAuthStore.getState().setUser(res.data.data);
      }).catch(() => {});
    }
  }, [user]);

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

  // Listen for create-item events from child pages (e.g., BacklogPage keyboard shortcut)
  useEffect(() => {
    const handler = () => setShowCreateItem(true);
    document.addEventListener('shortcut-create-item', handler);
    return () => document.removeEventListener('shortcut-create-item', handler);
  }, []);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onCreateItem: () => {
      if (currentProjectId) {
        setShowCreateItem(true);
      }
    },
  });

  // Derive project ID from URL for the dialog
  const activeProjectId = (() => {
    const match = location.pathname.match(/\/projects\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  })();

  return (
    <div className="flex flex-col h-screen bg-[#F2F9F3] dark:bg-dneutral-50">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar projects={projects} />
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>

      {showCreateItem && activeProjectId && (
        <CreateItemDialog
          projectId={activeProjectId}
          defaultType="task"
          onClose={() => setShowCreateItem(false)}
          onCreated={() => setShowCreateItem(false)}
        />
      )}
    </div>
  );
}
