import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gatewayFetch,
  getPaddleClient,
  type PaddleEnv,
} from "@/lib/paddle.server";

/**
 * Resolve a human-readable price ID (e.g. "metabyx_pro_monthly") to the
 * Paddle internal ID (pri_…) required by Paddle.Checkout.open().
 * Public so the unauthenticated pricing/checkout flow can render.
 */
export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const result = (await response.json()) as { data?: Array<{ id: string }> };
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0].id;
  });

/**
 * Create a Paddle customer-portal session for the signed-in user, scoped to
 * one subscription. Used by upgrade/downgrade/cancel actions in Settings.
 * Returns a URL the client opens in a new tab.
 */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { subscriptionId: string; environment: PaddleEnv }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("paddle_customer_id, paddle_subscription_id, environment")
      .eq("paddle_subscription_id", data.subscriptionId)
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Subscription not found");

    const paddle = getPaddleClient(sub.environment as PaddleEnv);
    const portal = await paddle.customerPortalSessions.create(
      sub.paddle_customer_id,
      [sub.paddle_subscription_id],
    );
    return {
      overviewUrl: portal.urls.general.overview,
      subscriptionUrls: portal.urls.subscriptions,
    };
  });

/**
 * Cancel a Paddle subscription at the end of the current billing period.
 * The signed-in user keeps access until current_period_end, then the
 * subscription transitions to "canceled" via webhook.
 */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { subscriptionId: string; environment: PaddleEnv }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("paddle_subscription_id, environment")
      .eq("paddle_subscription_id", data.subscriptionId)
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Subscription not found");

    const paddle = getPaddleClient(sub.environment as PaddleEnv);
    await paddle.subscriptions.cancel(sub.paddle_subscription_id, {
      effectiveFrom: "next_billing_period",
    });
    return { ok: true };
  });