import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../components/common/Toast';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { createPortal } from 'react-dom';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';

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
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === 'admin' || user?.role === 'project_manager';
  const [cancellingSprintId, setCancellingSprintId] = useState<number | null>(null);

  useEffect(() => {
    loadSprints();
    apiClient.get(`/projects/${projectId}`).then((res) => {
      setDefaultDuration(res.data.data.defaultSprintDuration || 14);
    }).catch(() => {});
  }, [projectId]);

  const loadSprints = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints`);
      setSprints(data.data.list || []);
    } catch {}
  };

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

  const statusColors: Record<string, string> = {
    planning: 'bg-primary-100 dark:bg-dprimary-100 text-primary-700 dark:text-dprimary-500',
    active: 'bg-secondary-100 dark:bg-dsecondary-100 text-secondary-700 dark:text-dsecondary-600',
    completed: 'bg-neutral-100 dark:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500',
    cancelled: 'bg-danger/10 text-danger',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Sprints</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600"
          >
            Create Sprint
          </button>
        )}
      </div>

      {sprints.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 dark:text-dneutral-500">
          <p>Create a sprint to start planning your work</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sprints.map((sprint) => (
            <div key={sprint.id} className="p-4 rounded-lg border border-neutral-200 dark:border-dneutral-200">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-neutral-700 dark:text-dneutral-700">{sprint.name}</h3>
                    <span className={`text-sm px-2 py-0.5 rounded ${statusColors[sprint.status]}`}>{sprint.status}</span>
                  </div>
                  {sprint.goal && (
                    <p className="text-sm text-neutral-400 dark:text-dneutral-500 mb-1">{sprint.goal}</p>
                  )}
                  {sprint.startDate && sprint.endDate && (
                    <p className="text-sm text-neutral-400 dark:text-dneutral-500">
                      {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)} · {daysBetween(sprint.startDate, sprint.endDate)} days
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {sprint.status === 'planning' && (
                      <>
                        <Link
                          to={`/projects/${projectId}/sprints/${sprint.id}/planning`}
                          className="text-sm px-2 py-1 bg-primary-100 dark:bg-dprimary-100 text-primary-700 dark:text-dprimary-500 rounded hover:bg-primary-200"
                        >
                          Plan
                        </Link>
                        <button
                          onClick={() => handleStart(sprint.id)}
                          disabled={hasActiveSprint}
                          title={hasActiveSprint ? 'Another sprint is already active' : 'Start sprint'}
                          className="text-sm px-2 py-1 bg-success text-white rounded hover:bg-success/90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Start
                        </button>
                        <button
                          onClick={() => setCancellingSprintId(sprint.id)}
                          className="text-sm px-2 py-1 text-danger border border-danger rounded hover:bg-danger/10"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {sprint.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleComplete(sprint.id)}
                          className="text-sm px-2 py-1 bg-primary-500 text-white rounded hover:bg-primary-600"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => setCancellingSprintId(sprint.id)}
                          className="text-sm px-2 py-1 text-danger border border-danger rounded hover:bg-danger/10"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {(sprint.status === 'completed' || sprint.status === 'active') && (
                      <Link
                        to={`/projects/${projectId}/sprints/${sprint.id}/retro`}
                        className="text-sm px-2 py-1 bg-primary-100 dark:bg-dprimary-100 text-primary-600 dark:text-dprimary-500 rounded hover:bg-primary-200"
                      >
                        Retro
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
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

  const inputClass = "w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-neutral-50 dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Create Sprint</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-danger">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Sprint name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} autoFocus placeholder="e.g. Sprint 1" />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Goal (optional)</label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="What should this sprint achieve?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Start date</label>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} min={today} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">End date</label>
              <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} min={minEndDate} required className={inputClass} />
            </div>
          </div>
          <p className="text-sm text-neutral-400 dark:text-dneutral-500">
            {duration} day{duration !== 1 ? 's' : ''} · Default: {defaultDuration} days
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 dark:text-dneutral-500 hover:text-neutral-700">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
