import { useState, useEffect, useRef } from 'react';
import { Shapes } from 'lucide-react';
import { TypeTag } from '../ui';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'subtask', label: 'Subtask' },
];

interface TypeMultiSelectProps {
  selected: string[];
  onChange: (types: string[]) => void;
}

export function TypeMultiSelect({ selected, onChange }: TypeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectedLabel =
    selected.length === 1
      ? TYPE_OPTIONS.find((o) => o.value === selected[0])?.label
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 text-[14px] font-medium px-3 rounded-md border h-[32px] min-w-[120px] ${
          selected.length > 0
            ? 'bg-lilac-tint border-lilac text-lilac-dark'
            : 'border-rule text-faint hover:bg-paper'
        }`}
      >
        <Shapes size={16} className="flex-shrink-0" />
        <span className="truncate">{selected.length === 0 ? 'Type' : selectedLabel}</span>
        {selected.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="ml-auto text-faint hover:text-mute"
          >
            ×
          </button>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-44 bg-card shadow-[0_8px_30px_rgba(26,20,36,0.18),0_2px_8px_rgba(26,20,36,0.10)] z-[60] overflow-hidden">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-[14px] hover:bg-lilac-tint"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-white text-[10px] ${
                selected.includes(opt.value) ? 'bg-lilac border-lilac' : 'border-rule'
              }`}>
                {selected.includes(opt.value) && '✓'}
              </span>
              <TypeTag kind={opt.value as any} size="sm" />
              <span className="text-text truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
