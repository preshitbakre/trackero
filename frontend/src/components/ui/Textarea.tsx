import { forwardRef, type TextareaHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-rule bg-card px-3 py-2 text-[14px] text-text placeholder-faint focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac-tint resize-none';

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
