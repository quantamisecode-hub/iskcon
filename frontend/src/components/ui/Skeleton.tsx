/** Shimmer placeholders for loading states. Respects reduced motion. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-shimmer rounded-lg bg-gradient-to-r from-border via-background to-border bg-[length:200%_100%] ${className}`} />;
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-5 w-48" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}
