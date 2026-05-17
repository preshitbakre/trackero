import { forwardRef, type TextareaHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-sm text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 dark:placeholder-dneutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40 resize-none';

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
