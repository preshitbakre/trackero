import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

export interface StatusOption {
  id: number;
  name: string;
  color: string;
}

interface Props {
  value: number;
  options: StatusOption[];
  onChange: (statusId: number) => void;
  disabled?: boolean;
}

/**
 * Compact inline status dropdown for the epic Tickets table. Shows a coloured
 * dot in the status's real board-settings colour (project_statuses.color),
 * unlike StatusPill which uses a fixed category palette.
 */
export function RowStatusSelect({ value, options, onChange, disabled }: Props) {
  const current = options.find((o) => o.id === value);

  return (
    <SelectPrimitive.Root
      value={String(value)}
      onValueChange={(v) => {
        const next = parseInt(v, 10);
        if (next !== value) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 h-[26px] px-2 text-[12px] text-text border border-rule bg-card hover:bg-paper focus:outline-none focus:border-lilac focus:ring-2 focus:ring-lilac-tint disabled:opacity-60 disabled:pointer-events-none max-w-[150px]"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: current?.color ?? '#A8A1B5' }}
        />
        <span className="truncate min-w-0">
          <SelectPrimitive.Value placeholder="Status" />
        </span>
        <SelectPrimitive.Icon className="flex-shrink-0">
          <ChevronDown size={12} className="text-mute" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[var(--radix-select-trigger-width)] max-w-[260px] overflow-hidden bg-card shadow-[0_8px_30px_rgba(26,20,36,0.18),0_2px_8px_rgba(26,20,36,0.10)]"
        >
          <SelectPrimitive.Viewport className="p-1 max-h-[260px] overflow-y-auto">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.id}
                value={String(opt.id)}
                className="relative flex items-center gap-2 pl-3 pr-7 py-1.5 text-[12.5px] text-text cursor-pointer outline-none data-[highlighted]:bg-lilac-tint data-[highlighted]:text-lilac-dark data-[state=checked]:font-medium"
                title={opt.name}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                <SelectPrimitive.ItemText>
                  <span className="block truncate max-w-[200px]">{opt.name}</span>
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check size={13} className="text-lilac-dark" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
