import { Link } from 'react-router-dom';

interface DashboardSectionProps {
  title: string;
  viewAllLink?: string;
  viewAllText?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardSection({ title, viewAllLink, viewAllText, footer, children }: DashboardSectionProps) {
  return (
    <div className={`rounded-lg border border-neutral-200 dark:border-dneutral-200 bg-neutral-50 dark:bg-dneutral-100 px-4 pt-4 flex flex-col h-[220px] ${footer ? 'pb-2' : 'pb-4'}`}>
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700">{title}</h3>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-sm text-primary-500 hover:underline">
            {viewAllText || 'View all'} &rarr;
          </Link>
        )}
      </div>
      <div className="overflow-y-auto min-h-0 flex-1 pr-2">
        {children}
      </div>
      {footer && (
        <div className="flex-shrink-0 pt-1.5 mt-auto border-t border-neutral-200 dark:border-dneutral-200 flex items-center min-h-[24px]">
          {footer}
        </div>
      )}
    </div>
  );
}

export function TwoColumnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      {children}
    </div>
  );
}
