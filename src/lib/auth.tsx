import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n, { LANGUAGES, applyDocumentDirection, type LanguageCode } from "@/i18n";

export type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  archetype: string | null;
  archetype_scores: Record<string, number>;
  baseline_bmr: number | null;
  preferences: Record<string, unknown>;
  onboarded_at: string | null;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
};

const listeners = new Set<(s: AuthState) => void>();
let state: AuthState = { loading: true, session: null, user: null, profile: null };
let initialized = false;

function emit() {
  for (const l of listeners) l(state);
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

/**
 * If the user has a saved language in their profile preferences, switch the
 * UI to it. Falls back gracefully when the field is missing or unsupported.
 */
function applyProfileLanguage(profile: Profile | null) {
  if (!profile) return;
  const lang = (profile.preferences as { language?: string } | null)?.language;
  if (!lang) return;
  const code = lang.split("-")[0] as LanguageCode;
  if (!LANGUAGES.some((l) => l.code === code)) return;
  if (i18n.language === code) return;
  void i18n.changeLanguage(code).then(() => applyDocumentDirection(code));
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    state = { ...state, session, user: session?.user ?? null, loading: false };
    emit();
    if (session?.user) {
      loadProfile(session.user.id).then((profile) => {
        state = { ...state, profile };
        applyProfileLanguage(profile);
        emit();
      });
    } else {
      state = { ...state, profile: null };
      emit();
    }
  });
  supabase.auth.getSession().then(({ data }) => {
    state = {
      ...state,
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    };
    emit();
    if (data.session?.user) {
      loadProfile(data.session.user.id).then((profile) => {
        state = { ...state, profile };
        applyProfileLanguage(profile);
        emit();
      });
    }
  });
}

export function useAuth(): AuthState {
  const [s, setS] = useState<AuthState>(state);
  useEffect(() => {
    init();
    setS(state);
    const l = (n: AuthState) => setS(n);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return s;
}

export async function refreshProfile() {
  if (!state.user) return;
  const p = await loadProfile(state.user.id);
  state = { ...state, profile: p };
  applyProfileLanguage(p);
  emit();
}

/**
 * Persist the selected language to the user's profile (when signed in).
 * Always writes to localStorage via i18next-browser-languagedetector cache, so
 * signed-out visitors still keep their choice across launches.
 */
export async function persistLanguage(code: LanguageCode) {
  if (!state.user) return;
  const prev = state.profile?.preferences ?? {};
  const nextPrefs = { ...prev, language: code };
  // Optimistic local update so UI is consistent immediately.
  if (state.profile) {
    state = { ...state, profile: { ...state.profile, preferences: nextPrefs } };
    emit();
  }
  try {
    await supabase
      .from("profiles")
      .update({ preferences: nextPrefs })
      .eq("user_id", state.user.id);
  } catch (err) {
    console.warn("[auth] could not persist language to profile", err);
  }
}

export async function signOut() {
  await supabase.auth.signOut();
  state = { loading: false, session: null, user: null, profile: null };
  emit();
}

/**
 * Renders children only when the visitor is authenticated AND has completed
 * onboarding. While the session is loading we show a calm shimmer. When
 * signed out we send them to /auth; when signed in but not onboarded we send
 * them to /onboarding. Skip the onboarding check by passing `requireOnboarded={false}`.
 */
export function RequireAuth({
  children,
  requireOnboarded = true,
}: {
  children: ReactNode;
  requireOnboarded?: boolean;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.session) {
      navigate({ to: "/auth", search: { redirect: pathname } as never });
      return;
    }
    if (requireOnboarded && auth.session && auth.profile && !auth.profile.onboarded_at) {
      navigate({ to: "/onboarding" });
    }
  }, [auth.loading, auth.session, auth.profile, requireOnboarded, navigate, pathname]);

  if (auth.loading || !auth.session) return <AuthSkeleton />;
  if (requireOnboarded && auth.profile && !auth.profile.onboarded_at) return <AuthSkeleton />;
  // profile may still be loading after sign-in; render children optimistically
  return <>{children}</>;
}

function AuthSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="glass-strong h-24 w-24 animate-pulse rounded-full" aria-label="Loading" />
    </div>
  );
}