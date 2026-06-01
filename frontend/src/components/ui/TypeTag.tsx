import { TYPE_TAG_BG } from '../../lib/colors';

export type TypeTagKind = 'task' | 'bug' | 'story' | 'epic' | 'subtask';

interface TypeTagProps {
  kind: TypeTagKind;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const LETTERS: Record<TypeTagKind, string> = {
  task: 'T',
  bug: 'B',
  story: 'S',
  epic: 'E',
  subtask: 's',
};

/**
 * Single-letter coloured square tag (`T B S E s`) used on every
 * surface that lists work items: Board cards, Backlog rows, Today's
 * triage queue, Sprint Planning rows, Search results, etc. Colours
 * pull from `TYPE_TAG_BG` in lib/colors.ts so the visual treatment
 * stays the canonical source of truth.
 */
export function TypeTag({ kind, size = 'sm', className = '' }: TypeTagProps) {
  const palette = TYPE_TAG_BG[kind] ?? TYPE_TAG_BG.task;
  const sizePx = size === 'md' ? 20 : size === 'xs' ? 14 : 16;
  return (
    <span
      role="img"
      aria-label={`${kind} type`}
      className={`inline-flex items-center justify-center rounded-[2px] font-mono font-bold flex-shrink-0 ${className}`}
      style={{
        width: sizePx,
        height: sizePx,
        backgroundColor: palette.bg,
        color: palette.color,
        fontSize: size === 'md' ? 11 : size === 'xs' ? 8 : 9,
        lineHeight: 1,
      }}
    >
      {LETTERS[kind]}
    </span>
  );
}
