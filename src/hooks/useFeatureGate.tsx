import { useState, useCallback } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { canAccess, type PaywallReason, type RequiredTier } from "@/lib/feature-access";
import { PaywallSheet } from "@/components/PaywallSheet";
import { recordPaywallEvent } from "@/lib/paywall-analytics";

/**
 * Imperative feature-gate helper for call sites that need to guard a single
 * action (e.g. an Export button, an AI refine call). Returns:
 *  - `tier` — the current resolved tier
 *  - `ensure(required, copy)` — returns true if allowed, else opens the
 *    paywall sheet and returns false
 *  - `paywall` — JSX to render once (handles its own visibility)
 */
export function useFeatureGate() {
  const { tier } = useSubscription();
  const [reason, setReason] = useState<PaywallReason | null>(null);

  const ensure = useCallback(
    (required: RequiredTier, copy: { feature: string; description: string }): boolean => {
      if (canAccess(tier, required)) return true;
      recordPaywallEvent({
        required,
        feature: copy.feature,
        type: "impression",
        surface: "ensure",
      });
      setReason({ required, feature: copy.feature, description: copy.description });
      return false;
    },
    [tier],
  );

  const show = useCallback(
    (required: RequiredTier, copy: { feature: string; description: string }) => {
      recordPaywallEvent({
        required,
        feature: copy.feature,
        type: "impression",
        surface: "show",
      });
      setReason({ required, feature: copy.feature, description: copy.description });
    },
    [],
  );

  const paywall = <PaywallSheet reason={reason} onClose={() => setReason(null)} />;

  return { tier, ensure, show, paywall };
}