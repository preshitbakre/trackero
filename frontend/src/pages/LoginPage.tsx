import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    apiClient.get('/auth/setup-status').then((res) => {
      setIsSetup(res.data.data.isSetup);
      if (!res.data.data.isSetup) {
        navigate('/register');
      }
    }).catch(() => setIsSetup(true));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      login(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F9F3] dark:bg-dneutral-50">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F2F9F3] dark:bg-dneutral-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-neutral-700 dark:text-dneutral-700">Trackero</h1>
          <p className="mt-2 text-[16px] text-neutral-500 dark:text-neutral-400">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 dark:bg-danger/10 p-3 text-[16px] text-danger dark:text-danger">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <Button type="submit" variant="primary" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
