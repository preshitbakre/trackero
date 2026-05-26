interface IconProps {
  className?: string;
  size?: number;
}

const defaults = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

function icon(size: number | undefined, className: string | undefined, fallback: number) {
  const s = size ?? fallback;
  return { ...defaults, width: s, height: s, className };
}

export function TodayIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <path d="M2.5 8L8 3l5.5 5" />
      <path d="M3.5 7.5v6h9v-6" />
    </svg>
  );
}

export function BoardIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <rect x="2.5" y="2.5" width="3" height="11" />
      <rect x="6.5" y="2.5" width="3" height="7" />
      <rect x="10.5" y="2.5" width="3" height="9" />
    </svg>
  );
}

export function BacklogIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <path d="M3 4h10M3 8h10M3 12h7" />
    </svg>
  );
}

export function SprintsIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4v4l2.5 2" />
    </svg>
  );
}

export function EpicsIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <path d="M3.5 13.5V3" />
      <path d="M3.5 3h7l-1 2 1 2h-7" />
    </svg>
  );
}

export function StoriesIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
      <path d="M5 7h6M5 9.5h4" />
    </svg>
  );
}

export function ChartsIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <path d="M2.5 13.5h11" />
      <path d="M4 11V8M7 11V4.5M10 11V7M13 11V9.5" />
    </svg>
  );
}

export function RetroIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <path d="M2.5 4.5h11v6h-4l-2.5 2.5V10.5h-4.5z" />
    </svg>
  );
}

export function MembersIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <circle cx="6" cy="6" r="2.5" />
      <path d="M2 13c.5-2.2 2.2-3.5 4-3.5s3.5 1.3 4 3.5" />
      <path d="M10.5 4a2 2 0 0 1 0 4M13.5 13c-.3-1.6-1.2-2.7-2.5-3.2" />
    </svg>
  );
}

export function SettingsIcon({ className, size }: IconProps) {
  return (
    <svg {...icon(size, className, 14)}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
    </svg>
  );
}
