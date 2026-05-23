import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Gates routes on a *verified* auth status, not mere token presence.
 *
 * - 'anon'    -> redirect to /login.
 * - 'authed'  -> render children.
 * - 'loading' -> render children so AppShell can mount and call /auth/me,
 *               which resolves the status to 'authed' or 'anon'. Redirecting
 *               on 'loading' would prevent AppShell from ever mounting and
 *               cause an infinite "loading" with no resolution.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const authStatus = useAuthStore((s) => s.authStatus);

  if (authStatus === 'anon') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
