import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ScreenTransition — wraps a region whose contents change between
 * loading / empty / content phases. The `phase` prop is used as a React key
 * so React fully remounts the inner block, which retriggers the
 * `animate-phase-in` keyframe. Result: a calm crossfade with no layout jank
 * and a single, predictable transition register across the app.
 *
 * Reduced-motion users get an instant swap (handled in styles.css).
 */
export function ScreenTransition({
  phase,
  children,
  className,
}: {
  /** A stable discriminator: e.g. "loading" | "empty" | "content". */
  phase: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={phase} className={cn("animate-phase-in", className)}>
      {children}
    </div>
  );
}
