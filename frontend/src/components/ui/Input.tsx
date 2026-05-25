import { forwardRef, useState, type InputHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-rule bg-card px-3 py-2 text-[14px] text-text placeholder-faint focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac-tint disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-60';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'email' | 'search' | 'date' | 'number' | 'password';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    if (type === 'password') {
      return (
        <div className="relative">
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={`${baseClass} pr-9 ${className || ''}`}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-mute transition-colors flex items-center justify-center outline-none focus:outline-none"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 2l12 12" />
                <path d="M6.5 6.5a2 2 0 0 0 2.83 2.83" />
                <path d="M3.8 3.8C2.5 4.9 1.5 6.3 1 8c1.1 3.5 4 6 7 6 1.3 0 2.5-.4 3.6-1" />
                <path d="M10.7 5.3C12 6.1 13 7 13.8 8c-.5 1.6-1.5 3-2.8 4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 8c1.1-3.5 4-6 7-6s5.9 2.5 7 6c-1.1 3.5-4 6-7 6S2.1 11.5 1 8z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
            )}
          </button>
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        className={`${baseClass} ${className || ''}`}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
