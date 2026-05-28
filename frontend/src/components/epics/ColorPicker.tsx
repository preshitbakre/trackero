import { useState, useRef, useEffect } from 'react';

const PALETTE = ['#7C3AED', '#88A9D6', '#88D68E', '#D6B588', '#D688D0', '#E05252', '#E88A48', '#1F5A8A'];

interface Props {
  value: string;
  onChange: (color: string) => void;
}

/** Swatch button opening a brand-palette popover. */
export function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] w-full flex items-center gap-2 px-2 bg-card shadow-[inset_0_0_0_1px_var(--rule,#E8E3F0)]"
      >
        <span className="w-5 h-5 rounded" style={{ backgroundColor: value }} />
        <span className="text-[13px] text-mute font-mono">{value}</span>
        <span className="ml-auto text-faint text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 p-2 bg-card shadow-[0_4px_14px_rgba(0,0,0,0.12)] grid grid-cols-4 gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`w-7 h-7 rounded ${c === value ? 'ring-2 ring-offset-1 ring-text' : ''}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
