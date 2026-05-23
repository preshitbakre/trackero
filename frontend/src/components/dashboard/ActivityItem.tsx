interface ActivityItemProps {
  actor: { displayName: string; avatarUrl?: string | null };
  action: string;
  target: { taskKey: string; title: string };
  detail?: string | null;
  timestamp: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const actionLabels: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  status_changed: 'moved',
  assigned: 'assigned',
  comment_added: 'commented on',
  attachment_added: 'attached file to',
  sprint_started: 'started sprint',
  sprint_completed: 'completed sprint',
  sprint_cancelled: 'cancelled sprint',
};

export function ActivityItem({ actor, action, target, timestamp }: ActivityItemProps) {
  const initial = actor.displayName?.charAt(0)?.toUpperCase() || '?';
  const label = actionLabels[action] || action;

  return (
    <div className="flex items-center gap-2 py-1.5 text-[16px]">
      <div className="w-5 h-5 rounded-full bg-lilac-tint dark:bg-peri-dm/30 flex items-center justify-center text-[16px] font-medium text-lilac-dark dark:text-peri-dm flex-shrink-0">
        {initial}
      </div>
      <span className="font-medium text-neutral-700 dark:text-dneutral-700 flex-shrink-0">{actor.displayName}</span>
      <span className="text-neutral-400 dark:text-dneutral-500">{label}</span>
      {target.taskKey && (
        <span className="font-mono font-medium text-neutral-700 dark:text-dneutral-700 flex-shrink-0">{target.taskKey}</span>
      )}
      <span className="text-neutral-400 dark:text-dneutral-500 truncate flex-1">{target.title}</span>
      <span className="text-neutral-400 dark:text-dneutral-500 flex-shrink-0">{timeAgo(timestamp)}</span>
    </div>
  );
}
