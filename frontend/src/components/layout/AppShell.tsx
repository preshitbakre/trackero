import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { connectSocket, disconnectSocket, joinProject, leaveProject } from '../../lib/socket';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { CreateItemDialog } from '../common/CreateItemDialog';
import { CommandPalette } from '../common/CommandPalette';
import { ShortcutsHelp } from '../common/ShortcutsHelp';

export function AppShell() {
  const [projects, setProjects] = useState<any[]>([]);
  const location = useLocation();
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  // Mirror currentProjectId into a ref so the project-room effect reads the
  // latest value without needing it in the dep array (which would trigger an
  // unwanted re-run on every set).
  const currentProjectIdRef = useRef<number | null>(null);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useAuthStore((s) => s.user);

  // Close mobile nav when the route changes.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

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
      if (newProjectId) {
        joinProject(newProjectId);
        // Phase 3 — fire-and-forget visit ping powers /me/projects/recent
        // (Sidebar switcher's Recent section) and informs project-ordering.
        // Failures are silently swallowed so a flaky network never blocks UX.
        apiClient.post(`/me/project-visits/${newProjectId}`).catch(() => {});
      }
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

  // Re-fetch when navigating to a project not yet in the cached list.
  useEffect(() => {
    if (currentProjectId && !projects.some((p) => p.id === currentProjectId)) {
      loadProjects();
    }
  }, [currentProjectId]);

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

  // T1.2 — global command palette ownership.
  // The TopBar's "Jump to anything…" button and other surfaces dispatch the
  // `open-command-palette` custom event; the shell is the single listener so
  // the palette renders exactly once on top of the route Outlet.
  useEffect(() => {
    const handler = () => setPaletteOpen(true);
    document.addEventListener('open-command-palette', handler);
    return () => document.removeEventListener('open-command-palette', handler);
  }, []);

  // T1.3 — shortcuts-help modal. `useKeyboardShortcuts` dispatches the
  // `show-shortcuts-help` event on `?`; the shell mounts the modal so
  // its content (driven by lib/keymap.ts) stays in lockstep with what
  // the hook actually wires.
  useEffect(() => {
    const handler = () => setHelpOpen(true);
    document.addEventListener('show-shortcuts-help', handler);
    return () => document.removeEventListener('show-shortcuts-help', handler);
  }, []);

  // ⌘K / Ctrl+K opens the palette from any authenticated page. The shortcut
  // fires even when an input is focused (mirrors Slack / GitHub / Linear);
  // Escape closes the palette via its own onClose handler.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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

  // Design layout (frame 1): the Sidebar runs floor-to-ceiling and the
  // TopBar sits *to the right of* the sidebar inside the main column.
  // The trackero. wordmark therefore lives in the TopBar (not over the
  // sidebar). This matches the design's outer flex-row structure where
  // sidebar is the first flex item and the topbar+content stack is the
  // second.
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      {/* Full-height Sidebar */}
      <div
        className={`flex-shrink-0 fixed inset-y-0 left-0 z-20 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar
          projects={projects}
          currentProjectId={currentProjectId}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </div>

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-10 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Main column (topbar + outlet stacked) */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar
          currentProjectId={currentProjectId}
          projects={projects}
          onToggleSidebar={() => setMobileNavOpen((v) => !v)}
          sidebarOpen={mobileNavOpen}
        />
        <main className="flex-1 min-w-0 min-h-0 overflow-auto">
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

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
