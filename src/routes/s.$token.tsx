import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Lightbulb,
  EyeOff,
  Activity,
  Flame,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import {
  fetchPublicShareLink,
  type PublicShareLink,
} from "@/lib/share-links";

/**
 * Public share-link view. No auth required — the page calls the
 * `get_share_link` RPC, which only returns non-revoked rows and only the
 * safe column projection (no email, no user_id).
 */
export const Route = createFileRoute("/s/$token")({
  head: () => ({
    meta: [
      { title: "Shared on METABYX" },
      { name: "description", content: "A reflection shared from METABYX." },
      { property: "og:title", content: "Shared on METABYX" },
      { property: "og:description", content: "A reflection shared from METABYX." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShareView,
});

function ShareView() {
  const { token } = Route.useParams();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "error"; message: string }
    | { status: "ok"; link: PublicShareLink }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const link = await fetchPublicShareLink(token);
        if (cancelled) return;
        setState(link ? { status: "ok", link } : { status: "missing" });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Couldn't load.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <PhoneFrame>
      <StatusBar title="SHARED" />
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground"
        >
          ← METABYX
        </Link>
        <span aria-hidden className="w-12" />
      </header>

      {state.status === "loading" && (
        <div className="glass flex items-center justify-center gap-2 rounded-3xl p-8 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      )}
      {state.status === "missing" && (
        <div className="glass-strong rounded-3xl p-6 text-center">
          <p
            className="text-lg font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            This link isn't active.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            It may have been revoked or rotated to a fresh URL. Ask the
            person who shared it for a new link.
          </p>
        </div>
      )}
      {state.status === "error" && (
        <p className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          <AlertCircle className="h-3 w-3" /> {state.message}
        </p>
      )}
      {state.status === "ok" && <SharedCard link={state.link} />}
    </PhoneFrame>
  );
}

function SharedCard({ link }: { link: PublicShareLink }) {
  const Icon = link.kind === "reflection" ? Sparkles : Lightbulb;
  return (
    <article className="glass-strong rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.82_0.14_82/0.18)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
          <Icon className="h-3 w-3" /> {link.kind}
        </span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {link.anonymous && <EyeOff className="h-3 w-3" />} {link.author_label}
        </span>
      </div>
      <h1
        className="mt-4 text-2xl font-light leading-tight text-foreground"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        {link.title}
      </h1>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {link.body}
      </p>
      {(typeof link.snapshot?.bmr === "number" ||
        (typeof link.snapshot?.streak === "number" && link.snapshot.streak > 0)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {typeof link.snapshot?.bmr === "number" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.82_0.14_82/0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
              <Activity className="h-3 w-3" /> BMR {link.snapshot.bmr}
            </span>
          )}
          {typeof link.snapshot?.streak === "number" && link.snapshot.streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.82_0.14_82/0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
              <Flame className="h-3 w-3" /> {link.snapshot.streak}d streak
            </span>
          )}
        </div>
      )}
      <p className="mt-5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Shared from METABYX
      </p>
      {link.expires_at && (
        <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
          Expires {new Date(link.expires_at).toLocaleDateString()}
        </p>
      )}
    </article>
  );
}