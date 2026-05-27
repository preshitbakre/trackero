import type { SprintDetail } from '../SprintDetailPage';

interface ScopeChangesTabProps {
  sprint: SprintDetail;
}

export function ScopeChangesTab({ sprint }: ScopeChangesTabProps) {
  return (
    <div className="text-mute text-[13px]">
      Scope Changes tab content — to be implemented in Task T2. Sprint #{sprint.sprintNumber} loaded.
    </div>
  );
}
