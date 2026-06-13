import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthLayout } from '../components/layout/AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {sent ? (
        <>
          <h2 className="font-serif text-[28px] text-text leading-tight">
            Check your <span className="italic">inbox.</span>
          </h2>
          <p className="mt-3 text-[14px] text-mute leading-relaxed">
            If an account exists for <strong className="text-text font-medium">{email}</strong>,
            we sent a password reset link. It expires in 1 hour.
          </p>
          <p className="mt-2 text-[13px] text-faint">
            Didn't get it? Check your spam folder, or try again with a different address.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Link to="/login" className="text-[13px] text-mute hover:text-text font-medium">
              ← Back to sign in
            </Link>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-[13px] text-faint hover:text-mute"
            >
              Try another email
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-serif text-[28px] text-text leading-tight">
            Forgot your <span className="italic">password?</span>
          </h2>
          <p className="mt-3 text-[14px] text-mute leading-relaxed">
            Enter the email address on your account. We'll send a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="bg-danger/10 px-3 py-2 text-[13px] text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="reset-email" className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-mute">
                Email
              </label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="mt-2 w-full"
                placeholder="you@example.com"
              />
            </div>

            <Button type="submit" variant="primary" disabled={loading} className="w-full h-11 text-[15px]">
              {loading ? 'Sending…' : 'Send reset link  →'}
            </Button>

            <p className="text-center text-[13px] text-faint pt-3">
              Remember your password?{' '}
              <Link to="/login" className="text-mute hover:text-text font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
