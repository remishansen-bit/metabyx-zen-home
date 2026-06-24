import type { Tier } from "@/hooks/useSubscription";

/**
 * Tier ordering for paywall gating. Higher number = more access.
 * Free < Plus < Pro.
 */
const RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2 };

export type RequiredTier = Exclude<Tier, "free">;

export function canAccess(current: Tier, required: RequiredTier): boolean {
  return RANK[current] >= RANK[required];
}

export type PaywallReason = {
  required: RequiredTier;
  feature: string;
  description: string;
};

export const PAYWALL_COPY: Record<RequiredTier, { name: string; price: string; tagline: string }> = {
  plus: {
    name: "METABYX Plus",
    price: "$7.99 / mo",
    tagline: "AI refinement, full library, data exports and personal learning insights.",
  },
  pro: {
    name: "METABYX Pro",
    price: "$14.99 / mo",
    tagline: "Everything in Plus, plus Metabolic Circles and priority AI.",
  },
};
