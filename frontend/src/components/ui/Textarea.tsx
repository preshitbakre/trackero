import { forwardRef, type TextareaHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 px-3 py-2 text-[16px] text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-peri dark:focus:border-peri-dm focus:outline-none focus:ring-2 focus:ring-peri-light dark:focus:ring-peri-dm/20 resize-none';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`${baseClass} ${className || ''}`}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
