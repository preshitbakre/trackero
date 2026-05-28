import type { ReactNode } from 'react';

interface KbdKeyProps {
  children: ReactNode;
  className?: string;
  /** `on-accent` reads against a filled/coloured button; `default` against the page. */
  tone?: 'default' | 'on-accent';
}

const TONES: Record<NonNullable<KbdKeyProps['tone']>, string> = {
  default: 'text-mute bg-paper border-rule shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]',
  'on-accent': 'text-white bg-black/15 border-white/25',
};

/**
 * Monospaced keyboard-key chip. Used by the command palette footer,
 * the shortcuts-help dialog, every inline `<kbd>` reference, and the
 * "or press X" hints across the app. One shared component so the chip
 * has exactly one visual treatment.
 */
export function KbdKey({ children, className = '', tone = 'default' }: KbdKeyProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center text-[10px] font-mono border rounded px-1.5 py-0.5 ${TONES[tone]} ${className}`}
    >
      {children}
    </kbd>
  );
}
