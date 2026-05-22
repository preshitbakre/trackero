import type { SaveStatus } from '../../hooks/useTaskAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  return (
    <span className="flex items-center gap-1.5 text-neutral-400 dark:text-dneutral-500">
      {status === 'saving' ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-[16px]">Saving...</span>
        </>
      ) : status === 'error' ? (
        <>
          <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="text-[16px] text-danger">Save failed</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 15.5C2 18.538 4.462 21 7.5 21h9c3.038 0 5.5-2.462 5.5-5.5 0-2.727-1.986-4.989-4.593-5.42C16.91 7.248 14.2 5 11 5 7.41 5 4.5 7.91 4.5 11.5c0 .17.007.338.02.504C2.97 12.67 2 13.97 2 15.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 12.5 2 2 4-4" />
          </svg>
          {status === 'saved' && <span className="text-[16px]">Saved</span>}
        </>
      )}
    </span>
  );
}
