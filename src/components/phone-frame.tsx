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
    <div className="min-h-screen w-full flex justify-center px-4 py-6 sm:py-10">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[40px] glass-strong">
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
          className={`relative z-10 flex flex-col gap-8 px-6 pt-10 animate-rise ${hideTabBar ? "pb-8" : "pb-28"}`}
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