/**
 * Paywall analytics — records every prompt impression, dismissal, and
 * upgrade-click so Settings can show conversion + drop-off. Writes to
 * localStorage first (always available, even pre-auth) and best-effort
 * mirrors to Supabase `paywall_events` when a user session exists.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RequiredTier } from "@/lib/feature-access";

export type PaywallEventType = "impression" | "dismissed" | "upgrade_clicked";

export type PaywallEvent = {
  id: string;
  required: RequiredTier;
  feature: string;
  surface?: string;
  type: PaywallEventType;
  at: number;
};

const KEY = "metabyx:paywall:events:v1";
const EVENT = "metabyx:paywall:change";
const MAX = 500;

function readLocal(): PaywallEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaywallEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(events: PaywallEvent[]) {
  if (typeof window === "undefined") return;
  const trimmed = events.slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new Event(EVENT));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordPaywallEvent(input: {
  required: RequiredTier;
  feature: string;
  surface?: string;
  type: PaywallEventType;
}) {
  const event: PaywallEvent = {
    id: newId(),
    required: input.required,
    feature: input.feature,
    surface: input.surface,
    type: input.type,
    at: Date.now(),
  };
  writeLocal([event, ...readLocal()]);

  // Best-effort cloud mirror — never block UX on this.
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      await supabase.from("paywall_events").insert({
        user_id: userId,
        required_tier: input.required,
        feature: input.feature,
        surface: input.surface ?? null,
        event_type: input.type,
      });
    } catch {
      // Silent — local copy is the source of truth for the UI.
    }
  })();
}

export function listLocalPaywallEvents(): PaywallEvent[] {
  return readLocal();
}

export function clearLocalPaywallEvents() {
  writeLocal([]);
}

export type PaywallFunnel = {
  impressions: number;
  dismissed: number;
  upgradeClicks: number;
  conversionRate: number; // 0..1 (upgrade_clicked / impressions)
  dropOffRate: number; // 0..1 (dismissed / impressions)
  topFeatures: { feature: string; required: RequiredTier; count: number }[];
  last7Days: number;
};

export function summarizeFunnel(events: PaywallEvent[]): PaywallFunnel {
  const impressions = events.filter((e) => e.type === "impression").length;
  const dismissed = events.filter((e) => e.type === "dismissed").length;
  const upgradeClicks = events.filter((e) => e.type === "upgrade_clicked").length;
  const map = new Map<string, { feature: string; required: RequiredTier; count: number }>();
  for (const e of events) {
    if (e.type !== "impression") continue;
    const k = `${e.required}:${e.feature}`;
    const existing = map.get(k);
    if (existing) existing.count += 1;
    else map.set(k, { feature: e.feature, required: e.required, count: 1 });
  }
  const topFeatures = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7Days = events.filter((e) => e.at >= weekAgo).length;
  return {
    impressions,
    dismissed,
    upgradeClicks,
    conversionRate: impressions === 0 ? 0 : upgradeClicks / impressions,
    dropOffRate: impressions === 0 ? 0 : dismissed / impressions,
    topFeatures,
    last7Days,
  };
}

export function usePaywallEvents(): PaywallEvent[] {
  const [events, setEvents] = useState<PaywallEvent[]>(() => readLocal());
  useEffect(() => {
    const sync = () => setEvents(readLocal());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return events;
}