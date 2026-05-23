import { Button } from '../ui/Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = 'confirm-dialog-title';
  return (
    <Modal
      open
      onClose={onCancel}
      titleId={titleId}
      contentClassName="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-dneutral-200 rounded-lg p-6 shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] focus:outline-none"
    >
      <h2 id={titleId} className="text-[22px] font-bold text-neutral-700 dark:text-dneutral-700 mb-2">{title}</h2>
      <p className="text-[16px] text-neutral-500 dark:text-dneutral-500 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
