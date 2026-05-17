import { Link } from 'react-router-dom';

interface ProjectCardProps {
  id: number;
  name: string;
  prefix: string;
  status: string;
  taskCount: number;
  openTaskCount: number;
  memberCount: number;
  activeSprint?: { name: string; progressPercent: number; daysRemaining?: number } | null;
}

export function ProjectCard({ id, name, prefix, taskCount, openTaskCount, activeSprint }: ProjectCardProps) {
  return (
    <Link
      to={`/projects/${id}/board`}
      className="flex items-center gap-3 rounded-md border border-neutral-200 dark:border-dneutral-200 px-3 py-2.5 hover:border-primary-400 dark:hover:border-dprimary-400 transition-colors"
    >
      <span className="text-sm font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500 flex-shrink-0">
        {prefix}
      </span>
      <span className="text-sm font-medium text-neutral-700 dark:text-dneutral-700 truncate flex-1">{name}</span>
      <span className="text-sm text-neutral-400 dark:text-dneutral-500 flex-shrink-0">{openTaskCount}/{taskCount}</span>
      {activeSprint && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-16 h-1 rounded-full bg-neutral-200 dark:bg-dneutral-300">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${activeSprint.progressPercent}%` }} />
          </div>
          <span className="text-sm text-neutral-400 dark:text-dneutral-500">{activeSprint.progressPercent}%</span>
        </div>
      )}
    </Link>
  );
}
