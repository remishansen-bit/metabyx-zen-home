import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — calm "nothing here yet" panel used wherever a list or section
 * is intentionally empty. Single shape across the app so the experience never
 * feels broken or unfinished.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = "neutral",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** "gold" gives a warmer accent — use sparingly for celebratory empties. */
  tone?: "neutral" | "gold";
}) {
  return (
    <div
      className={cn(
        "glass animate-phase-in flex flex-col items-center gap-3 rounded-2xl px-6 py-7 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            tone === "gold"
              ? "text-[var(--primary-foreground)]"
              : "text-gold",
          )}
          style={
            tone === "gold"
              ? { background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }
              : {
                  background: "oklch(0.82 0.14 82 / 0.10)",
                  border: "1px solid oklch(0.82 0.14 82 / 0.22)",
                }
          }
        >
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-[20rem] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
