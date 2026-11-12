import { Skeleton } from '../ui/Skeleton';

/**
 * Full-area fallback shown while a lazily-loaded page chunk (or its route
 * data) is being fetched. Mirrors the app shell so the transition feels
 * instant and intentional rather than a blank white flash.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-10" role="status" aria-live="polite" aria-label="Loading page">
      {/* Brand pulse */}
      <div className="flex flex-col items-center gap-3">
        <img src="/iskcon-logo.png" alt="" className="h-16 w-auto animate-brand-pulse" />
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-primary-soft">
          <div className="h-full w-1/2 animate-loader-slide rounded-full bg-primary" />
        </div>
      </div>
      {/* Shimmer skeletons mirroring a content page */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 px-6 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="col-span-full h-40 rounded-2xl" />
      </div>
    </div>
  );
}
