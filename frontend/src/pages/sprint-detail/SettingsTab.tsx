import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { Textarea } from '../../components/ui/Textarea';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useRole } from '../../hooks/useRole';
import { toast } from '../../components/common/Toast';
import { SettingsSidebar } from './SettingsSidebar';
import type { SprintDetail } from '../SprintDetailPage';

interface SettingsTabProps {
  sprint: SprintDetail;
  onSaved: () => void;
}

type CarryPolicy = 'roll' | 'backlog' | 'ask';

const LENGTH_OPTIONS = [5, 7, 10, 14, 21, 28];
const CARRY_OPTIONS: Array<{ key: CarryPolicy; label: string }> = [
  { key: 'roll', label: 'Roll into next sprint' },
  { key: 'backlog', label: 'Move to backlog' },
  { key: 'ask', label: 'Ask each time' },
];

/**
 * Sprint Detail Settings tab. Form-driven configuration page for goal,
 * schedule, carry-over policy, capacity, and operational controls
 * (complete / cancel). Sections gate edits based on:
 *   - role (only project managers / admins can edit)
 *   - sprint status (completed / cancelled lock everything; active locks
 *     dates; cancelled also locks the goal).
 * Auto-saves each field on blur or selection. The right rail renders the
 * `SettingsSidebar` with sprint identity + audit metadata.
 */
export function SettingsTab({ sprint, onSaved }: SettingsTabProps) {
  const { canManageProject } = useRole();
  const readOnly = !canManageProject;
  const isLocked = sprint.status === 'completed' || sprint.status === 'cancelled';

  const [goal, setGoal] = useState(sprint.goal ?? '');
  const [startDate, setStartDate] = useState(sprint.startDate ?? '');
  const [endDate, setEndDate] = useState(sprint.endDate ?? '');
  const [policy, setPolicy] = useState<CarryPolicy>(sprint.carryOverPolicy ?? 'ask');
  const [capacity, setCapacity] = useState<number | null>(sprint.capacity);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  // Re-sync local form state when the sprint prop refreshes (e.g. after a save
  // or an operation that mutates the sprint server-side).
  useEffect(() => {
    setGoal(sprint.goal ?? '');
    setStartDate(sprint.startDate ?? '');
    setEndDate(sprint.endDate ?? '');
    setPolicy(sprint.carryOverPolicy ?? 'ask');
    setCapacity(sprint.capacity);
  }, [
    sprint.id,
    sprint.goal,
    sprint.startDate,
    sprint.endDate,
    sprint.carryOverPolicy,
    sprint.capacity,
  ]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      await apiClient.put(`/projects/${sprint.projectId}/sprints/${sprint.id}`, patch);
      onSaved();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Save failed', 'error');
    }
  };

  const lengthDays =
    startDate && endDate
      ? Math.max(
          1,
          Math.ceil(
            (Date.parse(endDate + 'T00:00:00') - Date.parse(startDate + 'T00:00:00')) /
              86_400_000,
          ),
        )
      : 0;

  const onLengthChange = (days: number) => {
    if (!startDate) return;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const newEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setEndDate(newEnd);
    save({ endDate: newEnd });
  };

  const onComplete = async () => {
    setShowComplete(false);
    try {
      await apiClient.post(`/projects/${sprint.projectId}/sprints/${sprint.id}/complete`);
      toast('Sprint completed');
      onSaved();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to complete', 'error');
    }
  };

  const onCancelSprint = async () => {
    setShowCancel(false);
    try {
      await apiClient.post(`/projects/${sprint.projectId}/sprints/${sprint.id}/cancel`);
      toast('Sprint cancelled');
      onSaved();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to cancel', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 min-w-0 overflow-y-auto py-6 px-[28px]">
        <div className="space-y-8">
        {/* Sprint goal */}
        <section>
          <h2 className="font-serif text-[20px] text-text">Sprint goal</h2>
          <p className="text-[13px] text-mute mb-2">
            One sentence — what does shipping this sprint mean for users?
          </p>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => {
              if (goal !== (sprint.goal ?? '')) save({ goal });
            }}
            disabled={readOnly || sprint.status === 'cancelled' || sprint.status === 'completed'}
            rows={3}
            className="font-serif italic"
          />
        </section>

        {/* Schedule */}
        <section>
          <h2 className="font-serif text-[20px] text-text">Schedule</h2>
          <p className="text-[13px] text-mute mb-2">
            Sprint length is fixed once a sprint is active. To change it, complete this sprint and
            start a new one.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <FieldLabel label="Start">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onBlur={() => {
                  if (startDate === (sprint.startDate ?? '')) return;
                  if (startDate && endDate && startDate > endDate) {
                    toast('Start date cannot be after end date', 'error');
                    setStartDate(sprint.startDate ?? '');
                    return;
                  }
                  save({ startDate });
                }}
                disabled={readOnly || sprint.status !== 'planning'}
              />
            </FieldLabel>
            <FieldLabel label="End">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onBlur={() => {
                  if (endDate === (sprint.endDate ?? '')) return;
                  if (startDate && endDate && endDate < startDate) {
                    toast('End date cannot be before start date', 'error');
                    setEndDate(sprint.endDate ?? '');
                    return;
                  }
                  save({ endDate });
                }}
                disabled={readOnly || sprint.status !== 'planning'}
              />
            </FieldLabel>
            <FieldLabel label="Length">
              <Select
                value={lengthDays > 0 ? String(lengthDays) : ''}
                onChange={(v) => onLengthChange(Number(v))}
                options={(lengthDays > 0 && !LENGTH_OPTIONS.includes(lengthDays)
                  ? [...LENGTH_OPTIONS, lengthDays].sort((a, b) => a - b)
                  : LENGTH_OPTIONS
                ).map((d) => ({ value: String(d), label: `${d} days` }))}
                placeholder="—"
                className={`w-full ${
                  readOnly || sprint.status !== 'planning'
                    ? 'opacity-60 cursor-not-allowed pointer-events-none'
                    : ''
                }`}
              />
            </FieldLabel>
          </div>
        </section>

        {/* Carry-over policy */}
        <section>
          <h2 className="font-serif text-[20px] text-text">Carry-over policy</h2>
          <p className="text-[13px] text-mute mb-2">
            What happens to In-progress / In-review items when this sprint completes.
          </p>
          <div className={`flex w-full items-center gap-0.5 bg-lilac-tint/50 p-0.5 rounded-md ${readOnly || isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            {CARRY_OPTIONS.map((opt) => {
              const selected = policy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPolicy(opt.key);
                    save({ carryOverPolicy: opt.key });
                  }}
                  disabled={readOnly || isLocked}
                  className={`h-[28px] px-3 text-[12px] rounded transition-colors ${
                    selected
                      ? 'bg-card shadow-sm text-text font-medium'
                      : 'text-mute hover:text-text'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Capacity */}
        <section>
          <h2 className="font-serif text-[20px] text-text">Capacity</h2>
          <p className="text-[13px] text-mute mb-2">
            Trackero estimates from your team's velocity. Override to set a fixed cap.
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={capacity ?? sprint.autoCapacity}
              onChange={(e) => {
                const v = e.target.value;
                setCapacity(v === '' ? null : Number(v));
              }}
              onBlur={() => {
                if (capacity !== sprint.capacity) save({ capacity });
              }}
              disabled={readOnly || isLocked}
              className="!w-[70px] text-center font-mono"
            />
            <span className="text-[13px] text-mute">
              points · auto:{' '}
              <span className="font-semibold text-text">{sprint.autoCapacity}</span> based on last 3
              sprints
            </span>
            {capacity != null && capacity !== sprint.autoCapacity && !readOnly && !isLocked && (
              <button
                type="button"
                className="ml-auto h-[28px] px-3 text-[12px] border border-rule rounded text-text hover:bg-paper-2 transition-colors"
                onClick={() => {
                  setCapacity(null);
                  save({ capacity: null });
                }}
              >
                Reset to auto
              </button>
            )}
          </div>
        </section>

        {/* Sprint operations */}
        {!readOnly && (sprint.status === 'active' || sprint.status === 'planning') && (
          <section>
            <h2 className="font-serif text-[20px] text-text">Sprint operations</h2>
            <p className="text-[13px] text-mute mb-2">
              Operational controls. Some are irreversible.
            </p>
            <div className="border border-rule divide-y divide-rule">
              {sprint.status === 'active' && (
                <OpRow
                  title="Complete sprint now"
                  desc="Mark all done items as shipped. Move WIP per the carry-over policy. Open the retro."
                >
                  <button
                    type="button"
                    onClick={() => setShowComplete(true)}
                    className="h-[30px] px-3 text-[12px] border border-rule-2 bg-transparent text-text hover:bg-paper-2 transition-colors"
                  >
                    Complete…
                  </button>
                </OpRow>
              )}
              <OpRow
                title="Cancel this sprint"
                desc="Use when the sprint is no longer relevant. Items return to the backlog; the sprint is preserved for the record."
              >
                <button
                  type="button"
                  onClick={() => setShowCancel(true)}
                  className="h-[30px] px-3 text-[12px] border border-danger bg-transparent text-danger hover:bg-paper-2 transition-colors"
                >
                  Cancel…
                </button>
              </OpRow>
            </div>
          </section>
        )}

        {showComplete && (
          <ConfirmDialog
            title="Complete this sprint?"
            message="Done items will ship. WIP follows the carry-over policy. This will also open the retro."
            confirmLabel="Complete"
            onConfirm={onComplete}
            onCancel={() => setShowComplete(false)}
          />
        )}
        {showCancel && (
          <ConfirmDialog
            title="Cancel this sprint?"
            message="Items return to the backlog. The sprint is preserved for the record."
            confirmLabel="Cancel sprint"
            danger
            onConfirm={onCancelSprint}
            onCancel={() => setShowCancel(false)}
          />
        )}
        </div>
      </main>

      <SettingsSidebar sprint={sprint} />
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-mute uppercase tracking-[0.1em] mb-1">{label}</p>
      {children}
    </div>
  );
}

function OpRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] font-semibold text-text">{title}</p>
        <p className="text-[12px] text-mute mt-1">{desc}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
