import { useState, useEffect } from 'react';
import type { EpicDetail, EpicChildrenGroups } from '../../api/epics';
import { getEpicChildren } from '../../api/epics';
import { Button } from '../../components/ui/Button';
import { EpicDetailStatStrip } from '../../components/epics/EpicDetailStatStrip';
import { AcrossSprintsTimeline } from '../../components/epics/AcrossSprintsTimeline';
import { EpicChildRow } from '../../components/epics/EpicChildRow';

const GROUP_DOT: Record<string, string> = {
  in_progress: '#D6B588',
  in_review: '#D688D0',
  open: '#A8A1B5',
  done: '#88D68E',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  epic: EpicDetail;
  projectId: string;
  onUpdateStatus: () => void;
  onOpenChild: (id: number) => void;
  onSeeAll: () => void;
}

const PREVIEW_LIMIT = 6;

export function OverviewTab({ epic, projectId, onUpdateStatus, onOpenChild, onSeeAll }: Props) {
  const [children, setChildren] = useState<EpicChildrenGroups | null>(null);

  useEffect(() => {
    getEpicChildren(projectId, epic.id, 'status').then(setChildren).catch(() => {});
  }, [projectId, epic.id]);

  const blocked = epic.displayState === 'blocked';
  let shown = 0;

  return (
    <div className="space-y-6">
      {/* Brief */}
      {epic.description && (
        <p className="font-serif text-[18px] leading-[1.5] text-text">
          {epic.description}
          {blocked && <span className="font-semibold"> Critical · P0</span>}
        </p>
      )}

      {/* Blocked banner */}
      {blocked && epic.blockedBy && (
        <div className="flex items-center gap-3 bg-lilac-tint px-4 py-3">
          <span aria-hidden>⛔</span>
          <p className="text-[13px] text-mute flex-1">
            <span className="font-semibold text-text">Blocked since {fmtDate(epic.blockedBy.since)} ·</span>{' '}
            {epic.blockedBy.note}
            {epic.blockedBy.owner && ` Owner: @${epic.blockedBy.owner}`}
          </p>
          <Button size="sm" variant="secondary" onClick={onUpdateStatus}>
            Update status
          </Button>
        </div>
      )}

      <EpicDetailStatStrip epic={epic} />

      <AcrossSprintsTimeline data={epic.acrossSprints} displayState={epic.displayState} />

      {/* Stories preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[16px] font-medium text-text">
            Stories <span className="text-mute font-normal">· {children?.totalItems ?? 0} under {epic.itemKey}</span>
          </h2>
          <button type="button" onClick={onSeeAll} className="text-[13px] text-lilac hover:underline">
            See all →
          </button>
        </div>
        {children && children.groups.length > 0 ? (
          <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            {children.groups.map((g) => {
              if (shown >= PREVIEW_LIMIT) return null;
              const room = PREVIEW_LIMIT - shown;
              const items = g.items.slice(0, room);
              shown += items.length;
              return (
                <div key={g.key}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-paper-2/40 text-[12px] tracking-[0.1em] uppercase text-faint">
                    {GROUP_DOT[g.key] && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GROUP_DOT[g.key] }} />
                    )}
                    <span>{g.label}</span>
                    <span>{g.count}</span>
                    <span className="ml-auto">{g.points} pts</span>
                  </div>
                  {items.map((it) => (
                    <EpicChildRow key={it.id} item={it} onClick={onOpenChild} />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[14px] text-faint py-6 text-center">No items in this epic yet.</p>
        )}
      </div>
    </div>
  );
}
