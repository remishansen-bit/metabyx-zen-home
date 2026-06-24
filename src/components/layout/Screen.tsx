import type { ReactNode, ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Screen — vertical layout primitive consumed inside PhoneFrame.
 *
 * Structure: optional sticky header → scrollable main → optional sticky footer.
 * Use this instead of hand-rolling px/pt/gap on every route so spacing and
 * scroll behavior stay identical across screens.
 */
export function Screen({
  header,
  footer,
  children,
  className,
  contentClassName,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-1 flex-col", className)}>
      {header ? (
        <div className="shrink-0">{header}</div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-[var(--spacing-section)]", contentClassName)}>
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 pt-[var(--spacing-stack-lg)]">{footer}</div>
      ) : null}
    </div>
  );
}

/**
 * Section — a grouped block within a Screen. Wraps children in a vertical
 * stack at the "section" spacing rhythm.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
  as: Component = "section",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Component className={cn("flex flex-col gap-[var(--spacing-stack-md)]", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </Component>
  );
}

type Gap = "xs" | "sm" | "md" | "lg";
const gapClass: Record<Gap, string> = {
  xs: "gap-[var(--spacing-stack-xs)]",
  sm: "gap-[var(--spacing-stack-sm)]",
  md: "gap-[var(--spacing-stack-md)]",
  lg: "gap-[var(--spacing-stack-lg)]",
};

/**
 * Stack — vertical (default) or horizontal flex container with consistent gap
 * sized from the spacing tokens.
 */
export function Stack({
  gap = "md",
  direction = "vertical",
  children,
  className,
  as: Component = "div",
}: {
  gap?: Gap;
  direction?: "vertical" | "horizontal";
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Component
      className={cn(
        "flex",
        direction === "vertical" ? "flex-col" : "flex-row items-center",
        gapClass[gap],
        className,
      )}
    >
      {children}
    </Component>
  );
}
