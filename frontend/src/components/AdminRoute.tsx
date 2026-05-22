import { Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { canAdminister } = useRole();

  if (!canAdminister) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
