import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

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
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    apiClient.get('/auth/setup-status').then((res) => {
      setIsSetup(res.data.data.isSetup);
    }).catch(() => setIsSetup(true));

    // Pre-fill email from invite token
    if (inviteToken) {
      apiClient.get(`/auth/invite-info?token=${inviteToken}`).then((res) => {
        setEmail(res.data.data.email || '');
      }).catch(() => {});
    }
  }, [inviteToken]);

  const isFirstRun = isSetup === false;
  const hasInvite = !!inviteToken;
  const canRegister = isFirstRun || hasInvite;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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

  if (isSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-dneutral-50">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (!canRegister) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-dneutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Trackero</h1>
          <div className="rounded-md bg-accent-50 dark:bg-daccent-100 p-4">
            <p className="text-sm text-accent-700 dark:text-daccent-600 font-medium">Registration is invite-only</p>
            <p className="mt-1 text-sm text-accent-600 dark:text-daccent-500">
              Ask your admin to send you an invitation link.
            </p>
          </div>
          <Link to="/login" className="text-sm text-primary-500 hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-dneutral-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700">Trackero</h1>
          {isFirstRun ? (
            <>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Set up your instance</p>
              <p className="mt-1 text-sm text-primary-500">Your account will be the admin.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Create your account</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 dark:bg-danger/10 p-3 text-sm text-danger dark:text-danger">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600">
              Display name
            </label>
            <input
              id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required
              className="mt-1 block w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600">Email</label>
            <input
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              readOnly={!!inviteToken && email !== ''}
              className={`mt-1 block w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${inviteToken && email ? 'bg-neutral-100 dark:bg-dneutral-200 cursor-not-allowed' : ''}`}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600">Password</label>
            <input
              id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="mt-1 block w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600">Confirm password</label>
            <input
              id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              className="mt-1 block w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-100 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : isFirstRun ? 'Set up Trackero' : 'Create account'}
          </button>
        </form>

        {!isFirstRun && (
          <p className="text-center text-sm text-neutral-400 dark:text-neutral-400">
            <Link to="/login" className="text-primary-500 hover:underline">Back to login</Link>
          </p>
        )}
      </div>
    </div>
  );
}
