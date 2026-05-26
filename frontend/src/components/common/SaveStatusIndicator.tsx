import { Loader2, AlertTriangle, CloudUpload } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useTaskAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  return (
    <span className="flex items-center gap-1.5 text-neutral-400 dark:text-dneutral-500">
      {status === 'saving' ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[16px]">Saving...</span>
        </>
      ) : status === 'error' ? (
        <>
          <AlertTriangle size={16} className="text-danger" />
          <span className="text-[16px] text-danger">Save failed</span>
        </>
      ) : (
        <>
          <CloudUpload size={16} />
          {status === 'saved' && <span className="text-[16px]">Saved</span>}
        </>
      )}
    </span>
  );
}
