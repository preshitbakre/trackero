import type { ReactNode } from 'react';

interface EyebrowProps {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Uppercase, letter-spaced, serif label that sits above the hero of
 * every page section (e.g. "CURRENT SPRINT · 29 ITEMS", "INSTANCE ·
 * trackero.events.internal · ADMIN ONLY"). Standardising the shape
 * keeps page headers visually anchored.
 */
export function Eyebrow({ children, className = '', size = 'md' }: EyebrowProps) {
  const sizeClass = size === 'sm' ? 'text-[10px] tracking-[0.16em]' : 'text-[11px] tracking-[0.18em]';
  return (
    <p
      className={`uppercase font-serif font-semibold text-faint ${sizeClass} ${className}`}
    >
      {children}
    </p>
  );
}
