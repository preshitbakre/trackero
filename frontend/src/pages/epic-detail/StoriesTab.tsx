import { useState, useEffect, useCallback } from 'react';
import type { EpicChildrenGroups } from '../../api/epics';
import { getEpicChildren } from '../../api/epics';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { EpicChildRow } from '../../components/epics/EpicChildRow';

interface Props {
  epicId: number;
  epicKey: string;
  projectId: string;
  canEdit: boolean;
  onAddStory: () => void;
  onOpenChild: (id: number) => void;
  reloadKey?: number;
}

export function StoriesTab({ epicId, projectId, canEdit, onAddStory, onOpenChild, reloadKey }: Props) {
  const [groupBy, setGroupBy] = useState<'status' | 'sprint'>('status');
  const [data, setData] = useState<EpicChildrenGroups | null>(null);

  const load = useCallback(() => {
    getEpicChildren(projectId, epicId, groupBy).then(setData).catch(() => {});
  }, [projectId, epicId, groupBy]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] text-text">
          All children <span className="text-mute">· {data?.totalItems ?? 0} items · {data?.totalPoints ?? 0} pts total</span>
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={groupBy}
            onChange={(v) => setGroupBy(v as 'status' | 'sprint')}
            options={[
              { value: 'status', label: 'By status' },
              { value: 'sprint', label: 'By sprint' },
            ]}
            className="w-[130px]"
          />
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={onAddStory}>
              + Add story
            </Button>
          )}
        </div>
      </div>

      {data && data.groups.length > 0 ? (
        <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {data.groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 px-4 py-2 bg-paper-2/40 text-[12px] tracking-[0.1em] uppercase text-faint">
                <span>{g.label}</span>
                <span>{g.count}</span>
                <span className="ml-auto">{g.points} pts</span>
              </div>
              {g.items.map((it) => (
                <EpicChildRow key={it.id} item={it} onClick={onOpenChild} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-faint py-10 text-center">No items in this epic yet.</p>
      )}
    </div>
  );
}
