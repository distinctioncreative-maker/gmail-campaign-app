/**
 * Placeholder blocks for loading states.
 *
 * A sweep rather than a pulse. `animate-pulse` fades the whole block in and out,
 * which at a glance is hard to tell apart from a layout that has broken and left
 * grey boxes behind. A highlight travelling left to right reads unambiguously as
 * work in progress, and because it animates background-position on a gradient it
 * composites on the GPU instead of repainting a whole subtree. Both are disabled
 * under prefers-reduced-motion, where the block simply sits there.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-lg bg-surface-2 ${className}`} />;
}

/** A few stacked list-row skeletons. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
