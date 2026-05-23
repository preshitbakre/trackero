export type RoleKey = 'admin' | 'project_manager' | 'pm' | 'member' | 'viewer';

interface RoleBadgeProps {
  role: RoleKey;
  className?: string;
}

const STYLES: Record<RoleKey, { bg: string; color: string; label: string }> = {
  admin: { bg: '#1A1424', color: '#FAF8FD', label: 'Admin' },
  project_manager: { bg: '#EFE7FD', color: '#6326D6', label: 'PM' },
  pm: { bg: '#EFE7FD', color: '#6326D6', label: 'PM' },
  member: { bg: '#FFFFFF', color: '#1A1424', label: 'Member' },
  viewer: { bg: '#FAF8FD', color: '#6B6377', label: 'Viewer' },
};

/**
 * Role badge for user tables and member rows. Admin reads
 * ink-on-paper; PM reads lilac-on-tint; Member is unadorned card;
 * Viewer is muted. Visual treatment lifted from the design's
 * Settings members table.
 */
export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const s = STYLES[role];
  return (
    <span
      className={`inline-flex items-center text-[11px] font-serif font-semibold px-1.5 py-0.5 rounded ${className}`}
      style={{ backgroundColor: s.bg, color: s.color, border: '1px solid var(--color-rule)' }}
    >
      {s.label}
    </span>
  );
}
