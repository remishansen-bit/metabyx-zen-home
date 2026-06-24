import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { z } from "zod";

const InputSchema = z.object({ token: z.string().min(1).max(200) });

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 60; // max views per token+visitor per window

function visitorHash(token: string): string {
  // Hash token + best-effort IP + UA so the same visitor pounding one
  // token is throttled, but the value can't be reversed to a raw IP.
  let ip = "";
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? "";
  } catch {
    ip = "";
  }
  const ua = getRequestHeader("user-agent") ?? "";
  return createHash("sha256").update(`${token}|${ip}|${ua}`).digest("hex");
}

/**
 * Public proxy for the `get_share_link` RPC. The underlying SQL function is
 * `SECURITY DEFINER` and only `service_role` can execute it, so we call it
 * from the server using the admin client. The RPC itself only returns
 * non-revoked, non-expired rows and a safe column projection (no email,
 * no user_id). We also throttle repeated views per token+visitor via the
 * `share_link_views` log table.
 */
export const fetchPublicShareLinkFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string, o?: { count?: "exact"; head?: boolean }) => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => {
              gte: (k: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }>;
            };
          };
        };
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const hash = visitorHash(data.token);
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count, error: countErr } = await admin
      .from("share_link_views")
      .select("id", { count: "exact", head: true })
      .eq("token", data.token)
      .eq("visitor_hash", hash)
      .gte("viewed_at", since);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      throw new Error("Too many requests. Please slow down and try again in a few minutes.");
    }

    const { error: logErr } = await admin
      .from("share_link_views")
      .insert({ token: data.token, visitor_hash: hash });
    if (logErr) throw new Error(logErr.message);

    const { data: rows, error } = await admin.rpc("get_share_link", {
      p_token: data.token,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ?? null;
  });