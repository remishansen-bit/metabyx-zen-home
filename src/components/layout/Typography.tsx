import type { ReactNode, ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Typography primitives bound to the design tokens. Use these on screen
 * headers instead of hand-rolling text-3xl/font-bold/etc so every screen
 * speaks at the same visual register.
 */

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.28em] text-gold/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ScreenTitle({
  children,
  className,
  as: Component = "h1",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Component
      className={cn(
        "text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function ScreenSubtitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/**
 * ScreenHeader — bundles eyebrow + title + subtitle in a consistent layout.
 * Use as the `header` prop on <Screen>.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-3 pb-[var(--spacing-stack-md)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? <ScreenTitle>{title}</ScreenTitle> : null}
        {subtitle ? <ScreenSubtitle>{subtitle}</ScreenSubtitle> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
