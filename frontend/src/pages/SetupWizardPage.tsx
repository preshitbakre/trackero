import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

/* ────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────── */
interface StepDef {
  label: string;
}

const STEPS: StepDef[] = [
  { label: 'Welcome' },
  { label: 'Admin account' },
  { label: 'Instance basics' },
  { label: 'Invite your team' },
];

/* ────────────────────────────────────────────────────
 * Validation helpers
 * ──────────────────────────────────────────────────── */
function validatePassword(pw: string): string | null {
  if (pw.length < 14) return 'Password must be at least 14 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  return null;
}

/* ────────────────────────────────────────────────────
 * Main component
 * ──────────────────────────────────────────────────── */
export function SetupWizardPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* Step 2 — admin account */
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /* Step 3 — instance basics */
  const [instanceName, setInstanceName] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');

  /* Step 4 — invites */
  const [invites, setInvites] = useState<{ email: string; role: string }[]>([
    { email: '', role: 'member' },
  ]);

  /* ── Navigation logic ───────────────────────────── */
  const canProceed = useCallback((): boolean => {
    setError('');
    if (step === 0) return true;
    if (step === 1) {
      if (!displayName.trim()) { setError('Name is required.'); return false; }
      if (!email.trim()) { setError('Email is required.'); return false; }
      const pwErr = validatePassword(password);
      if (pwErr) { setError(pwErr); return false; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return false; }
      return true;
    }
    if (step === 2) {
      if (!instanceName.trim()) { setError('Instance name is required.'); return false; }
      return true;
    }
    return true;
  }, [step, displayName, email, password, confirmPassword, instanceName]);

  const goNext = useCallback(() => {
    if (!canProceed()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  }, [step, canProceed]);

  const goBack = useCallback(() => {
    if (step > 0) { setError(''); setStep(step - 1); }
  }, [step]);

  const goToStep = useCallback((target: number) => {
    // Only allow navigating to completed steps (steps before current)
    if (target < step) {
      setError('');
      setStep(target);
    }
  }, [step]);

  /* ── Invite helpers ─────────────────────────────── */
  const updateInvite = (idx: number, field: 'email' | 'role', value: string) => {
    setInvites((prev) => prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv)));
  };
  const addInviteRow = () => setInvites((prev) => [...prev, { email: '', role: 'member' }]);
  const removeInviteRow = (idx: number) => {
    if (invites.length === 1) return;
    setInvites((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ── Submit ─────────────────────────────────────── */
  const handleFinish = async (skipInvites = false) => {
    if (!canProceed()) return;
    setSubmitting(true);
    setError('');

    const payload = {
      admin: { displayName: displayName.trim(), email: email.trim(), password },
      instance: { name: instanceName.trim(), url: instanceUrl.trim() || undefined },
      invites: skipInvites ? [] : invites.filter((inv) => inv.email.trim()),
    };

    try {
      const { data } = await apiClient.post('/auth/setup', payload);
      login(data.data.user, data.data.accessToken, data.data.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Setup failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ────────────────────────────────────────────────────
   * Sidebar step item
   * ──────────────────────────────────────────────────── */
  const StepItem = ({ index }: { index: number }) => {
    const isActive = step === index;
    const isComplete = index < step;
    const clickable = isComplete;

    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => goToStep(index)}
        className={`flex items-center gap-3 w-full text-left py-1.5 ${
          clickable ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Step indicator */}
        {isComplete ? (
          <span className="w-[22px] h-[22px] rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5L5 9L9.5 3.5" />
            </svg>
          </span>
        ) : isActive ? (
          <span className="w-[22px] h-[22px] rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0 text-white text-[11px] font-semibold">
            {index + 1}
          </span>
        ) : (
          <span className="w-[22px] h-[22px] rounded-full border border-[var(--line-2)] flex items-center justify-center flex-shrink-0 text-[var(--ink-4)] text-[11px] font-semibold">
            {index + 1}
          </span>
        )}

        <span
          className={`text-[12px] ${
            isActive
              ? 'text-[var(--ink)] font-semibold'
              : isComplete
                ? 'text-[var(--ink-2)] font-medium'
                : 'text-[var(--ink-4)] font-medium'
          }`}
        >
          {STEPS[index].label}
        </span>
      </button>
    );
  };

  /* ────────────────────────────────────────────────────
   * Label helper (bottom-border-only input style)
   * ──────────────────────────────────────────────────── */
  const inputClass =
    'w-full bg-transparent border-0 border-b border-[var(--line-2)] rounded-none px-0 py-2 text-[13px] text-[var(--ink)] placeholder-[var(--ink-4)] focus:border-[var(--accent)] focus:outline-none focus:ring-0 transition-colors';

  /* ────────────────────────────────────────────────────
   * Step content
   * ──────────────────────────────────────────────────── */
  const renderStep = () => {
    switch (step) {
      /* ── Welcome ──────────────────────────────────── */
      case 0:
        return (
          <div className="max-w-lg">
            <div className="smallcaps mb-4">Welcome to Trackero</div>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Let's get your instance <span className="serif-i">up and running.</span>
            </h2>
            <p className="mt-4 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-md">
              This wizard will walk you through the essential first-run steps: creating your
              admin account, naming your instance, and optionally inviting your team. It takes
              about two minutes.
            </p>

            <div className="mt-10">
              <button
                type="button"
                onClick={goNext}
                className="btn btn-accent h-[34px] px-5 text-[13px]"
              >
                Continue &rarr;
              </button>
            </div>
          </div>
        );

      /* ── Admin Account ────────────────────────────── */
      case 1:
        return (
          <div className="max-w-xl">
            <div className="smallcaps mb-4">
              Welcome &mdash; you're the first user on this instance.
            </div>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Set up your<br />
              <span className="serif-i">admin account.</span>
            </h2>
            <p className="mt-3 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-md">
              This account will have full administrative privileges. You can create
              additional admin accounts later from Settings.
            </p>

            <div className="mt-8 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                  Your name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className={inputClass}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ada@example.com"
                  className={inputClass}
                />
              </div>

              {/* Password + Confirm row */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••••"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                    Confirm
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--ink-4)]">
                14+ chars, mixed case, one number
              </p>

              {/* Info box */}
              <div className="border-l-[3px] border-[var(--accent-2)] bg-[var(--accent-bg)] rounded-r-[var(--radius)] px-4 py-3 mt-2">
                <div className="text-[12px] font-semibold text-[var(--accent-ink)] mb-1">
                  You'll be the admin
                </div>
                <p className="text-[12px] text-[var(--ink-3)] leading-relaxed">
                  As the first user, you'll have full access to instance settings, user
                  management, and all projects. You can promote other users to admin later.
                </p>
              </div>
            </div>
          </div>
        );

      /* ── Instance Basics ──────────────────────────── */
      case 2:
        return (
          <div className="max-w-lg">
            <div className="smallcaps mb-4">Instance basics</div>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Name your <span className="serif-i">instance.</span>
            </h2>
            <p className="mt-3 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-md">
              This name appears in the sidebar and email notifications. You can change it
              later in Settings.
            </p>

            <div className="mt-8 space-y-5">
              <div>
                <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                  Instance name
                </label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Acme Corp"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                  Instance URL <span className="text-[var(--ink-4)] font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  placeholder="https://trackero.acme.com"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        );

      /* ── Invite Your Team ─────────────────────────── */
      case 3:
        return (
          <div className="max-w-xl">
            <div className="smallcaps mb-4">Invite your team</div>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Bring your <span className="serif-i">team along.</span>
            </h2>
            <p className="mt-3 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-md">
              Send invite emails now, or skip this and invite people later from Settings.
            </p>

            <div className="mt-8 space-y-3">
              {invites.map((inv, idx) => (
                <div key={idx} className="flex items-end gap-3">
                  <div className="flex-1">
                    {idx === 0 && (
                      <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                        Email
                      </label>
                    )}
                    <input
                      type="email"
                      value={inv.email}
                      onChange={(e) => updateInvite(idx, 'email', e.target.value)}
                      placeholder="colleague@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div className="w-[140px]">
                    {idx === 0 && (
                      <label className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1">
                        Role
                      </label>
                    )}
                    <select
                      value={inv.role}
                      onChange={(e) => updateInvite(idx, 'role', e.target.value)}
                      className={`${inputClass} appearance-none cursor-pointer`}
                    >
                      <option value="member">Member</option>
                      <option value="project_manager">Project Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInviteRow(idx)}
                    disabled={invites.length === 1}
                    className="text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-30 disabled:cursor-default pb-2 transition-colors"
                    aria-label="Remove row"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M3 7h8" />
                    </svg>
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addInviteRow}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors mt-1"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 2v8M2 6h8" />
                </svg>
                Add another
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /* ────────────────────────────────────────────────────
   * Footer navigation
   * ──────────────────────────────────────────────────── */
  const renderFooter = () => {
    const nextLabels = [
      'Continue → admin account',
      'Continue → instance basics',
      'Continue → invite team',
    ];

    return (
      <div className="flex items-center justify-between mt-10">
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="btn-ghost h-[34px] px-4 text-[13px]"
          >
            &larr; Back
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {step === 3 && (
            <button
              type="button"
              onClick={() => handleFinish(true)}
              disabled={submitting}
              className="btn-ghost h-[34px] px-4 text-[13px]"
            >
              Skip
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="btn btn-accent h-[34px] px-5 text-[13px]"
            >
              {nextLabels[step]}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleFinish(false)}
              disabled={submitting}
              className="btn btn-accent h-[34px] px-5 text-[13px]"
            >
              {submitting ? 'Setting up…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ────────────────────────────────────────────────────
   * Layout
   * ──────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col bg-[var(--paper)]">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-6 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border-[1.5px] border-[var(--ink)] inline-block" />
          <span className="font-serif italic text-[17px] leading-none text-[var(--ink)]">
            trackero<span className="text-[var(--accent)]">.</span>
          </span>
        </div>
        <div className="smallcaps text-[10px]">
          First-run &middot; Step {step + 1} of {STEPS.length}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-[180px] border-r border-[var(--line)] px-5 py-6 flex-shrink-0">
          <div className="smallcaps smallcaps-ink text-[10px] mb-4">Setup</div>
          <div className="space-y-1">
            {STEPS.map((_, i) => (
              <StepItem key={i} index={i} />
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-12 py-10 overflow-y-auto">
          {error && (
            <div className="mb-6 max-w-xl rounded-[var(--radius)] bg-[#E0525214] border border-[#E0525230] px-4 py-2.5 text-[13px] text-[var(--color-danger,#E05252)]">
              {error}
            </div>
          )}
          {renderStep()}
          {renderFooter()}
        </main>
      </div>
    </div>
  );
}
