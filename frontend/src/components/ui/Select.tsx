import * as SelectPrimitive from '@radix-ui/react-select';

const EMPTY_VALUE = '__none__';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder, className }: SelectProps) {
  // Radix doesn't allow empty string as Item value, so we map '' ↔ sentinel
  const radixValue = value === '' ? EMPTY_VALUE : value;
  const handleChange = (v: string) => onChange(v === EMPTY_VALUE ? '' : v);

  const radixOptions = options.map((opt) => ({
    ...opt,
    value: opt.value === '' ? EMPTY_VALUE : opt.value,
  }));

  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={handleChange}>
      <SelectPrimitive.Trigger
        className={`inline-flex items-center justify-between gap-2 rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 px-3 text-[16px] text-neutral-700 dark:text-dneutral-700 hover:bg-neutral-100 dark:hover:bg-dneutral-200 focus:outline-none focus:border-lilac dark:focus:border-peri-dm focus:ring-2 focus:ring-lilac-tint dark:focus:ring-peri-dm/20 h-[30px] overflow-hidden ${className || ''}`}
      >
        <span className="truncate min-w-0">
          <SelectPrimitive.Value placeholder={placeholder || 'Select...'} />
        </span>
        <SelectPrimitive.Icon className="flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] max-w-[320px] overflow-hidden rounded-md border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1 max-h-[240px] overflow-y-auto">
            {radixOptions.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center rounded px-3 py-2 text-[16px] text-neutral-700 dark:text-dneutral-700 cursor-pointer outline-none data-[highlighted]:bg-lilac/10 data-[highlighted]:text-lilac-dark data-[state=checked]:font-medium"
                title={opt.label}
              >
                <SelectPrimitive.ItemText>
                  <span className="block truncate max-w-[260px]">{opt.label}</span>
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
