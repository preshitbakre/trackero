import { useState } from 'react';
import type { EpicDetail } from '../../api/epics';
import { updateEpic, shipEpic, reopenEpic, archiveEpic, detachEpicChildren } from '../../api/epics';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ColorPicker } from '../../components/epics/ColorPicker';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { toast } from '../../components/common/Toast';

interface Props {
  epic: EpicDetail;
  projectId: string;
  canEdit: boolean;
  onChanged: () => void;
  onArchived: () => void;
}

type Confirm = 'ship' | 'reopen' | 'detach' | 'archive' | null;

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="py-6 border-t border-rule first:border-t-0">
      <h2 className="font-serif text-[22px] text-text">{title}</h2>
      <p className="text-[13px] text-mute mb-4">{help}</p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] uppercase text-faint mb-1">{label}</p>
      {children}
    </div>
  );
}

export function SettingsTab({ epic, projectId, canEdit, onChanged, onArchived }: Props) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description ?? '');
  const [color, setColor] = useState(epic.color);
  const [startDate, setStartDate] = useState(epic.startDate ?? '');
  const [endDate, setEndDate] = useState(epic.endDate ?? '');
  const [state, setState] = useState(epic.epicState);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const shipped = epic.epicState === 'shipped';

  const save = async (patch: Parameters<typeof updateEpic>[2]) => {
    try {
      await updateEpic(projectId, epic.id, patch);
      toast('Saved');
      onChanged();
    } catch {
      toast('Failed to save', 'error');
    }
  };

  const runConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    try {
      if (action === 'ship') {
        await shipEpic(projectId, epic.id);
        toast('Epic shipped');
        onChanged();
      } else if (action === 'reopen') {
        await reopenEpic(projectId, epic.id);
        toast('Epic reopened');
        onChanged();
      } else if (action === 'detach') {
        const res = await detachEpicChildren(projectId, epic.id);
        toast(`Detached ${res.detached} item(s)`);
        onChanged();
      } else if (action === 'archive') {
        await archiveEpic(projectId, epic.id);
        toast('Epic archived');
        onArchived();
      }
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Operation failed', 'error');
    }
  };

  const disabled = !canEdit;

  return (
    <div className="max-w-[680px]">
      <Section title="Identity" help="What this epic is called and where it lives.">
        <div className="grid grid-cols-[1fr_180px] gap-4">
          <Field label="Title">
            <Input
              value={title}
              disabled={disabled}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== epic.title && save({ title })}
            />
          </Field>
          <Field label="Color">
            <ColorPicker
              value={color}
              onChange={(c) => {
                setColor(c);
                save({ color: c });
              }}
            />
          </Field>
        </div>
      </Section>

      <Section title="Brief / why" help="A one-paragraph why. This shows on the Overview.">
        <Textarea
          value={description}
          disabled={disabled}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (epic.description ?? '') && save({ description })}
        />
      </Section>

      <Section title="Scope" help="Dates are optional — but a target keeps the team honest.">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Start">
            <Input
              type="date"
              value={startDate}
              disabled={disabled}
              onChange={(e) => setStartDate(e.target.value)}
              onBlur={() => startDate !== (epic.startDate ?? '') && save({ startDate: startDate || null })}
            />
          </Field>
          <Field label="Target">
            <Input
              type="date"
              value={endDate}
              disabled={disabled}
              onChange={(e) => setEndDate(e.target.value)}
              onBlur={() => endDate !== (epic.endDate ?? '') && save({ endDate: endDate || null })}
            />
          </Field>
          <Field label="State">
            {shipped ? (
              <div className="h-[30px] flex items-center text-[13px] text-mute">Shipped</div>
            ) : (
              <Select
                value={state}
                onChange={(v) => {
                  setState(v as any);
                  save({ epicState: v as any });
                }}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'planning', label: 'Planning' },
                  { value: 'in_flight', label: 'In flight' },
                ]}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Operations" help="Operational controls. Some are irreversible.">
        <div className="space-y-px">
          <OpRow
            icon="✓"
            title={shipped ? 'Reopen epic' : 'Mark epic as shipped'}
            desc={
              shipped
                ? 'Move the epic back to In flight.'
                : 'All children must be Done or moved out. The epic moves to the Shipped section.'
            }
            button={
              <Button size="sm" variant={shipped ? 'secondary' : 'ink'} disabled={disabled} onClick={() => setConfirm(shipped ? 'reopen' : 'ship')}>
                {shipped ? 'Reopen' : 'Ship epic…'}
              </Button>
            }
          />
          <OpRow
            icon="↩"
            title="Move children to backlog"
            desc="Detach all child items. They keep their data, lose their parent."
            button={
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setConfirm('detach')}>
                Detach…
              </Button>
            }
          />
          <OpRow
            icon="⚠"
            title="Archive epic"
            desc="Read-only. Survives in history; doesn't show up in filters."
            warn
            button={
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setConfirm('archive')}>
                Archive…
              </Button>
            }
          />
        </div>
      </Section>

      {confirm && (
        <ConfirmDialog
          title={
            confirm === 'ship'
              ? 'Ship this epic?'
              : confirm === 'reopen'
                ? 'Reopen this epic?'
                : confirm === 'detach'
                  ? 'Detach all children?'
                  : 'Archive this epic?'
          }
          message={
            confirm === 'ship'
              ? 'All children must be Done or moved out. The epic moves to the Shipped section.'
              : confirm === 'reopen'
                ? 'The epic returns to In flight.'
                : confirm === 'detach'
                  ? 'All child items keep their data but lose their parent.'
                  : 'The epic becomes read-only and disappears from filters.'
          }
          confirmLabel={confirm === 'archive' || confirm === 'detach' ? 'Confirm' : 'Yes'}
          danger={confirm === 'archive' || confirm === 'detach'}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function OpRow({
  icon,
  title,
  desc,
  button,
  warn,
}: {
  icon: string;
  title: string;
  desc: string;
  button: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${warn ? 'bg-[#E0525208]' : 'bg-card'} shadow-[0_1px_0_var(--rule,#E8E3F0)]`}>
      <span className={`text-[14px] ${warn ? 'text-[#E05252]' : 'text-mute'}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-medium ${warn ? 'text-[#E05252]' : 'text-text'}`}>{title}</p>
        <p className="text-[13px] text-mute">{desc}</p>
      </div>
      {button}
    </div>
  );
}
