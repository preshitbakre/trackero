import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthLayout } from '../components/layout/AuthLayout';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [appUrl, setAppUrl] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const authStatus = useAuthStore((s) => s.authStatus);

  useEffect(() => {
    if (authStatus === 'authed') {
      const u = useAuthStore.getState().user;
      navigate(u?.mustChangePassword ? '/set-password' : '/dashboard', { replace: true });
      return;
    }
    if (authStatus === 'loading') {
      apiClient.get('/auth/me').then((res) => {
        const u = res.data.data;
        useAuthStore.getState().setUser(u);
        navigate(u?.mustChangePassword ? '/set-password' : '/dashboard', { replace: true });
      }).catch(() => {
        useAuthStore.getState().setAuthStatus('anon');
      });
    }
  }, [authStatus, navigate]);

  useEffect(() => {
    apiClient.get('/auth/setup-status').then((res) => {
      setIsSetup(res.data.data.isSetup);
      if (res.data.data.appUrl) setAppUrl(res.data.data.appUrl);
      if (!res.data.data.isSetup) {
        navigate('/setup');
        return;
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
      navigate(data.data.user?.mustChangePassword ? '/set-password' : '/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-faint">Loading…</div>
      </div>
    );
  }

  return (
    <AuthLayout>
      <h2 className="font-serif text-[28px] text-text leading-tight">
        Sign in to <span className="italic">Trackero.</span>
      </h2>
      <p className="mt-2 text-[14px] text-mute">
        Your instance is hosted at{' '}
        <code className="px-1.5 py-0.5 rounded bg-lilac-tint text-lilac-dark text-[13px] font-mono">
          {appUrl ? (() => { try { return new URL(appUrl).host; } catch { return appUrl; } })() : (typeof window !== 'undefined' ? window.location.host : 'trackero.local')}
        </code>
        .
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-2 w-full"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
              Password
            </label>
            <Link to="/forgot-password" className="text-[12px] text-faint hover:text-lilac-dark">forgot?</Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-2 w-full"
          />
        </div>

        {/* "Keep me signed in for 30 days" — surfaces the refresh-token
            lifetime to the user. Backend session/refresh already lasts
            30 days; the checkbox is informational for v1 (no opt-out
            flow yet), matching the design's frame 12 placement. */}
        <label className="flex items-center gap-2 text-[13px] text-mute cursor-pointer select-none">
          <input
            type="checkbox"
            defaultChecked
            disabled
            className="w-4 h-4 accent-lilac"
            aria-label="Keep me signed in for 30 days"
          />
          Keep me signed in for 30 days
        </label>

        <Button type="submit" variant="primary" disabled={loading} className="w-full h-11 text-[15px]">
          {loading ? 'Signing in…' : 'Sign in  →'}
        </Button>

        <p className="text-center text-[13px] text-faint pt-3">
          No account?{' '}
          <span className="text-mute">Ask for an invite from your admin.</span>
        </p>
      </form>
    </AuthLayout>
  );
}
