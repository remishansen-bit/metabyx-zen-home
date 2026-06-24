import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";

/**
 * Webhook handlers are exported so the test suite can drive them with a
 * fake supabase client without going through Paddle signature verification.
 * Idempotency is provided by `paddle_subscription_id` (unique) plus an
 * occurredAt comparison so out-of-order or duplicate events don't roll back
 * to a stale state.
 */
export type WebhookDb = {
  upsertSubscription: (row: Record<string, unknown>) => Promise<void>;
  updateSubscription: (
    id: string,
    env: PaddleEnv,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  getEventTime: (id: string, env: PaddleEnv) => Promise<string | null>;
};

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function defaultDb(): WebhookDb {
  const sb = getSupabase();
  return {
    upsertSubscription: async (row) => {
      await sb
        .from("subscriptions")
        .upsert(row, { onConflict: "paddle_subscription_id" });
    },
    updateSubscription: async (id, env, patch) => {
      await sb
        .from("subscriptions")
        .update(patch)
        .eq("paddle_subscription_id", id)
        .eq("environment", env);
    },
    getEventTime: async (id, env) => {
      const { data } = await sb
        .from("subscriptions")
        .select("updated_at")
        .eq("paddle_subscription_id", id)
        .eq("environment", env)
        .maybeSingle();
      return (data?.updated_at as string | undefined) ?? null;
    },
  };
}

async function isStale(
  db: WebhookDb,
  id: string,
  env: PaddleEnv,
  incoming: string | undefined,
): Promise<boolean> {
  if (!incoming) return false;
  const current = await db.getEventTime(id, env);
  if (!current) return false;
  return new Date(incoming).getTime() < new Date(current).getTime();
}

export async function handleSubscriptionCreated(
  data: any,
  env: PaddleEnv,
  db: WebhookDb = defaultDb(),
) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;
  const userId = customData?.userId;
  if (!userId) {
    console.error("payments-webhook: no userId in customData");
    return;
  }
  const item = items[0];
  const priceId = item.price.importMeta?.externalId;
  const productId = item.product.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn("payments-webhook: missing importMeta.externalId", {
      rawPriceId: item.price.id,
      rawProductId: item.product.id,
    });
    return;
  }
  const occurredAt: string = data.occurredAt ?? new Date().toISOString();
  if (await isStale(db, id, env, occurredAt)) return;

  await db.upsertSubscription({
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    environment: env,
    updated_at: occurredAt,
  });
}

export async function handleSubscriptionUpdated(
  data: any,
  env: PaddleEnv,
  db: WebhookDb = defaultDb(),
) {
  const { id, status, currentBillingPeriod, scheduledChange, items } = data;
  const item = items?.[0];
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;
  const occurredAt: string = data.occurredAt ?? new Date().toISOString();
  if (await isStale(db, id, env, occurredAt)) return;

  const patch: Record<string, unknown> = {
    status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    cancel_at_period_end: scheduledChange?.action === "cancel",
    updated_at: occurredAt,
  };
  if (priceId) patch.price_id = priceId;
  if (productId) patch.product_id = productId;

  await db.updateSubscription(id, env, patch);
}

export async function handleSubscriptionCanceled(
  data: any,
  env: PaddleEnv,
  db: WebhookDb = defaultDb(),
) {
  const occurredAt: string = data.occurredAt ?? new Date().toISOString();
  if (await isStale(db, data.id, env, occurredAt)) return;
  await db.updateSubscription(data.id, env, {
    status: "canceled",
    updated_at: occurredAt,
  });
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data, env);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env);
      break;
    default:
      console.log("payments-webhook: unhandled event", event.eventType);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("payments-webhook: error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});