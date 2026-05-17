import { forwardRef, type InputHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 dark:placeholder-dneutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:dark:bg-dneutral-200 disabled:opacity-60';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'email' | 'search';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
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
