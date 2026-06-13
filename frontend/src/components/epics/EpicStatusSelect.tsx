import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Check } from 'lucide-react';
import type { EpicDetail } from '../../api/epics';
import { updateEpic, shipEpic, reopenEpic, epicStateToPill } from '../../api/epics';
import { StatusPill } from '../ui/StatusPill';
import type { StatusKey } from '../ui/StatusPill';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { toast } from '../common/Toast';
import { STATUS_BADGE_COLORS, PROJECT_STATUS_PALETTE } from '../../lib/colors';

type EpicState = 'draft' | 'planning' | 'in_flight';

const LIFECYCLE: { value: EpicState; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planning', label: 'Planning' },
  { value: 'in_flight', label: 'In flight' },
];

const EPIC_LABEL: Record<string, string> = {
  draft: 'draft',
  planning: 'planning',
  in_flight: 'in flight',
  shipped: 'shipped',
  blocked: 'blocked',
  at_risk: 'at risk',
  archived: 'archived',
};

interface Props {
  epic: EpicDetail;
  projectId: string;
  canEdit: boolean;
  onChanged: () => void;
  /** `pill` = header trigger (status pill + chevron); `button` = the Overview blocked-banner action. */
  variant: 'pill' | 'button';
}

/**
 * Inline epic status control. The trigger shows the derived displayState
 * (which may be blocked/at_risk/archived), but the menu only ever sets the
 * real lifecycle `epicState` (draft/planning/in_flight) via PATCH, or runs
 * the Ship/Reopen operations — matching the backend's allowed transitions.
 */
export function EpicStatusSelect({ epic, projectId, canEdit, onChanged, variant }: Props) {
  const [confirm, setConfirm] = useState<'ship' | 'reopen' | null>(null);
  const [busy, setBusy] = useState(false);
  const shipped = epic.epicState === 'shipped';

  const pill = <StatusPill status={epicStateToPill(epic.displayState) as StatusKey} dot caps />;

  // Viewers can't change status: show the read-only pill, no banner action.
  if (!canEdit) {
    return variant === 'pill' ? pill : null;
  }

  const changeState = async (next: EpicState) => {
    if (next === epic.epicState) return;
    setBusy(true);
    try {
      await updateEpic(projectId, epic.id, { epicState: next });
      toast('Status updated');
      onChanged();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      if (action === 'ship') {
        await shipEpic(projectId, epic.id);
        toast('Epic shipped');
      } else if (action === 'reopen') {
        await reopenEpic(projectId, epic.id);
        toast('Epic reopened');
      }
      onChanged();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Operation failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pillKey = epicStateToPill(epic.displayState);
  const palette =
    (STATUS_BADGE_COLORS as Record<string, { bg: string; color: string }>)[pillKey] ??
    PROJECT_STATUS_PALETTE[pillKey] ??
    PROJECT_STATUS_PALETTE.idle;
  const pillLabel = EPIC_LABEL[epic.displayState] ?? epic.displayState;

  const trigger =
    variant === 'pill' ? (
      <button
        type="button"
        disabled={busy}
        aria-label="Change epic status"
        className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded border text-[11px] font-semibold uppercase tracking-[0.06em] focus:outline-none disabled:opacity-60"
        style={{ backgroundColor: palette.bg, color: palette.color, borderColor: palette.color + '40' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.color }} />
        {pillLabel}
        <ChevronDown size={12} className="ml-0.5 opacity-70" />
      </button>
    ) : (
      <Button size="sm" variant="outline" disabled={busy} className="text-lilac border-lilac hover:bg-lilac-tint">
        Update status
      </Button>
    );

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[200px] overflow-hidden bg-card p-1 shadow-[0_8px_30px_rgba(26,20,36,0.18),0_2px_8px_rgba(26,20,36,0.10)]"
          >
            {shipped ? (
              <>
                <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-faint">Shipped</div>
                <DropdownMenu.Item
                  onSelect={() => setConfirm('reopen')}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-text cursor-pointer outline-none data-[highlighted]:bg-lilac-tint data-[highlighted]:text-lilac-dark"
                >
                  Reopen epic
                </DropdownMenu.Item>
              </>
            ) : (
              <>
                <DropdownMenu.RadioGroup
                  value={epic.epicState}
                  onValueChange={(v) => changeState(v as EpicState)}
                >
                  {LIFECYCLE.map((s) => (
                    <DropdownMenu.RadioItem
                      key={s.value}
                      value={s.value}
                      className="relative flex items-center gap-2 pl-3 pr-7 py-1.5 text-[12.5px] text-text cursor-pointer outline-none data-[highlighted]:bg-lilac-tint data-[highlighted]:text-lilac-dark data-[state=checked]:font-medium"
                    >
                      <span>{s.label}</span>
                      <DropdownMenu.ItemIndicator className="absolute right-2">
                        <Check size={13} className="text-lilac-dark" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                <DropdownMenu.Separator className="my-1 h-px bg-rule" />
                <DropdownMenu.Item
                  onSelect={() => setConfirm('ship')}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-text cursor-pointer outline-none data-[highlighted]:bg-lilac-tint data-[highlighted]:text-lilac-dark"
                >
                  Ship epic…
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'ship' ? 'Ship this epic?' : 'Reopen this epic?'}
          message={
            confirm === 'ship'
              ? 'All children must be Done or moved out. The epic moves to the Shipped section.'
              : 'The epic returns to In flight.'
          }
          confirmLabel="Yes"
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
