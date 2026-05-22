import { forwardRef, type InputHTMLAttributes } from 'react';

const baseClass =
  'w-full rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-3 py-2 text-[16px] text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 dark:placeholder-dneutral-400 focus:border-peri focus:outline-none focus:ring-2 focus:ring-peri/40';

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  onChange: (value: number | null) => void;
  value: number | null | undefined;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, onChange, value, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows, home, end
      const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (allowed.includes(e.key)) return;
      // Allow Ctrl/Cmd + A, C, V, X
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
      // Allow digits and minus
      if (/^[0-9-]$/.test(e.key)) return;
      e.preventDefault();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (!/^-?\d+$/.test(pasted.trim())) {
        e.preventDefault();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '' || raw === '-') {
        onChange(null);
        return;
      }
      const num = parseInt(raw, 10);
      if (!isNaN(num)) {
        onChange(num);
      }
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`${baseClass} ${className || ''}`}
        {...props}
      />
    );
  },
);

NumberInput.displayName = 'NumberInput';
