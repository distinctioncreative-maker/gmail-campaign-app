import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The loading state for the three pages that fan out across the most reads:
 * Reports, Leads, and Replies. Each of those waits on several collection queries
 * before it can render anything, and until now that wait was a blank screen.
 *
 * Deliberately not a spinner. A skeleton in roughly the shape of the page tells
 * someone the request is working *and* what is about to appear, so the second or
 * two reads as loading rather than as a stall. It matches the real layout closely
 * enough that nothing jumps when the content arrives, which is the actual point:
 * a skeleton whose proportions are wrong is just a more elaborate flicker.
 */
export function PageSkeleton({
  tiles = 4,
  rows = 6,
}: {
  /** How many stat tiles the real page shows above its table. */
  tiles?: number;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />

      {tiles > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="card p-6 sm:p-7">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="card p-5 sm:p-6 mt-6">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-11 w-40" />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="hidden h-4 w-1/4 sm:block" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
