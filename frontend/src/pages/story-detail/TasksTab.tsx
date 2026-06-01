import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import type { TaskRow } from './types';

interface Props {
  topLevel: TaskRow[];
  subtasksByParent: Map<number, TaskRow[]>;
  statuses: { id: number; name: string; category: string }[];
  canEdit: boolean;
  onOpenItem: (id: number) => void;
  onAddTask: () => void;
  onReportBug: () => void;
  onLinkItem: () => void;
}

export function TasksTab({ topLevel, subtasksByParent, statuses, canEdit, onOpenItem, onAddTask, onReportBug, onLinkItem }: Props) {
  const allRows = [...topLevel, ...Array.from(subtasksByParent.values()).flat()];
  const totalPts = allRows.reduce((sum, r) => sum + (r.storyPoints ?? 0), 0);

  const order = new Map(statuses.map((s, i) => [s.id, i]));
  const groups = new Map<number, TaskRow[]>();
  for (const r of topLevel) {
    const sid = r.status?.id ?? -1;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid)!.push(r);
  }
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999),
  );

  const groupPts = (items: TaskRow[]) =>
    items.reduce((s, r) => s + (r.storyPoints ?? 0) + (subtasksByParent.get(r.id)?.reduce((x, st) => x + (st.storyPoints ?? 0), 0) ?? 0), 0);

  return (
    <div className="flex-1 min-w-0 px-[28px] py-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-serif text-[22px] text-text">Tasks &amp; bugs</h2>
          <span className="text-[13px] text-mute">· {allRows.length} child{allRows.length === 1 ? '' : 'ren'} · {totalPts} pts total</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="inline-flex items-center gap-1.5" onClick={onLinkItem}>Link existing</Button>
            <Button variant="secondary" size="sm" className="inline-flex items-center gap-1.5" onClick={onReportBug}>⚑ Report a bug</Button>
            <Button variant="ink" size="sm" onClick={onAddTask}>+ Add task</Button>
          </div>
        )}
      </div>

      {topLevel.length === 0 ? (
        <div className="text-center py-12 text-mute text-[14px]">No tasks or bugs in this story yet.</div>
      ) : (
        <div className="bg-card border border-rule/60">
          {sortedGroups.map(([sid, items], gi) => {
            const status = items[0]?.status;
            return (
              <div key={sid} className={gi > 0 ? 'border-t border-rule/60' : ''}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 bg-paper-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusDot(status?.category) }} />
                  <span className="text-[12px] font-semibold text-text uppercase tracking-[0.04em]">{status?.name ?? 'No status'}</span>
                  <span className="text-[11px] text-faint">{items.length}</span>
                  <span className="ml-auto text-[12px] text-mute">{groupPts(items)} pts</span>
                </div>
                {items.map((r) => (
                  <div key={r.id}>
                    <Row row={r} onOpenItem={onOpenItem} />
                    {(subtasksByParent.get(r.id) ?? []).map((st) => (
                      <Row key={st.id} row={st} onOpenItem={onOpenItem} indent />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ row, onOpenItem, indent }: { row: TaskRow; onOpenItem: (id: number) => void; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpenItem(row.id)}
      className="w-full flex items-center gap-2.5 h-[36px] border-b border-rule/40 px-4 text-[13px] hover:bg-lilac-tint/50 transition-colors text-left last:border-b-0"
      style={indent ? { paddingLeft: 44 } : undefined}
    >
      <span className="w-3.5 h-3.5 border border-rule/80 inline-flex items-center justify-center flex-shrink-0">
        {row.status?.category === 'done' && <span className="text-[9px] text-[#3E8E44]">✓</span>}
      </span>
      <TypeTag kind={(row.itemType as TypeTagKind) || 'task'} />
      <span className="font-mono text-[11px] text-mute w-[72px] flex-shrink-0">{row.itemKey}</span>
      <span className="flex-1 truncate text-text">{row.title}</span>
      <span className="inline-flex items-center gap-1.5 text-[12px] text-mute flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot(row.status?.category) }} />
        {row.status?.name ?? 'No status'}
      </span>
      <span className="font-mono text-[12px] text-text w-[28px] text-right flex-shrink-0">{row.storyPoints ?? '—'}</span>
      {row.assignee ? <Avatar user={row.assignee} size="xs" /> : <span className="w-6" />}
    </button>
  );
}

function statusDot(cat?: string): string {
  switch (cat) {
    case 'done': return '#88D68E';
    case 'in_progress': return '#D6B588';
    case 'in_review': return '#D688D0';
    case 'cancelled': return '#E05252';
    default: return '#A8A1B5';
  }
}
