import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useRole } from '../hooks/useRole';
import { Skeleton } from './common/Skeleton';

/**
 * Gates admin-only routes on verified auth status AND role.
 *
 * - 'anon'    -> redirect to /login (defense-in-depth; ProtectedRoute also
 *                wraps this in the route tree).
 * - 'loading' -> render a small loading state. We can't evaluate the role
 *                until /auth/me resolves; rendering children here would
 *                briefly flash "not admin" since useRole defaults to 'viewer'
 *                when user is null, causing a spurious redirect to /dashboard.
 * - 'authed'  -> evaluate role; redirect non-admins to /dashboard.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const authStatus = useAuthStore((s) => s.authStatus);
  const { canAdminister } = useRole();

  if (authStatus === 'anon') {
    return <Navigate to="/login" replace />;
  }

  if (authStatus === 'loading') {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!canAdminister) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
