import { useState, useMemo, useRef, useEffect } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional leading element (color dot, icon, etc.) */
  prefix?: React.ReactNode;
  /** Arbitrary data passed through for custom rendering */
  data?: any;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  /** Custom option renderer. If not provided, renders label with prefix. */
  renderOption?: (option: ComboboxOption, isHighlighted: boolean, isSelected: boolean) => React.ReactNode;
}

const inputClass =
  'w-full rounded-md border border-rule bg-card px-3 py-2 text-[14px] text-text placeholder-faint focus:border-lilac focus:outline-none focus:ring-2 focus:ring-lilac-tint h-[32px] truncate';

export function Combobox({ value, onChange, options, placeholder, emptyLabel, className, renderOption }: ComboboxProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => { setHighlightIdx(-1); }, [filtered]);

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        select(filtered[highlightIdx].value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  return (
    <div className={`relative ${className || ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? search : (selectedOption?.label || emptyLabel || '')}
          onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setSearch(''); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Select...'}
          title={selectedOption?.label || ''}
          className={`${inputClass} pr-8`}
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mute pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-[9]" onClick={() => { setOpen(false); setSearch(''); }} />
          <div
            ref={listRef}
            className="absolute z-10 mt-1 w-full max-h-[260px] overflow-y-auto rounded-md bg-card shadow-[0_1px_3px_rgba(26,20,36,0.04),0_8px_24px_rgba(26,20,36,0.06)]"
          >
            {filtered.map((opt, idx) => {
              const isHighlighted = idx === highlightIdx;
              const isSelected = opt.value === value;

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-b border-rule/60 last:border-b-0 ${
                    isHighlighted
                      ? 'bg-lilac-tint'
                      : isSelected
                        ? 'bg-lilac-tint/60'
                        : 'hover:bg-lilac-tint/60'
                  }`}
                >
                  {renderOption ? (
                    renderOption(opt, isHighlighted, isSelected)
                  ) : (
                    <div className="flex items-center gap-2 text-[14px] text-text">
                      {opt.prefix}
                      <span className="truncate">{opt.label}</span>
                    </div>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[14px] text-faint">No matches</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
