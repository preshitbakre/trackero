import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { getEpic, reopenEpic } from '../api/epics';
import type { EpicDetail } from '../api/epics';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { EpicStatusSelect } from '../components/epics/EpicStatusSelect';
import { TypeTag } from '../components/ui/TypeTag';
import { ErrorState } from '../components/common/ErrorState';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { toast } from '../components/common/Toast';
import { OverviewTab } from './epic-detail/OverviewTab';
import { TicketsTab } from './epic-detail/TicketsTab';
import { SettingsTab } from './epic-detail/SettingsTab';
import { EpicSidebar } from './epic-detail/EpicSidebar';
import { EpicIdentitySidebar } from './epic-detail/EpicIdentitySidebar';
import OverviewIcon from '../assets/icons/overview.svg?react';
import SettingsIcon from '../assets/icons/settings.svg?react';

type TabKey = 'overview' | 'tickets' | 'settings';

export function EpicDetailPage() {
  const { id: projectId, epicId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabKey) || 'overview';

  const [epic, setEpic] = useState<EpicDetail | null>(null);
  const [childCount, setChildCount] = useState(0);
  const [projectPrefix, setProjectPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { canEdit } = useRole();

  const load = useCallback(async () => {
    if (!projectId || !epicId) return;
    setLoading(true);
    setError(false);
    try {
      const [detail, projRes] = await Promise.all([
        getEpic(projectId, epicId),
        apiClient.get(`/projects/${projectId}`),
      ]);
      setEpic(detail);
      setChildCount(detail.byType.reduce((s, t) => s + t.count, 0));
      setProjectPrefix(projRes.data.data.prefix || '');
    } catch (err: any) {
      if (err?.response?.status !== 404) setError(true);
      setEpic(null);
    }
    setLoading(false);
  }, [projectId, epicId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const setTab = (key: string) => setSearchParams({ tab: key }, { replace: true });
  const reload = () => setReloadKey((k) => k + 1);

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 bg-rule rounded w-48" />
        <div className="h-4 bg-rule rounded w-72" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load epic" onRetry={load} />
      </div>
    );
  }
  if (!epic) {
    return (
      <div className="p-6 text-center py-12 text-faint">
        <p>Epic not found.</p>
        <Link to={`/projects/${projectId}/epics`} className="text-lilac hover:underline mt-2 inline-block text-[15px]">
          Back to Epics
        </Link>
      </div>
    );
  }

  const shipped = epic.epicState === 'shipped';

  const handleReopen = async () => {
    try {
      await reopenEpic(projectId!, epic.id);
      toast('Epic reopened');
      reload();
    } catch {
      toast('Failed to reopen', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <nav className="text-[12px] text-mute mb-2">
          <Link to={`/projects/${projectId}/epics`} className="hover:text-text">
            Epics
          </Link>
          <span className="mx-2">›</span>
          <span>{epic.itemKey}</span>
        </nav>

        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <TypeTag kind="epic" size="md" />
            <h1 className="font-serif text-[32px] leading-none tracking-[-0.8px] text-text truncate">{epic.title}</h1>
            <EpicStatusSelect epic={epic} projectId={projectId!} canEdit={canEdit} onChanged={reload} variant="pill" />
            {epic.displayState === 'blocked' && epic.priority === 'urgent' && (
              <span className="text-[10px] px-1.5 py-0.5 font-semibold bg-[#E05252] text-white">P0</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {shipped ? (
              <>
                <Button size="sm" variant="secondary" disabled title="Coming soon">
                  Export report
                </Button>
                {canEdit && (
                  <Button size="sm" variant="secondary" onClick={handleReopen}>
                    Reopen
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setShowBrief(true)}>
                Brief
              </Button>
            )}
          </div>
        </header>
      </PageHeader>

      <Tabs
        className="px-[28px] flex-shrink-0"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview', icon: <OverviewIcon className="w-[14px] h-[14px]" /> },
          { key: 'tickets', label: 'Tickets', icon: <TypeTag kind="task" size="xs" />, badge: childCount },
          { key: 'settings', label: 'Settings', icon: <SettingsIcon className="w-[14px] h-[14px]" /> },
        ]}
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-[28px] py-6">
          {tab === 'overview' && (
            <OverviewTab
              epic={epic}
              projectId={projectId!}
              canEdit={canEdit}
              onChanged={reload}
            />
          )}
          {tab === 'tickets' && (
            <TicketsTab
              epicId={epic.id}
              epicKey={epic.itemKey}
              projectId={projectId!}
              canEdit={canEdit}
              onOpenChild={setSelectedTaskId}
              reloadKey={reloadKey}
              onLinked={reload}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab
              epic={epic}
              projectId={projectId!}
              canEdit={canEdit}
              onChanged={reload}
              onArchived={() => navigate(`/projects/${projectId}/epics`)}
            />
          )}
        </div>

        {tab === 'settings' ? <EpicIdentitySidebar epic={epic} /> : <EpicSidebar epic={epic} projectId={projectId!} />}
      </div>

      {/* Brief modal */}
      {showBrief && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4"
          onClick={() => setShowBrief(false)}
        >
          <div
            className="bg-card shadow-[0_8px_30px_rgba(0,0,0,0.18)] max-w-[560px] w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] tracking-[0.14em] uppercase text-faint mb-2">Brief · {epic.itemKey}</p>
            <p className="font-serif text-[18px] leading-[1.5] text-text whitespace-pre-wrap">
              {epic.description || 'No brief written yet.'}
            </p>
            <div className="mt-5 text-right">
              <Button size="sm" variant="secondary" onClick={() => setShowBrief(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix={projectPrefix}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={reload}
          onNavigateToTask={(id) => setSelectedTaskId(id)}
        />
      )}

    </div>
  );
}
