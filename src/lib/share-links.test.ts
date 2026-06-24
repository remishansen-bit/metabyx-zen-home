// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end-ish tests for share-link viewing semantics. We mock the
 * Supabase client so the test asserts the *behavior* we contract for:
 *   - viewers (any user) only see non-revoked links via get_share_link RPC
 *   - anonymous mode replaces the author label, regardless of viewer
 *   - non-owners can never list/read raw rows from share_links
 */

type Row = {
  id: string;
  user_id: string;
  token: string;
  kind: "reflection" | "insight";
  title: string;
  body: string;
  snapshot: Record<string, unknown>;
  anonymous: boolean;
  revoked_at: string | null;
  created_at: string;
  rotated_from: string | null;
  display_name: string | null;
};

const ALICE = "user-alice";
const BOB = "user-bob";

let currentUserId: string | null = ALICE;
const rows: Row[] = [];

function rpcGetShareLink(token: string) {
  const r = rows.find((x) => x.token === token && x.revoked_at === null);
  if (!r) return null;
  return {
    token: r.token,
    kind: r.kind,
    title: r.title,
    body: r.body,
    snapshot: r.snapshot,
    anonymous: r.anonymous,
    author_label: r.anonymous
      ? "Anonymous"
      : r.display_name ?? "A METABYX friend",
    created_at: r.created_at,
  };
}

vi.mock("@/integrations/supabase/client", () => {
  const tableHandler = (name: string) => {
    if (name !== "share_links") throw new Error(`unexpected table ${name}`);
    const ownerFilter = () => currentUserId; // RLS scopes to auth.uid()
    let pending: Partial<Row> | null = null;
    const builder: {
      select: (cols?: string) => typeof builder;
      order: () => typeof builder;
      eq: (col: string, val: string) => typeof builder;
      single: () => Promise<{ data: Row | null; error: null }>;
      insert: (vals: Partial<Row>) => typeof builder;
      update: (vals: Partial<Row>) => typeof builder;
      then?: (resolve: (v: { data: Row[]; error: null }) => unknown) => unknown;
    } = {
      select: () => builder,
      order: () => builder,
      eq: (col, val) => {
        if (pending && col === "id") {
          const target = rows.find(
            (r) => r.id === val && r.user_id === ownerFilter(),
          );
          if (target && pending) Object.assign(target, pending);
          pending = null;
        }
        return builder;
      },
      single: async () => {
        const last = rows[rows.length - 1] ?? null;
        return { data: last, error: null };
      },
      insert: (vals) => {
        const row: Row = {
          id: `row-${rows.length + 1}`,
          user_id: (vals.user_id as string) ?? ownerFilter() ?? "",
          token: vals.token as string,
          kind: (vals.kind as Row["kind"]) ?? "reflection",
          title: (vals.title as string) ?? "",
          body: (vals.body as string) ?? "",
          snapshot: (vals.snapshot as Record<string, unknown>) ?? {},
          anonymous: Boolean(vals.anonymous),
          revoked_at: null,
          created_at: new Date().toISOString(),
          rotated_from: (vals.rotated_from as string) ?? null,
          display_name: vals.user_id === ALICE ? "Alice" : "Bob",
        };
        rows.push(row);
        return builder;
      },
      update: (vals) => {
        pending = vals;
        return builder;
      },
    };
    // Default await on the chain (list) — only return owner's rows (RLS).
    builder.then = (resolve) =>
      resolve({
        data: rows.filter((r) => r.user_id === ownerFilter()),
        error: null,
      });
    return builder;
  };

  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }),
      },
      from: tableHandler,
      rpc: async (_name: string, args: { p_token: string }) => ({
        data: [rpcGetShareLink(args.p_token)].filter(Boolean),
        error: null,
      }),
    },
  };
});

import {
  createShareLink,
  fetchPublicShareLink,
  listShareLinks,
  revokeShareLink,
} from "./share-links";

beforeEach(() => {
  rows.length = 0;
  currentUserId = ALICE;
});

describe("share-link viewing", () => {
  it("non-revoked link is visible to any viewer", async () => {
    currentUserId = ALICE;
    const link = await createShareLink({
      kind: "reflection",
      title: "Morning calm",
      body: "Felt grounded after the check-in.",
      anonymous: false,
    });
    // Switch viewer — public RPC must still resolve.
    currentUserId = BOB;
    const view = await fetchPublicShareLink(link.token);
    expect(view).not.toBeNull();
    expect(view?.title).toBe("Morning calm");
    expect(view?.author_label).toBe("Alice");

    // Even signed-out viewers can read via the security-definer RPC.
    currentUserId = null;
    const anonView = await fetchPublicShareLink(link.token);
    expect(anonView?.title).toBe("Morning calm");
  });

  it("revoked tokens are blocked for every viewer", async () => {
    currentUserId = ALICE;
    const link = await createShareLink({
      kind: "insight",
      title: "BMR trend",
      body: "Three weeks of steady recovery.",
      anonymous: false,
    });
    await revokeShareLink(link.id);

    for (const viewer of [ALICE, BOB, null]) {
      currentUserId = viewer;
      const view = await fetchPublicShareLink(link.token);
      expect(view).toBeNull();
    }
  });

  it("anonymous mode hides the author label across viewers", async () => {
    currentUserId = ALICE;
    const link = await createShareLink({
      kind: "reflection",
      title: "Quiet win",
      body: "Held a boundary today.",
      anonymous: true,
    });
    for (const viewer of [ALICE, BOB, null]) {
      currentUserId = viewer;
      const view = await fetchPublicShareLink(link.token);
      expect(view?.anonymous).toBe(true);
      expect(view?.author_label).toBe("Anonymous");
    }
  });

  it("listShareLinks is scoped to the owner (RLS)", async () => {
    currentUserId = ALICE;
    await createShareLink({
      kind: "reflection",
      title: "Alice 1",
      body: "x",
      anonymous: false,
    });
    currentUserId = BOB;
    await createShareLink({
      kind: "reflection",
      title: "Bob 1",
      body: "y",
      anonymous: false,
    });

    currentUserId = ALICE;
    const aliceRows = await listShareLinks();
    expect(aliceRows.every((r) => r.user_id === ALICE)).toBe(true);
    expect(aliceRows.some((r) => r.title === "Bob 1")).toBe(false);

    currentUserId = BOB;
    const bobRows = await listShareLinks();
    expect(bobRows.every((r) => r.user_id === BOB)).toBe(true);
  });
});
