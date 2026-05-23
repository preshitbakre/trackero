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
    <div className="rounded-xl bg-card dark:bg-dneutral-100 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[14px] w-6 h-6 flex items-center justify-center rounded-md ${iconBg || ''} ${iconColor || 'text-faint'}`}>{icon}</span>
        <span className="text-[11px] font-semibold text-mute dark:text-dneutral-500 uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className={`font-serif italic text-[40px] leading-none ${valueColor || 'text-text dark:text-dneutral-700'}`}>
        {value}
      </div>
      {subtext && (
        <p className="text-[12px] text-mute dark:text-dneutral-500 mt-2">{subtext}</p>
      )}
      {progressBar && (
        <div className="mt-3 h-1 rounded-full bg-rule dark:bg-dneutral-300">
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
