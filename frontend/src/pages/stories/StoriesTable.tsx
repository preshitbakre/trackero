import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TypeTag } from '../../components/ui/TypeTag';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusKey } from '../../components/ui/StatusPill';
import { Avatar } from '../../components/ui/Avatar';
import { LabelList } from '../../components/ui/LabelBadge';
import { epicStateToPill } from '../../api/epics';
import type { StoryGroup } from './helpers';

function GroupHeader({ group }: { group: StoryGroup }) {
  const { header } = group;
  return (
    <div className="flex items-center gap-2.5 mb-1">
      {header.kind === 'epic' && header.epicId != null && (
        <TypeTag kind="epic" size="xs" />
      )}
      {header.kind === 'epic' && header.epicKey && (
        <span className="font-mono text-[11px] text-faint">{header.epicKey}</span>
      )}
      {header.kind === 'status' && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusDot(header.statusCategory) }}
          aria-hidden
        />
      )}
      <span className="text-[14px] font-semibold text-text">{header.title}</span>
      {header.kind === 'epic' && header.health && (
        <StatusPill status={epicStateToPill(header.health) as StatusKey} dot caps />
      )}
      <div className="flex-1 border-t border-rule mx-1" />
      <span className="font-mono text-[10.5px] text-faint whitespace-nowrap">
        {header.kind === 'epic'
          ? `${group.doneCount}/${group.totalCount} done · ${group.points} pts`
          : `${group.totalCount} stor${group.totalCount === 1 ? 'y' : 'ies'} · ${group.points} pts`}
      </span>
    </div>
  );
}

function RowMenu({ itemKey, onOpen }: { itemKey: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="relative" ref={ref} onClick={stop}>
      <button
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        className="text-faint hover:text-text px-1"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[160px] bg-card border border-rule shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-20 py-1">
          <button type="button" onClick={() => { setOpen(false); onOpen(); }} className="w-full text-left px-3 py-1.5 text-[13px] text-text hover:bg-paper">Open</button>
          <button
            type="button"
            onClick={() => { setOpen(false); navigator.clipboard?.writeText(itemKey).catch(() => {}); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-text hover:bg-paper"
          >
            Copy key
          </button>
        </div>
      )}
    </div>
  );
}

function statusDot(cat?: string | null): string {
  switch (cat) {
    case 'done': return '#88D68E';
    case 'in_progress': return '#D6B588';
    case 'in_review': return '#D688D0';
    case 'cancelled': return '#E05252';
    default: return '#A8A1B5';
  }
}

interface Props {
  groups: StoryGroup[];
}

export function StoriesTable({ groups }: Props) {
  const navigate = useNavigate();
  const { id: projectId } = useParams();

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <GroupHeader group={group} />

          {/* Column header */}
          <div className="flex items-center h-[28px] px-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-faint border-b border-rule">
            <div className="w-[28px]" />
            <div className="w-[80px]">ID</div>
            <div className="flex-1">Title</div>
            <div className="w-[150px]">Status</div>
            <div className="w-[150px]">Labels</div>
            <div className="w-[48px] text-right">Pts</div>
            <div className="w-[56px] text-right">Tasks</div>
            <div className="w-[32px]" />
          </div>

          {/* Rows */}
          {group.items.map((s) => {
            const tasksTotal = s.progress?.totalItems ?? 0;
            const tasksDone = s.progress?.completedItems ?? 0;
            const href = `/projects/${projectId}/stories/${s.id}`;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(href)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(href); }}
                className="flex items-center h-[42px] border-b border-rule px-3 hover:bg-lilac-tint/50 transition-colors cursor-pointer"
              >
                <div className="w-[28px]"><TypeTag kind="story" /></div>
                <div className="w-[80px] font-mono text-[11px] text-faint">{s.itemKey}</div>
                <div className="flex-1 truncate text-[13px] text-text pr-3">{s.title}</div>
                <div className="w-[150px] flex items-center gap-2">
                  {s.assignee && <Avatar user={s.assignee} size="xs" />}
                  {s.status && <StatusPill status={(s.status.category as StatusKey) || 'backlog'} dot caps />}
                </div>
                <div className="w-[150px]"><LabelList labels={s.labels} max={2} /></div>
                <div className="w-[48px] text-right font-mono text-[11.5px] text-text">
                  {s.storyPoints ?? '—'}
                </div>
                <div className="w-[56px] text-right font-mono text-[11.5px] text-mute">
                  {tasksTotal > 0 ? `${tasksDone}/${tasksTotal}` : '—'}
                </div>
                <div className="w-[32px] flex justify-end">
                  <RowMenu itemKey={s.itemKey} onOpen={() => navigate(href)} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
