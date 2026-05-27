import { Avatar } from './Avatar';
import type { ComponentProps } from 'react';

type User = ComponentProps<typeof Avatar>['user'];

interface AvatarStackProps {
  users: User[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const CHIP_PX: Record<'xs' | 'sm' | 'md', number> = { xs: 24, sm: 28, md: 32 };

export function AvatarStack({ users, max = 5, size = 'sm', className = '' }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  const px = CHIP_PX[size];
  return (
    <span className={`inline-flex stack ${className}`}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full font-semibold text-mute bg-paper-2 border border-rule flex-shrink-0"
          style={{
            width: px,
            height: px,
            fontSize: Math.max(10, Math.round(px * 0.4)),
            lineHeight: 1,
          }}
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
