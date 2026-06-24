import { useMemo } from "react";
import { Lock, TrendingUp, X, Sparkles, RefreshCw } from "lucide-react";
import {
  clearLocalPaywallEvents,
  summarizeFunnel,
  usePaywallEvents,
} from "@/lib/paywall-analytics";

/**
 * Settings card showing paywall conversion + drop-off. Reads from
 * localStorage (mirrored to Supabase in the background) so the card
 * renders instantly without a network round-trip.
 */
export function PaywallAnalyticsCard() {
  const events = usePaywallEvents();
  const funnel = useMemo(() => summarizeFunnel(events), [events]);

  if (funnel.impressions === 0) {
    return (
      <section className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Paywall analytics
          </p>
        </div>
        <p
          className="mt-2 text-sm font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          No paywall prompts yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Each time a Plus or Pro action shows you the upgrade sheet, it'll
          land here with conversion and drop-off.
        </p>
      </section>
    );
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <section className="glass-strong rounded-3xl p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Paywall analytics
          </p>
        </div>
        <button
          onClick={() => clearLocalPaywallEvents()}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          aria-label="Clear paywall history"
        >
          <RefreshCw className="h-3 w-3" /> reset
        </button>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Prompts" value={funnel.impressions} />
        <Stat
          label="Upgrade"
          value={pct(funnel.conversionRate)}
          accent="gold"
          icon={Sparkles}
        />
        <Stat
          label="Drop-off"
          value={pct(funnel.dropOffRate)}
          icon={X}
        />
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full"
          style={{
            width: `${Math.round(funnel.conversionRate * 100)}%`,
            background: "var(--gradient-gold)",
          }}
        />
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {funnel.upgradeClicks} of {funnel.impressions} upgraded ·{" "}
        {funnel.dismissed} dismissed · {funnel.last7Days} events this week
      </p>

      {funnel.topFeatures.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Most-blocked actions
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {funnel.topFeatures.map((f) => (
              <li
                key={`${f.required}:${f.feature}`}
                className="glass flex items-center justify-between rounded-xl px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <Lock className="h-3 w-3 text-gold" />
                  {f.feature}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {f.required} · {f.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent?: "gold";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass rounded-2xl p-3">
      <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {Icon && <Icon className={`h-3 w-3 ${accent === "gold" ? "text-gold" : "text-muted-foreground"}`} />}
        <p
          className={`text-xl font-light ${accent === "gold" ? "text-gold" : "text-foreground"}`}
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}