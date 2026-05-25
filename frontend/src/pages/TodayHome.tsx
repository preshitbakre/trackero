import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

interface RecentProject {
  id: number;
  name: string;
  prefix: string;
  isPinned: boolean;
}

/**
 * Default landing for /today and /dashboard. Resolves the user's default
 * project (pinned first, then most-recently-visited) and replaces the URL
 * with /projects/:id/today so the rest of the app can rely on a stable
 * project scope. Falls back to /projects when the user has no projects.
 */
export function TodayHome() {
  const navigate = useNavigate();

  const { data: recent } = useQuery<RecentProject[]>({
    queryKey: ['today-home-recent-projects'],
    queryFn: async () => {
      const res = await apiClient.get('/me/projects/recent');
      return (res.data?.data?.projects ?? []) as RecentProject[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!recent) return;
    const pinned = recent.find((r) => r.isPinned);
    const target = pinned ?? recent[0];
    if (target) {
      navigate(`/projects/${target.id}/today`, { replace: true });
    } else {
      navigate('/projects', { replace: true });
    }
  }, [recent, navigate]);

  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[12px] text-[var(--ink-4)]">Loading your Today…</span>
    </div>
  );
}
