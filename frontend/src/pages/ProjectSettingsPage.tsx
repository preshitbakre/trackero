import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { apiClient } from '../api/client';
import { GeneralTab } from '../components/settings/GeneralTab';
import { MembersTab } from '../components/settings/MembersTab';
import { BoardTab } from '../components/settings/BoardTab';
import { LabelsTab } from '../components/settings/LabelsTab';
import { DangerZoneTab } from '../components/settings/DangerZoneTab';

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'board', label: 'Board' },
  { key: 'labels', label: 'Labels' },
  { key: 'danger', label: 'Danger zone' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function ProjectSettingsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-6">Project Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-dneutral-200 overflow-x-auto scrollbar-none">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-2 text-[16px] font-medium border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-peri text-peri'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600'
            } ${tab.key === 'danger' ? (activeTab === 'danger' ? 'text-danger border-danger' : 'text-danger/60 hover:text-danger') : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'general' && <GeneralTab canEdit={canEdit} />}
        {activeTab === 'members' && canEdit && <MembersTab />}
        {activeTab === 'board' && canEdit && <BoardTab />}
        {activeTab === 'labels' && canEdit && <LabelsTab />}
        {activeTab === 'danger' && canEdit && <DangerZoneTab />}
      </div>
    </div>
  );
}
