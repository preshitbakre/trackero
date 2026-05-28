import { Eyebrow, PageHeader } from '../ui';

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
    <PageHeader>
      {/* T1.5 — date goes above the hero as the editorial eyebrow per frame-01. */}
      <Eyebrow className="mb-2">{date}</Eyebrow>
      <h1 className="font-serif text-[36px] leading-tight text-text dark:text-dneutral-700">
        {getGreeting()}, <span className="italic">{userName}.</span>
      </h1>
      {summaryText && (
        <p className="mt-2 text-[14px] text-mute dark:text-dneutral-500">{summaryText}</p>
      )}
    </PageHeader>
  );
}
