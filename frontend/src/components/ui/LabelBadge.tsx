interface LabelBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
}

export function LabelBadge({ name, color, size = 'sm' }: LabelBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium truncate max-w-[100px] ${
        size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-[12px] px-2 py-0.5'
      }`}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}30`,
      }}
      title={name}
    >
      {name}
    </span>
  );
}

interface LabelListProps {
  labels: { id: number; name: string; color: string }[];
  max?: number;
  size?: 'sm' | 'md';
}

export function LabelList({ labels, max = 3, size = 'sm' }: LabelListProps) {
  if (!labels || labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const remaining = labels.length - max;

  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0 flex-wrap">
      {shown.map((l) => (
        <LabelBadge key={l.id} name={l.name} color={l.color} size={size} />
      ))}
      {remaining > 0 && (
        <span className="text-[11px] text-faint">+{remaining}</span>
      )}
    </span>
  );
}
