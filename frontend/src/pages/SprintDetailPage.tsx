import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import OverviewIcon from '@/assets/icons/today.svg?react';
import ScopeChangesIcon from '@/assets/icons/scope-changes.svg?react';
import SettingsIcon from '@/assets/icons/settings.svg?react';
import { apiClient } from '../api/client';
import { Tabs } from '../components/ui/Tabs';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusPill, type StatusKey } from '../components/ui/StatusPill';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';
import { useRole } from '../hooks/useRole';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { OverviewTab } from './sprint-detail/OverviewTab';
import { ScopeChangesTab } from './sprint-detail/ScopeChangesTab';
import { SettingsTab } from './sprint-detail/SettingsTab';

export interface SprintDetail {
  id: number;
  projectId: number;
  sprintNumber: number;
  name: string;
  goal: string | null;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  carryOverPolicy: 'roll' | 'backlog' | 'ask';
  capacity: number | null;
  startedBy: number | null;
  createdBy: number | null;
  startedAt: string | null;
  createdByUser: { id: number; displayName: string; handle: string | null } | null;
  startedByUser: { id: number; displayName: string; handle: string | null } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  totalItems: number;
  totalPoints: number;
  completedPoints: number;
  assignees: Array<{
    id: number;
    displayName: string;
    avatarUrl: string | null;
    assigned: number;
    done: number;
    inProgress: number;
    capacity: number | null;
  }>;
  autoCapacity: number;
}

type Tab = 'overview' | 'scope-changes' | 'settings';

const STATUS_PILL_MAP: Record<SprintDetail['status'], StatusKey> = {
  planning: 'planning',
  active: 'active',
  completed: 'shipped',
  cancelled: 'cancelled',
};

/**
 * Sprint detail page shell. Owns the breadcrumb, status-aware header, action
 * buttons, and tab strip. The active tab is driven by the `?tab=` query param
 * so deep-links and back/forward navigation work. Sprint data is loaded once
 * here and passed down to each tab — Wave 3 tabs (Overview / Scope changes /
 * Settings) implement the actual content.
 */
export function SprintDetailPage() {
  const { id: projectIdParam, sprintId: sprintIdParam } = useParams();
  const projectId = Number(projectIdParam);
  const sprintId = Number(sprintIdParam);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('tab', t);
        return n;
      },
      { replace: true },
    );

  const [sprint, setSprint] = useState<SprintDetail | null>(null);
  const [scopeCount, setScopeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}`);
      setSprint({ ...data.data, projectId });
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, sprintId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiClient
      .get(`/projects/${projectId}/sprints/${sprintId}/scope-changes`)
      .then((r) => setScopeCount(r.data.data?.entries?.length ?? 0))
      .catch(() => setScopeCount(0));
  }, [projectId, sprintId]);

  const handleStart = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/start`);
      toast('Sprint started');
      load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Failed to start sprint', 'error');
    }
  };
  const handleComplete = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/complete`);
      toast('Sprint completed');
      load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Failed to complete sprint', 'error');
    }
  };
  const handleCancel = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/cancel`);
      toast('Sprint cancelled');
      load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Failed to cancel sprint', 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <CardSkeleton />
      </div>
    );
  }
  if (error || !sprint) {
    return <ErrorState message="Could not load sprint." onRetry={load} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader>
      <nav className="text-[12px] text-mute mb-2">
        <Link to={`/projects/${projectId}/sprints`} className="hover:text-text">
          Sprints
        </Link>
        <span className="mx-2">›</span>
        <span>S-{sprint.sprintNumber}</span>
      </nav>

      <header className="flex items-start justify-between">
        <div>
          <span className="font-serif text-[36px] text-text">Sprint</span>
          <span className="font-serif text-[28px] text-text ml-3">{sprint.sprintNumber}</span>
          <StatusPill status={STATUS_PILL_MAP[sprint.status]} solid dot className="ml-3" />
          {sprint.status === 'active' && (
            <span className="font-mono text-[12px] font-semibold bg-lilac-tint text-lilac px-2 py-0.5 ml-3 align-middle">
              day {dayOf(sprint)} of {totalDays(sprint)} · ends in {daysRemaining(sprint)}d
            </span>
          )}
          {sprint.goal && (
            <p className="font-serif italic text-[15px] text-ink-2 mt-2">"{sprint.goal}"</p>
          )}
        </div>
        <HeaderActions
          sprint={sprint}
          onStart={handleStart}
          onComplete={() => setShowCompleteConfirm(true)}
          onCancel={() => setShowCancelConfirm(true)}
          onOpenBoard={() => navigate(`/projects/${projectId}/board`)}
          onOpenRetro={() => navigate(`/projects/${projectId}/sprints/${sprintId}/retro`)}
          onReopenAsNew={() => navigate(`/projects/${projectId}/sprints`)}
        />
      </header>
      </PageHeader>

      <Tabs
        className="px-[28px] flex-shrink-0"
        tabs={[
          { key: 'overview', label: 'Overview', icon: <OverviewIcon width={14} height={14} aria-hidden /> },
          { key: 'scope-changes', label: 'Scope changes', icon: <ScopeChangesIcon width={14} height={14} aria-hidden />, badge: scopeCount },
          { key: 'settings', label: 'Settings', icon: <SettingsIcon width={14} height={14} aria-hidden /> },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'overview' && <OverviewTab sprint={sprint} onAfterAction={load} />}
        {tab === 'scope-changes' && <ScopeChangesTab sprint={sprint} />}
        {tab === 'settings' && <SettingsTab sprint={sprint} onSaved={load} />}
      </div>

      {showCompleteConfirm && (
        <ConfirmDialog
          title="Complete this sprint?"
          message="Done items will ship. WIP follows the carry-over policy. This will also open the retro."
          confirmLabel="Complete"
          onConfirm={async () => {
            setShowCompleteConfirm(false);
            await handleComplete();
          }}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel this sprint?"
          message="Items return to the backlog. The sprint is preserved for the record."
          confirmLabel="Cancel sprint"
          danger
          onConfirm={async () => {
            setShowCancelConfirm(false);
            await handleCancel();
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}

interface HeaderActionsProps {
  sprint: SprintDetail;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onOpenBoard: () => void;
  onOpenRetro: () => void;
  onReopenAsNew: () => void;
}

/**
 * Header action buttons that vary by sprint status — per the table in
 * `docs/sprints/spec-sprint-detail-overview.md`. Privileged actions
 * (Start / Complete) are gated by project-management role.
 */
function HeaderActions({
  sprint,
  onStart,
  onComplete,
  onCancel: _onCancel,
  onOpenBoard,
  onOpenRetro,
  onReopenAsNew,
}: HeaderActionsProps) {
  const { canManageProject } = useRole();
  if (sprint.status === 'planning') {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" disabled>
          Edit goal
        </Button>
        {canManageProject && (
          <Button variant="primary" onClick={onStart}>
            Start sprint ↵
          </Button>
        )}
      </div>
    );
  }
  if (sprint.status === 'active') {
    return (
      <div className="flex gap-2">
        <Button variant="secondary" className="inline-flex items-center gap-1.5">
          <BarChart3 size={14} /> Burndown
        </Button>
        <Button variant="secondary" onClick={onOpenBoard}>
          Open board →
        </Button>
        {canManageProject && (
          <Button variant="ink" onClick={onComplete}>
            Complete sprint…
          </Button>
        )}
      </div>
    );
  }
  if (sprint.status === 'completed') {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onOpenRetro}>
          Open retro
        </Button>
        <Button variant="ghost" disabled>
          Export report
        </Button>
      </div>
    );
  }
  if (sprint.status === 'cancelled') {
    return (
      <Button variant="ghost" onClick={onReopenAsNew}>
        Re-open as new sprint
      </Button>
    );
  }
  return null;
}

function dayOf(s: SprintDetail): number {
  if (!s.startDate) return 1;
  return Math.max(1, Math.ceil((Date.now() - Date.parse(s.startDate + 'T00:00:00')) / 86400000));
}
function totalDays(s: SprintDetail): number {
  if (!s.startDate || !s.endDate) return 1;
  return Math.max(
    1,
    Math.ceil((Date.parse(s.endDate + 'T00:00:00') - Date.parse(s.startDate + 'T00:00:00')) / 86400000),
  );
}
function daysRemaining(s: SprintDetail): number {
  return Math.max(0, totalDays(s) - dayOf(s));
}
