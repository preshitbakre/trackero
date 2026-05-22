import { useRole } from '../../hooks/useRole';

type Role = 'admin' | 'project_manager' | 'member' | 'viewer';

interface RoleGateProps {
  /** Minimum role required to see children */
  minRole?: Role;
  /** Specific roles allowed */
  roles?: Role[];
  /** Content shown when access denied (defaults to nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children based on user role.
 *
 * Usage:
 *   <RoleGate minRole="member">...</RoleGate>        — admin, PM, member can see
 *   <RoleGate roles={['admin']}>...</RoleGate>        — only admin
 *   <RoleGate minRole="project_manager">...</RoleGate> — admin and PM
 */
export function RoleGate({ minRole, roles, fallback = null, children }: RoleGateProps) {
  const { role, hasRole } = useRole();

  if (roles) {
    if (!roles.includes(role)) return <>{fallback}</>;
  } else if (minRole) {
    if (!hasRole(minRole)) return <>{fallback}</>;
  }

  return <>{children}</>;
}
