/**
 * Share-link helpers — generate, list, revoke, and rotate share links for
 * reflections and BMR insights. Calls the `share_links` table directly
 * (RLS scopes every read/write to the owner). Anonymous mode is a row
 * column, not a separate table.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ShareKind = "reflection" | "insight";
export type ShareSnapshot = { bmr?: number; streak?: number; pulse?: number };

export type ShareLink = Database["public"]["Tables"]["share_links"]["Row"];

function randomToken(): string {
  // URL-safe, 22 chars of entropy. Avoid Math.random — use crypto when present.
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function createShareLink(input: {
  kind: ShareKind;
  title: string;
  body: string;
  anonymous: boolean;
  snapshot?: ShareSnapshot;
}): Promise<ShareLink> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to create a share link.");

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Give the share a title.");
  if (!body) throw new Error("Add some text before sharing.");
  if (title.length > 120) throw new Error("Title must be 120 chars or less.");
  if (body.length > 2000) throw new Error("Body must be 2000 chars or less.");

  const token = randomToken();
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      user_id: userId,
      token,
      kind: input.kind,
      title,
      body,
      anonymous: input.anonymous,
      snapshot: (input.snapshot ?? {}) as Database["public"]["Tables"]["share_links"]["Insert"]["snapshot"],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listShareLinks(): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeShareLink(id: string): Promise<void> {
  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function rotateShareLink(prev: ShareLink): Promise<ShareLink> {
  // Issue a fresh row pointing at the previous one via rotated_from, then
  // revoke the old token so existing copies stop working.
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to rotate a share link.");

  const token = randomToken();
  const { data: next, error } = await supabase
    .from("share_links")
    .insert({
      user_id: userId,
      token,
      kind: prev.kind,
      title: prev.title,
      body: prev.body,
      anonymous: prev.anonymous,
      snapshot: prev.snapshot,
      rotated_from: prev.id,
    })
    .select("*")
    .single();
  if (error) throw error;

  await revokeShareLink(prev.id);
  return next;
}

export type PublicShareLink = {
  token: string;
  kind: ShareKind;
  title: string;
  body: string;
  snapshot: ShareSnapshot;
  anonymous: boolean;
  author_label: string;
  created_at: string;
};

export async function fetchPublicShareLink(token: string): Promise<PublicShareLink | null> {
  const { fetchPublicShareLinkFn } = await import("./share-links.functions");
  const row = await fetchPublicShareLinkFn({ data: { token } });
  if (!row) return null;
  return {
    ...row,
    snapshot: (row.snapshot ?? {}) as ShareSnapshot,
  } as PublicShareLink;
}

export function shareUrl(token: string): string {
  if (typeof window === "undefined") return `/s/${token}`;
  return `${window.location.origin}/s/${token}`;
}