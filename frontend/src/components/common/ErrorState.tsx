import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <AlertCircle size={40} className="text-danger" strokeWidth={1.5} />
      <p className="text-[16px] text-neutral-500 dark:text-dneutral-500">{message}</p>
      <Button variant="primary" onClick={onRetry}>Try again</Button>
    </div>
  );
}
