import { useState, useEffect, useRef } from 'react';

interface AssigneeOption {
  id: number;
  name: string;
}

interface AssigneeMultiSelectProps {
  options: AssigneeOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

export function AssigneeMultiSelect({ options, selected, onChange }: AssigneeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search
    ? options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedNames = options.filter((o) => selected.includes(o.id)).map((o) => o.name);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-[16px] px-3 py-1 rounded-md border min-w-[140px] ${
          selected.length > 0
            ? 'bg-lilac-tint dark:bg-peri-dm/30 border-lilac dark:border-peri-dm text-lilac-dark dark:text-peri-dm'
            : 'border-neutral-200 dark:border-dneutral-300 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
        }`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
        </svg>
        <span className="truncate">
          {selected.length === 0
            ? 'Assignee'
            : selected.length === 1
              ? selectedNames[0]
              : `${selected.length} selected`}
        </span>
        {selected.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="ml-auto text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600"
          >
            ×
          </button>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-lg border border-neutral-200 dark:border-dneutral-300 bg-white dark:bg-dneutral-100 shadow-lg z-[60] overflow-hidden">
          <div className="p-2 border-b border-neutral-200 dark:border-dneutral-200">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full text-[16px] px-2 py-1.5 rounded border border-neutral-200 dark:border-dneutral-300 bg-transparent text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400 focus:border-lilac focus:outline-none"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-[16px] hover:bg-neutral-100 dark:hover:bg-dneutral-200"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-white text-[16px] ${
                    selected.includes(opt.id)
                      ? 'bg-lilac border-lilac'
                      : 'border-neutral-300 dark:border-dneutral-400'
                  }`}>
                    {selected.includes(opt.id) && '✓'}
                  </span>
                  <span className="text-neutral-700 dark:text-dneutral-700 truncate">{opt.name}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-[16px] text-neutral-400">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
