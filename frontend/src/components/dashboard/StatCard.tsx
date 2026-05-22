interface StatCardProps {
  icon: string;
  iconColor?: string;
  iconBg?: string;
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
  progressBar?: { percent: number; color: string };
}

export function StatCard({ icon, iconColor, iconBg, label, value, subtext, valueColor, progressBar }: StatCardProps) {
  return (
    <div className="rounded-lg shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] bg-white dark:bg-dneutral-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[18px] w-7 h-7 flex items-center justify-center rounded-md ${iconBg || ''} ${iconColor || 'text-neutral-400'}`}>{icon}</span>
        <span className="text-[16px] font-medium text-neutral-400 dark:text-dneutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-[28px] font-semibold ${valueColor || 'text-neutral-700 dark:text-dneutral-700'}`}>
        {value}
      </div>
      {subtext && (
        <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 mt-1">{subtext}</p>
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
