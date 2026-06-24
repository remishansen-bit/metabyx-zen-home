import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Receipt, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getPaddleEnvironment } from "@/lib/paddle";

type Row = {
  id: string;
  paddle_subscription_id: string;
  product_id: string;
  price_id: string;
  status: string;
  cancel_at_period_end: boolean | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

function eventLabel(
  row: Row,
  t: (key: string) => string,
): { label: string; tone: "good" | "warn" | "info" } {
  if (row.status === "canceled")
    return { label: t("subscriptionHistory.evtCancellation"), tone: "warn" };
  if (row.cancel_at_period_end)
    return { label: t("subscriptionHistory.evtCancellationScheduled"), tone: "warn" };
  if (row.status === "past_due")
    return { label: t("subscriptionHistory.evtPastDue"), tone: "warn" };
  if (row.created_at === row.updated_at)
    return { label: t("subscriptionHistory.evtStarted"), tone: "good" };
  return { label: t("subscriptionHistory.evtUpdated"), tone: "info" };
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function planName(productId: string, t: (key: string) => string) {
  if (productId === "metabyx_pro") return t("subscriptionHistory.planPro");
  if (productId === "metabyx_plus") return t("subscriptionHistory.planPlus");
  return productId;
}

/**
 * Lightweight activity feed for the user's subscription history. Reads the
 * managed `subscriptions` table directly (RLS scopes to the signed-in user)
 * and renders one row per subscription event so the user can confirm each
 * upgrade, downgrade, and cancellation landed.
 */
export function SubscriptionHistory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("subscriptions")
      .select(
        "id,paddle_subscription_id,product_id,price_id,status,cancel_at_period_end,current_period_start,current_period_end,created_at,updated_at",
      )
      .eq("user_id", user.id)
      .eq("environment", getPaddleEnvironment())
      .order("updated_at", { ascending: false })
      .limit(25)
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) setError(qErr.message);
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Receipt className="h-3.5 w-3.5 text-gold" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("subscriptionHistory.activity")}
        </p>
      </div>
      <div className="glass rounded-2xl p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("subscriptionHistory.loading")}
          </div>
        ) : error ? (
          <p className="px-3 py-4 text-xs text-[oklch(0.78_0.16_27)]">
            {t("subscriptionHistory.couldNotLoad", { error })}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {t("subscriptionHistory.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const evt = eventLabel(row, t);
              const Icon =
                evt.tone === "good"
                  ? CheckCircle2
                  : evt.tone === "warn"
                    ? XCircle
                    : RefreshCw;
              const color =
                evt.tone === "good"
                  ? "text-gold"
                  : evt.tone === "warn"
                    ? "text-[oklch(0.78_0.16_27)]"
                    : "text-foreground";
              return (
                <li
                  key={`${row.id}-${row.updated_at}`}
                  className="flex items-start gap-3 rounded-xl px-2 py-2"
                >
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color}`} />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">
                      {evt.label} ·{" "}
                      <span className="text-gold">{planName(row.product_id, t)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmt(row.updated_at)}
                    </p>
                    {row.current_period_end && (
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {t("subscriptionHistory.periodEnds", { date: fmt(row.current_period_end) })}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-[oklch(1_0_0/0.06)] px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    {row.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}