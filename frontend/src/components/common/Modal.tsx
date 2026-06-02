import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * Modal — accessible dialog primitive built on @radix-ui/react-dialog.
 *
 * Provides:
 *  - role="dialog" + aria-modal="true" (Radix sets these automatically)
 *  - aria-labelledby wiring via the (optional) `title` prop
 *  - Escape key closes the modal (calls onClose)
 *  - Focus trap (Tab / Shift+Tab cycle inside the modal)
 *  - Focus restoration to the previously-focused element on close
 *  - Body scroll lock while open
 *  - Backdrop click closes (preserved from the previous custom dialogs)
 *  - Portal rendering (Radix mounts into a portal under document.body by default)
 *
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Heading">
 *     ...content...
 *   </Modal>
 *
 * For dialogs whose heading must remain visually custom-styled (which is the
 * majority of our existing dialogs), pass `title` for accessibility AND render
 * your own <h2> in `children`. We hide the Radix Title visually but keep it
 * available to assistive tech. If a custom DOM <h2> is rendered with a known
 * id, callers may instead pass `titleId` to skip Radix's hidden title.
 */
export interface ModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the modal requests to close (Escape, backdrop click, etc.). */
  onClose: () => void;
  /** Accessible name. Required for screen readers unless `titleId` is provided. */
  title?: string;
  /** If the consumer renders its own <h2 id="...">, pass the id here for aria-labelledby. */
  titleId?: string;
  /** Optional accessible description. */
  description?: string;
  /** Content classes for the panel. Defaults to centered card. */
  contentClassName?: string;
  /** Backdrop classes. Defaults to semi-transparent black. */
  overlayClassName?: string;
  /** When true (default), clicking the backdrop closes the modal. */
  closeOnBackdropClick?: boolean;
  /** Initial element to focus when opening. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

const DEFAULT_OVERLAY =
  'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0';

const DEFAULT_CONTENT =
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md ' +
  'bg-white rounded-lg p-6 shadow-xl ' +
  'focus:outline-none';

export function Modal({
  open,
  onClose,
  title,
  titleId,
  description,
  contentClassName,
  overlayClassName,
  closeOnBackdropClick = true,
  initialFocusRef,
  children,
}: ModalProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  // Radix calls this when the user clicks outside the content panel.
  const handlePointerDownOutside = (event: Event) => {
    if (!closeOnBackdropClick) {
      event.preventDefault();
    }
  };

  const handleInteractOutside = (event: Event) => {
    if (!closeOnBackdropClick) {
      event.preventDefault();
    }
  };

  const handleOpenAutoFocus = (event: Event) => {
    if (initialFocusRef?.current) {
      event.preventDefault();
      initialFocusRef.current.focus();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClassName ?? DEFAULT_OVERLAY} />
        <DialogPrimitive.Content
          className={contentClassName ?? DEFAULT_CONTENT}
          onPointerDownOutside={handlePointerDownOutside}
          onInteractOutside={handleInteractOutside}
          onOpenAutoFocus={handleOpenAutoFocus}
          aria-labelledby={titleId}
        >
          {/*
           * If caller passed `titleId` they render their own heading and we
           * skip the Radix Title. Otherwise we render a visually-hidden Title
           * for accessibility while the caller is free to render its own
           * styled heading inside `children`.
           */}
          <DialogPrimitive.Title className="sr-only">
            {title ?? 'Dialog'}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="sr-only">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Lower-level Radix re-exports for callers that need fine-grained control
 * (e.g. Drawer, which has custom positioning and stacking).
 */
export const ModalRoot = DialogPrimitive.Root;
export const ModalPortal = DialogPrimitive.Portal;
export const ModalOverlay = DialogPrimitive.Overlay;
export const ModalContent = DialogPrimitive.Content;
export const ModalTitle = DialogPrimitive.Title;
export const ModalDescription = DialogPrimitive.Description;
