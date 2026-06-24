import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/feedback";

/**
 * Public landing for Supabase password-recovery links. Supabase sets a
 * temporary recovery session on the URL hash, so we just listen for
 * `PASSWORD_RECOVERY` (or trust the active session if it's already set) and
 * let the user pick a new password via `updateUser({ password })`.
 */
export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password · METABYX" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If the user already has a session (recovery hash exchanged), allow the form.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      notify.error("Pick a longer password", "At least 6 characters.");
      return;
    }
    if (password !== confirm) {
      notify.error("Passwords don't match", "Try entering them again.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      notify.saved("Password updated", "You're signed in.");
      navigate({ to: "/" });
    } catch (err) {
      notify.error("Couldn't update password", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-gold)" }}
      />
      <div className="relative w-full max-w-[400px]">
        <div className="glass-strong rounded-[32px] p-8">
          <div className="flex flex-col items-center text-center">
            <div className="glass mb-5 flex h-14 w-14 items-center justify-center rounded-2xl">
              <KeyRound className="h-6 w-6 text-gold" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
              METABYX
            </p>
            <h1
              className="mt-3 text-2xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Set a new password
            </h1>
            <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
              Pick something memorable but private. You'll be signed in once it's saved.
            </p>
          </div>
          {!ready ? (
            <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Verifying your reset link…
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
              <input
                type="password"
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold/40"
              />
              <input
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="glass rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold/40"
              />
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background disabled:opacity-60"
                style={{ background: "var(--gradient-gold)" }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Update password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}