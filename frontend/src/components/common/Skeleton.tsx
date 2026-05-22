export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-200 dark:bg-dneutral-200 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="p-3 rounded-lg shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2 mt-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-8" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-12" />
    </div>
  );
}
