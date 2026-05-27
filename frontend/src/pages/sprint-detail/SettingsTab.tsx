import type { SprintDetail } from '../SprintDetailPage';

interface SettingsTabProps {
  sprint: SprintDetail;
  onSaved: () => void;
}

export function SettingsTab({ sprint, onSaved: _onSaved }: SettingsTabProps) {
  return (
    <div className="text-mute text-[13px]">
      Settings tab content — to be implemented in Task T3. Sprint #{sprint.sprintNumber} loaded.
    </div>
  );
}
