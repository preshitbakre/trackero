import type { ReactNode } from 'react';

interface PageHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Sticky-free page header band. Owns its own padding (20px 28px 16px) and
 * a bottom hairline that acts as the divider between the header and the
 * client area below it. Pass whatever the page needs (eyebrow, title,
 * actions) as children and arrange it inside.
 */
export function PageHeader({ children, className = '' }: PageHeaderProps) {
  return (
    <header className={`pt-[20px] px-[28px] pb-[16px] border-b border-rule ${className}`}>
      {children}
    </header>
  );
}
