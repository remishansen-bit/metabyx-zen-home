import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({ token: z.string().min(1).max(200) });

/**
 * Public proxy for the `get_share_link` RPC. The underlying SQL function is
 * `SECURITY DEFINER` and only `service_role` can execute it, so we call it
 * from the server using the admin client. The RPC itself only returns
 * non-revoked rows and a safe column projection (no email, no user_id).
 */
export const fetchPublicShareLinkFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_share_link", {
      p_token: data.token,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ?? null;
  });