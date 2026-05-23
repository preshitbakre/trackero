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
    <div className="mb-8">
      <h1 className="font-serif text-[36px] leading-tight text-text dark:text-dneutral-700">
        {getGreeting()}, <span className="italic">{userName}.</span>
      </h1>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[13px] text-mute dark:text-dneutral-500">{date}</span>
        <span className="text-[13px] text-faint dark:text-dneutral-500">·</span>
        <span className="text-[13px] text-mute dark:text-dneutral-500">{summaryText}</span>
      </div>
    </div>
  );
}
