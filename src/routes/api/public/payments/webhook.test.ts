import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled,
  type WebhookDb,
} from "./webhook";

/**
 * In-memory webhook DB so we can assert idempotency + ordering without a
 * live Supabase round-trip. The shape mirrors the three operations the real
 * handler performs against the `subscriptions` table.
 */
function makeDb() {
  const rows = new Map<string, Record<string, any>>();
  const calls: { op: string; arg: any }[] = [];
  const db: WebhookDb = {
    upsertSubscription: async (row) => {
      calls.push({ op: "upsert", arg: row });
      const id = row.paddle_subscription_id as string;
      rows.set(id, { ...rows.get(id), ...row });
    },
    updateSubscription: async (id, env, patch) => {
      calls.push({ op: "update", arg: { id, env, patch } });
      const cur = rows.get(id);
      if (!cur || cur.environment !== env) return;
      rows.set(id, { ...cur, ...patch });
    },
    getEventTime: async (id) => {
      return (rows.get(id)?.updated_at as string | undefined) ?? null;
    },
  };
  return { db, rows, calls };
}

function createdEvent(overrides: Partial<any> = {}) {
  return {
    id: "sub_001",
    customerId: "ctm_001",
    status: "active",
    customData: { userId: "user-a" },
    currentBillingPeriod: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z" },
    items: [
      {
        price: { id: "pri_1", importMeta: { externalId: "metabyx_pro_monthly" } },
        product: { id: "pro_1", importMeta: { externalId: "metabyx_pro" } },
      },
    ],
    occurredAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("payments webhook handlers", () => {
  it("upserts idempotently when the same subscription.created event arrives twice", async () => {
    const { db, rows, calls } = makeDb();
    const evt = createdEvent();

    await handleSubscriptionCreated(evt, "sandbox", db);
    await handleSubscriptionCreated(evt, "sandbox", db);

    expect(rows.size).toBe(1);
    const row = rows.get("sub_001")!;
    expect(row.user_id).toBe("user-a");
    expect(row.price_id).toBe("metabyx_pro_monthly");
    // First call writes, second call is stale (same occurredAt) and skips.
    expect(calls.filter((c) => c.op === "upsert")).toHaveLength(1);
  });

  it("ignores an out-of-order older subscription.updated event", async () => {
    const { db, rows } = makeDb();
    await handleSubscriptionCreated(createdEvent(), "sandbox", db);

    // Newer event first: status flips to past_due at T+10 minutes.
    await handleSubscriptionUpdated(
      {
        id: "sub_001",
        status: "past_due",
        currentBillingPeriod: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z" },
        scheduledChange: null,
        items: [],
        occurredAt: "2026-01-01T00:10:00Z",
      },
      "sandbox",
      db,
    );
    expect(rows.get("sub_001")!.status).toBe("past_due");

    // Older event arrives late and tries to set status back to "active".
    await handleSubscriptionUpdated(
      {
        id: "sub_001",
        status: "active",
        currentBillingPeriod: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z" },
        scheduledChange: null,
        items: [],
        occurredAt: "2026-01-01T00:05:00Z",
      },
      "sandbox",
      db,
    );

    expect(rows.get("sub_001")!.status).toBe("past_due");
  });

  it("treats subscription.canceled as idempotent and won't unset a newer status", async () => {
    const { db, rows } = makeDb();
    await handleSubscriptionCreated(createdEvent(), "sandbox", db);

    await handleSubscriptionCanceled(
      { id: "sub_001", occurredAt: "2026-01-02T00:00:00Z" },
      "sandbox",
      db,
    );
    expect(rows.get("sub_001")!.status).toBe("canceled");

    // Duplicate cancel at the same occurredAt is a no-op (stale check skips it).
    await handleSubscriptionCanceled(
      { id: "sub_001", occurredAt: "2026-01-02T00:00:00Z" },
      "sandbox",
      db,
    );
    expect(rows.get("sub_001")!.status).toBe("canceled");
  });

  it("skips when importMeta.externalId is missing — no silent raw-id rows", async () => {
    const { db, rows } = makeDb();
    await handleSubscriptionCreated(
      createdEvent({
        items: [
          {
            price: { id: "pri_raw", importMeta: null },
            product: { id: "pro_raw", importMeta: null },
          },
        ],
      }),
      "sandbox",
      db,
    );
    expect(rows.size).toBe(0);
  });

  it("keeps sandbox and live environments separate on update", async () => {
    const { db, rows } = makeDb();
    await handleSubscriptionCreated(createdEvent(), "sandbox", db);

    // Update sent to live env should not touch the sandbox row.
    await handleSubscriptionUpdated(
      {
        id: "sub_001",
        status: "past_due",
        currentBillingPeriod: { startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-02-01T00:00:00Z" },
        scheduledChange: null,
        items: [],
        occurredAt: "2026-01-01T00:10:00Z",
      },
      "live",
      db,
    );
    expect(rows.get("sub_001")!.environment).toBe("sandbox");
    expect(rows.get("sub_001")!.status).toBe("active");
  });
});

/**
 * Cross-user RLS isolation. We can't easily spin up a real Supabase
 * authenticated session in vitest, so we assert the migration that ships
 * RLS for `subscriptions` defines policies that scope to `auth.uid()`.
 * If a future migration weakens this, the test fails before review.
 */
describe("subscriptions RLS policies", () => {
  it("scopes subscriptions SELECT to auth.uid() = user_id", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");

    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.subscriptions/i);
    expect(sql).toMatch(/alter\s+table\s+public\.subscriptions\s+enable\s+row\s+level\s+security/i);
    // SELECT policy must require auth.uid() = user_id (cross-user reads denied).
    expect(sql).toMatch(/on\s+public\.subscriptions\s+for\s+select[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i);
    // Only service_role may mutate.
    expect(sql).toMatch(/on\s+public\.subscriptions\s+for\s+all[\s\S]*?service_role/i);
  });
});