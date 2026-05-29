import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { PMDashboard } from '../components/dashboard/PMDashboard';
import { MemberDashboard } from '../components/dashboard/MemberDashboard';
import { ViewerDashboard } from '../components/dashboard/ViewerDashboard';
import { ErrorState } from '../components/common/ErrorState';

function DashboardSkeleton() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-64 bg-neutral-200 rounded mb-2" />
      <div className="h-4 w-48 bg-neutral-200 rounded mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-neutral-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-neutral-200" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      apiClient.get('/auth/me').then((res) => {
        useAuthStore.getState().setUser(res.data.data);
      }).catch(() => {
        navigate('/login');
      });
    }
  }, [user, navigate]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard');
      return res.data.data;
    },
    staleTime: 30000,
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (isLoading || !user) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load dashboard" onRetry={() => refetch()} />;
  if (!data) return <DashboardSkeleton />;

  switch (data.role) {
    case 'admin':
      return <AdminDashboard data={data} />;
    case 'project_manager':
      return <PMDashboard data={data} />;
    case 'member':
      return <MemberDashboard data={data} />;
    case 'viewer':
      return <ViewerDashboard data={data} />;
    default:
      return <MemberDashboard data={data} />;
  }
}
