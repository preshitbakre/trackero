import { useState, useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import { Input } from '../ui/Input';

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
        className={`inline-flex items-center gap-1.5 text-[14px] font-medium px-3 rounded-md border h-[32px] min-w-[140px] ${
          selected.length > 0
            ? 'bg-lilac-tint border-lilac text-lilac-dark'
            : 'border-rule text-faint hover:bg-paper'
        }`}
      >
        <User size={16} className="flex-shrink-0" />
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
            className="ml-auto text-faint hover:text-mute"
          >
            ×
          </button>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-56 bg-card shadow-[0_8px_30px_rgba(26,20,36,0.18),0_2px_8px_rgba(26,20,36,0.10)] z-[60] overflow-hidden">
          <div className="p-2 border-b border-rule">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="!text-[13px] !py-1.5"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-[14px] hover:bg-lilac-tint"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-white text-[10px] ${
                    selected.includes(opt.id)
                      ? 'bg-lilac border-lilac'
                      : 'border-rule'
                  }`}>
                    {selected.includes(opt.id) && '✓'}
                  </span>
                  <span className="text-text truncate">{opt.name}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-[14px] text-faint">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
