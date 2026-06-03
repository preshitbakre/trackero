import { useState, useEffect, useCallback, useRef } from 'react';
import { Filter } from 'lucide-react';
import type { EpicChildrenGroups } from '../../api/epics';
import { getEpicChildren } from '../../api/epics';
import { Button } from '../../components/ui/Button';
import { EpicChildRow } from '../../components/epics/EpicChildRow';

const GROUP_DOT: Record<string, string> = {
  in_progress: '#D6B588',
  in_review: '#D688D0',
  open: '#A8A1B5',
  done: '#88D68E',
};

const GROUP_OPTIONS: { value: 'status' | 'sprint'; label: string }[] = [
  { value: 'status', label: 'By status' },
  { value: 'sprint', label: 'By sprint' },
];

interface Props {
  epicId: number;
  epicKey: string;
  projectId: string;
  canEdit: boolean;
  onAddStory: () => void;
  onOpenChild: (id: number) => void;
  reloadKey?: number;
}

export function StoriesTab({ epicId, projectId, canEdit, onAddStory, onOpenChild, reloadKey }: Props) {
  const [groupBy, setGroupBy] = useState<'status' | 'sprint'>('status');
  const [data, setData] = useState<EpicChildrenGroups | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    getEpicChildren(projectId, epicId, groupBy).then(setData).catch(() => {});
  }, [projectId, epicId, groupBy]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filterOpen]);

  const filterLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'By status';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[20px] text-text font-serif italic">
          All children <span className="text-mute font-sans not-italic text-[14px]">· {data?.totalItems ?? 0} items · {data?.totalPoints ?? 0} pts total</span>
        </p>
        <div className="flex items-center gap-2">
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={`btn-ghost inline-flex items-center gap-2 ${filterOpen ? 'bg-shade' : ''}`}
            >
              <Filter size={14} aria-hidden />
              {filterLabel}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 bg-card shadow-[0_4px_14px_rgba(0,0,0,0.10)] border border-rule min-w-[160px] z-10 py-1">
                {GROUP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setGroupBy(opt.value);
                      setFilterOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-[13px] hover:bg-shade ${
                      groupBy === opt.value ? 'bg-shade font-medium' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <Button variant="ink" onClick={onAddStory} className="inline-flex items-center gap-2">
              + Add ticket
            </Button>
          )}
        </div>
      </div>

      {data && data.groups.length > 0 ? (
        <div className="bg-card border-y border-rule">
          {data.groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-paper-2 text-[12px] tracking-[0.1em] uppercase text-faint">
                {GROUP_DOT[g.key] && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GROUP_DOT[g.key] }} />
                )}
                <span>{g.label}</span>
                <span>{g.count}</span>
                <span className="ml-auto normal-case tracking-normal">{g.points} pts</span>
              </div>
              {g.items.map((it) => (
                <EpicChildRow key={it.id} item={it} onClick={onOpenChild} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-faint py-10 text-center">No items in this epic yet.</p>
      )}
    </div>
  );
}
