const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
const TSHIRT = [
  { label: 'XS', value: 1 },
  { label: 'S', value: 2 },
  { label: 'M', value: 3 },
  { label: 'L', value: 5 },
  { label: 'XL', value: 8 },
];

const TSHIRT_REVERSE: Record<number, string> = { 1: 'XS', 2: 'S', 3: 'M', 5: 'L', 8: 'XL' };

interface StoryPointsInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  scale: 'free' | 'fibonacci' | 'tshirt';
  disabled?: boolean;
}

export function StoryPointsInput({ value, onChange, scale, disabled }: StoryPointsInputProps) {
  if (scale === 'fibonacci') {
    return (
      <div className="flex gap-1">
        {FIBONACCI.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
            className={`px-2 py-1 text-sm rounded border transition-colors ${
              value === n
                ? 'bg-primary-500 text-white border-primary-500'
                : 'border-neutral-200 dark:border-dneutral-300 text-neutral-500 dark:text-dneutral-500 hover:border-primary-400'
            } disabled:opacity-50`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (scale === 'tshirt') {
    return (
      <div className="flex gap-1">
        {TSHIRT.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === t.value ? null : t.value)}
            className={`px-2.5 py-1 text-sm rounded border transition-colors ${
              value === t.value
                ? 'bg-primary-500 text-white border-primary-500'
                : 'border-neutral-200 dark:border-dneutral-300 text-neutral-500 dark:text-dneutral-500 hover:border-primary-400'
            } disabled:opacity-50`}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  // Free integer
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') { onChange(null); return; }
        if (/^\d+$/.test(v)) onChange(parseInt(v, 10));
      }}
      disabled={disabled}
      placeholder="-"
      className="w-16 text-right rounded-md border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 px-2 py-1 text-sm text-neutral-700 dark:text-dneutral-700 disabled:opacity-50"
    />
  );
}

/** Display story points as a label (for task cards, detail panels) */
export function StoryPointsLabel({ value, scale }: { value: number | null; scale?: string }) {
  if (value == null || value === 0) return null;

  const displayText = scale === 'tshirt' ? (TSHIRT_REVERSE[value] || String(value)) : String(value);

  return (
    <span className="text-sm text-neutral-400 bg-neutral-100 dark:bg-dneutral-200 px-1.5 py-0.5 rounded">
      {displayText}{scale !== 'tshirt' ? 'pts' : ''}
    </span>
  );
}
