import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Lock,
  TrendingUp,
  X,
  Sparkles,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import {
  clearLocalPaywallEvents,
  usePaywallEvents,
  type PaywallEvent,
} from "@/lib/paywall-analytics";
import type { RequiredTier } from "@/lib/feature-access";

type TierFilter = "all" | RequiredTier;
type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGES: { key: RangeKey; label: string; ms: number | null }[] = [
  { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "90d", label: "90d", ms: 90 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "all", ms: null },
];

/**
 * Per-action paywall funnel (prompt → dismiss → upgrade) with date range
 * and tier filtering. Reads from the local mirror; Supabase rows are kept
 * in sync in the background.
 */
export function PaywallAnalyticsCard() {
  const { t } = useTranslation();
  const events = usePaywallEvents();
  const [range, setRange] = useState<RangeKey>("30d");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  const filtered = useMemo(() => {
    const cutoff = (() => {
      const r = RANGES.find((x) => x.key === range)!;
      return r.ms === null ? 0 : Date.now() - r.ms;
    })();
    return events.filter(
      (e) => e.at >= cutoff && (tierFilter === "all" || e.required === tierFilter),
    );
  }, [events, range, tierFilter]);

  const totals = useMemo(() => bucketTotals(filtered), [filtered]);
  const timeline = useMemo(() => buildTimeline(filtered), [filtered]);

  const exportCsv = () => {
    const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;
    const csv = buildTimelineCsv(timeline);
    const filename = `paywall-funnel_${rangeLabel}_${tierFilter}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    downloadCsv(filename, csv);
  };

  return (
    <section className="glass-strong rounded-3xl p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("paywallAnalytics.eyebrow")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={timeline.length === 0}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={`${t("paywallAnalytics.exportAria")} (${RANGES.find((r) => r.key === range)?.label ?? range} · ${tierFilter})`}
          >
            <Download className="h-3 w-3" /> {t("paywallAnalytics.exportCsv")}
          </button>
          <button
            onClick={() => clearLocalPaywallEvents()}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            aria-label={t("paywallAnalytics.resetAria")}
          >
            <RefreshCw className="h-3 w-3" /> {t("paywallAnalytics.reset")}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="glass flex items-center gap-1 rounded-xl p-1">
          <Calendar className="ml-1 h-3 w-3 text-muted-foreground" />
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${range === r.key ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "text-muted-foreground"}`}
            >
              {r.key === "all" ? t("paywallAnalytics.rangeAll") : r.label}
            </button>
          ))}
        </div>
        <div className="glass flex items-center gap-1 rounded-xl p-1">
          {(["all", "plus", "pro"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${tierFilter === t ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("paywallAnalytics.prompts")} value={totals.impressions} />
        <Stat
          label={t("paywallAnalytics.upgrade")}
          value={pct(totals.impressions === 0 ? 0 : totals.upgrades / totals.impressions)}
          accent="gold"
          icon={Sparkles}
        />
        <Stat
          label={t("paywallAnalytics.dropOff")}
          value={pct(totals.impressions === 0 ? 0 : totals.dismisses / totals.impressions)}
          icon={X}
        />
      </div>

      {/* Per-action timeline */}
      {timeline.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("paywallAnalytics.empty")}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {timeline.map((row) => (
            <ActionRow key={row.key} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionRow({ row }: { row: ActionTimeline }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const total = row.impressions || 1;
  return (
    <li className="glass rounded-2xl p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Lock className="h-3 w-3 shrink-0 text-gold" />
          <span className="truncate text-xs text-foreground">{row.feature}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {row.required} · {row.impressions}
          </span>
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      </button>

      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <span
          className="h-full"
          style={{
            width: `${(row.upgrades / total) * 100}%`,
            background: "var(--gradient-gold)",
          }}
          aria-label={t("paywallAnalytics.upgradeClicks", { n: row.upgrades })}
        />
        <span
          className="h-full bg-foreground/30"
          style={{ width: `${(row.dismisses / total) * 100}%` }}
          aria-label={t("paywallAnalytics.dismisses", { n: row.dismisses })}
        />
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {t("paywallAnalytics.rowSummary", {
          up: row.upgrades,
          dis: row.dismisses,
          none: Math.max(0, row.impressions - row.upgrades - row.dismisses),
        })}
      </p>

      {open && (
        <ol className="mt-3 flex flex-col gap-1 border-l border-foreground/10 pl-3 text-[11px]">
          {row.events
            .slice(-12)
            .reverse()
            .map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 text-muted-foreground"
              >
                <span className={`uppercase tracking-[0.2em] ${labelColor(e.type)}`}>
                  {labelFor(e.type, t)}
                </span>
                <span>{formatTime(e.at, t)}</span>
              </li>
            ))}
        </ol>
      )}
    </li>
  );
}

type ActionTimeline = {
  key: string;
  feature: string;
  required: RequiredTier;
  impressions: number;
  dismisses: number;
  upgrades: number;
  events: PaywallEvent[];
};

function buildTimeline(events: PaywallEvent[]): ActionTimeline[] {
  const map = new Map<string, ActionTimeline>();
  for (const e of events) {
    const k = `${e.required}:${e.feature}`;
    let row = map.get(k);
    if (!row) {
      row = {
        key: k,
        feature: e.feature,
        required: e.required,
        impressions: 0,
        dismisses: 0,
        upgrades: 0,
        events: [],
      };
      map.set(k, row);
    }
    row.events.push(e);
    if (e.type === "impression") row.impressions += 1;
    else if (e.type === "dismissed") row.dismisses += 1;
    else if (e.type === "upgrade_clicked") row.upgrades += 1;
  }
  return [...map.values()].sort((a, b) => b.impressions - a.impressions);
}

function bucketTotals(events: PaywallEvent[]) {
  let impressions = 0;
  let dismisses = 0;
  let upgrades = 0;
  for (const e of events) {
    if (e.type === "impression") impressions += 1;
    else if (e.type === "dismissed") dismisses += 1;
    else if (e.type === "upgrade_clicked") upgrades += 1;
  }
  return { impressions, dismisses, upgrades };
}

function labelFor(type: PaywallEvent["type"], t: (k: string) => string) {
  if (type === "impression") return t("paywallAnalytics.labelPrompt");
  if (type === "dismissed") return t("paywallAnalytics.labelDismiss");
  return t("paywallAnalytics.labelUpgrade");
}

function labelColor(t: PaywallEvent["type"]) {
  if (t === "upgrade_clicked") return "text-gold";
  if (t === "dismissed") return "text-rose-300";
  return "text-foreground";
}

function formatTime(at: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return t("paywallAnalytics.timeJustNow");
  if (diff < 60 * 60_000) return t("paywallAnalytics.timeMinutes", { n: Math.floor(diff / 60_000) });
  if (diff < 24 * 60 * 60_000) return t("paywallAnalytics.timeHours", { n: Math.floor(diff / (60 * 60_000)) });
  return t("paywallAnalytics.timeDays", { n: Math.floor(diff / (24 * 60 * 60_000)) });
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildTimelineCsv(rows: ActionTimeline[]): string {
  const header = [
    "feature",
    "required_tier",
    "prompts",
    "dismisses",
    "upgrade_clicks",
    "no_action",
    "conversion_rate",
    "drop_off_rate",
  ].join(",");
  const lines = rows.map((r) => {
    const noAction = Math.max(0, r.impressions - r.upgrades - r.dismisses);
    const conv = r.impressions === 0 ? 0 : r.upgrades / r.impressions;
    const drop = r.impressions === 0 ? 0 : r.dismisses / r.impressions;
    return [
      csvEscape(r.feature),
      csvEscape(r.required),
      r.impressions,
      r.dismisses,
      r.upgrades,
      noAction,
      conv.toFixed(4),
      drop.toFixed(4),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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