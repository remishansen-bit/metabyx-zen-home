import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useAuth } from "@/lib/auth";

export type SubscriptionRow = {
  id: string;
  paddle_subscription_id: string;
  paddle_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  environment: string;
};

export type Tier = "free" | "plus" | "pro";

export function tierFromProductId(productId: string | undefined | null): Tier {
  if (productId === "metabyx_pro") return "pro";
  if (productId === "metabyx_plus") return "plus";
  return "free";
}

export function isAccessActive(sub: SubscriptionRow | null): boolean {
  if (!sub) return false;
  const endsAt = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : null;
  const stillInPeriod = endsAt === null || endsAt > Date.now();
  if (["active", "trialing", "past_due"].includes(sub.status) && stillInPeriod) {
    return true;
  }
  if (sub.status === "canceled" && endsAt && endsAt > Date.now()) return true;
  return false;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSub = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", getPaddleEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (qErr) throw qErr;
      setSubscription((data as SubscriptionRow | null) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load subscription");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSub();
  }, [fetchSub]);

  // Listen for realtime subscription changes so the UI reacts the moment
  // a webhook updates the row (e.g. cancel-at-period-end flag flips).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`subscriptions:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchSub();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchSub]);

  const tier: Tier = isAccessActive(subscription)
    ? tierFromProductId(subscription?.product_id)
    : "free";

  return {
    subscription,
    tier,
    isActive: isAccessActive(subscription),
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    loading,
    error,
    refresh: fetchSub,
  };
}