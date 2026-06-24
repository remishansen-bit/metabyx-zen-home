import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Lightbulb,
  EyeOff,
  Activity,
  Flame,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import {
  fetchPublicShareLink,
  useExpiresInLabel,
  isShareLinkExpired,
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
  const { t } = useTranslation();
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
      <StatusBar title={t("share.title")} />
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground"
        >
          {t("share.viewerHeaderBack")}
        </Link>
        <span aria-hidden className="w-12" />
      </header>

      {state.status === "loading" && (
        <div className="glass flex items-center justify-center gap-2 rounded-3xl p-8 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("share.viewerLoading")}
        </div>
      )}
      {state.status === "missing" && (
        <div className="glass-strong rounded-3xl p-6 text-center">
          <p
            className="text-lg font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {t("share.viewerNotActiveTitle")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("share.viewerNotActiveBody")}
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
  const { t } = useTranslation();
  const Icon = link.kind === "reflection" ? Sparkles : Lightbulb;
  const expiresLabel = useExpiresInLabel(link.expires_at);
  const expired = isShareLinkExpired({
    expires_at: link.expires_at,
    revoked_at: null,
  });

  if (expired) {
    return (
      <div
        className="glass-strong rounded-3xl p-6 text-center"
        data-testid="share-expired"
      >
        <p
          className="text-lg font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {t("share.viewerExpiredTitle")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("share.viewerExpiredBody")}
        </p>
      </div>
    );
  }

  return (
    <article className="glass-strong rounded-3xl p-5" data-testid="share-active">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.82_0.14_82/0.18)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
          <Icon className="h-3 w-3" /> {t(`share.kind${link.kind === "reflection" ? "Reflection" : "Insight"}`)}
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
              <Flame className="h-3 w-3" /> {t("share.streakSuffix", { count: link.snapshot.streak })}
            </span>
          )}
        </div>
      )}
      <p className="mt-5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {t("share.viewerFooter")}
      </p>
      {link.expires_at && (
        <p
          data-testid="share-expiry"
          className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70"
        >
          <Clock className="h-3 w-3" />
          {expiresLabel ?? t("share.viewerExpiresOn", { date: new Date(link.expires_at).toLocaleDateString() })}
        </p>
      )}
    </article>
  );
}