interface StatCardProps {
  icon: string;
  iconColor?: string;
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
  progressBar?: { percent: number; color: string };
}

export function StatCard({ icon, iconColor, label, value, subtext, valueColor, progressBar }: StatCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-dneutral-200 bg-neutral-50 dark:bg-dneutral-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-base ${iconColor || 'text-neutral-400'}`}>{icon}</span>
        <span className="text-sm font-medium text-neutral-400 dark:text-dneutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-semibold ${valueColor || 'text-neutral-700 dark:text-dneutral-700'}`}>
        {value}
      </div>
      {subtext && (
        <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-1">{subtext}</p>
      )}
      {progressBar && (
        <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-dneutral-300">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(progressBar.percent, 100)}%`, backgroundColor: progressBar.color }}
          />
        </div>
      )}
    </div>
  );
}

export function StatCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {children}
    </div>
  );
}
