import { createFileRoute, Link } from "@tanstack/react-router";
import { Sunrise, Moon, Sparkles, Leaf, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { todaysAllBranches, todaysOpenBranches, useMetabyx } from "@/lib/store";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "METABYX — Calibrate your day" },
      { name: "description", content: "A calm, premium daily metabolism & mindfulness companion." },
      { property: "og:title", content: "METABYX" },
      { property: "og:description", content: "A calm, premium daily metabolism & mindfulness companion." },
    ],
  }),
  component: Index,
});

const greetingFor = (d: Date) => {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const dateLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

function Index() {
  const state = useMetabyx();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const open = useMemo(() => todaysOpenBranches(state), [state]);
  const todays = useMemo(() => todaysAllBranches(state), [state]);
  const now = mounted ? new Date() : null;
  const greeting = now ? greetingFor(now) : "Welcome";
  const bmr = state.lastBmr;
  const prev = state.bmrHistory.at(-2)?.value;
  const delta = typeof prev === "number" ? bmr - prev : 0;
  const progress = todays.length === 0 ? 0 : todays.filter((b) => b.status === "metabolized").length / todays.length;
  const ringPct = Math.max(0.08, progress > 0 ? progress : bmr / 100);
  return (
    <PhoneFrame>
      <StatusBar title="METABYX" />

          {/* greeting */}
          <header className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                {now ? dateLabel(now) : "Today"}
              </p>
              <h1
                className="mt-2 text-3xl font-light leading-tight text-foreground"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {greeting},
                <br />
                <span className="text-gold italic">Adrien</span>
              </h1>
            </div>
            <div className="glass flex h-11 w-11 items-center justify-center rounded-full">
              <Sparkles className="h-4 w-4 text-gold" />
            </div>
          </header>

          {/* BMR circle */}
          <section className="flex flex-col items-center">
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 rounded-full blur-2xl opacity-60"
                style={{ background: "var(--gradient-gold)" }}
              />
              <div className="glass-strong relative flex h-56 w-56 flex-col items-center justify-center rounded-full">
                {/* progress ring */}
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="oklch(1 0 0 / 0.08)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="url(#goldStroke)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${ringPct * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                    style={{ transition: "stroke-dasharray 700ms ease" }}
                  />
                  <defs>
                    <linearGradient id="goldStroke" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="oklch(0.92 0.1 86)" />
                      <stop offset="100%" stopColor="oklch(0.72 0.16 70)" />
                    </linearGradient>
                  </defs>
                </svg>

                <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                  BMR Score
                </p>
                <p
                  className="mt-1 text-6xl font-light text-foreground"
                  style={{ fontFamily: "Fraunces, serif" }}
                >
                  {bmr}
                </p>
                <p className="mt-1 text-xs text-gold">
                  {delta === 0 ? "Steady" : `${delta > 0 ? "+" : ""}${delta} since last check-in`}
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-[16rem] text-center text-sm text-muted-foreground">
              {todays.length === 0
                ? "No branches noticed yet. A morning check-in begins your day."
                : open.length === 0
                  ? "Every branch metabolized. Rest well tonight."
                  : "Your metabolic rhythm is steady. A short reset will lift you further."}
            </p>
            <BmrSparkline history={state.bmrHistory} current={bmr} />
          </section>

          {/* Branches */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2
                className="text-lg font-normal text-foreground"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                Today's open branches
              </h2>
              <span className="text-xs text-muted-foreground">
                {open.length} of {todays.length}
              </span>
            </div>

            {open.length === 0 ? (
              <Link
                to="/morning"
                className="glass flex items-center justify-between rounded-2xl px-4 py-5"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Nothing noticed yet</p>
                  <p className="text-xs text-muted-foreground">
                    {todays.length === 0
                      ? "Begin with a morning check-in"
                      : "All branches metabolized today"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gold" />
              </Link>
            ) : (
              <ul className="flex flex-col gap-3">
                {open.slice(0, 4).map((b) => (
                  <li
                    key={b.id}
                    className="glass group flex items-center gap-4 rounded-2xl px-4 py-3.5"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: "oklch(0.82 0.14 82 / 0.12)",
                        border: "1px solid oklch(0.82 0.14 82 / 0.25)",
                      }}
                    >
                      <Leaf className="h-4 w-4 text-gold" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{b.detail}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {b.category}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Actions */}
          <section className="flex flex-col gap-3">
            <Link
              to="/session"
              className="relative overflow-hidden rounded-2xl px-5 py-4 text-left transition-transform active:scale-[0.99]"
              style={{
                background: "var(--gradient-gold)",
                boxShadow: "var(--shadow-gold)",
                color: "var(--primary-foreground)",
              }}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Start guided session</p>
                  <p className="text-xs opacity-80">7 min · breath + intention</p>
                </div>
                <ChevronRight className="h-5 w-5" />
              </div>
            </Link>

            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/morning"
                className="glass rounded-2xl px-4 py-4 text-left transition-colors hover:bg-[oklch(1_0_0/0.06)]"
              >
                <Sunrise className="mb-2 h-5 w-5 text-gold" />
                <p className="text-sm font-medium text-foreground">Morning</p>
                <p className="text-xs text-muted-foreground">Check-in</p>
              </Link>
              <Link
                to="/evening"
                className="glass rounded-2xl px-4 py-4 text-left transition-colors hover:bg-[oklch(1_0_0/0.06)]"
              >
                <Moon className="mb-2 h-5 w-5 text-gold" />
                <p className="text-sm font-medium text-foreground">Evening</p>
                <p className="text-xs text-muted-foreground">Reflection</p>
              </Link>
            </div>
          </section>
    </PhoneFrame>
  );
}

/**
 * Tiny SVG sparkline of the recent BMR history. Calm, gold gradient that
 * matches the BMR ring. Hidden when there is no trend yet.
 */
function BmrSparkline({
  history,
  current,
}: {
  history: { t: number; value: number }[];
  current: number;
}) {
  const points = [...history.slice(-12).map((p) => p.value), current];
  if (points.length < 3) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(4, max - min);
  const w = 220;
  const h = 44;
  const stepX = w / (points.length - 1);
  const yFor = (v: number) => h - 4 - ((v - min) / span) * (h - 12);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${w.toFixed(1)},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last - first;
  return (
    <div className="mt-4 flex w-full max-w-[15rem] flex-col items-center gap-1.5">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-11 w-full"
        role="img"
        aria-label={`BMR-trend siste ${points.length} avlesninger, ${delta >= 0 ? "stigende" : "synkende"}`}
      >
        <defs>
          <linearGradient id="bmrSparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.88 0.14 82)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="oklch(0.88 0.14 82)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bmrSparkStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.72 0.16 70)" />
            <stop offset="100%" stopColor="oklch(0.92 0.1 86)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bmrSparkFill)" />
        <path d={path} stroke="url(#bmrSparkStroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={(points.length - 1) * stepX} cy={yFor(last)} r="2.2" fill="oklch(0.92 0.1 86)" />
      </svg>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Trend · {points.length} avlesninger · {delta >= 0 ? "+" : ""}{delta}
      </p>
    </div>
  );
}
