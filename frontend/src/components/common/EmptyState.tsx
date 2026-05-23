import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
  variant?: 'card' | 'dashed' | 'inline';
  className?: string;
}

/**
 * Editorial empty-state for lists, panels, and columns. Three
 * variants:
 *   - `card` — filled surface, used at the top of a section when the
 *     section has no rows yet.
 *   - `dashed` — dashed-rule rectangle, used in drop zones (board
 *     columns, sprint planning, retro columns).
 *   - `inline` — no chrome, italic text only. Used inline alongside
 *     other content.
 *
 * Copy is direct + warm per the design (e.g. "Drop here · drag from
 * In progress").
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
  variant = 'card',
  className = '',
}: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <p className={`text-[12px] italic text-faint ${className}`}>
        {title}
        {hint ? ` · ${hint}` : ''}
      </p>
    );
  }

  const shell =
    variant === 'card'
      ? 'rounded-xl bg-card p-6 shadow-[0_1px_2px_rgba(26,20,36,0.04)]'
      : 'rounded-xl border border-dashed border-rule p-4 bg-paper/40';

  return (
    <div className={`${shell} text-center ${className}`}>
      {icon ? <div className="mb-2 flex justify-center text-faint">{icon}</div> : null}
      <div
        className={
          variant === 'card'
            ? 'text-[16px] font-serif text-text'
            : 'text-[12px] font-serif text-faint'
        }
      >
        {title}
      </div>
      {hint ? (
        <div
          className={
            variant === 'card'
              ? 'mt-1 text-[13px] text-mute'
              : 'mt-1 text-[11px] text-faint'
          }
        >
          {hint}
        </div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
