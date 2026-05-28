import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { StoryListItem } from './types';
import type { StoryFilters } from './helpers';

interface Props {
  stories: StoryListItem[];
  filters: StoryFilters;
  onChange: (f: StoryFilters) => void;
}

const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** "More" filter popover — assignee / label / priority / sprint facets. */
export function StoriesFilterPopover({ stories, filters, onChange }: Props) {
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

  // Distinct facets from the loaded stories.
  const assignees = Array.from(
    new Map(stories.filter((s) => s.assignee).map((s) => [s.assignee!.id, s.assignee!])).values(),
  );
  const labels = Array.from(
    new Map(stories.flatMap((s) => s.labels).map((l) => [l.id, l])).values(),
  );
  const sprints = Array.from(
    new Map(stories.filter((s) => s.sprint).map((s) => [s.sprint!.id, s.sprint!])).values(),
  );

  const activeCount =
    filters.assigneeIds.length + filters.labelIds.length + filters.priorities.length + filters.sprintIds.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-ghost inline-flex items-center gap-1.5 ${activeCount > 0 ? 'bg-shade' : ''}`}
      >
        <SlidersHorizontal size={14} /> More
        {activeCount > 0 && <span className="text-lilac">· {activeCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[260px] bg-card border border-rule shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-20 p-3 max-h-[420px] overflow-y-auto">
          <FacetSection title="Priority">
            {PRIORITIES.map((p) => (
              <FacetRow
                key={p}
                label={p}
                checked={filters.priorities.includes(p)}
                onToggle={() => onChange({ ...filters, priorities: toggle(filters.priorities, p) })}
              />
            ))}
          </FacetSection>

          {assignees.length > 0 && (
            <FacetSection title="Assignee">
              {assignees.map((a) => (
                <FacetRow
                  key={a.id}
                  label={a.displayName}
                  checked={filters.assigneeIds.includes(a.id)}
                  onToggle={() => onChange({ ...filters, assigneeIds: toggle(filters.assigneeIds, a.id) })}
                />
              ))}
            </FacetSection>
          )}

          {labels.length > 0 && (
            <FacetSection title="Label">
              {labels.map((l) => (
                <FacetRow
                  key={l.id}
                  label={l.name}
                  dot={l.color}
                  checked={filters.labelIds.includes(l.id)}
                  onToggle={() => onChange({ ...filters, labelIds: toggle(filters.labelIds, l.id) })}
                />
              ))}
            </FacetSection>
          )}

          {sprints.length > 0 && (
            <FacetSection title="Sprint">
              {sprints.map((s) => (
                <FacetRow
                  key={s.id}
                  label={s.name}
                  checked={filters.sprintIds.includes(s.id)}
                  onToggle={() => onChange({ ...filters, sprintIds: toggle(filters.sprintIds, s.id) })}
                />
              ))}
            </FacetSection>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              className="btn-ghost w-full mt-2 text-[12px]"
              onClick={() =>
                onChange({ ...filters, assigneeIds: [], labelIds: [], priorities: [], sprintIds: [] })
              }
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FacetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="smallcaps mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function FacetRow({
  label,
  checked,
  onToggle,
  dot,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-1 text-[13px] text-text hover:bg-paper rounded px-1 text-left"
    >
      <span
        className={`w-3.5 h-3.5 border flex-shrink-0 inline-flex items-center justify-center ${
          checked ? 'bg-ink border-ink text-white' : 'border-rule'
        }`}
      >
        {checked && <span className="text-[10px] leading-none">✓</span>}
      </span>
      {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
      <span className="capitalize truncate">{label}</span>
    </button>
  );
}
