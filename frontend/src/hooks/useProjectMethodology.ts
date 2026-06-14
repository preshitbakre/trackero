import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export type Methodology = 'scrum' | 'kanban';

export function useProjectMethodology(projectId: string | number | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['project-methodology', String(projectId ?? '')],
    enabled: projectId != null && projectId !== '',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiClient.get(`/projects/${projectId}`);
      return (res.data?.data?.methodology ?? 'scrum') as Methodology;
    },
  });
  return { methodology: data, isLoading };
}
