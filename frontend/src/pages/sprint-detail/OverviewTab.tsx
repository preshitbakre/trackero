import type { SprintDetail } from '../SprintDetailPage';

interface OverviewTabProps {
  sprint: SprintDetail;
  onAfterAction: () => void;
}

export function OverviewTab({ sprint, onAfterAction: _onAfterAction }: OverviewTabProps) {
  return (
    <div className="text-mute text-[13px]">
      Overview tab content — to be implemented in Task T1. Sprint #{sprint.sprintNumber} loaded.
    </div>
  );
}
