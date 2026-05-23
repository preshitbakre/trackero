import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { toast } from '../components/common/Toast';
import { useRole } from '../hooks/useRole';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { createPortal } from 'react-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';

interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  sprintNumber: number;
  startDate: string | null;
  endDate: string | null;
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(start: string, end: string): number {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
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
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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

  const hasActiveSprint = sprints.some((s) => s.status === 'active');
  const cancellingName = sprints.find((s) => s.id === cancellingSprintId)?.name || '';


  const STATUS_ACCENT: Record<string, { border: string; bg: string; badge: string; badgeText: string; label: string }> = {
    planning: { border: '#88A9D6', bg: '#FFFFFF', badge: '#88A9D630', badgeText: '#3F5E8E', label: 'Planning' },
    active: { border: '#88D68E', bg: '#FFFFFF', badge: '#88D68E35', badgeText: '#3E8E44', label: 'Active' },
    completed: { border: '#D1CCC7', bg: '#FFFFFF', badge: '#D1CCC725', badgeText: '#7E7770', label: 'Completed' },
    cancelled: { border: '#E05252', bg: '#FFFFFF', badge: '#E0525220', badgeText: '#E05252', label: 'Cancelled' },
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-[28px] text-text dark:text-dneutral-700">Sprints</h1>
          <p className="text-[14px] text-neutral-400 mt-0.5">{sprints.length} sprint{sprints.length !== 1 ? 's' : ''} · {sprints.filter(s => s.status === 'active').length} active</p>
        </div>
        {canManageProject && (
          <Button onClick={() => setShowCreate(true)} className="shadow-[0_2px_8px_rgba(136,169,214,0.3)]">+ Create Sprint</Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load sprints" onRetry={loadSprints} />
      ) : sprints.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#88A9D620' }}>
            <svg className="w-8 h-8" style={{ color: '#3F5E8E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </div>
          <h3 className="text-[16px] font-medium text-neutral-500 mb-1">No sprints yet</h3>
          <p className="text-[14px] text-neutral-400 mb-4">Create a sprint to start planning your work</p>
          {canManageProject && <Button onClick={() => setShowCreate(true)}>+ Create Sprint</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sprints.map((sprint) => {
            const accent = STATUS_ACCENT[sprint.status] || STATUS_ACCENT.planning;
            const daysLeft = sprint.status === 'active' && sprint.endDate
              ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86400000))
              : null;
            return (
              <div
                key={sprint.id}
                className="flex flex-col rounded-xl bg-white dark:bg-dneutral-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-150 overflow-hidden"
              >
                {/* Colored top bar */}
                <div className="h-1.5" style={{ background: accent.border }} />

                <div className="p-5 flex flex-col flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide" style={{ background: accent.badge, color: accent.badgeText }}>
                      {accent.label}
                    </span>
                    {daysLeft !== null && (
                      <span className="text-[14px] font-medium ml-auto" style={{ color: daysLeft <= 3 ? '#E05252' : '#D6B588' }}>
                        {daysLeft === 0 ? 'Ends today' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-[18px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-1">{sprint.name}</h3>

                  {/* Goal */}
                  {sprint.goal && (
                    <p className="text-[14px] text-neutral-500 dark:text-dneutral-500 mb-2 line-clamp-2">{sprint.goal}</p>
                  )}

                  {/* Dates */}
                  {sprint.startDate && sprint.endDate && (
                    <p className="text-[14px] text-neutral-400 dark:text-dneutral-500 mb-4">
                      {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)} · {daysBetween(sprint.startDate, sprint.endDate)} days
                    </p>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Actions */}
                  {canManageProject && (
                    <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-neutral-100 dark:border-dneutral-200">
                      {sprint.status === 'planning' && (
                        <>
                          <Link
                            to={`/projects/${projectId}/sprints/${sprint.id}/planning`}
                            className="inline-flex items-center h-[30px] px-4 text-[14px] font-medium rounded-md"
                            style={{ background: '#88A9D620', color: '#3F5E8E' }}
                          >
                            Plan
                          </Link>
                          <Button size="sm" variant="success" onClick={() => handleStart(sprint.id)} disabled={hasActiveSprint} title={hasActiveSprint ? 'Another sprint is already active' : 'Start sprint'}>
                            Start
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setCancellingSprintId(sprint.id)}>
                            Cancel
                          </Button>
                        </>
                      )}
                      {sprint.status === 'active' && (
                        <>
                          <Button size="sm" variant="success" onClick={() => handleComplete(sprint.id)}>
                            Complete
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setCancellingSprintId(sprint.id)}>
                            Cancel
                          </Button>
                        </>
                      )}
                      {(sprint.status === 'completed' || sprint.status === 'active') && (
                        <Link
                          to={`/projects/${projectId}/sprints/${sprint.id}/retro`}
                          className="inline-flex items-center h-[30px] px-4 text-[14px] font-medium rounded-md"
                          style={{ background: '#D688D020', color: '#8E3E88' }}
                        >
                          Retro
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateSprintDialog
          projectId={projectId!}
          defaultDuration={defaultDuration}
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
    </div>
  );
}

function CreateSprintDialog({ projectId, defaultDuration, onClose, onCreated }: {
  projectId: string;
  defaultDuration: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = todayStr();
  const [name, setName] = useState('');
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
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/sprints`, {
        name: name.trim(),
        goal: goal.trim() || undefined,
        startDate,
        endDate,
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create sprint');
    }
    setLoading(false);
  };

  const inputClass = "w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-[16px] text-neutral-700 dark:text-dneutral-700";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Create Sprint</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-[16px] text-danger">{error}</div>}

          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Sprint name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} autoFocus placeholder="e.g. Sprint 1" />
          </div>

          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Goal (optional)</label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="What should this sprint achieve?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Start date</label>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} min={today} required className={inputClass} />
            </div>
            <div>
              <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">End date</label>
              <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} min={minEndDate} required className={inputClass} />
            </div>
          </div>
          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500">
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
