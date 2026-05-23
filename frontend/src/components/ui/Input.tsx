import { forwardRef, type InputHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 px-3 py-2 text-[16px] text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-lilac dark:focus:border-peri-dm focus:outline-none focus:ring-2 focus:ring-lilac-tint dark:focus:ring-peri-dm/20 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:dark:bg-dneutral-200 disabled:opacity-60';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'email' | 'search' | 'date' | 'number' | 'password';
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
