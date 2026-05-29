import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import EyeSvg from '@/assets/icons/eye.svg?react';
import EyeOffSvg from '@/assets/icons/eye-off.svg?react';

const baseClass =
  'w-full rounded-md border border-rule bg-card px-3 py-2 text-[14px] text-text placeholder-faint focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac-tint disabled:cursor-not-allowed disabled:bg-paper disabled:text-mute';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'email' | 'search' | 'date' | 'number' | 'password';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    if (type === 'password') {
      return (
        <div className={`relative ${className || ''}`}>
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={`${baseClass} pr-9`}
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
              <EyeOffSvg width={16} height={16} />
            ) : (
              <EyeSvg width={16} height={16} />
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
