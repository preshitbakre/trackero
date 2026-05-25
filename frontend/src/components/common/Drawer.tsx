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

/**
 * Drawer — right-side slide-in panel. Built on @radix-ui/react-dialog for:
 *  - role="dialog" + aria-modal="true"
 *  - Escape closes
 *  - Focus trap (Tab cycles inside the drawer)
 *  - Focus restoration to the trigger on close
 *  - Body scroll lock while open
 *
 * Positioning, stacked levels and the "pushed" shift behavior are preserved
 * from the original custom implementation.
 *
 * Note: when `level > 0` we suppress Radix's modal behavior so background
 * interaction with the underlying drawer continues to work (matching the
 * previous behavior of stacked drawers).
 */
export function Drawer({
  open,
  onClose,
  width = 'w-[480px]',
  level = 0,
  pushed = false,
  ariaLabel = 'Drawer',
  children,
}: DrawerProps) {
  const backdropZ = 30 + level * 10;
  const panelZ = backdropZ + 1;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={level === 0}>
      <DialogPrimitive.Portal>
        {/* Backdrop — below header */}
        <DialogPrimitive.Overlay
          className="fixed inset-0"
          style={{ zIndex: backdropZ, top: '3.5rem' }}
        />
        {/* Panel — below header */}
        <DialogPrimitive.Content
          aria-label={ariaLabel}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest?.('[data-radix-popper-content-wrapper], [data-radix-select-viewport], [data-radix-menu-content], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"]')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest?.('[data-radix-popper-content-wrapper], [data-radix-select-viewport], [data-radix-menu-content], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"]')) {
              e.preventDefault();
            }
          }}
          className={`fixed bottom-0 bg-[#F2F9F3] dark:bg-dneutral-50 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_24px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden transition-all duration-200 focus:outline-none ${pushed ? 'w-[530px]' : width}`}
          style={{ zIndex: panelZ, top: '3.5rem', right: 0 }}
        >
          {/* Visually-hidden title for a11y; caller renders its own header. */}
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
