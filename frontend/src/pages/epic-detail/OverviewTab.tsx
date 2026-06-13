import { Ban } from 'lucide-react';
import type { EpicDetail } from '../../api/epics';
import { EpicStatusSelect } from '../../components/epics/EpicStatusSelect';
import { EpicDetailStatStrip } from '../../components/epics/EpicDetailStatStrip';
import { EpicForecast } from '../../components/epics/EpicForecast';
import { AcrossSprintsTimeline } from '../../components/epics/AcrossSprintsTimeline';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  epic: EpicDetail;
  projectId: string;
  canEdit: boolean;
  onChanged: () => void;
}

export function OverviewTab({ epic, projectId, canEdit, onChanged }: Props) {
  const blocked = epic.displayState === 'blocked';

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
        <div className="flex items-center gap-3 bg-lilac-tint border-l-4 border-lilac px-4 py-3">
          <Ban size={16} className="text-lilac shrink-0" aria-hidden />
          <p className="text-[13px] text-mute flex-1">
            <span className="font-semibold text-text">Blocked since {fmtDate(epic.blockedBy.since)}</span>
            {epic.blockedBy.note ? ` · ${epic.blockedBy.note}` : ''}
            {epic.blockedBy.owner && (
              <>
                {' Owner: '}
                <span className="text-lilac font-medium">@{epic.blockedBy.owner}</span>
              </>
            )}
          </p>
          <EpicStatusSelect epic={epic} projectId={projectId} canEdit={canEdit} onChanged={onChanged} variant="button" />
        </div>
      )}

      <EpicDetailStatStrip epic={epic} />

      {epic.forecast && <EpicForecast data={epic.forecast} />}

      <AcrossSprintsTimeline data={epic.acrossSprints} />
    </div>
  );
}
