import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Logo } from '../ui/Logo';

const STEPS = [
  'Welcome',
  'Admin account',
  'Invite your team',
  'Ready',
] as const;

export interface SetupWizardFooter {
  backLabel?: string;
  nextLabel: string;
  onBack?: () => void;
  onNext: () => void;
  centerText?: string;
  nextDisabled?: boolean;
  extraButtons?: ReactNode;
}

interface SetupWizardLayoutProps {
  step: number;
  footer: SetupWizardFooter;
  error?: string;
  onGoToStep?: (index: number) => void;
  children: ReactNode;
}

function StepItem({
  index,
  currentStep,
  onGoToStep,
}: {
  index: number;
  currentStep: number;
  onGoToStep?: (index: number) => void;
}) {
  const isActive = currentStep === index;
  const isComplete = index < currentStep;
  const clickable = isComplete && !!onGoToStep;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onGoToStep?.(index)}
      className={`flex items-center gap-3 w-full text-left py-1.5 ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      {isComplete ? (
        <span className="w-[24px] h-[24px] rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
          <Check size={12} className="text-white" strokeWidth={2} />
        </span>
      ) : isActive ? (
        <span className="w-[24px] h-[24px] rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0 text-white text-[12px] font-semibold">
          {index + 1}
        </span>
      ) : (
        <span className="w-[24px] h-[24px] rounded-full border border-[var(--line-2)] flex items-center justify-center flex-shrink-0 text-[var(--ink-4)] text-[12px] font-semibold">
          {index + 1}
        </span>
      )}

      <span
        className={`text-[13.5px] ${
          isActive
            ? 'text-[var(--ink)] font-semibold'
            : isComplete
              ? 'text-[var(--ink-2)] font-medium'
              : 'text-[var(--ink-4)] font-medium'
        }`}
      >
        {STEPS[index]}
      </span>
    </button>
  );
}

export function SetupWizardLayout({
  step,
  footer,
  error,
  onGoToStep,
  children,
}: SetupWizardLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-[var(--paper)]">
      {/* Header */}
      <header className="h-[54px] flex items-center justify-between px-6 border-b border-[var(--line)] flex-shrink-0">
        <Logo height={18} variant="dark" />
        <div className="smallcaps text-[10px]">
          First-run &middot; Step {step + 1} of {STEPS.length}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidenav */}
        <aside className="w-[220px] border-r border-[var(--line)] px-6 py-8 flex-shrink-0">
          <div className="smallcaps smallcaps-ink text-[10px] mb-4">Setup</div>
          <div className="space-y-1">
            {STEPS.map((_, i) => (
              <StepItem key={i} index={i} currentStep={step} onGoToStep={onGoToStep} />
            ))}
          </div>
        </aside>

        {/* Client area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 px-14 py-10 overflow-y-auto">
            {error && (
              <div className="mb-6 max-w-xl bg-[#E0525214] border border-[#E0525230] px-4 py-2.5 text-[13px] text-[var(--color-danger,#E05252)]">
                {error}
              </div>
            )}
            {children}
          </main>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--line)] px-14 py-4 flex-shrink-0">
            {footer.onBack ? (
              <button
                type="button"
                onClick={footer.onBack}
                className="btn-ghost h-[34px] px-4 text-[13px]"
              >
                {footer.backLabel ?? '← Back'}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {footer.extraButtons}
              <span className="text-[12px] text-[var(--ink-4)]">
                {footer.centerText ?? '~ 3 minutes'}
              </span>
              <button
                type="button"
                onClick={footer.onNext}
                disabled={footer.nextDisabled}
                className="btn btn-accent h-[34px] px-5 text-[13px]"
              >
                {footer.nextLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { STEPS as SETUP_STEPS };
