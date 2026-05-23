import { AVATAR_COLORS } from '../../lib/colors';

interface AvatarUser {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
}

interface AvatarProps {
  user: AvatarUser;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  xs: 20,
  sm: 24,
  md: 28,
  lg: 32,
};

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

/**
 * User avatar — image when `avatarUrl` is present, falls back to a
 * coloured circle with initials. Colour rotation is keyed on
 * `user.id` so the same user always renders in the same hue across
 * surfaces (TopBar avatar menu, TaskCard assignee, reporter row,
 * settings user table, notification rows).
 */
export function Avatar({ user, size = 'sm', className = '' }: AvatarProps) {
  const px = SIZE_PX[size];
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        width={px}
        height={px}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }
  const palette = AVATAR_COLORS[user.id % AVATAR_COLORS.length];
  return (
    <span
      role="img"
      aria-label={user.displayName}
      className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${className}`}
      style={{
        width: px,
        height: px,
        backgroundColor: palette.bg,
        color: palette.color,
        fontSize: Math.max(10, Math.round(px * 0.4)),
        lineHeight: 1,
      }}
    >
      {initialsFor(user.displayName)}
    </span>
  );
}
