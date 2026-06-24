import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  User,
  Settings as SettingsIcon,
  ChevronRight,
  TrendingUp,
  Flame,
  Target,
  Sparkles,
  Users,
  Brain,
  LogOut,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { useMetabyx } from "@/lib/store";
import { RequireAuth, useAuth, signOut } from "@/lib/auth";
import { summarize } from "@/lib/learning";
import { useEffect, useState } from "react";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { canAccess } from "@/lib/feature-access";
import { PaywallLockedCard } from "@/components/PaywallSheet";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile · METABYX" },
      { name: "description", content: "Your metabolic rhythm over time." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
});

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAYS = 14;

function ProfilePage() {
  const state = useMetabyx();
  const auth = useAuth();
  const gate = useFeatureGate();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const learningAllowed = canAccess(gate.tier, "plus");
  const [insights, setInsights] = useState(() => summarize());
  useEffect(() => {
    const sync = () => setInsights(summarize());
    sync();
    window.addEventListener("metabyx:learning:change", sync);
    return () => window.removeEventListener("metabyx:learning:change", sync);
  }, []);
  const displayName =
    auth.profile?.display_name ?? auth.user?.email?.split("@")[0] ?? "Friend";
  const archetype = auth.profile?.archetype;

  const series = useMemo(() => {
    const out: { t: number; day: string; value: number | null }[] = [];
    const now = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      const end = start + 86400000;
      const entries = state.bmrHistory.filter((e) => e.t >= start && e.t < end);
      const avg = entries.length
        ? Math.round(entries.reduce((a, b) => a + b.value, 0) / entries.length)
        : null;
      out.push({
        t: start,
        day: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        value: avg,
      });
    }
    return out;
  }, [state.bmrHistory]);

  const recorded = series.filter((s) => s.value !== null) as {
    t: number;
    day: string;
    value: number;
  }[];

  const avg7 = useMemo(() => {
    const last7 = recorded.slice(-7);
    if (last7.length === 0) return 0;
    return Math.round(last7.reduce((a, b) => a + b.value, 0) / last7.length);
  }, [recorded]);

  const best = recorded.length ? Math.max(...recorded.map((d) => d.value)) : 0;

  const streak = useMemo(() => {
    // consecutive days ending today with at least one branch
    const days = new Set(state.branches.map((b) => startOfDay(b.createdAt)));
    let s = 0;
    let cursor = startOfDay(Date.now());
    while (days.has(cursor)) {
      s++;
      cursor -= 86400000;
    }
    return s;
  }, [state.branches]);

  const integration = useMemo(() => {
    if (state.branches.length === 0) return 0;
    const closed = state.branches.filter((b) => b.status === "metabolized").length;
    return Math.round((closed / state.branches.length) * 100);
  }, [state.branches]);

  // SVG line graph geometry
  const W = 320;
  const H = 120;
  const padX = 12;
  const padY = 14;
  const yMin = 40;
  const yMax = 99;
  const points = series.map((s, i) => {
    const x = padX + (i * (W - padX * 2)) / (DAYS - 1);
    const v = s.value ?? yMin;
    const y = H - padY - ((v - yMin) / (yMax - yMin)) * (H - padY * 2);
    return { x, y, value: s.value };
  });
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${H - padY} L ${points[0].x} ${H - padY} Z`;

  return (
    <PhoneFrame>
      <StatusBar title={t("profile.title")} />

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
            {displayName}
          </h1>
          {archetype ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-gold">
              <Sparkles className="h-3 w-3" /> {archetype}
            </p>
          ) : (
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {t("profile.bmrTracker")}
            </p>
          )}
        </div>
      </header>

      {/* Graph */}
      <section className="glass-strong rounded-3xl p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("profile.todayEyebrow")}</p>
            <p
              className="mt-1 text-5xl font-light leading-none text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {state.lastBmr}
            </p>
            <p className="mt-1 text-xs text-gold">{t("profile.avg7")} · {avg7 || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("profile.bestEyebrow")}</p>
            <p
              className="mt-1 text-2xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {best || "—"}
            </p>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-5 w-full"
          preserveAspectRatio="none"
          style={{ height: 140 }}
        >
          <defs>
            <linearGradient id="bmrLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="oklch(0.88 0.12 86)" />
              <stop offset="100%" stopColor="oklch(0.72 0.16 70)" />
            </linearGradient>
            <linearGradient id="bmrArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.82 0.14 82 / 0.35)" />
              <stop offset="100%" stopColor="oklch(0.82 0.14 82 / 0)" />
            </linearGradient>
          </defs>
          {/* grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line
              key={g}
              x1={padX}
              x2={W - padX}
              y1={padY + g * (H - padY * 2)}
              y2={padY + g * (H - padY * 2)}
              stroke="oklch(1 0 0 / 0.05)"
              strokeWidth="1"
            />
          ))}
          {recorded.length > 0 ? (
            <>
              <path d={areaPath} fill="url(#bmrArea)" />
              <path
                d={linePath}
                fill="none"
                stroke="url(#bmrLine)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p, i) =>
                p.value !== null ? (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === points.length - 1 ? 4 : 2.2}
                    fill="oklch(0.92 0.1 86)"
                  />
                ) : null,
              )}
            </>
          ) : (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fill="oklch(0.78 0.02 90 / 0.5)"
              fontSize="10"
              fontFamily="Inter, sans-serif"
            >
              No check-ins yet
            </text>
          )}
        </svg>

        <div className="mt-1 flex justify-between">
          {series.map((s, i) => (
            <span
              key={i}
              className={`text-[9px] uppercase tracking-wider ${i === series.length - 1 ? "text-gold" : "text-muted-foreground"}`}
            >
              {s.day}
            </span>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { icon: Flame, label: t("profile.streak"), value: `${streak}`, unit: streak === 1 ? t("profile.day") : t("profile.day_plural") },
          { icon: Target, label: t("profile.integrated"), value: `${integration}`, unit: "%" },
          { icon: TrendingUp, label: t("profile.checkins"), value: `${state.bmrHistory.length}`, unit: t("profile.total") },
        ].map(({ icon: Icon, label, value, unit }) => (
          <div key={label} className="glass rounded-2xl p-3">
            <Icon className="h-4 w-4 text-gold" />
            <p
              className="mt-2 text-2xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {value}
              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {unit}
              </span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      {/* Preferences */}
      <section className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("profile.accountEyebrow")}</p>
        <Link
          to="/settings"
          className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "oklch(0.82 0.14 82 / 0.12)",
              border: "1px solid oklch(0.82 0.14 82 / 0.22)",
            }}
          >
            <SettingsIcon className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t("profile.preferences")}</p>
            <p className="text-xs text-muted-foreground">{t("profile.preferencesDesc")}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/circles"
          className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "oklch(0.82 0.14 82 / 0.12)",
              border: "1px solid oklch(0.82 0.14 82 / 0.22)",
            }}
          >
            <Users className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t("profile.circles")}</p>
            <p className="text-xs text-muted-foreground">{t("profile.circlesDesc")}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        {auth.user?.email && (
          <p className="px-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("profile.signedInAs", { email: auth.user.email })}
          </p>
        )}
      </section>

      {/* Personal learning */}
      {!learningAllowed ? (
        <PaywallLockedCard
          required="plus"
          title="What Metabyx has learned"
          description="Plus surfaces your preference changes, most-tuned settings, and reminder consistency — kept on-device."
          onUnlock={() =>
            gate.show("plus", {
              feature: "Personal Learning insights are part of Plus",
              description:
                "Track how your preferences and reminder rhythm evolve over time, stored on this device only.",
            })
          }
        />
      ) : (
      <section className="glass-strong rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            What Metabyx has learned
          </p>
        </div>
        {insights.totalPrefChanges === 0 && insights.remindersFired === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing yet — your preferences and reminder patterns will start
            shaping this section as you use the app.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Preference changes</span>
              <span className="text-gold">{insights.totalPrefChanges}</span>
            </li>
            {insights.mostTunedPref && (
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Most tuned</span>
                <span className="text-gold">{insights.mostTunedPref}</span>
              </li>
            )}
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Preferred slot</span>
              <span className="text-gold capitalize">{insights.preferredReminderSlot}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Reminder consistency</span>
              <span className="text-gold">
                {Math.round(insights.consistency * 100)}%
              </span>
            </li>
          </ul>
        )}
        <p className="mt-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          stored on this device only
        </p>
      </section>
      )}
      {gate.paywall}

      <section className="mt-2 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut();
            } catch {
              /* ignore — we still want to clear and redirect */
            }
            try {
              window.localStorage.removeItem("metabyx:v1");
            } catch {
              /* ignore */
            }
            navigate({ to: "/auth" });
          }}
          className="glass inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <LogOut className="h-4 w-4 text-gold" />
          <span>{t("profileExtras.logout")}</span>
        </button>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("profileExtras.logoutHint")}
        </p>
      </section>
    </PhoneFrame>
  );
}
