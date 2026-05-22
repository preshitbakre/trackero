interface TeamWorkloadBarProps {
  user: { displayName: string; avatarUrl?: string | null };
  taskCount: number;
  maxTaskCount: number;
  overdueCount?: number;
}

function getBarColor(count: number): string {
  if (count > 12) return 'bg-danger';
  if (count >= 8) return 'bg-tan dark:bg-tan-dm';
  return 'bg-mint dark:bg-mint-dm';
}

export function TeamWorkloadBar({ user, taskCount, maxTaskCount, overdueCount }: TeamWorkloadBarProps) {
  const initial = user.displayName?.charAt(0)?.toUpperCase() || '?';
  const barWidth = maxTaskCount > 0 ? (taskCount / maxTaskCount) * 100 : 0;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-5 h-5 rounded-full bg-peri-light dark:bg-peri-dm/30 flex items-center justify-center text-[16px] font-medium text-peri dark:text-peri-dm flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{user.displayName}</span>
          <span className="text-[16px] text-neutral-400 dark:text-dneutral-500 flex-shrink-0 ml-2">
            {taskCount} tasks
            {overdueCount !== undefined && overdueCount > 0 && (
              <span className="text-danger ml-1">({overdueCount} overdue)</span>
            )}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-dneutral-200">
          <div
            className={`h-full rounded-full transition-all ${getBarColor(taskCount)}`}
            style={{ width: `${Math.min(barWidth, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
