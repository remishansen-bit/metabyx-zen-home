import type { ReactNode } from "react";
import { TabBar } from "./tab-bar";

export function PhoneFrame({
  children,
  hideTabBar = false,
}: {
  children: ReactNode;
  hideTabBar?: boolean;
}) {
  return (
    <div className="min-h-dvh w-full flex justify-center px-3 sm:px-4 py-3 sm:py-8 phone-shell-outer">
      <div className="phone-shell relative w-full max-w-[420px] overflow-hidden rounded-[40px] glass-strong flex flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--gradient-gold)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-20 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{
            background: "radial-gradient(circle, var(--indigo-glow), transparent 70%)",
          }}
        />
        <div
          className={`phone-shell-scroll relative z-10 flex flex-1 flex-col animate-rise overflow-y-auto px-[var(--spacing-screen-x)] pt-[calc(var(--spacing-screen-y)+0.5rem)] sm:pt-[calc(var(--spacing-screen-y)+1rem)] gap-[var(--spacing-section)] ${hideTabBar ? "phone-pad-bottom-safe" : "phone-pad-bottom-tabs"}`}
        >
          {children}
        </div>
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}

export function StatusBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] tracking-[0.3em] text-muted-foreground">
      <span>9:41</span>
      <span className="text-gold">{title}</span>
      <span>·· ·</span>
    </div>
  );
}