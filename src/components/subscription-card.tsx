import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Crown, Check, Loader2, ExternalLink, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import {
  useSubscription,
  type Tier,
  tierFromProductId,
} from "@/hooks/useSubscription";
import { getPaddleEnvironment } from "@/lib/paddle";
import {
  cancelSubscription,
  createPortalSession,
} from "@/utils/payments.functions";

type Plan = {
  tier: Tier;
  name: string;
  price: string;
  priceId?: string;
  productId?: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    features: [
      "Daily morning & evening check-ins",
      "Local library (last 14 days)",
      "Basic archetype",
    ],
  },
  {
    tier: "plus",
    name: "Plus",
    price: "$7.99",
    priceId: "metabyx_plus_monthly",
    productId: "metabyx_plus",
    features: [
      "Everything in Free",
      "Full unlimited library",
      "AI refinement & rephrasing",
      "JSON & PDF data export",
      "Personal Learning insights",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$14.99",
    priceId: "metabyx_pro_monthly",
    productId: "metabyx_pro",
    features: [
      "Everything in Plus",
      "Metabolic Circles (shared rooms)",
      "Advanced archetype insights",
      "Priority AI · faster reflections",
      "Early access to new modes",
    ],
  },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function SubscriptionCard() {
  const auth = useAuth();
  const { subscription, tier, cancelAtPeriodEnd, loading, refresh } =
    useSubscription();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [showPlans, setShowPlans] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const callPortal = useServerFn(createPortalSession);
  const callCancel = useServerFn(cancelSubscription);

  const handleSelect = async (plan: Plan) => {
    if (plan.tier === "free") {
      // Downgrade to Free = cancel current paid sub at period end.
      if (subscription) setShowCancel(true);
      else setShowPlans(false);
      return;
    }
    if (!plan.priceId) return;
    if (!auth.user) {
      notify.error("Sign in first", "You need an account to upgrade.");
      return;
    }

    // If user already has an active paid subscription, route them through
    // the customer portal so plan changes apply pro-rated automatically.
    if (subscription && tier !== "free" && tier !== plan.tier) {
      try {
        setActing(plan.tier);
        const portal = await callPortal({
          data: {
            subscriptionId: subscription.paddle_subscription_id,
            environment: getPaddleEnvironment(),
          },
        });
        window.open(portal.overviewUrl, "_blank", "noopener,noreferrer");
        notify.info(
          "Manage your plan",
          "We opened your subscription portal in a new tab.",
        );
        setShowPlans(false);
      } catch (err) {
        notify.error(
          "Couldn't open portal",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setActing(null);
      }
      return;
    }

    try {
      setActing(plan.tier);
      await openCheckout({
        priceId: plan.priceId,
        customerEmail: auth.user.email ?? undefined,
        customData: { userId: auth.user.id },
      });
      // Refresh after a beat so the webhook-written row lands.
      setTimeout(refresh, 2500);
      setShowPlans(false);
    } catch (err) {
      notify.error(
        "Couldn't start checkout",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setActing(null);
    }
  };

  const handleManage = async () => {
    if (!subscription) return;
    try {
      setActing("portal");
      const portal = await callPortal({
        data: {
          subscriptionId: subscription.paddle_subscription_id,
          environment: getPaddleEnvironment(),
        },
      });
      window.open(portal.overviewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      notify.error(
        "Couldn't open portal",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setActing(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!subscription) return;
    try {
      setActing("cancel");
      await callCancel({
        data: {
          subscriptionId: subscription.paddle_subscription_id,
          environment: getPaddleEnvironment(),
        },
      });
      notify.saved(
        "Cancellation scheduled",
        `Access continues until ${formatDate(subscription.current_period_end)}.`,
      );
      setShowCancel(false);
      setTimeout(refresh, 800);
    } catch (err) {
      notify.error(
        "Couldn't cancel",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setActing(null);
    }
  };

  const currentPlanName =
    PLANS.find((p) => p.tier === tier)?.name ?? "Free";

  const statusLabel = (() => {
    if (loading) return "checking…";
    if (!subscription) return "Active · free tier";
    if (subscription.status === "past_due") return "Payment past due";
    if (cancelAtPeriodEnd && subscription.current_period_end) {
      return `Ends ${formatDate(subscription.current_period_end)}`;
    }
    if (subscription.status === "canceled" && subscription.current_period_end) {
      return `Access until ${formatDate(subscription.current_period_end)}`;
    }
    if (subscription.current_period_end) {
      return `Renews ${formatDate(subscription.current_period_end)}`;
    }
    return subscription.status;
  })();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Crown className="h-3.5 w-3.5 text-gold" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Subscription
        </p>
      </div>

      <div className="glass-strong rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Current plan
            </p>
            <p
              className="mt-1 text-2xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              METABYX {currentPlanName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]"
            style={{
              background:
                tier === "free"
                  ? "oklch(1 0 0 / 0.08)"
                  : "oklch(0.82 0.14 82 / 0.18)",
              color: tier === "free" ? "var(--muted-foreground)" : "var(--gold)",
              border:
                tier === "free"
                  ? "1px solid oklch(1 0 0 / 0.1)"
                  : "1px solid oklch(0.82 0.14 82 / 0.32)",
            }}
          >
            {tier}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setShowPlans(true)}
            disabled={checkoutLoading || acting !== null}
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
            style={{ background: "var(--gradient-gold)" }}
          >
            <Sparkles className="h-4 w-4" />
            {tier === "free"
              ? "Upgrade"
              : tier === "pro"
                ? "Manage plan"
                : "Change plan"}
          </button>
          {subscription && (
            <button
              onClick={handleManage}
              disabled={acting !== null}
              className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs uppercase tracking-[0.2em] text-foreground disabled:opacity-60"
            >
              {acting === "portal" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 text-gold" />
              )}
              Billing
            </button>
          )}
          {subscription && !cancelAtPeriodEnd && subscription.status !== "canceled" && (
            <button
              onClick={() => setShowCancel(true)}
              disabled={acting !== null}
              className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs uppercase tracking-[0.2em] text-muted-foreground disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>

        {cancelAtPeriodEnd && (
          <p className="mt-3 rounded-xl bg-[oklch(0.62_0.2_27/0.1)] px-3 py-2 text-[11px] text-foreground">
            Cancellation scheduled · access continues until{" "}
            {formatDate(subscription?.current_period_end ?? null)}.
          </p>
        )}
      </div>

      {showPlans && (
        <PlansDialog
          currentTier={tier}
          onClose={() => setShowPlans(false)}
          onSelect={handleSelect}
          actingTier={acting as Tier | null}
          checkoutLoading={checkoutLoading}
        />
      )}

      {showCancel && subscription && (
        <ConfirmCancelDialog
          tier={tierFromProductId(subscription.product_id)}
          endsAt={subscription.current_period_end}
          loading={acting === "cancel"}
          onClose={() => setShowCancel(false)}
          onConfirm={handleConfirmCancel}
        />
      )}
    </section>
  );
}

function PlansDialog({
  currentTier,
  onClose,
  onSelect,
  actingTier,
  checkoutLoading,
}: {
  currentTier: Tier;
  onClose: () => void;
  onSelect: (plan: Plan) => void;
  actingTier: Tier | null;
  checkoutLoading: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a plan"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="glass-strong max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Choose your plan
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="glass flex h-8 w-8 items-center justify-center rounded-full"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Compare what's included. Prices in USD, billed monthly. Cancel anytime.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const isActing = actingTier === plan.tier || (checkoutLoading && actingTier === plan.tier);
            return (
              <div
                key={plan.tier}
                className="glass rounded-2xl p-4"
                style={{
                  border: isCurrent
                    ? "1px solid oklch(0.82 0.14 82 / 0.4)"
                    : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className="text-lg font-light text-foreground"
                    style={{ fontFamily: "Fraunces, serif" }}
                  >
                    {plan.name}
                  </p>
                  <p className="text-sm text-foreground">
                    {plan.price}
                    <span className="text-xs text-muted-foreground"> /mo</span>
                  </p>
                </div>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-gold" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelect(plan)}
                  disabled={isCurrent || isActing}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  style={
                    isCurrent
                      ? {
                          background: "oklch(1 0 0 / 0.06)",
                          color: "var(--muted-foreground)",
                        }
                      : plan.tier === "free"
                        ? {
                            background: "oklch(1 0 0 / 0.06)",
                            color: "var(--foreground)",
                          }
                        : {
                            background: "var(--gradient-gold)",
                            color: "var(--background)",
                          }
                  }
                >
                  {isActing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCurrent
                    ? "Current plan"
                    : plan.tier === "free"
                      ? "Downgrade to Free"
                      : currentTier === "free"
                        ? `Upgrade to ${plan.name}`
                        : `Switch to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConfirmCancelDialog({
  tier,
  endsAt,
  loading,
  onClose,
  onConfirm,
}: {
  tier: Tier;
  endsAt: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm cancellation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="glass-strong w-full max-w-sm rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-lg font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Cancel METABYX {tier === "pro" ? "Pro" : "Plus"}?
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Your subscription stays active until{" "}
          <span className="text-foreground">{formatDate(endsAt)}</span>, then
          you'll drop to the Free tier. You can resubscribe anytime.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="glass flex-1 rounded-2xl px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
          >
            Keep plan
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-background disabled:opacity-60"
            style={{ background: "oklch(0.62 0.2 27)" }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm cancel
          </button>
        </div>
      </div>
    </div>
  );
}