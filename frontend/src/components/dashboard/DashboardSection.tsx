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
    <div className={`rounded-xl bg-card px-5 pt-5 flex flex-col h-[340px] ${footer ? 'pb-3' : 'pb-5'}`}>
      <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
        <h3 className="font-serif text-[18px] text-text">{title}</h3>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-[12px] text-lilac-dark hover:text-lilac">
            {viewAllText || 'View all'} →
          </Link>
        )}
      </div>
      <div className="overflow-y-auto min-h-0 flex-1 pr-2">
        {children}
      </div>
      {footer && (
        <div className="flex-shrink-0 pt-2 mt-auto border-t border-rule flex items-center min-h-[28px]">
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
