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

export function StoriesViewToggle({ view, onChange }: Props) {
  return (
    <div className="inline-flex items-center bg-paper-2 rounded-[4px] p-[3px]">
      {OPTIONS.map((o) => {
        const active = o.key === view;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 text-[12px] font-semibold rounded-[3px] transition-colors ${
              active
                ? 'bg-white text-text border border-text shadow-sm'
                : 'text-mute border border-transparent hover:text-text'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
