import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Sunrise, Sparkles, BookHeart, User } from "lucide-react";
import type { ComponentType } from "react";

type Tab = {
  to: "/" | "/morning" | "/session" | "/library" | "/profile";
  label: string;
  icon: ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

const TABS: Tab[] = [
  { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
  {
    to: "/morning",
    label: "Check-in",
    icon: Sunrise,
    match: (p) => p === "/morning" || p === "/evening",
  },
  { to: "/session", label: "Guided", icon: Sparkles, match: (p) => p === "/session" },
  { to: "/library", label: "Library", icon: BookHeart, match: (p) => p === "/library" },
  { to: "/profile", label: "Profile", icon: User, match: (p) => p === "/profile" },
];

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
      <div
        className="glass-strong pointer-events-auto flex items-center justify-between rounded-[28px] px-2 py-2"
        style={{ boxShadow: "0 24px 60px -20px oklch(0 0 0 / 0.8)" }}
      >
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={to}
              to={to}
              className="group relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-1.5 py-2 transition-all"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-2xl transition-opacity"
                style={{
                  background: active
                    ? "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.18), oklch(0.82 0.14 82 / 0.05))"
                    : "transparent",
                  border: active ? "1px solid oklch(0.82 0.14 82 / 0.35)" : "1px solid transparent",
                  boxShadow: active ? "0 6px 20px -10px oklch(0.82 0.14 82 / 0.6)" : undefined,
                }}
              />
              <Icon
                className={`relative h-4 w-4 transition-colors ${active ? "text-gold" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              <span
                className={`relative text-[9px] uppercase tracking-[0.15em] transition-colors ${active ? "text-gold" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
