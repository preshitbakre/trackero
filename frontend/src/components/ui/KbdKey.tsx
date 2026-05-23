import type { ReactNode } from 'react';

interface KbdKeyProps {
  children: ReactNode;
  className?: string;
}

/**
 * Monospaced keyboard-key chip. Used by the command palette footer,
 * the shortcuts-help dialog, every inline `<kbd>` reference, and the
 * "or press X" hints across the app. One shared component so the chip
 * has exactly one visual treatment.
 */
export function KbdKey({ children, className = '' }: KbdKeyProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center text-[10px] font-mono text-mute bg-paper border border-rule rounded px-1.5 py-0.5 shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </kbd>
  );
}
