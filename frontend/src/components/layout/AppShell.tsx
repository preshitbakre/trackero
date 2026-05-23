import { useState, useEffect, useRef } from 'react';
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
  // Mirror currentProjectId into a ref so the project-room effect reads the
  // latest value without needing it in the dep array (which would trigger an
  // unwanted re-run on every set).
  const currentProjectIdRef = useRef<number | null>(null);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const user = useAuthStore((s) => s.user);

  // Ensure user is loaded AND auth status is resolved.
  // On 401 the apiClient response interceptor will attempt refresh; if that
  // also fails it calls logout() which sets authStatus to 'anon' and
  // ProtectedRoute will redirect on the next render. For any other error
  // (network, 5xx, etc.) we fail closed by setting 'anon' too — we cannot
  // safely render protected content without a verified user. Task 6.2 will
  // refine resilience for transient network errors.
  useEffect(() => {
    if (!user) {
      apiClient
        .get('/auth/me')
        .then((res) => {
          useAuthStore.getState().setUser(res.data.data);
        })
        .catch(() => {
          // If the interceptor already logged out (refresh failed on 401),
          // authStatus is already 'anon' and this is a no-op. Otherwise we
          // explicitly resolve out of 'loading' so ProtectedRoute can act.
          if (useAuthStore.getState().authStatus === 'loading') {
            useAuthStore.getState().setAuthStatus('anon');
          }
        });
    }
  }, [user]);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    const match = location.pathname.match(/\/projects\/(\d+)/);
    const newProjectId = match ? parseInt(match[1]) : null;
    const prev = currentProjectIdRef.current;

    if (newProjectId !== prev) {
      if (prev) leaveProject(prev);
      if (newProjectId) joinProject(newProjectId);
      currentProjectIdRef.current = newProjectId;
      setCurrentProjectId(newProjectId);
    }
  }, [location.pathname]);

  const loadProjects = () => {
    apiClient.get('/projects?limit=100').then((res) => {
      setProjects(res.data.data.list || []);
    }).catch((err) => { console.error(err); });
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
