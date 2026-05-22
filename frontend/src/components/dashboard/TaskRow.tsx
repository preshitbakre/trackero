interface TaskRowProps {
  taskKey: string;
  title: string;
  priority: string;
  status: { name: string; category: string; color: string };
  assignee?: { displayName: string; avatarUrl?: string | null } | null;
  endDate?: string | null;
  hasBlockers?: boolean;
  onClick?: () => void;
}

const priorityDotColor: Record<string, string> = {
  urgent: 'bg-priority-urgent',
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
  none: 'bg-priority-none',
};

function getDueLabel(endDate: string): { text: string; className: string } | null {
  const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `Overdue ${Math.abs(diff)}d`, className: 'text-danger bg-danger/10' };
  if (diff === 0) return { text: 'Due today', className: 'text-warning bg-warning/10' };
  if (diff === 1) return { text: 'Due tomorrow', className: 'text-warning bg-warning/10' };
  if (diff <= 7) return { text: `Due in ${diff}d`, className: 'text-neutral-500 bg-neutral-100 dark:bg-dneutral-200 dark:text-dneutral-500' };
  return null;
}

export function TaskRow({ taskKey, title, priority, status, endDate, hasBlockers, onClick }: TaskRowProps) {
  const dueLabel = endDate ? getDueLabel(endDate) : null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-dneutral-200 transition-colors group"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor[priority] || 'bg-priority-none'}`} />
      {hasBlockers && <span className="text-danger text-[16px] flex-shrink-0" title="Blocked">&#x1F512;</span>}
      <span className="text-[16px] font-mono text-neutral-400 dark:text-dneutral-500 flex-shrink-0">{taskKey}</span>
      <span className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate flex-1 group-hover:text-peri">{title}</span>
      <span
        className="text-[16px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
        style={{ backgroundColor: status.color + '20', color: status.color }}
      >
        {status.name}
      </span>
      {dueLabel && (
        <span className={`text-[16px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${dueLabel.className}`}>
          {dueLabel.text}
        </span>
      )}
    </button>
  );
}
