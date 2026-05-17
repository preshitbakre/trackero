interface TeamWorkloadBarProps {
  user: { displayName: string; avatarUrl?: string | null };
  taskCount: number;
  maxTaskCount: number;
  overdueCount?: number;
}

function getBarColor(count: number): string {
  if (count > 12) return 'bg-danger';
  if (count >= 8) return 'bg-warning';
  return 'bg-success';
}

export function TeamWorkloadBar({ user, taskCount, maxTaskCount, overdueCount }: TeamWorkloadBarProps) {
  const initial = user.displayName?.charAt(0)?.toUpperCase() || '?';
  const barWidth = maxTaskCount > 0 ? (taskCount / maxTaskCount) * 100 : 0;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-5 h-5 rounded-full bg-primary-100 dark:bg-dprimary-100 flex items-center justify-center text-sm font-medium text-primary-600 dark:text-dprimary-600 flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-neutral-700 dark:text-dneutral-700 truncate">{user.displayName}</span>
          <span className="text-sm text-neutral-400 dark:text-dneutral-500 flex-shrink-0 ml-2">
            {taskCount} tasks
            {overdueCount !== undefined && overdueCount > 0 && (
              <span className="text-danger ml-1">({overdueCount} overdue)</span>
            )}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-dneutral-300">
          <div
            className={`h-full rounded-full transition-all ${getBarColor(taskCount)}`}
            style={{ width: `${Math.min(barWidth, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
