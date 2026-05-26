interface IconProps {
  className?: string;
}

export function DragHandleDots({ className }: IconProps) {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" className={className} aria-hidden>
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="6" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="6" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  );
}

export function EllipsisDots({ className }: IconProps) {
  return (
    <svg className={className ?? 'w-[14px] h-[14px]'} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3.5" cy="8" r=".9" />
      <circle cx="8" cy="8" r=".9" />
      <circle cx="12.5" cy="8" r=".9" />
    </svg>
  );
}

export function EnterKeyGlyph({ className }: IconProps) {
  return (
    <svg
      className={className ?? 'w-[11px] h-[11px]'}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 4v3.5a2 2 0 0 1-2 2H3" />
      <path d="M5.5 7L3 9.5l2.5 2.5" />
    </svg>
  );
}
