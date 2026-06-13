import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthLayout } from '../components/layout/AuthLayout';
import { validatePassword, passwordStrength } from '../lib/password';

/**
 * Forced-password-change screen. Reached when a user logs in with a
 * temporary password an admin set (mustChangePassword = true). The backend
 * gates every other authenticated route until a new password is chosen here,
 * so this page is intentionally outside the AppShell layout.
 */
export function SetPasswordPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.authStatus);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // No token at all → not authenticated; send to login. If the user is
  // authenticated but not actually gated, there's nothing to do here.
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      navigate('/login', { replace: true });
      return;
    }
    if (authStatus === 'authed' && user && !user.mustChangePassword) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, user, navigate]);

  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const passwordError = validatePassword(password);
  const confirmError =
    confirmPassword.length > 0 && password !== confirmPassword
      ? 'Passwords do not match.'
      : !confirmPassword.trim()
        ? 'Please confirm your password.'
        : null;

  const { segments, label: strengthLabel } = passwordStrength(password);
  const segmentColor = segments <= 1 ? 'bg-red-600' : segments <= 3 ? 'bg-amber-500' : 'bg-green-700';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirmPassword: true });

    if (passwordError || confirmError) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/set-new-password', {
        newPassword: password,
      });
      // Backend clears the flag, rotates tokens, and returns a fresh session.
      login(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Could not set your password. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="font-serif text-[28px] text-text leading-tight">
        Set a new <span className="italic">password.</span>
      </h2>
      <p className="mt-3 text-[14px] text-mute leading-relaxed">
        Your account was given a temporary password. Choose a new one to
        continue.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="new-password" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => markTouched('password')}
            required
            autoFocus
            className="mt-2 w-full"
            placeholder="••••••••••••••"
          />
          {touched.password && passwordError && (
            <p className="text-[11px] text-[#E05252] mt-1">{passwordError}</p>
          )}
          {password.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-[3px]">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-[5px] w-[28px] ${i < segments ? segmentColor : 'bg-[var(--line-2)]'}`}
                  />
                ))}
              </div>
              {strengthLabel && (
                <span className="text-[12px] font-semibold text-[var(--ink-2)]">
                  {strengthLabel}
                </span>
              )}
              <span className="text-[11px] text-[var(--ink-4)]">
                · 8–20 chars, mixed case, one number, one special
              </span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
            Confirm password
          </label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => markTouched('confirmPassword')}
            required
            className="mt-2 w-full"
            placeholder="••••••••••••••"
          />
          {touched.confirmPassword && confirmError && (
            <p className="text-[11px] text-[#E05252] mt-1">{confirmError}</p>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={loading} className="w-full h-11 text-[15px]">
          {loading ? 'Saving…' : 'Set password  →'}
        </Button>
      </form>
    </AuthLayout>
  );
}
