import { Navigate, useParams } from 'react-router-dom';
import { useProjectMethodology } from '../../hooks/useProjectMethodology';

export function MethodologyGuard({ scrumOnly, children }: { scrumOnly?: boolean; children: React.ReactNode }) {
  const { id } = useParams();
  const { methodology, isLoading } = useProjectMethodology(id);

  if (isLoading || !methodology) return null;
  if (scrumOnly && methodology === 'kanban') {
    return <Navigate to={`/projects/${id}/board`} replace />;
  }
  return <>{children}</>;
}
