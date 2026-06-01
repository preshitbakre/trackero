import { useState } from 'react';
import type { EpicDetail } from '../../api/epics';
import { updateEpic, shipEpic, reopenEpic, archiveEpic, detachEpicChildren } from '../../api/epics';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Eyebrow } from '../../components/ui/Eyebrow';
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

/**
 * Section wrapper — serif heading + help line. Matches the design's
 * "Identity / Scope / Operations" rhythm (18px serif heading, 12px mute
 * help, generous vertical space between sections, no top border on first).
 */
function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-8 first:pt-0">
      <h2 className="font-serif text-[18px] leading-[1.4] tracking-[-0.36px] text-text">
        {title}
      </h2>
      <p className="text-[12px] text-mute mt-1">{help}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Smallcaps-eyebrow + control. Eyebrow is the same 10px / 600 / 1.2px
 * tracking style used across the app (Eyebrow size="sm").
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow size="sm">{label}</Eyebrow>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function SettingsTab({ epic, projectId, canEdit, onChanged, onArchived }: Props) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description ?? '');
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
    <div className="w-full">
      {/*
        Identity section — covers Title AND Brief/Why. They share the same
        section heading per the design (no second serif heading, no extra
        divider between them).
      */}
      <Section title="Identity" help="What this epic is called and where it lives.">
        <div className="space-y-5">
          <Field label="Title">
            <Input
              value={title}
              disabled={disabled}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== epic.title && save({ title })}
            />
          </Field>

          <Field label="Brief / Why">
            <Textarea
              value={description}
              disabled={disabled}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() =>
                description !== (epic.description ?? '') && save({ description })
              }
            />
          </Field>
        </div>
      </Section>

      <Section title="Scope" help="Dates are optional — but a target keeps the team honest.">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Start">
            <Input
              type="date"
              value={startDate}
              disabled={disabled}
              onChange={(e) => setStartDate(e.target.value)}
              onBlur={() => {
                if (startDate === (epic.startDate ?? '')) return;
                if (startDate && endDate && startDate > endDate) {
                  toast('Start date cannot be after target date', 'error');
                  setStartDate(epic.startDate ?? '');
                  return;
                }
                save({ startDate: startDate || null });
              }}
            />
          </Field>
          <Field label="Target">
            <Input
              type="date"
              value={endDate}
              disabled={disabled}
              onChange={(e) => setEndDate(e.target.value)}
              onBlur={() => {
                if (endDate === (epic.endDate ?? '')) return;
                if (startDate && endDate && endDate < startDate) {
                  toast('Target date cannot be before start date', 'error');
                  setEndDate(epic.endDate ?? '');
                  return;
                }
                save({ endDate: endDate || null });
              }}
            />
          </Field>
          <Field label="State">
            {shipped ? (
              <div className="h-[38px] flex items-center text-[14px] text-mute">
                Shipped
              </div>
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
        <div className="space-y-3">
          <OpCard
            icon="✓"
            title={shipped ? 'Reopen epic' : 'Mark epic as shipped'}
            desc={
              shipped
                ? 'Move the epic back to In flight.'
                : 'All children must be Done or moved out. The epic moves to the Shipped section.'
            }
            button={
              <Button
                size="sm"
                variant={shipped ? 'secondary' : 'ink'}
                disabled={disabled}
                onClick={() => setConfirm(shipped ? 'reopen' : 'ship')}
              >
                {shipped ? 'Reopen' : 'Ship epic…'}
              </Button>
            }
          />
          <OpCard
            icon="↩"
            title="Move children to backlog"
            desc="Detach all child items. They keep their data, lose their parent."
            button={
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => setConfirm('detach')}
              >
                Detach…
              </Button>
            }
          />
          <OpCard
            icon="⚠"
            title="Archive epic"
            desc="Read-only. Survives in history; doesn't show up in filters."
            tone="lilac"
            button={
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => setConfirm('archive')}
                className="text-lilac-dark"
              >
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

/**
 * Single destructive-operation card. Each op is its OWN card (per the
 * design), no shared container. Cards are flat — no border-radius, hairline
 * rule on all sides via `border border-rule`. The "lilac" tone tints the
 * title + leading icon to draw attention to the archive action without
 * shouting (no danger-red background).
 */
function OpCard({
  icon,
  title,
  desc,
  button,
  tone = 'neutral',
}: {
  icon: string;
  title: string;
  desc: string;
  button: React.ReactNode;
  tone?: 'neutral' | 'lilac';
}) {
  const accent = tone === 'lilac' ? 'text-lilac-dark' : 'text-mute';
  const titleColor = tone === 'lilac' ? 'text-lilac-dark' : 'text-text';
  return (
    <div className="flex items-center gap-3 bg-card border border-rule px-[14px] py-3">
      <span aria-hidden className={`text-[14px] leading-none ${accent}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold leading-[1.4] ${titleColor}`}>
          {title}
        </p>
        <p className="text-[11.5px] text-mute mt-0.5">{desc}</p>
      </div>
      {button}
    </div>
  );
}
