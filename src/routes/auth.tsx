import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Mail, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · METABYX" },
      {
        name: "description",
        content: "Sign in to METABYX to begin metabolising your day.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });

  useEffect(() => {
    if (auth.loading) return;
    if (auth.session) {
      const to =
        auth.profile && !auth.profile.onboarded_at
          ? "/onboarding"
          : search.redirect && search.redirect.startsWith("/")
            ? search.redirect
            : "/";
      navigate({ to });
    }
  }, [auth.loading, auth.session, auth.profile, navigate, search.redirect]);

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-gold)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--indigo-glow), transparent 70%)" }}
      />
      <div className="relative w-full max-w-[400px] animate-rise">
        <WelcomeCard />
      </div>
    </div>
  );
}

function WelcomeCard() {
  const [mode, setMode] = useState<"welcome" | "email">("welcome");
  return (
    <div className="glass-strong rounded-[32px] p-8">
      <div className="flex flex-col items-center text-center">
        <div className="glass mb-5 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Sparkles className="h-6 w-6 text-gold" />
        </div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">METABYX</p>
        <h1
          className="mt-3 text-3xl font-light leading-tight text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Metabolise your day,
          <br />gently.
        </h1>
        <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
          A calm space to notice, name and integrate what moves through you.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-2.5">
        {mode === "welcome" ? (
          <>
            <OAuthButton provider="apple" />
            <OAuthButton provider="google" />
            <button
              onClick={() => setMode("email")}
              className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-[oklch(1_0_0/0.06)]"
            >
              <Mail className="h-4 w-4" />
              Continue with email
            </button>
          </>
        ) : (
          <EmailForm onBack={() => setMode("welcome")} />
        )}
      </div>

      <p className="mt-6 text-center text-[10px] leading-relaxed text-muted-foreground">
        By continuing you agree to a kind, mindful use of this space.
      </p>
    </div>
  );
}

function OAuthButton({ provider }: { provider: "apple" | "google" }) {
  const [loading, setLoading] = useState(false);
  const label = provider === "apple" ? "Continue with Apple" : "Continue with Google";

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        notify.error("Couldn't sign in", result.error.message ?? "Please try again.");
        setLoading(false);
      }
      // if redirected, browser handles navigation
    } catch (err) {
      notify.error("Couldn't sign in", err instanceof Error ? err.message : "Please try again.");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="glass-strong flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-[oklch(1_0_0/0.08)] disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : provider === "apple" ? (
        <AppleGlyph />
      ) : (
        <GoogleGlyph />
      )}
      {label}
    </button>
  );
}

function EmailForm({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      notify.error("Check your details", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        notify.saved("Check your inbox", "We sent a confirmation link to finish signing up.");
      }
    } catch (err) {
      notify.error(
        tab === "signin" ? "Couldn't sign in" : "Couldn't sign up",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="glass flex rounded-2xl p-1 text-[11px] uppercase tracking-[0.2em]">
        {(["signin", "signup"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 transition-all ${
              tab === t ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "text-muted-foreground"
            }`}
          >
            {t === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="glass rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold/40"
      />
      <input
        type="password"
        required
        autoComplete={tab === "signin" ? "current-password" : "new-password"}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="glass rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold/40"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-1 flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background transition-all disabled:opacity-60"
        style={{ background: "var(--gradient-gold)" }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {tab === "signin" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
    </form>
  );
}

function AppleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.04-.79.85-2.05 1.5-3.07 1.42-.13-1.1.43-2.27 1.17-3.06.83-.9 2.21-1.55 3.11-1.4zM20.5 17.4c-.55 1.28-.82 1.86-1.53 2.99-1 1.59-2.41 3.58-4.15 3.6-1.55.01-1.95-1-4.05-.99-2.1.01-2.55 1-4.1.98-1.74-.03-3.07-1.82-4.07-3.42-2.8-4.5-3.1-9.79-1.37-12.6 1.22-1.98 3.16-3.14 4.97-3.14 1.84 0 3 1.01 4.52 1.01 1.47 0 2.37-1.01 4.5-1.01 1.62 0 3.32.88 4.54 2.41-3.99 2.19-3.34 7.9.74 8.17z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.5 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.2 5.2C40.9 36 44 30.6 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

// Sneaky helper used by Link import so it isn't tree-shaken; keep navigation typed.
void Link;