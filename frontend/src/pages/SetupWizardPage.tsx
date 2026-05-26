import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { SetupWizardLayout, SETUP_STEPS, type SetupWizardFooter } from '../components/layout/SetupWizardLayout';
import { Input } from '../components/ui/Input';
import { Eyebrow } from '../components/ui/Eyebrow';
import { validatePassword, passwordStrength } from '../lib/password';
import { Select } from '../components/ui/Select';
import { Avatar } from '../components/ui/Avatar';
import { Logo } from '../components/ui/Logo';


const WELCOME_CARDS = [
  {
    num: '01',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="0" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Your account',
    desc: "Name, email, password. You'll be the admin — irrevocably.",
  },
  {
    num: '02',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Your team',
    desc: 'Invite the first few teammates. Skip and add them later if you prefer.',
  },
  {
    num: '03',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    title: "You're in",
    desc: 'A starter project, a welcome email, and the keys to the instance.',
  },
];

interface PreflightCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  sub: string;
}

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-[#1F5236]',
  warn: 'bg-[#C68F12]',
  error: 'bg-[#E05252]',
};

export function SetupWizardPage() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams<{ step: string }>();
  const login = useAuthStore((s) => s.login);

  const step = Math.max(0, Math.min(SETUP_STEPS.length - 1, parseInt(stepParam || '1', 10) - 1));
  const setStep = (s: number) => navigate(`/setup/${s + 1}`, { replace: true });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const fieldErrors: Record<string, string | null> = {
    displayName: !displayName.trim() ? 'Name is required.' : null,
    username: !username.trim() ? 'Username is required.' : null,
    email: !email.trim()
      ? 'Email is required.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? 'Enter a valid email address.'
        : null,
    password: validatePassword(password),
    confirmPassword:
      confirmPassword.length > 0 && password !== confirmPassword
        ? 'Passwords do not match.'
        : !confirmPassword.trim()
          ? 'Please confirm your password.'
          : null,
  };

  const fieldError = (field: string) =>
    touched[field] ? fieldErrors[field] : null;




  const [invites, setInvites] = useState<{ email: string; name: string; role: string }[]>([
    { email: '', name: '', role: 'member' },
  ]);

  const [preflightSummary, setPreflightSummary] = useState('checking…');
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([]);

  const authStatus = useAuthStore((s) => s.authStatus);

  useEffect(() => {
    apiClient.get('/auth/setup-status').then((res) => {
      if (res.data.data.isSetup && authStatus !== 'authed') {
        navigate('/login', { replace: true });
      }
    }).catch(() => {});
    apiClient.get('/auth/preflight').then((res) => {
      const { summary, checks } = res.data.data;
      setPreflightSummary(summary);
      setPreflightChecks(checks);
    }).catch(() => {
      setPreflightSummary('unable to reach server');
    });
  }, [navigate, authStatus]);

  const canProceed = useCallback((): boolean => {
    setError('');
    if (step === 0) return true;
    if (step === 1) {
      setTouched({ displayName: true, username: true, email: true, password: true, confirmPassword: true });
      const hasErrors = Object.values(fieldErrors).some((e) => e !== null);
      return !hasErrors;
    }
    return true;
  }, [step, fieldErrors]);

  const goNext = useCallback(() => {
    if (!canProceed()) return;
    if (step === 1) {
      handleCreateAdmin();
      return;
    }
    if (step < SETUP_STEPS.length - 1) setStep(step + 1);
  }, [step, canProceed]);

  const goBack = useCallback(() => {
    if (step > 2) { setError(''); setStep(step - 1); }
  }, [step]);

  const goToStep = useCallback((target: number) => {
    if (target < step && target >= 2) {
      setError('');
      setStep(target);
    }
  }, [step]);

  const updateInvite = (idx: number, field: 'email' | 'name' | 'role', value: string) => {
    setInvites((prev) => prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv)));
  };
  const addInviteRow = () => setInvites((prev) => [...prev, { email: '', name: '', role: 'member' }]);
  const removeInviteRow = (idx: number) => {
    if (invites.length === 1) return;
    setInvites((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateAdmin = async () => {
    if (!canProceed()) return;
    setSubmitting(true);
    setError('');

    try {
      const { data } = await apiClient.post('/auth/setup', {
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
      login(data.data.user, data.data.accessToken, data.data.refreshToken);
      setStep(2);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Setup failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishSetup = () => {
    navigate('/dashboard');
  };

  const filledInviteCount = invites.filter((inv) => inv.email.trim()).length;

  const nextLabels = [
    'Get started → admin account',
    submitting ? 'Creating account…' : 'Create account → invite team',
    filledInviteCount > 0
      ? `Send ${filledInviteCount} invite${filledInviteCount !== 1 ? 's' : ''} & finish →`
      : 'Continue → ready',
    'Open Trackero →',
  ];

  const footer: SetupWizardFooter = {
    nextLabel: nextLabels[step],
    backLabel: step === 2 ? '← Admin account' : undefined,
    centerText: step === 3 ? 'You can change any of this from admin → settings.' : undefined,
    onNext: step < SETUP_STEPS.length - 1 ? goNext : handleFinishSetup,
    onBack: step === 2 ? goBack : undefined,
    nextDisabled: step === 1 && submitting,
    extraButtons: step === 2 ? (
      <button
        type="button"
        onClick={() => {
          setInvites([{ email: '', name: '', role: 'member' }]);
          goNext();
        }}
        disabled={submitting}
        className="btn-ghost h-[34px] px-4 text-[13px]"
      >
        Skip &middot; invite later
      </button>
    ) : undefined,
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div>
            <p className="smallcaps mb-[14px]">
              You&rsquo;re the first user on this instance
            </p>

            <h2 className="font-serif text-[44px] leading-[44px] tracking-[-1.1px] text-[var(--ink)]">
              Welcome to <span className="serif-i tracking-[-0.44px]">Trackero.</span>{' '}
              <span className="inline-flex items-center align-middle ml-1">
                <span className="inline-block w-[56px] h-[2px] bg-[var(--accent-2)]" />
              </span>
            </h2>

            <p className="mt-[14px] text-[14px] leading-[19.6px] text-[var(--ink-3)] max-w-[560px]">
              Self-hosted, open-source, agile project management. You&rsquo;re about to set up an
              instance for your team. It takes three steps and about two minutes.
            </p>

            <div className="mt-[32px] grid grid-cols-4 gap-[12px]">
              {WELCOME_CARDS.map((card) => (
                <div
                  key={card.num}
                  className="border border-[var(--line)] p-[16px] flex flex-col gap-[8px]"
                >
                  <div className="flex items-center gap-[6px]">
                    <span className="font-serif text-[24px] leading-[24px] tracking-[-0.96px] text-[var(--ink-3)] tabular-nums">
                      {card.num}
                    </span>
                    <span className="text-[var(--ink-3)]">{card.icon}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-[var(--ink)]">{card.title}</div>
                  <p className="text-[12px] leading-[16.8px] text-[var(--ink-3)]">{card.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-[32px] border border-[var(--line)] p-[16px]">
              <p className="smallcaps mb-[14px]">
                Preflight &middot; {preflightSummary}
              </p>
              <div className="grid grid-cols-4 gap-[12px]">
                {preflightChecks.map((item) => (
                  <div key={item.key} className="flex items-start gap-[8px]">
                    <span className={`mt-[5px] w-[7px] h-[7px] rounded-full ${STATUS_DOT[item.status] ?? STATUS_DOT.warn} shrink-0`} />
                    <div>
                      <div className="text-[12px] font-semibold text-[var(--ink)] leading-[16.8px]">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)] leading-[15.4px]">
                        {item.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 1: {
        const { segments, label: strengthLabel } = passwordStrength(password);
        const segmentColor = segments <= 1 ? 'bg-red-600' : segments <= 3 ? 'bg-amber-500' : 'bg-green-700';

        const inputOverride = '!rounded-none !bg-transparent !text-[13px]';
        const labelClass = 'block text-[11px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)] mb-1.5';

        return (
          <div className="max-w-xl">
            <Eyebrow className="mb-4">
              Welcome &mdash; you&rsquo;re the first user on this instance.
            </Eyebrow>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Set up your <span className="serif-i">admin account.</span>
            </h2>
            <p className="mt-3 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-md">
              This account owns the instance. You can transfer ownership later, but you
              can never lock yourself out&nbsp;&mdash; write the password down somewhere
              your team can find it.
            </p>

            <div className="mt-8">
              <Eyebrow size="sm" className="mb-4">Identity</Eyebrow>

              <div className="grid grid-cols-[1fr_1fr] gap-5">
                <div>
                  <label className={labelClass}>Your name</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={() => markTouched('displayName')}
                    placeholder="Jane Smith"
                    className={inputOverride}
                  />
                  {fieldError('displayName') && (
                    <p className="text-[11px] text-[#E05252] mt-1">{fieldError('displayName')}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Username</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
                      onBlur={() => markTouched('username')}
                      placeholder="jsmith"
                      className={inputOverride}
                    />
                    <span className="shrink-0 text-[12px] text-[var(--ink-4)] font-mono">
                      @{username || 'username'}
                    </span>
                  </div>
                  {fieldError('username') && (
                    <p className="text-[11px] text-[#E05252] mt-1">{fieldError('username')}</p>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <label className={labelClass}>Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched('email')}
                  placeholder="jane@example.com"
                  className={inputOverride}
                />
                {fieldError('email') && (
                  <p className="text-[11px] text-[#E05252] mt-1">{fieldError('email')}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-5 mt-5">
                <div>
                  <label className={labelClass}>Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => markTouched('password')}
                    placeholder="••••••••••••••"
                    className={inputOverride}
                  />
                  {fieldError('password') && (
                    <p className="text-[11px] text-[#E05252] mt-1">{fieldError('password')}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Confirm</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => markTouched('confirmPassword')}
                    placeholder="••••••••••••••"
                    className={inputOverride}
                  />
                  {fieldError('confirmPassword') && (
                    <p className="text-[11px] text-[#E05252] mt-1">{fieldError('confirmPassword')}</p>
                  )}
                </div>
              </div>

              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
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
                    &middot; 8–20 chars, mixed case, one number, one special
                  </span>
                </div>
              )}

              <div className="bg-[var(--accent-bg)] px-5 py-4 mt-8">
                <Eyebrow size="sm" className="!text-[var(--accent-ink)] mb-1">
                  You&rsquo;ll be the admin
                </Eyebrow>
                <p className="text-[13px] text-[var(--ink-3)] leading-relaxed">
                  Admins can add users, change roles, and configure the instance.
                  Other roles: PM, Member, Viewer.
                </p>
              </div>
            </div>
          </div>
        );
      }

      case 2: {
        const filledInvites = invites.filter((inv) => inv.email.trim());
        const firstInvite = filledInvites[0];
        const previewName = firstInvite?.name.trim() || firstInvite?.email.split('@')[0] || 'teammate';
        const previewRole = firstInvite
          ? firstInvite.role === 'project_manager' ? 'PM' : firstInvite.role === 'viewer' ? 'Viewer' : 'Member'
          : 'Member';
        const senderName = displayName || 'Admin';
        const instName = 'Trackero';

        return (
          <div>
            <Eyebrow className="mb-4">Entirely optional</Eyebrow>
            <h2 className="font-serif text-[32px] leading-[1.1] text-[var(--ink)]">
              Bring your <span className="serif-i">team.</span>
            </h2>
            <p className="mt-3 text-[13px] text-[var(--ink-3)] leading-relaxed max-w-[480px]">
              Drop in their emails. Trackero sends each a one-time invite link that expires in 7 days.
              You can also paste a CSV — name, email, role — for bulk.
            </p>

            <div className="mt-8 flex gap-10">
              {/* Left column — invite list */}
              <div className="flex-1 min-w-0">
                {/* Table header */}
                <div className="flex items-center border-b border-[var(--line)] pb-2 mb-0">
                  <div className="flex-1 pl-[40px] text-[11px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)]">
                    Email
                  </div>
                  <div className="w-[130px] text-[11px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)]">
                    Role
                  </div>
                  <div className="w-[28px]" />
                </div>

                {/* Invite rows */}
                {invites.map((inv, idx) => (
                  <div key={idx} className="flex items-center border-b border-[var(--line)] py-2.5 gap-3">
                    <Avatar
                      user={{ id: idx, displayName: inv.name.trim() || inv.email.trim() || '?' }}
                      size="md"
                    />
                    <div className="flex-1 min-w-0 -space-y-0.5">
                      <input
                        type="email"
                        value={inv.email}
                        onChange={(e) => updateInvite(idx, 'email', e.target.value)}
                        placeholder="colleague@example.com"
                        className="w-full bg-transparent border-0 p-0 text-[13px] leading-tight text-[var(--ink)] placeholder-[var(--ink-4)] focus:outline-none focus:ring-0"
                      />
                      <input
                        type="text"
                        value={inv.name}
                        onChange={(e) => updateInvite(idx, 'name', e.target.value)}
                        placeholder="Display name"
                        className="w-full bg-transparent border-0 p-0 text-[12px] leading-tight text-[var(--ink-3)] placeholder-[var(--ink-4)] focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="w-[130px] flex-shrink-0">
                      <Select
                        value={inv.role}
                        onChange={(v) => updateInvite(idx, 'role', v)}
                        options={[
                          { value: 'project_manager', label: 'PM' },
                          { value: 'member', label: 'Member' },
                          { value: 'viewer', label: 'Viewer' },
                        ]}
                        className="w-full h-[28px] text-[12px]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInviteRow(idx)}
                      disabled={invites.length === 1}
                      className="w-[28px] flex-shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-30 disabled:cursor-default transition-colors text-center"
                      aria-label="Remove row"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* Add row */}
                <button
                  type="button"
                  onClick={addInviteRow}
                  className="w-full flex items-center border-b border-[var(--line)] py-2.5 gap-3 text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors"
                >
                  <div className="w-[28px] h-[28px] rounded-full border border-dashed border-[var(--line-2)] flex items-center justify-center flex-shrink-0 text-[14px]">
                    +
                  </div>
                  <span className="text-[13px]">Add another</span>
                </button>

                <div className="mt-4 flex items-center">
                  <span className="ml-auto text-[12px] text-[var(--ink-4)]">
                    {filledInviteCount} ready &middot; 0 duplicates
                  </span>
                </div>
              </div>

              {/* Right column — email preview */}
              <div className="w-[300px] flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)]">
                    What they'll get
                  </span>
                  <span className="text-[11px] font-semibold tracking-[0.08em] uppercase bg-[var(--accent)] text-white px-2 py-0.5">
                    From {senderName}
                  </span>
                </div>

                <div className="border border-[var(--line)] p-5">
                  <div className="text-[10px] text-[var(--ink-4)] uppercase tracking-[0.08em] mb-4">
                    Subj: {senderName} invited you to {instName} on Trackero
                  </div>

                  <div className="mb-5">
                    <Logo height={14} variant="dark" />
                  </div>

                  <h3 className="font-serif text-[22px] leading-[1.2] text-[var(--ink)] mb-3">
                    Hi {previewName},<br /><span className="serif-i">{senderName}</span> invited you.
                  </h3>

                  <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mb-5">
                    You've been added to <strong className="text-[var(--ink)] font-semibold">{instName}</strong> as
                    a <strong className="text-[var(--ink)] font-semibold">{previewRole}</strong>. This link expires in 7 days.
                  </p>

                  <div className="mb-4">
                    <span className="inline-block bg-[var(--accent)] text-white text-[12px] font-semibold px-4 py-2 cursor-default">
                      Accept invitation &rarr;
                    </span>
                  </div>

                  <div className="text-[10px] text-[var(--ink-4)] font-mono break-all mb-4">
                    https://trackero.{instName.toLowerCase().replace(/\s+/g, '.')}/accept/xYkR1-3P6...
                  </div>

                  <p className="text-[10px] text-[var(--ink-4)] leading-relaxed border-t border-[var(--line)] pt-3">
                    Doesn't arrive? Trackero shows you the raw link in admin &rarr; invitations so you can hand it over manually.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 3: {
        const filledInvites = invites.filter((inv) => inv.email.trim());
        const inviteCount = filledInvites.length;
        const roleCounts = filledInvites.reduce<Record<string, number>>((acc, inv) => {
          const label = inv.role === 'project_manager' ? 'PM' : inv.role === 'viewer' ? 'viewer' : 'member';
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        }, {});
        const roleBreakdown = Object.entries(roleCounts).map(([r, c]) => `${c} ${r}${c > 1 ? 's' : ''}`).join(' · ');
        const smtpCheck = preflightChecks.find((c) => c.key === 'smtp');

        return (
          <div className="max-w-[680px]">
            <p className="smallcaps mb-[14px]">Everything is set</p>

            <h2 className="font-serif text-[44px] leading-[44px] tracking-[-1.1px] text-[var(--ink)]">
              You're <span className="serif-i tracking-[-0.44px]">in.</span>{' '}
              <span className="inline-flex items-center align-middle ml-1">
                <span className="inline-block w-[56px] h-[2px] bg-[var(--accent-2)]" />
              </span>
            </h2>

            <p className="mt-[14px] text-[14px] leading-[19.6px] text-[var(--ink-3)] max-w-[560px]">
              {inviteCount > 0 ? `${inviteCount} invite${inviteCount !== 1 ? 's' : ''} sent.` : 'No invites sent.'}{' '}
              {smtpCheck?.status === 'ok' ? 'SMTP wired. ' : ''}Trackero is yours to drive.
            </p>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-[12px] mt-[32px]">
              <div className="border border-[var(--line-2)] px-[16px] py-[14px]">
                <div className="font-serif text-[28px] leading-none text-[var(--ink)]">1</div>
                <div className="smallcaps mt-[8px] text-[10px]">Admin account</div>
                <div className="text-[12px] text-[var(--ink-3)] mt-[2px]">@{displayName.trim().split(' ')[0]?.toLowerCase() || 'admin'} · primary</div>
              </div>
              <div className="border border-[var(--line-2)] px-[16px] py-[14px]">
                <div className="font-serif text-[28px] leading-none text-[var(--ink)]">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[0]?.slice(0, 2).toUpperCase() || 'UTC'}
                </div>
                <div className="smallcaps mt-[8px] text-[10px]">Time zone</div>
                <div className="text-[12px] text-[var(--ink-3)] mt-[2px]">{Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
              </div>
              <div className="border border-[var(--line-2)] px-[16px] py-[14px]">
                <div className="font-serif text-[28px] leading-none text-[var(--ink)]">{inviteCount}</div>
                <div className="smallcaps mt-[8px] text-[10px]">Invitations sent</div>
                <div className="text-[12px] text-[var(--ink-3)] mt-[2px]">{roleBreakdown || 'none'}</div>
              </div>
              <div className="border border-[var(--line-2)] px-[16px] py-[14px]">
                <div className="font-serif text-[28px] leading-none text-[var(--ink)]">
                  {smtpCheck?.status === 'ok' ? '✓' : '—'}
                </div>
                <div className="smallcaps mt-[8px] text-[10px]">
                  {smtpCheck?.status === 'ok' ? 'SMTP live' : 'SMTP'}
                </div>
                <div className="text-[12px] text-[var(--ink-3)] mt-[2px]">{smtpCheck?.sub || 'not configured'}</div>
              </div>
            </div>

          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <SetupWizardLayout
      step={step}
      footer={footer}
      error={error}
      onGoToStep={goToStep}
    >
      {renderStep()}
    </SetupWizardLayout>
  );
}
