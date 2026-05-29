import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../api/client';
import { toast } from '../components/common/Toast';
import { useRole } from '../hooks/useRole';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { Eyebrow } from '../components/ui/Eyebrow';
import { PageHeader } from '../components/ui/PageHeader';
import { KbdKey } from '../components/ui/KbdKey';
import { MetricNumber } from '../components/ui/MetricNumber';
import { StatusPill } from '../components/ui/StatusPill';
import { AvatarStack } from '../components/ui/AvatarStack';
import { VelocityChart } from '../components/sprints/VelocityChart';

interface SprintAssignee {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
}

interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  sprintNumber: number;
  startDate: string | null;
  endDate: string | null;
  taskCount?: number;
  totalPoints?: number;
  completedPoints?: number;
  assignees?: SprintAssignee[];
  statusCounts?: { open?: number; in_progress?: number; done?: number };
  scopeAdded?: number;
  scopeDropped?: number;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function daysBetween(start: string, end: string): number {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}

function totalDays(s: Sprint): number {
  if (!s.startDate || !s.endDate) return 1;
  return Math.max(1, Math.ceil((Date.parse(s.endDate) - Date.parse(s.startDate)) / 86400000));
}

function dayOfSprint(s: Sprint): number {
  if (!s.startDate) return 1;
  return Math.max(1, Math.ceil((Date.now() - Date.parse(s.startDate + 'T00:00:00')) / 86400000));
}

function daysUntil(end: string | null): number {
  if (!end) return 0;
  return Math.max(0, Math.ceil((new Date(end + 'T00:00:00').getTime() - Date.now()) / 86400000));
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function SprintsPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showVelocity, setShowVelocity] = useState(true);
  const [showAllSprints, setShowAllSprints] = useState(false);
  const { canManageProject } = useRole();
  const [cancellingSprintId, setCancellingSprintId] = useState<number | null>(null);

  const loadSprints = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints`);
      setSprints(data.data.list || []);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadSprints();
    apiClient.get(`/projects/${projectId}`).then((res) => {
      setDefaultDuration(res.data.data.defaultSprintDuration || 14);
    }).catch((err) => { console.error(err); });
  }, [projectId, loadSprints]);

  useEffect(() => {
    if (!canManageProject) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setShowCreate(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canManageProject]);

  const handleStart = async (sprintId: number) => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/start`);
      loadSprints();
      toast('Sprint started');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to start sprint', 'error');
    }
  };

  const handleComplete = async (sprintId: number) => {
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/complete`);
      loadSprints();
      toast('Sprint completed');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to complete sprint', 'error');
    }
  };

  const handleCancel = async (sprintId: number) => {
    setCancellingSprintId(null);
    try {
      await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/cancel`);
      loadSprints();
      toast('Sprint cancelled');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to cancel sprint', 'error');
    }
  };

  const cancellingName = sprints.find((s) => s.id === cancellingSprintId)?.name || '';

  // Derived data
  const activeSprint = sprints.find((s) => s.status === 'active');
  const planningSprint = sprints.find((s) => s.status === 'planning');
  const archivedSprints = sprints.filter((s) => s.status === 'completed' || s.status === 'cancelled');
  const completedSprints = archivedSprints.filter((s) => s.status === 'completed');
  const recentArchive = showAllSprints
    ? archivedSprints
    : archivedSprints.slice(0, 12);

  const recentCompleted = completedSprints.slice(0, 6);
  const avgVelocity = Math.round(
    recentCompleted.reduce((sum, s) => sum + (s.completedPoints || 0), 0) /
      Math.max(1, recentCompleted.length),
  );

  // Loading / error states
  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load sprints" onRetry={loadSprints} />
      </div>
    );
  }

  // EMPTY STATE
  if (sprints.length === 0) {
    return (
      <>
        <PageHeader className="flex items-start justify-between">
          <div>
            <Eyebrow>Project · Backstage · 0 sprints</Eyebrow>
            <h1 className="font-serif text-[36px] text-text mt-1">Sprints</h1>
          </div>
          {canManageProject && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn btn-accent inline-flex items-center gap-2"
            >
              + Plan a sprint
              <KbdKey tone="on-accent">S</KbdKey>
            </button>
          )}
        </PageHeader>

        <div className="px-[28px] py-6 flex flex-col lg:flex-row gap-12 items-start">
          {/* LEFT */}
          <div className="flex-1 max-w-[520px]">
            <div className="font-serif text-[48px] leading-[1.05] text-text">No sprints</div>
            <div className="font-serif italic text-[48px] leading-[1.05] text-text mb-6">— yet. <span className="text-lilac not-italic">—</span></div>

            <p className="text-[14px] text-mute mb-8 max-w-[480px]">
              A sprint is a time-boxed plan: a goal, a start, an end, and the work you'll ship in between.
              Most teams run them weekly or biweekly.
            </p>

            <div className="mb-8">
              <div className="flex gap-5 border-t border-rule pt-5">
                <span className="font-serif text-[28px] text-faint leading-none w-[40px]">01</span>
                <div>
                  <div className="text-[15px] font-semibold text-text">Set the goal</div>
                  <div className="text-[13px] text-mute mt-0.5">One sentence. What does shipping this sprint mean?</div>
                </div>
              </div>
              <div className="flex gap-5 border-t border-rule pt-5 mt-5">
                <span className="font-serif text-[28px] text-faint leading-none w-[40px]">02</span>
                <div>
                  <div className="text-[15px] font-semibold text-text">Pull in items</div>
                  <div className="text-[13px] text-mute mt-0.5">Drag from the backlog. The capacity meter tells you when to stop.</div>
                </div>
              </div>
              <div className="flex gap-5 border-t border-rule pt-5 mt-5">
                <span className="font-serif text-[28px] text-faint leading-none w-[40px]">03</span>
                <div>
                  <div className="text-[15px] font-semibold text-text">Start it</div>
                  <div className="text-[13px] text-mute mt-0.5">Trackero starts the clock and the board lights up.</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canManageProject && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="btn btn-accent"
                >
                  Plan your first sprint →
                </button>
              )}
              <button
                type="button"
                onClick={() => window.open('https://www.atlassian.com/agile/scrum/sprints', '_blank', 'noopener')}
                className="btn-ghost"
              >
                Read the sprint guide
              </button>
            </div>
          </div>

          {/* RIGHT preview card */}
          <div className="w-full lg:flex-1 bg-card border border-rule p-6">
            <div className="smallcaps mb-4">What it'll look like</div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-serif text-[28px] text-faint leading-none">01</span>
              <span className="font-serif italic text-[20px] text-mute">Your first goal…</span>
            </div>
            <div className="pbar w-full mb-3" />
            <div className="smallcaps">0 / 0 pts · Awaiting plan</div>
          </div>
        </div>

        {showCreate && (
          <CreateSprintDialog
            projectId={projectId!}
            defaultDuration={defaultDuration}
            nextSprintNumber={1}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); loadSprints(); toast('Sprint created'); }}
          />
        )}
      </>
    );
  }

  // POPULATED STATE
  const activeCount = sprints.filter((s) => s.status === 'active').length;
  const planningCount = sprints.filter((s) => s.status === 'planning').length;
  const subtitleParts: string[] = [];
  if (activeCount > 0) subtitleParts.push(`${activeCount} shipping`);
  if (planningCount > 0) subtitleParts.push(`${planningCount} queued`);
  if (archivedSprints.length > 0) subtitleParts.push(`${archivedSprints.length} in the archive`);

  return (
    <>
      <PageHeader className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Project · Backstage · {sprints.length} sprints</Eyebrow>
          <h1 className="font-serif text-[36px] text-text mt-1">
            Sprints
            {subtitleParts.length > 0 && (
              <span className="font-serif italic text-[20px] text-mute ml-3">— {subtitleParts.join(', ')}.</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVelocity((v) => !v)}
            className={`btn-ghost ${showVelocity ? 'bg-shade' : ''}`}
          >
            Velocity
          </button>
          <button
            type="button"
            onClick={() => setShowAllSprints((v) => !v)}
            className={`btn-ghost ${showAllSprints ? 'bg-shade' : ''}`}
          >
            All sprints
          </button>
          {canManageProject && (
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              + Plan a sprint
              <KbdKey tone="on-accent">S</KbdKey>
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="px-[28px] py-6">
      {/* Velocity panel */}
      {showVelocity && completedSprints.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-5 border-b border-rule mb-8">
          <div>
            <div className="smallcaps mb-2">Avg velocity · last 6</div>
            <div className="flex items-baseline gap-2">
              <MetricNumber size="xl">{avgVelocity}</MetricNumber>
              <span className="text-[14px] text-mute">pts</span>
            </div>
            <div className="text-[12px] text-mute mt-1">across last {recentCompleted.length} completed sprint{recentCompleted.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="md:col-span-1">
            <div className="smallcaps mb-2">Velocity by sprint</div>
            <VelocityChart
              sprints={[...completedSprints].reverse().slice(-8).map((s) => ({
                sprintNumber: s.sprintNumber,
                completedPoints: s.completedPoints || 0,
                status: s.status,
              }))}
              currentSprintNumber={activeSprint?.sprintNumber}
            />
          </div>
          {activeSprint && (
            <div>
              <div className="smallcaps mb-2">This sprint · S-{activeSprint.sprintNumber}</div>
              <div className="flex items-baseline gap-2">
                <MetricNumber size="lg">{activeSprint.completedPoints || 0}</MetricNumber>
                <span className="font-serif italic text-[18px] text-mute">of</span>
                <MetricNumber size="lg">{activeSprint.totalPoints || 0}</MetricNumber>
                <span className="text-[12px] text-mute">pts</span>
              </div>
              <div className="text-[12px] text-mute mt-1">day {dayOfSprint(activeSprint)} of {totalDays(activeSprint)}</div>
            </div>
          )}
        </div>
      )}

      {/* CURRENT */}
      {activeSprint && (
        <div className="mb-8">
          <Eyebrow className="mb-3">Current</Eyebrow>
          <SprintCard
            sprint={activeSprint}
            variant="active"
            projectId={projectId!}
            canManage={canManageProject}
            onComplete={() => handleComplete(activeSprint.id)}
            onCancel={() => setCancellingSprintId(activeSprint.id)}
            onNavigate={() => navigate(`/projects/${projectId}/sprints/${activeSprint.id}`)}
          />
        </div>
      )}

      {/* NEXT UP · PLANNING */}
      {planningSprint && (
        <div className="mb-8">
          <Eyebrow className="mb-3">Next up · Planning</Eyebrow>
          <SprintCard
            sprint={planningSprint}
            variant="planning"
            projectId={projectId!}
            canManage={canManageProject}
            hasActiveSprint={!!activeSprint}
            onStart={() => handleStart(planningSprint.id)}
            onCancel={() => setCancellingSprintId(planningSprint.id)}
            onNavigate={() => navigate(`/projects/${projectId}/sprints/${planningSprint.id}`)}
          />
        </div>
      )}

      {/* ARCHIVE */}
      {archivedSprints.length > 0 && (
        <div>
          <Eyebrow className="mb-3">
            Archive · {showAllSprints ? `all ${archivedSprints.length}` : 'last 12 weeks'}
          </Eyebrow>
          <div className="bg-card border border-rule">
            {/* Table header */}
            <div className="row-head flex items-center px-4">
              <div className="w-[40px]">#</div>
              <div className="flex-1">Goal</div>
              <div className="w-[160px]">Dates</div>
              <div className="w-[80px]">Velocity</div>
              <div className="w-[90px]">Status</div>
              <div className="w-[140px]">Team</div>
              <div className="w-[60px] text-right">Retro</div>
            </div>
            {recentArchive.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => navigate(`/projects/${projectId}/sprints/${s.id}`)}
                className="w-full flex items-center h-[44px] border-b border-rule px-4 text-[13px] hover:bg-paper transition-colors text-left last:border-b-0"
              >
                <div className="w-[40px] font-serif text-[18px] text-text">{s.sprintNumber}</div>
                <div className="flex-1 truncate text-text pr-3">{s.goal || s.name}</div>
                <div className="w-[160px] text-mute text-[12px]">{formatRange(s.startDate, s.endDate)}</div>
                <div className="w-[80px] font-mono text-[12px] text-text">{s.completedPoints || 0} pts</div>
                <div className="w-[90px]">
                  <StatusPill status={s.status === 'completed' ? 'shipped' : 'cancelled'} />
                </div>
                <div className="w-[140px]">
                  <AvatarStack users={s.assignees || []} max={5} size="xs" />
                </div>
                <div className="w-[60px] text-right">
                  {s.status === 'completed' ? (
                    <span
                      className="text-text underline decoration-rule underline-offset-2 text-[12px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${projectId}/sprints/${s.id}/retro`);
                      }}
                    >
                      open →
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Dialogs */}
      {showCreate && (
        <CreateSprintDialog
          projectId={projectId!}
          defaultDuration={defaultDuration}
          nextSprintNumber={Math.max(0, ...sprints.map((s) => s.sprintNumber)) + 1}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadSprints(); toast('Sprint created'); }}
        />
      )}

      {cancellingSprintId !== null && (
        <ConfirmDialog
          title="Cancel sprint"
          message={`Cancel "${cancellingName}"? All tasks will be moved to the backlog.`}
          confirmLabel="Cancel sprint"
          danger
          onConfirm={() => handleCancel(cancellingSprintId)}
          onCancel={() => setCancellingSprintId(null)}
        />
      )}
    </>
  );
}

interface SprintCardProps {
  sprint: Sprint;
  variant: 'active' | 'planning';
  projectId: string;
  canManage: boolean;
  hasActiveSprint?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onNavigate?: () => void;
}

function SprintCard({
  sprint,
  variant,
  projectId,
  canManage,
  hasActiveSprint,
  onStart,
  onComplete,
  onCancel,
  onNavigate,
}: SprintCardProps) {
  const navigate = useNavigate();
  const total = totalDays(sprint);
  const day = Math.min(dayOfSprint(sprint), total);
  const totalPoints = sprint.totalPoints || 0;
  const completedPoints = sprint.completedPoints || 0;
  const completedPct = totalPoints > 0 ? Math.min(100, Math.round((completedPoints / totalPoints) * 100)) : 0;
  const remaining = daysUntil(sprint.endDate);

  const counts = sprint.statusCounts || {};
  const openCount = counts.open ?? 0;
  const inProgressCount = counts.in_progress ?? 0;
  const doneCount = counts.done ?? 0;
  const totalItems = sprint.taskCount ?? (openCount + inProgressCount + doneCount);
  const added = sprint.scopeAdded ?? 0;
  const dropped = sprint.scopeDropped ?? 0;

  // Capacity for planning: target ~ defaultDuration * avg per day; we just show committed
  // We don't have a true capacity number; show committed pts and use a meter sized to itself.
  const capacityTarget = Math.max(totalPoints, 1);
  const meterSegments = 10;
  const meterFilled = Math.min(meterSegments, Math.round((totalPoints / capacityTarget) * meterSegments));

  const summaryParts: string[] = [];
  summaryParts.push(`${totalItems} on deck`);
  if (added > 0 || dropped > 0) {
    const scope: string[] = [];
    if (added > 0) scope.push(`+${added} added`);
    if (dropped > 0) scope.push(`−${dropped} dropped`);
    summaryParts.push(scope.join(', '));
  }

  return (
    <div
      className="bg-card border border-rule p-5 hover:border-text/30 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-baseline gap-3">
          <MetricNumber size="lg" className="text-text">{sprint.sprintNumber}</MetricNumber>
          <span className="text-[11px] text-mute tracking-[0.08em] uppercase">sprint</span>
          <StatusPill status={variant === 'active' ? 'active' : 'planning'} />
          <span className="font-mono text-[11px] text-faint">S-{sprint.sprintNumber}</span>
          <span className="text-[12px] text-mute">{formatRange(sprint.startDate, sprint.endDate)}</span>
          {variant === 'active' && (
            <span className="text-[12px] text-mute">· day {day}/{total}</span>
          )}
        </div>
      </div>

      {sprint.goal && (
        <div className="font-serif italic text-[15px] text-text mb-4">
          “{sprint.goal}”
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {sprint.assignees && sprint.assignees.length > 0 && (
          <AvatarStack users={sprint.assignees} max={6} size="sm" />
        )}
        <div className="text-[12px] text-mute">
          {summaryParts.join(' · ')}
        </div>
      </div>

      {variant === 'active' && (
        <>
          <div className="pbar accent w-full mb-2">
            <i style={{ width: `${completedPct}%` }} />
          </div>
          <div className="flex items-center gap-6 text-[12px] text-mute mb-4 flex-wrap">
            <div>
              <span className="text-faint">Work</span>{' '}
              <span className="font-semibold text-text">{completedPct}%</span>
            </div>
            <div>
              <span className="text-faint">Time</span>{' '}
              <span className="font-semibold text-text">day {day}/{total}</span>
            </div>
            <div>
              <span className="font-semibold text-text">{doneCount}</span> done
            </div>
            <div>
              <span className="font-semibold text-text">{inProgressCount}</span> WIP
            </div>
            <div>
              <span className="font-semibold text-text">{openCount}</span> open
            </div>
            <div className="ml-auto text-[12px] text-mute">
              {completedPoints} of {totalPoints} pts
            </div>
          </div>
        </>
      )}

      {variant === 'planning' && (
        <>
          <div className="meter w-full mb-2">
            {Array.from({ length: meterSegments }).map((_, i) => (
              <i key={i} className={i < meterFilled ? 'on' : ''} />
            ))}
          </div>
          <div className="flex items-center gap-6 text-[12px] text-mute mb-4 flex-wrap">
            <div>
              <span className="text-faint">Capacity</span>{' '}
              <span className="font-semibold text-text">{totalPoints} pts</span> committed
            </div>
            <div>
              <span className="font-semibold text-text">{totalItems}</span> items queued
            </div>
          </div>
        </>
      )}

      {canManage && (
        <div
          className="flex items-center gap-2 pt-3 border-t border-rule flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === 'active' && (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigate(`/projects/${projectId}/board`)}
              >
                Open board
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigate(`/projects/${projectId}/sprints/${sprint.id}`)}
              >
                Burndown
              </button>
              <Button size="sm" variant="success" onClick={onComplete}>
                Complete
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel sprint
              </Button>
              <span className="ml-auto text-[12px] text-mute">
                {remaining === 0 ? 'ends today' : `ends in ${remaining}d`}
              </span>
            </>
          )}
          {variant === 'planning' && (
            <>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => navigate(`/projects/${projectId}/sprints/${sprint.id}/planning`)}
              >
                Continue planning
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={onStart}
                disabled={hasActiveSprint}
                title={hasActiveSprint ? 'Another sprint is already active' : 'Start sprint'}
              >
                {sprint.startDate ? `Start now: ${formatDate(sprint.startDate)}` : 'Start now'}
              </button>
              <Button size="sm" variant="ghost" onClick={onCancel} className="ml-auto">
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CreateSprintDialog({ projectId, defaultDuration, nextSprintNumber, onClose, onCreated }: {
  projectId: string;
  defaultDuration: number;
  nextSprintNumber: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = todayStr();
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, defaultDuration));
  const [endDateTouched, setEndDateTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (!endDateTouched) {
      setEndDate(addDays(val, defaultDuration));
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setEndDateTouched(true);
  };

  const minEndDate = addDays(startDate, 1);
  const duration = daysBetween(startDate, endDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setError('');
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/sprints`, {
        goal: goal.trim(),
        startDate,
        endDate,
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create sprint');
    }
    setLoading(false);
  };

  const inputClass = "w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[16px] text-neutral-700";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold mb-4 text-neutral-700">Create Sprint {nextSprintNumber}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[16px] text-danger">{error}</div>}

          <div>
            <label className="block text-[16px] font-medium text-neutral-500 mb-1">Goal</label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="What should this sprint achieve?" required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[16px] font-medium text-neutral-500 mb-1">Start date</label>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} min={today} required className={inputClass} />
            </div>
            <div>
              <label className="block text-[16px] font-medium text-neutral-500 mb-1">End date</label>
              <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} min={minEndDate} required className={inputClass} />
            </div>
          </div>
          <p className="text-[16px] text-neutral-400">
            {duration} day{duration !== 1 ? 's' : ''} · Default: {defaultDuration} days
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
