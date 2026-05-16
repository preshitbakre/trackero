import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    // Fetch user profile if not loaded
    if (!user) {
      apiClient.get('/auth/me').then((res) => {
        useAuthStore.getState().setUser(res.data.data);
      }).catch(() => {
        navigate('/login');
      });
    }
  }, [user, navigate]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
        Welcome{user ? `, ${user.displayName}` : ''}
      </h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Select a project from the sidebar to get started.
      </p>
    </div>
  );
}
