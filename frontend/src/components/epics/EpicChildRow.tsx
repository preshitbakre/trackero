import type { EpicChildItem } from '../../api/epics';
import { TypeTag } from '../ui/TypeTag';
import type { TypeTagKind } from '../ui/TypeTag';
import { Avatar } from '../ui/Avatar';
import { LabelList } from '../ui/LabelBadge';

interface Props {
  item: EpicChildItem;
  onClick?: (id: number) => void;
}

/** One grouped child row (Overview preview + Stories tab). */
export function EpicChildRow({ item, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(item.id)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-rule last:border-b-0 hover:bg-lilac-tint/30 transition-colors"
    >
      <TypeTag kind={(item.itemType || 'task') as TypeTagKind} size="sm" />
      <span className="font-mono text-[13px] text-mute shrink-0 w-20">{item.itemKey}</span>
      <span className="text-[14px] text-text truncate flex-1 min-w-0">{item.title}</span>
      <LabelList labels={item.labels} max={2} />
      {item.storyPoints != null && <span className="text-[13px] text-mute shrink-0">{item.storyPoints}</span>}
      <span className="shrink-0 w-7">{item.assignee && <Avatar user={item.assignee} size="sm" />}</span>
    </button>
  );
}
