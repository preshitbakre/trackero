import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Width class, e.g. "w-[480px]". Default: "w-[480px]" */
  width?: string;
  /** Stacking level: 0 = base drawer, 1 = overlay on top, 2 = overlay on overlay, etc. */
  level?: number;
  /** When true, the drawer shifts left to make room for an overlay on top */
  pushed?: boolean;
  /** Accessible name for the drawer (visually hidden — caller renders its own heading). */
  ariaLabel?: string;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  width = 'w-[480px]',
  level = 0,
  pushed = false,
  ariaLabel = 'Drawer',
  children,
}: DrawerProps) {
  const panelZ = 31 + level * 10;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-label={ariaLabel}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={`fixed bottom-0 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden focus:outline-none ${pushed ? 'w-[530px]' : width}`}
          style={{ zIndex: panelZ, top: '49px', right: 0, backgroundColor: 'var(--paper-2)' }}
        >
          <DialogPrimitive.Title className="sr-only">{ariaLabel}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface DrawerHeaderProps {
  children: React.ReactNode;
}

export function DrawerHeader({ children }: DrawerHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-neutral-200">
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
    <div className="flex-shrink-0 border-t border-neutral-200">
      {children}
    </div>
  );
}
