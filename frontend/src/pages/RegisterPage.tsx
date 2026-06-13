import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { validatePassword } from '../lib/password';
import { AuthLayout } from '../components/layout/AuthLayout';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') || undefined;

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  // null = still validating the invite token, true/false = result.
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    apiClient.get('/auth/setup-status').then((res) => {
      setIsSetup(res.data.data.isSetup);
    }).catch(() => setIsSetup(true));

    // Validate the invite token and pre-fill the email. A missing/expired/
    // invalid token (e.g. F-L-0009) marks the invite invalid so we show the
    // "ask your admin for an invite" screen instead of a dead-end form.
    if (inviteToken) {
      apiClient.get(`/auth/invite-info?token=${inviteToken}`).then((res) => {
        setEmail(res.data.data.email || '');
        setInviteValid(true);
      }).catch(() => setInviteValid(false));
    }
  }, [inviteToken]);

  const isFirstRun = isSetup === false;
  const hasInvite = !!inviteToken;
  const inviteResolving = hasInvite && inviteValid === null;
  const canRegister = isFirstRun || (hasInvite && inviteValid === true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }

    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/register', {
        email,
        password,
        displayName,
        inviteToken,
      });
      login(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isSetup === null || inviteResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-faint">Loading…</div>
      </div>
    );
  }

  if (!canRegister) {
    return (
      <AuthLayout>
        <h2 className="font-serif text-[28px] text-text leading-tight">
          Invite <span className="italic">only.</span>
        </h2>
        <p className="mt-2 text-[14px] text-mute">
          Registration on this instance is invite-only. Ask your admin to send you an
          invitation link.
        </p>
        <Link
          to="/login"
          className="inline-block mt-8 text-[14px] text-lilac-dark hover:underline"
        >
          Back to login  →
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="font-serif text-[28px] text-text leading-tight">
        {isFirstRun ? (
          <>Set up <span className="italic">Trackero.</span></>
        ) : (
          <>Create your <span className="italic">account.</span></>
        )}
      </h2>
      <p className="mt-2 text-[14px] text-mute">
        {isFirstRun
          ? 'Your account will be the workspace admin.'
          : 'Complete your details to join the workspace.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="displayName" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Display name
          </label>
          <Input
            id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required
            className="mt-2 w-full"
            placeholder="Ada Lovelace"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Email
          </label>
          <Input
            id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            readOnly={!!inviteToken && email !== ''}
            className={`mt-2 w-full ${inviteToken && email ? 'bg-paper-2 cursor-not-allowed' : ''}`}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Password
          </label>
          <Input
            id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="mt-2 w-full"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Confirm password
          </label>
          <Input
            id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
            className="mt-2 w-full"
          />
        </div>

        <Button type="submit" variant="primary" disabled={loading} className="w-full h-11 text-[15px]">
          {loading ? (isFirstRun ? 'Setting up…' : 'Creating account…') : isFirstRun ? 'Set up Trackero  →' : 'Create account  →'}
        </Button>

        {!isFirstRun && (
          <p className="text-center text-[13px] text-faint pt-3">
            Already have an account?{' '}
            <Link to="/login" className="text-lilac-dark hover:underline">Sign in</Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
