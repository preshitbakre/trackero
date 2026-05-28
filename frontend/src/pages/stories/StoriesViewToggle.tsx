import type { StoryView } from './types';

interface Props {
  view: StoryView;
  onChange: (v: StoryView) => void;
}

const OPTIONS: { key: StoryView; label: string }[] = [
  { key: 'epic', label: 'By epic' },
  { key: 'status', label: 'By status' },
  { key: 'sprint', label: 'By sprint' },
];

/** Segmented control switching the story grouping. */
export function StoriesViewToggle({ view, onChange }: Props) {
  return (
    <div className="inline-flex items-center bg-paper-2 p-0.5 rounded-md">
      {OPTIONS.map((o) => {
        const active = o.key === view;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1 text-[13px] rounded transition-colors ${
              active ? 'bg-card shadow-sm text-text font-medium' : 'text-mute hover:text-text'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
