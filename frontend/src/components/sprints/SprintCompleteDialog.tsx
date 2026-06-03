import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { TypeTag } from '../ui/TypeTag';
import type { TypeTagKind } from '../ui/TypeTag';
import { toast } from '../common/Toast';

interface IncompleteItem {
  id: number;
  itemKey: string;
  title: string;
  itemType: string;
  priority: string;
  storyPoints: number | null;
  status: { name: string; color: string; category: string };
}

interface PreviewData {
  carryOverPolicy: 'roll' | 'backlog' | 'ask';
  incompleteItems: IncompleteItem[];
  nextSprint: { id: number; name: string } | null;
}

interface SprintCompleteDialogProps {
  projectId: number;
  sprintId: number;
  sprintName: string;
  onCompleted: () => void;
  onCancel: () => void;
}

export function SprintCompleteDialog({ projectId, sprintId, sprintName, onCompleted, onCancel }: SprintCompleteDialogProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actions, setActions] = useState<Record<number, 'roll' | 'backlog'>>({});
  const [bulkAction, setBulkAction] = useState<string>('roll');

  useEffect(() => {
    apiClient.get(`/projects/${projectId}/sprints/${sprintId}/complete-preview`)
      .then(({ data }) => {
        const p: PreviewData = data.data;
        setPreview(p);
        const defaultAction: 'roll' | 'backlog' = p.nextSprint ? 'roll' : 'backlog';
        const initial: Record<number, 'roll' | 'backlog'> = {};
        for (const item of p.incompleteItems) {
          initial[item.id] = defaultAction;
        }
        setActions(initial);
        setBulkAction(defaultAction);
      })
      .catch((err) => {
        toast(err?.response?.data?.message || 'Failed to load sprint preview', 'error');
        onCancel();
      })
      .finally(() => setLoading(false));
  }, [projectId, sprintId, onCancel]);

  const handleComplete = async (itemActions?: Record<number, 'roll' | 'backlog'>) => {
    setSubmitting(true);
    try {
      await apiClient.post(
        `/projects/${projectId}/sprints/${sprintId}/complete`,
        itemActions ? { itemActions } : {},
      );
      toast('Sprint completed');
      onCompleted();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Failed to complete sprint', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const applyBulk = () => {
    const value = bulkAction as 'roll' | 'backlog';
    const updated: Record<number, 'roll' | 'backlog'> = {};
    for (const item of preview!.incompleteItems) {
      updated[item.id] = value;
    }
    setActions(updated);
  };

  if (loading) return null;
  if (!preview) return null;

  const { carryOverPolicy, incompleteItems, nextSprint } = preview;
  const count = incompleteItems.length;

  if (count === 0) {
    return (
      <ConfirmDialog
        title={`Complete ${sprintName}?`}
        message="All items are done. Nothing to carry over."
        confirmLabel="Complete"
        onConfirm={() => handleComplete()}
        onCancel={onCancel}
      />
    );
  }

  if (carryOverPolicy === 'roll' || carryOverPolicy === 'backlog') {
    let message: string;
    if (carryOverPolicy === 'roll') {
      message = nextSprint
        ? `${count} incomplete item${count > 1 ? 's' : ''} will be moved to ${nextSprint.name}.`
        : `${count} incomplete item${count > 1 ? 's' : ''} will be moved to backlog (no planning sprint available).`;
    } else {
      message = `${count} incomplete item${count > 1 ? 's' : ''} will be moved to backlog.`;
    }
    return (
      <ConfirmDialog
        title={`Complete ${sprintName}?`}
        message={message}
        confirmLabel="Complete"
        onConfirm={() => handleComplete()}
        onCancel={onCancel}
      />
    );
  }

  // Ask policy — per-item dialog
  const actionOptions = nextSprint
    ? [
        { value: 'roll', label: `Roll into ${nextSprint.name}` },
        { value: 'backlog', label: 'Move to backlog' },
      ]
    : [{ value: 'backlog', label: 'Move to backlog' }];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-card w-full max-w-[560px] shadow-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <h2 className="font-serif text-[20px] text-text">Complete {sprintName}</h2>
          <button onClick={onCancel} className="text-mute hover:text-text text-[18px]">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-[14px] text-mute">
            {count} incomplete item{count > 1 ? 's' : ''} need{count === 1 ? 's' : ''} a destination.
          </p>

          {/* Bulk action */}
          {nextSprint && (
            <div className="flex items-center gap-2 p-3 bg-paper border border-rule">
              <span className="text-[13px] text-mute flex-shrink-0">Set all to:</span>
              <Select
                value={bulkAction}
                onChange={setBulkAction}
                options={actionOptions}
              />
              <Button variant="ghost" size="sm" onClick={applyBulk}>Apply</Button>
            </div>
          )}

          {/* Item list */}
          <div className="max-h-[320px] overflow-y-auto border border-rule divide-y divide-rule">
            {incompleteItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                <TypeTag kind={(item.itemType || 'task') as TypeTagKind} size="sm" />
                <span className="font-mono text-[12px] text-mute flex-shrink-0">{item.itemKey}</span>
                <span className="text-[14px] text-text truncate flex-1 min-w-0">{item.title}</span>
                <Select
                  value={actions[item.id] || 'backlog'}
                  onChange={(v) => setActions((prev) => ({ ...prev, [item.id]: v as 'roll' | 'backlog' }))}
                  options={actionOptions}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-rule">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="ink" onClick={() => handleComplete(actions)} disabled={submitting}>
            {submitting ? 'Completing…' : 'Complete sprint'}
          </Button>
        </div>
      </div>
    </div>
  );
}
