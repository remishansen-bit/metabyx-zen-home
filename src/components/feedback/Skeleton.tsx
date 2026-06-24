import { cn } from "@/lib/utils";

/**
 * Skeleton — single shimmer primitive used in place of spinners.
 *
 * Use the same shape/size as the real content that's loading so the layout
 * never shifts. Animation respects prefers-reduced-motion via the global
 * media query in styles.css.
 */
export function Skeleton({
  className,
  rounded = "rounded-xl",
  "aria-label": ariaLabel = "Loading",
}: {
  className?: string;
  rounded?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn("skeleton-shimmer block w-full", rounded, className)}
    />
  );
}

/** A ready-made skeleton card matching the Library / Open-branches list row. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "glass flex items-center gap-4 rounded-2xl px-4 py-3.5",
        className,
      )}
    >
      <Skeleton className="h-11 w-11 shrink-0" rounded="rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-3/4" rounded="rounded-md" />
        <Skeleton className="h-3 w-1/2" rounded="rounded-md" />
      </div>
    </div>
  );
}

/** Vertical stack of N SkeletonCards with the same gap as a real list. */
export function SkeletonList({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[var(--spacing-stack-sm)]", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
