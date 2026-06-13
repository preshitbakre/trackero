import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthLayout } from '../components/layout/AuthLayout';
import { validatePassword, passwordStrength } from '../lib/password';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

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
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword: password,
      });
      setDone(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Reset failed. The link may have expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <h2 className="font-serif text-[28px] text-text leading-tight">
          Invalid <span className="italic">link.</span>
        </h2>
        <p className="mt-3 text-[14px] text-mute leading-relaxed">
          This password reset link is missing a token. Please request a new one.
        </p>
        <div className="mt-8">
          <Link to="/forgot-password" className="text-[13px] text-mute hover:text-text font-medium">
            Request a new link →
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {done ? (
        <>
          <h2 className="font-serif text-[28px] text-text leading-tight">
            Password <span className="italic">reset.</span>
          </h2>
          <p className="mt-3 text-[14px] text-mute leading-relaxed">
            Your password has been changed and all existing sessions have been signed out.
            Sign in with your new password.
          </p>
          <div className="mt-8">
            <Link to="/login">
              <Button variant="primary" className="h-11 text-[15px] px-8">
                Sign in  →
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-serif text-[28px] text-text leading-tight">
            Set a new <span className="italic">password.</span>
          </h2>
          <p className="mt-3 text-[14px] text-mute leading-relaxed">
            Choose a strong password for your account.
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
              {loading ? 'Resetting…' : 'Reset password  →'}
            </Button>

            <p className="text-center text-[13px] text-faint pt-3">
              <Link to="/login" className="text-mute hover:text-text font-medium">
                ← Back to sign in
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
