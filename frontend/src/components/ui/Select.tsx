import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

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
        className={`inline-flex items-center justify-between gap-2 rounded-md border border-rule bg-card px-3 text-[14px] text-text hover:bg-paper focus:outline-none focus:border-lilac focus:ring-2 focus:ring-lilac-tint h-[32px] overflow-hidden ${className || ''}`}
      >
        <span className="truncate min-w-0">
          <SelectPrimitive.Value placeholder={placeholder || 'Select...'} />
        </span>
        <SelectPrimitive.Icon className="flex-shrink-0">
          <ChevronDown size={14} className="text-mute" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] max-w-[320px] overflow-hidden bg-card shadow-[0_8px_30px_rgba(26,20,36,0.18),0_2px_8px_rgba(26,20,36,0.10)]"
        >
          <SelectPrimitive.Viewport className="p-1 max-h-[240px] overflow-y-auto">
            {radixOptions.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center px-3 py-2 text-[14px] text-text cursor-pointer outline-none data-[highlighted]:bg-lilac-tint data-[highlighted]:text-lilac-dark data-[state=checked]:font-medium"
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
