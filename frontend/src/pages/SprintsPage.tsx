import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { BarChart3, Filter } from 'lucide-react';
import BurndownIcon from '@/assets/icons/charts.svg?react';
import { apiClient } from '../api/client';
import { toast } from '../components/common/Toast';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';
import { Eyebrow } from '../components/ui/Eyebrow';
import { PageHeader } from '../components/ui/PageHeader';
import { KbdKey } from '../components/ui/KbdKey';
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
  statusCounts?: { open?: number; in_progress?: number; in_review?: number; done?: number };
  scopeAdded?: number;
  scopeDropped?: number;
  blockedCount?: number;
  projectedPoints?: number;
  capacityPts?: number;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function formatRangeDash(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return `${formatDate(start)} — ${formatDate(end)}`;
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

function capacityVerdict(
  projected: number | undefined,
  capacity: number | undefined,
): string | null {
  if (!capacity || projected === undefined || projected === null) return null;
  if (capacity <= 0) return null;
  const tolerance = capacity * 0.05;
  if (Math.abs(projected - capacity) <= tolerance) return 'on capacity';
  if (projected < capacity * 0.9) return 'well under capacity';
  if (projected < capacity) return 'slightly under capacity';
  if (projected > capacity * 1.1) return 'well over capacity';
  return 'slightly over capacity';
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

  // Derived data
  const activeSprint = sprints.find((s) => s.status === 'active');
  const planningSprints = sprints
    .filter((s) => s.status === 'planning')
    .sort((a, b) => a.sprintNumber - b.sprintNumber);
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

  // Velocity baseline. If we have a prior 6-sprint window, use that.
  // Otherwise (≥4 completed) split the available completed sprints in
  // half and compare recent half vs older half — a noisier signal but
  // still meaningful for newer projects.
  const baselineDelta = (() => {
    if (completedSprints.length >= 7) {
      const baselineWindow = completedSprints.slice(6, 12);
      if (!baselineWindow.length) return null;
      const baselineAvg = Math.round(
        baselineWindow.reduce((sum, s) => sum + (s.completedPoints || 0), 0) /
          baselineWindow.length,
      );
      return baselineAvg > 0
        ? Math.round(((avgVelocity - baselineAvg) / baselineAvg) * 100)
        : null;
    }
    if (completedSprints.length >= 4) {
      const half = Math.floor(completedSprints.length / 2);
      const recentHalf = completedSprints.slice(0, completedSprints.length - half);
      const olderHalf = completedSprints.slice(completedSprints.length - half);
      const recentAvg = Math.round(
        recentHalf.reduce((s, x) => s + (x.completedPoints || 0), 0) /
          Math.max(1, recentHalf.length),
      );
      const olderAvg = Math.round(
        olderHalf.reduce((s, x) => s + (x.completedPoints || 0), 0) /
          Math.max(1, olderHalf.length),
      );
      return olderAvg > 0
        ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100)
        : null;
    }
    return null;
  })();

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
        <PageHeader className="flex items-end justify-between">
          <div>
            <Eyebrow>Project · Backstage · 0 sprints</Eyebrow>
            <h1 className="font-serif text-[36px] text-text mt-1">Sprints</h1>
          </div>
          {canManageProject && (
            <Button variant="ink" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
              + Plan a sprint
              <KbdKey tone="on-accent">S</KbdKey>
            </Button>
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
      <PageHeader className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Project · Backstage · {sprints.length} sprint{sprints.length === 1 ? '' : 's'}</Eyebrow>
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
            className={`btn-ghost inline-flex items-center gap-2 ${showVelocity ? 'bg-shade' : ''}`}
          >
            <BarChart3 size={14} aria-hidden />
            Velocity
          </button>
          <button
            type="button"
            onClick={() => setShowAllSprints((v) => !v)}
            className={`btn-ghost inline-flex items-center gap-2 ${showAllSprints ? 'bg-shade' : ''}`}
          >
            <Filter size={14} aria-hidden />
            All sprints
          </button>
          {canManageProject && (
            <Button variant="ink" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
              + Plan a sprint
              <KbdKey tone="on-accent">S</KbdKey>
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Velocity panel — full-width tinted strip with edge-to-edge bottom rule
          and explicit vertical dividers between the 3 columns. Mirrors the
          design's `grid-template-columns: 210px 1fr 220px` shell. */}
      {showVelocity && (
        <div className="bg-paper-2 border-b border-rule">
          <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)_280px]">
            {/* AVG VELOCITY · LAST N */}
            <div className="px-[22px] py-[18px] md:border-r md:border-rule">
              <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-mute mb-1.5">
                Avg velocity · last {Math.max(1, recentCompleted.length)}
              </div>
              {completedSprints.length > 0 ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-[38px] leading-none text-text">{avgVelocity}</span>
                    <span className="font-serif italic text-[14px] text-mute">pts</span>
                  </div>
                  <div className="text-[11px] mt-1.5 font-mono tracking-[-0.005em]">
                    {baselineDelta !== null ? (
                      <span className="text-lilac font-semibold">
                        {baselineDelta >= 0 ? '+' : ''}
                        {baselineDelta}% {baselineDelta >= 0 ? 'over' : 'under'} baseline
                      </span>
                    ) : (
                      <span className="text-mute">
                        across last {recentCompleted.length} completed sprint
                        {recentCompleted.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-[38px] leading-none text-faint">—</span>
                    <span className="font-serif italic text-[14px] text-mute">pts</span>
                  </div>
                  <div className="text-[11px] font-mono text-mute mt-1.5">
                    No completed sprints yet
                  </div>
                </>
              )}
            </div>

            {/* VELOCITY BY SPRINT — max 7, active last (rightmost) */}
            <div className="px-[24px] py-[14px] md:border-r md:border-rule">
              <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-mute mb-2">
                Velocity by sprint
              </div>
              {(completedSprints.length > 0 || activeSprint) ? (
                <VelocityChart
                  sprints={(() => {
                    // Build chronological series (oldest -> newest). Pick the
                    // most recent 7 sprints with the active sprint last when
                    // present, so the chart always anchors on "now".
                    const recent = [...completedSprints]
                      .sort((a, b) => a.sprintNumber - b.sprintNumber)
                      .slice(-6);
                    const series = activeSprint
                      ? [...recent, activeSprint]
                      : recent;
                    return series
                      .slice(-7)
                      .map((s) => ({
                        sprintNumber: s.sprintNumber,
                        completedPoints: s.completedPoints || 0,
                        status: s.status,
                      }));
                  })()}
                  currentSprintNumber={activeSprint?.sprintNumber}
                />
              ) : (
                <div className="flex items-end h-[56px]">
                  <span className="font-serif text-[38px] text-faint leading-none">—</span>
                </div>
              )}
            </div>

            {/* THIS SPRINT · S-N */}
            <div className="px-[22px] py-[18px]">
              <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-mute mb-1">
                This sprint{activeSprint ? ` · S-${activeSprint.sprintNumber}` : ''}
              </div>
              {activeSprint ? (
                <>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-serif text-[26px] leading-none text-lilac">{activeSprint.completedPoints || 0}</span>
                    <span className="font-serif italic text-[14px] text-mute">of {activeSprint.totalPoints || 0} pts</span>
                    <span className="font-mono text-[10.5px] text-mute">· day {dayOfSprint(activeSprint)}</span>
                  </div>
                  {(activeSprint.projectedPoints ?? null) !== null && (
                    <div className="font-mono text-[10.5px] text-mute mt-1">
                      Projected ·{' '}
                      <span className="text-lilac font-semibold">
                        {activeSprint.projectedPoints}
                      </span>{' '}
                      pts
                      {(() => {
                        const verdict = capacityVerdict(
                          activeSprint.projectedPoints,
                          activeSprint.capacityPts,
                        );
                        return verdict ? ` · ${verdict}` : null;
                      })()}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-[26px] text-faint leading-none">—</span>
                  <span className="font-serif italic text-[14px] text-mute">no active sprint</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-[28px] py-6">
      {/* CURRENT */}
      {activeSprint && (
        <div className="mb-8">
          <Eyebrow className="mb-3 text-lilac">Current</Eyebrow>
          <SprintCard
            sprint={activeSprint}
            variant="active"
            projectId={projectId!}
            canManage={canManageProject}
            onNavigate={() => navigate(`/projects/${projectId}/sprints/${activeSprint.id}`)}
          />
        </div>
      )}

      {/* NEXT UP · PLANNING */}
      <div className="mb-8">
        <Eyebrow className="mb-3">Next up · Planning</Eyebrow>
        {planningSprints.length > 0 ? (
          <div className="space-y-3">
            {planningSprints.map((ps) => (
              <SprintCard
                key={ps.id}
                sprint={ps}
                variant="planning"
                projectId={projectId!}
                canManage={canManageProject}
                hasActiveSprint={!!activeSprint}
                onStart={() => handleStart(ps.id)}
                onNavigate={() => navigate(`/projects/${projectId}/sprints/${ps.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-rule p-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-[13px] text-mute">
              Nothing queued. Plan your next sprint to set the next goal.
            </div>
            {canManageProject && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="btn-ghost"
              >
                + Plan a sprint
              </button>
            )}
          </div>
        )}
      </div>

      {/* ARCHIVE */}
      <div>
        <Eyebrow className="mb-3">
          Archive{archivedSprints.length > 0 ? ` · ${showAllSprints ? `all ${archivedSprints.length}` : 'last 12 weeks'}` : ''}
        </Eyebrow>
        {archivedSprints.length === 0 ? (
          <div className="bg-card border border-rule p-6 text-[13px] text-mute">
            Nothing shipped yet.
          </div>
        ) : (
          <table className="w-full bg-card border border-rule text-[13px]" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: 50 }} />
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr className="row-head text-left">
                <th className="px-4 font-medium">#</th>
                <th className="px-4 font-medium">Goal</th>
                <th className="px-4 font-medium">Dates</th>
                <th className="px-4 font-medium">Velocity</th>
                <th className="px-4 font-medium">Status</th>
                <th className="px-4 font-medium">Team</th>
                <th className="px-4 font-medium text-right">Retro</th>
              </tr>
            </thead>
            <tbody>
              {recentArchive.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/projects/${projectId}/sprints/${s.id}`)}
                  className="h-[52px] border-t border-rule hover:bg-paper transition-colors cursor-pointer"
                >
                  <td className="px-4 font-serif text-[18px] text-text">{s.sprintNumber}</td>
                  <td className="px-4 text-text truncate overflow-hidden">{s.goal || s.name}</td>
                  <td className="px-4 text-mute text-[12px] whitespace-nowrap">{formatRange(s.startDate, s.endDate)}</td>
                  <td className="px-4 font-mono text-[12px] text-text whitespace-nowrap">{s.completedPoints || 0} pts</td>
                  <td className="px-4 whitespace-nowrap overflow-hidden">
                    <StatusPill status={s.status === 'completed' ? 'shipped' : 'cancelled'} caps dot />
                  </td>
                  <td className="px-4 overflow-hidden">
                    <AvatarStack users={s.assignees || []} max={5} size="xs" />
                  </td>
                  <td className="px-4 text-right whitespace-nowrap">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
  onNavigate?: () => void;
}

function formatEndDateUpper(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

function formatStartLabel(d: string | null): string {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const md = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return `STARTS ${weekday} · ${md}`;
}

function SprintCard({
  sprint,
  variant,
  projectId,
  canManage,
  hasActiveSprint,
  onStart,
  onNavigate,
}: SprintCardProps) {
  const navigate = useNavigate();
  const total = totalDays(sprint);
  const day = Math.min(dayOfSprint(sprint), total);
  const totalPoints = sprint.totalPoints || 0;
  const completedPoints = sprint.completedPoints || 0;
  const completedPct = totalPoints > 0 ? Math.min(100, Math.round((completedPoints / totalPoints) * 100)) : 0;
  const timePct = Math.min(100, Math.round((day / total) * 100));
  const remaining = daysUntil(sprint.endDate);

  const counts = sprint.statusCounts || {};
  const openCount = counts.open ?? 0;
  const inProgressCount = counts.in_progress ?? 0;
  const inReviewCount = counts.in_review ?? 0;
  const doneCount = counts.done ?? 0;
  const wipCount = inProgressCount + inReviewCount;
  const totalItems = sprint.taskCount ?? (openCount + inProgressCount + inReviewCount + doneCount);
  const added = sprint.scopeAdded ?? 0;
  const dropped = sprint.scopeDropped ?? 0;
  const blockedCount = sprint.blockedCount ?? 0;

  // Planning capacity meter — prefer real capacityPts when present.
  const capacityPts = sprint.capacityPts ?? 0;
  const capacityTarget = Math.max(capacityPts, totalPoints, 1);
  const meterSegments = 10;
  const meterFilled = Math.min(
    meterSegments,
    Math.round((totalPoints / capacityTarget) * meterSegments),
  );

  // Scope summary (avatars + "N on deck · +X added, −Y dropped")
  const scopeParts: string[] = [`${totalItems} on deck`];
  if (added > 0 || dropped > 0) {
    const scope: string[] = [];
    if (added > 0) scope.push(`+${added} added`);
    if (dropped > 0) scope.push(`−${dropped} dropped`);
    scopeParts.push(scope.join(', '));
  }

  // Right-rail visual treatments differ per variant:
  //  • Active sprint  → lavender (paper-2) rail to echo the velocity strip
  //  • Planning sprint → plain paper rail
  const rightRailBg = variant === 'active' ? 'bg-paper-2' : 'bg-paper';
  // 4-col grid widths — design uses 320/220 for active and 220/180 for
  // planning (planning card is shorter because it has fewer metrics).
  const gridCols = variant === 'active'
    ? 'md:grid-cols-[52px_minmax(0,1fr)_320px_220px]'
    : 'md:grid-cols-[52px_minmax(0,1fr)_220px_180px]';

  return (
    <div
      className={`bg-card border border-rule grid grid-cols-1 ${gridCols} hover:border-text/30 transition-colors ${onNavigate ? 'cursor-pointer' : ''}`}
      onClick={onNavigate}
    >
      {/* LEFT — dark rail (52px) with number + 'SPRINT' eyebrow */}
      <div className="bg-text text-paper flex flex-col items-center justify-center py-5 md:py-0 shrink-0">
        <div className="font-serif text-[32px] leading-none">{sprint.sprintNumber}</div>
        <div className="mt-1.5 text-[9px] font-semibold tracking-[0.18em] uppercase text-paper/60">
          sprint
        </div>
      </div>

      {/* MIDDLE-LEFT — status row / italic goal / avatars + scope */}
      <div className="min-w-0 px-7 py-5 border-t md:border-t-0 md:border-l border-rule flex flex-col justify-center">
        <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
          <StatusPill status={variant === 'active' ? 'active' : 'planning'} caps dot />
          <span className="font-mono text-[11px] text-faint">S-{sprint.sprintNumber}</span>
          <span className="text-[12px] text-mute">
            · {formatRangeDash(sprint.startDate, sprint.endDate)}
          </span>
          {variant === 'active' && (
            <span className="text-[12px] text-lilac font-semibold">
              · day {day}/{total}
            </span>
          )}
        </div>

        {sprint.goal && (
          <div className="font-serif italic text-[22px] leading-[1.15] text-text mb-3">
            “{sprint.goal}”
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {sprint.assignees && sprint.assignees.length > 0 && (
            <AvatarStack users={sprint.assignees} max={6} size="sm" />
          )}
          <div className="text-[12px] text-mute">{scopeParts.join(' · ')}</div>
          {variant === 'active' && blockedCount > 0 && (
            <StatusPill status="blocked" hint={String(blockedCount)} caps dot />
          )}
        </div>
      </div>

      {/* MIDDLE-RIGHT — metrics / bars / stat strip (or capacity meter for planning) */}
      <div className="px-5 py-4 border-t md:border-t-0 md:border-l border-rule flex flex-col justify-center">
        {variant === 'active' && (
          <>
            <div className="flex items-baseline gap-2 mb-2.5">
              <span className="font-serif text-[26px] leading-none text-text">{completedPoints}</span>
              <span className="font-serif italic text-[14px] text-mute">of {totalPoints}</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-mute">pts done</span>
            </div>

            {/* WORK bar */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-mute">Work</span>
                <span className="font-mono text-[10.5px] text-text font-semibold">{completedPct}%</span>
              </div>
              <div className="pbar accent w-full">
                <i style={{ width: `${completedPct}%` }} />
              </div>
            </div>

            {/* TIME bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-mute">Time</span>
                <span className="font-mono text-[10.5px] text-text">
                  day <span className="font-semibold">{day}/{total}</span>
                </span>
              </div>
              <div className="pbar w-full">
                <i style={{ width: `${timePct}%` }} />
              </div>
            </div>

            <div className="flex items-center gap-5 text-[11.5px] text-mute flex-wrap">
              <div>
                <span className="font-semibold text-text">{doneCount}</span> done
              </div>
              <div>
                <span className="font-semibold text-text">{wipCount}</span> WIP
              </div>
              <div>
                <span className="font-semibold text-text">{openCount}</span> open
              </div>
            </div>
          </>
        )}

        {variant === 'planning' && (
          <>
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-mute mb-2">
              Capacity
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-serif text-[26px] leading-none text-text">{totalPoints}</span>
              {capacityPts > 0 ? (
                <span className="font-serif italic text-[13px] text-mute">
                  of {capacityPts} pts committed
                </span>
              ) : (
                <span className="font-serif italic text-[13px] text-mute">
                  pts committed
                </span>
              )}
            </div>
            <div className="meter w-full mb-2.5">
              {Array.from({ length: meterSegments }).map((_, i) => (
                <i key={i} className={i < meterFilled ? 'on' : ''} />
              ))}
            </div>
            <div className="text-[11.5px] text-mute">
              {totalItems} item{totalItems === 1 ? '' : 's'} queued
              {sprint.assignees && sprint.assignees.length > 0 && (
                <> · velocity {Math.round((completedPoints + totalPoints) / 2) || totalPoints} pts</>
              )}
            </div>
          </>
        )}
      </div>

      {/* RIGHT — light rail (buttons + footer) */}
      <div
        className={`border-t md:border-t-0 md:border-l border-rule ${rightRailBg} px-[18px] py-[14px] flex flex-col justify-center gap-2`}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'active' && (
          <>
            <button
              type="button"
              className="btn justify-between w-full"
              onClick={() => navigate(`/projects/${projectId}/board?sprint=${sprint.id}`)}
            >
              <span>Open board</span>
              <span aria-hidden>→</span>
            </button>
            <button
              type="button"
              className="btn-ghost justify-center w-full"
              onClick={() => navigate(`/projects/${projectId}/sprints/${sprint.id}`)}
            >
              <BurndownIcon width={14} height={14} aria-hidden />
              <span>Burndown</span>
            </button>
            <div className="mt-1 text-[9.5px] font-mono font-semibold tracking-[0.06em] uppercase text-mute text-center">
              {remaining === 0 ? 'ENDS TODAY' : `ENDS IN ${remaining}D`}
              {sprint.endDate && (
                <> · {formatEndDateUpper(sprint.endDate)}</>
              )}
            </div>
          </>
        )}

        {variant === 'planning' && (
          <>
            {canManage ? (
              <>
                <button
                  type="button"
                  className="btn btn-accent justify-center w-full"
                  onClick={() => navigate(`/projects/${projectId}/sprints/${sprint.id}/planning`)}
                >
                  Continue planning
                </button>
                <button
                  type="button"
                  className="btn-ghost justify-center w-full"
                  onClick={onStart}
                  disabled={hasActiveSprint}
                  title={hasActiveSprint ? 'Another sprint is already active' : 'Start sprint'}
                >
                  Start now
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost justify-center w-full"
                onClick={() => navigate(`/projects/${projectId}/sprints/${sprint.id}`)}
              >
                View
              </button>
            )}
            <div className="mt-1 text-[9.5px] font-mono font-semibold tracking-[0.06em] uppercase text-mute text-center">
              {sprint.startDate ? formatStartLabel(sprint.startDate) : 'NOT SCHEDULED'}
            </div>
          </>
        )}
      </div>
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
              <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} min={today} required className={inputClass} />
            </div>
            <div>
              <label className="block text-[16px] font-medium text-neutral-500 mb-1">End date</label>
              <Input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} min={minEndDate} required className={inputClass} />
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
