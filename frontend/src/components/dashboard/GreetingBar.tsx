interface GreetingBarProps {
  userName: string;
  date: string;
  summaryText: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function GreetingBar({ userName, date, summaryText }: GreetingBarProps) {
  return (
    <div className="mb-6">
      <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700">
        {getGreeting()}, {userName}
      </h1>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-[16px] text-neutral-400 dark:text-dneutral-500">{date}</span>
        <span className="text-[16px] text-neutral-400 dark:text-dneutral-500">·</span>
        <span className="text-[16px] text-neutral-500 dark:text-dneutral-500">{summaryText}</span>
      </div>
    </div>
  );
}
