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
      className="flex items-center gap-3 rounded-md shadow-sm hover:shadow-md px-3 py-1.5 transition-shadow duration-150"
    >
      <span className="text-[14px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 flex-shrink-0">
        {prefix}
      </span>
      <span className="text-[14px] font-medium text-neutral-700 truncate flex-1">{name}</span>
      <span className="text-[14px] text-neutral-400 flex-shrink-0">{openTaskCount}/{taskCount}</span>
      {activeSprint && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-16 h-1 rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-lilac" style={{ width: `${activeSprint.progressPercent}%` }} />
          </div>
          <span className="text-[14px] text-neutral-400">{activeSprint.progressPercent}%</span>
        </div>
      )}
    </Link>
  );
}
