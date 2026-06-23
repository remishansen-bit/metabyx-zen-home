import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { User, Sparkles, Bell, ShieldCheck, Heart } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { useMetabyx } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile · METABYX" },
      { name: "description", content: "Your metabolic rhythm over time." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const state = useMetabyx();

  const last7 = useMemo(() => {
    const out: { day: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      const end = start + 86400000;
      const entries = state.bmrHistory.filter((e) => e.t >= start && e.t < end);
      const avg = entries.length
        ? entries.reduce((a, b) => a + b.value, 0) / entries.length
        : 0;
      out.push({
        day: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        value: Math.round(avg),
      });
    }
    return out;
  }, [state.bmrHistory]);

  const max = Math.max(99, ...last7.map((d) => d.value));
  const min = 40;

  return (
    <PhoneFrame>
      <StatusBar title="PROFILE" />

      <header className="flex flex-col items-center gap-3">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-50 blur-2xl"
            style={{ background: "var(--gradient-gold)" }}
          />
          <div className="glass-strong relative flex h-20 w-20 items-center justify-center rounded-full">
            <User className="h-7 w-7 text-gold" />
          </div>
        </div>
        <div className="text-center">
          <h1
            className="text-2xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Adrien
          </h1>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Member · since today
          </p>
        </div>
      </header>

      <section className="glass-strong rounded-3xl p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              7-day BMR
            </p>
            <p
              className="mt-1 text-4xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {state.lastBmr}
            </p>
          </div>
          <p className="text-xs text-gold">
            {state.bmrHistory.length} check-ins
          </p>
        </div>
        <div className="mt-5 flex h-24 items-end gap-2">
          {last7.map((d, i) => {
            const h = d.value === 0 ? 6 : Math.max(8, ((d.value - min) / (max - min)) * 100);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${h}%`,
                      background: d.value
                        ? "var(--gradient-gold)"
                        : "oklch(1 0 0 / 0.06)",
                      boxShadow: d.value ? "0 4px 12px -4px oklch(0.82 0.14 82 / 0.4)" : undefined,
                    }}
                  />
                </div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Preferences</p>
        {[
          { icon: Bell, label: "Daily reminders", hint: "Morning & evening" },
          { icon: Sparkles, label: "AI refinement", hint: "Gemini 3 Flash" },
          { icon: ShieldCheck, label: "Privacy", hint: "Stored on this device" },
          { icon: Heart, label: "About METABYX", hint: "v1.0 · with care" },
        ].map(({ icon: Icon, label, hint }) => (
          <button
            key={label}
            className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "oklch(0.82 0.14 82 / 0.12)",
                border: "1px solid oklch(0.82 0.14 82 / 0.22)",
              }}
            >
              <Icon className="h-4 w-4 text-gold" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          </button>
        ))}
      </section>
    </PhoneFrame>
  );
}
