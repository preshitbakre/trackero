import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import LoginOrbit from '@/assets/decor/login-orbit.svg?react';

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
      navigate('/dashboard', { replace: true });
      return;
    }
    if (authStatus === 'loading') {
      apiClient.get('/auth/me').then(() => {
        navigate('/dashboard', { replace: true });
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
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-faint">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper">
      {/* Editorial hero — ink-black with serif italic statement */}
      <section className="relative bg-ink text-white px-8 py-12 md:w-1/2 md:px-16 md:py-20 flex flex-col justify-between overflow-hidden">
        <Logo height={60} variant="light" />

        <div className="relative z-10">
          <div className="text-[11px] tracking-[0.2em] uppercase text-white/50 mb-4">
            The self-hosted PM tool · v1.0
          </div>
          <h1 className="font-serif italic text-[44px] md:text-[60px] leading-[1.05] tracking-tight">
            Track work.<br />
            <span className="inline-flex items-baseline gap-2">Own the data.<span className="text-lilac">_</span></span>
          </h1>
          <p className="mt-6 text-[14px] text-white/70 max-w-md">
            Trackero runs on your boxes, behind your auth, alongside the rest of your
            stack. No seat counts. No vendor lock-in. No telemetry pinging home.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            <Stat n="100%" label="OPEN SOURCE · AGPL-3" />
            <Stat n="<12 ms" label="P50 BOARD RESPONSE" />
            <Stat n="1 cmd" label="DOCKER COMPOSE UP" />
          </div>
        </div>

        {/* Editorial circle accent */}
        <LoginOrbit className="absolute right-[-60px] bottom-[-80px] w-[480px] h-[480px] opacity-30 pointer-events-none hidden md:block" aria-hidden />

        {/* T1 polish — on mobile the hero column is content-sized, so the
            footer collapses right under the stat columns. The mt gives it
            breathing room; on md+ the section is full-height and
            justify-between already spaces it correctly. */}
        <div className="relative z-10 mt-16 md:mt-0 text-[11px] tracking-[0.15em] uppercase text-white/40">
          Built by{' '}
          <a href="https://blueagate.in" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white/80 transition-colors">
            BlueAgate
          </a>
        </div>
      </section>

      {/* Form column */}
      <section className="md:w-1/2 px-6 py-10 md:px-16 md:py-20 flex items-center justify-center">
        <div className="w-full max-w-md">
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
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="font-serif italic text-[28px] leading-none text-white">{n}</div>
      <div className="mt-2 text-[10px] tracking-[0.15em] uppercase text-white/40">{label}</div>
    </div>
  );
}
