import type { ReactNode } from 'react';

interface MetricNumberProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  italic?: boolean;
  className?: string;
}

const SIZE_PX: Record<NonNullable<MetricNumberProps['size']>, number> = {
  sm: 22,
  md: 28,
  lg: 36,
  xl: 48,
};

/**
 * Serif numeric — the editorial hero numeric used in dashboard
 * stat cards, sprint capacity, Today's "Your three things" numerals,
 * and the Login left panel stats. Always serif; italic by default
 * when a value is a continuation (e.g. `14 of 38` where "of" is
 * italic), roman otherwise.
 */
export function MetricNumber({
  children,
  size = 'md',
  italic = false,
  className = '',
}: MetricNumberProps) {
  return (
    <span
      className={`font-serif ${italic ? 'italic' : ''} ${className}`}
      style={{ fontSize: SIZE_PX[size], lineHeight: 1 }}
    >
      {children}
    </span>
  );
}
