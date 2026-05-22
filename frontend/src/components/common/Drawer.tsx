import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Width class, e.g. "w-[480px]". Default: "w-[480px]" */
  width?: string;
  /** Stacking level: 0 = base drawer, 1 = overlay on top, 2 = overlay on overlay, etc. */
  level?: number;
  /** When true, the drawer shifts left to make room for an overlay on top */
  pushed?: boolean;
  /** Width class when pushed. Default: "w-[560px]" */
  pushedWidth?: string;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  width = 'w-[480px]',
  level = 0,
  pushed = false,
  pushedWidth = 'w-[560px]',
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const backdropZ = 30 + level * 10;
  const panelZ = backdropZ + 1;

  return createPortal(
    <>
      {/* Backdrop — below header */}
      <div
        className="fixed inset-0"
        style={{ zIndex: backdropZ, top: '3.5rem' }}
        onClick={onClose}
      />
      {/* Panel — below header */}
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className={`fixed right-0 bottom-0 bg-[#F2F9F3] dark:bg-dneutral-50 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_24px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden transition-all duration-200 ${
          pushed ? pushedWidth : width
        }`}
        style={{ zIndex: panelZ, top: '3.5rem' }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

interface DrawerHeaderProps {
  children: React.ReactNode;
}

export function DrawerHeader({ children }: DrawerHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-neutral-200 dark:border-dneutral-200">
      {children}
    </div>
  );
}

interface DrawerBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function DrawerBody({ children, className = '' }: DrawerBodyProps) {
  return (
    <div className={`flex-1 overflow-y-auto custom-scrollbar ${className}`}>
      {children}
    </div>
  );
}

interface DrawerFooterProps {
  children: React.ReactNode;
}

export function DrawerFooter({ children }: DrawerFooterProps) {
  return (
    <div className="flex-shrink-0 border-t border-neutral-200 dark:border-dneutral-200">
      {children}
    </div>
  );
}
