import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { apiClient } from '../api/client';
import { GeneralTab } from '../components/settings/GeneralTab';
import { MembersTab } from '../components/settings/MembersTab';
import { BoardTab } from '../components/settings/BoardTab';
import { LabelsTab } from '../components/settings/LabelsTab';
import { DangerZoneTab } from '../components/settings/DangerZoneTab';
import { NotificationsTab } from '../components/settings/NotificationsTab';
import { IntegrationsTab } from '../components/settings/IntegrationsTab';

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'board', label: 'Board statuses' },
  { key: 'labels', label: 'Labels' },
  // Phase 9 frontend slot. Notifications is post-v1 (per-user prefs already
  // live under /profile); Integrations binds to the existing v1 backend.
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'danger', label: 'Danger zone' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function ProjectSettingsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [project, setProject] = useState<{ name: string; prefix: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch project basics for the page header
  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}`).then((res) => {
      setProject({ name: res.data.data.name, prefix: res.data.data.prefix });
    }).catch(() => {});
  }, [projectId]);

  const activeTab = (searchParams.get('tab') as TabKey) || 'general';

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab }, { replace: true });
  };

  // Load user if not in store yet
  useEffect(() => {
    if (!user) {
      apiClient.get('/auth/me').then((res) => {
        useAuthStore.getState().setUser(res.data.data);
      }).catch(() => {
        navigate('/login');
      });
    }
  }, [user, navigate]);

  // Fetch user's project role
  useEffect(() => {
    if (!projectId || !user) return;

    // Admin always has full access
    if (user.role === 'admin') {
      setProjectRole('admin');
      setLoading(false);
      return;
    }

    apiClient.get(`/projects/${projectId}/members`).then((res) => {
      const members = res.data.data.list || [];
      const me = members.find((m: any) => m.userId === user.id);
      if (!me) {
        navigate(`/projects/${projectId}/board`, { replace: true });
        return;
      }
      setProjectRole(me.role);
      setLoading(false);
    }).catch(() => {
      navigate(`/projects/${projectId}/board`, { replace: true });
    });
  }, [projectId, user, navigate]);

  // Viewer can't access settings
  useEffect(() => {
    if (!loading && projectRole === 'viewer') {
      navigate(`/projects/${projectId}/board`, { replace: true });
    }
  }, [loading, projectRole, projectId, navigate]);

  if (loading || !projectRole) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 w-48 bg-neutral-200 dark:bg-dneutral-200 rounded mb-6" />
        <div className="h-10 w-full bg-neutral-200 dark:bg-dneutral-200 rounded mb-6" />
        <div className="h-64 bg-neutral-200 dark:bg-dneutral-200 rounded" />
      </div>
    );
  }

  const canEdit = projectRole === 'admin' || projectRole === 'project_manager';
  const visibleTabs = projectRole === 'member'
    ? TABS.filter((t) => t.key === 'general')
    : TABS;

  const projectName = project?.name ?? 'Project';
  const projectPrefix = project?.prefix ?? '';

  return (
    <div className="p-6">
      <div className="smallcaps text-faint mb-0.5">
        Project · {projectName}{projectPrefix ? ` · ${projectPrefix}` : ''}
      </div>
      <h1 className="font-serif text-[36px] text-text mb-5">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6">
        {/* Left vertical nav */}
        <nav className="lg:sticky lg:top-4 self-start flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible scrollbar-none">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const isDanger = tab.key === 'danger';
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`text-left px-3 py-[7px] rounded-[var(--radius)] text-[13px] whitespace-nowrap transition-colors ${
                  isActive
                    ? isDanger
                      ? 'bg-danger/10 text-danger font-medium'
                      : 'bg-lilac-tint text-lilac-dark font-semibold'
                    : isDanger
                      ? 'text-danger/70 hover:text-danger hover:bg-danger/5'
                      : 'text-mute hover:text-text hover:bg-paper'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div>
          {activeTab === 'general' && <GeneralTab canEdit={canEdit} />}
          {activeTab === 'members' && canEdit && <MembersTab />}
          {activeTab === 'board' && canEdit && <BoardTab />}
          {activeTab === 'labels' && canEdit && <LabelsTab />}
          {activeTab === 'notifications' && canEdit && <NotificationsTab />}
          {activeTab === 'integrations' && canEdit && projectId && (
            <IntegrationsTab projectId={parseInt(projectId)} />
          )}
          {activeTab === 'danger' && canEdit && <DangerZoneTab />}
        </div>
      </div>
    </div>
  );
}
