import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Share2,
  Loader2,
  Copy,
  RotateCw,
  Trash2,
  EyeOff,
  Eye,
  Plus,
  AlertCircle,
  ExternalLink,
  Clock,
} from "lucide-react";
import { notify } from "@/lib/feedback";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  rotateShareLink,
  shareUrl,
  useExpiresInLabel,
  isShareLinkExpired,
  type ShareKind,
  type ShareLink,
} from "@/lib/share-links";
import { useMetabyx } from "@/lib/store";

/**
 * Settings card for share-link management. Lets the user mint a fresh
 * reflection/insight link with anonymous mode + optional BMR snapshot, see
 * every link they've made, and rotate or revoke each one.
 */
export function ShareLinksCard() {
  const { t } = useTranslation();
  const state = useMetabyx();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await listShareLinks());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("share.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onRevoke = async (link: ShareLink) => {
    setBusyId(link.id);
    try {
      await revokeShareLink(link.id);
      notify.saved(t("share.revokedToast"), t("share.revokedBody"));
      await refresh();
    } catch (err) {
      notify.error(t("share.couldNotRevoke"), err instanceof Error ? err.message : t("share.tryAgain"));
    } finally {
      setBusyId(null);
    }
  };

  const onRotate = async (link: ShareLink) => {
    setBusyId(link.id);
    try {
      const next = await rotateShareLink(link);
      await navigator.clipboard?.writeText(shareUrl(next.token)).catch(() => {});
      notify.saved(t("share.rotatedToast"), t("share.rotatedBody"));
      await refresh();
    } catch (err) {
      notify.error(t("share.couldNotRotate"), err instanceof Error ? err.message : t("share.tryAgain"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="glass-strong rounded-3xl p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="h-3.5 w-3.5 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("share.cardEyebrow")}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-background"
          style={{ background: "var(--gradient-gold)" }}
        >
          <Plus className="h-3 w-3" /> {t("share.new")}
        </button>
      </header>

      {open && (
        <NewShareForm
          onCreated={async () => {
            setOpen(false);
            await refresh();
          }}
          defaultSnapshot={{
            bmr: state.lastBmr,
            streak: state.bmrHistory?.length ?? 0,
          }}
        />
      )}

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("share.loading")}
        </div>
      ) : loadError ? (
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-rose-300">
          <AlertCircle className="h-3 w-3" /> {loadError}
        </p>
      ) : (links?.length ?? 0) === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("share.emptyList")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {links!.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              busy={busyId === link.id}
              onRevoke={() => onRevoke(link)}
              onRotate={() => onRotate(link)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({
  link,
  busy,
  onRevoke,
  onRotate,
}: {
  link: ShareLink;
  busy: boolean;
  onRevoke: () => void;
  onRotate: () => void;
}) {
  const url = shareUrl(link.token);
  const revoked = !!link.revoked_at;
  const expired = isShareLinkExpired(link);
  const expiresLabel = useExpiresInLabel(link.expires_at);
  return (
    <li className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">{link.title}</p>
            {link.anonymous ? (
              <EyeOff className="h-3 w-3 text-muted-foreground" aria-label="Anonymous" />
            ) : (
              <Eye className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <p className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {link.kind} ·{" "}
            {revoked ? (
              <span className="text-rose-300">revoked</span>
            ) : expired ? (
              <span className="text-rose-300">expired</span>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-gold hover:underline"
              >
                /s/{link.token.slice(0, 8)}…
              </a>
            )}
          </p>
          {!revoked && expiresLabel && (
            <p
              className={`mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] ${expired ? "text-rose-300" : "text-muted-foreground/70"}`}
            >
              <Clock className="h-3 w-3" /> {expiresLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!revoked && (
            <button
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(url)
                  .then(() => notify.info("Link copied", url))
                  .catch(() => notify.error("Couldn't copy", "Try selecting manually."));
              }}
              aria-label="Copy share link"
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
          {!revoked && (
            <button
              onClick={onRotate}
              disabled={busy}
              aria-label="Rotate link"
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
            </button>
          )}
          {!revoked && (
            <button
              onClick={onRevoke}
              disabled={busy}
              aria-label="Revoke link"
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-rose-300 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          )}
          {!revoked && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open share page"
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function NewShareForm({
  onCreated,
  defaultSnapshot,
}: {
  onCreated: () => Promise<void>;
  defaultSnapshot: { bmr: number | undefined; streak: number };
}) {
  const [kind, setKind] = useState<ShareKind>("reflection");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [includeSnapshot, setIncludeSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const link = await createShareLink({
        kind,
        title,
        body,
        anonymous,
        snapshot: includeSnapshot
          ? { bmr: defaultSnapshot.bmr, streak: defaultSnapshot.streak }
          : undefined,
      });
      await navigator.clipboard?.writeText(shareUrl(link.token)).catch(() => {});
      notify.saved("Share link ready", "Copied to your clipboard.");
      setTitle("");
      setBody("");
      setAnonymous(false);
      setIncludeSnapshot(false);
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-foreground/5 p-3">
      <div className="flex gap-1.5">
        {(["reflection", "insight"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded-xl px-2 py-2 text-[10px] uppercase tracking-[0.2em] transition-all ${kind === k ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "glass text-muted-foreground"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Title"
        className="glass rounded-2xl bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={kind === "reflection" ? "Your reflection…" : "Your BMR insight…"}
        className="glass resize-none rounded-2xl bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <label className="flex items-center justify-between rounded-xl px-1 text-xs text-foreground">
        <span className="flex items-center gap-2">
          {anonymous ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          Anonymous mode
        </span>
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="accent-[var(--gold)]"
        />
      </label>
      <label className="flex items-center justify-between rounded-xl px-1 text-xs text-foreground">
        <span className="flex items-center gap-2">
          Include current BMR snapshot
        </span>
        <input
          type="checkbox"
          checked={includeSnapshot}
          onChange={(e) => setIncludeSnapshot(e.target.checked)}
          className="accent-[var(--gold)]"
        />
      </label>
      {error && (
        <p className="inline-flex items-center gap-1 text-[11px] text-rose-300">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      <button
        onClick={submit}
        disabled={saving || !title.trim() || !body.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        style={{ background: "var(--gradient-gold)" }}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        {saving ? "Creating…" : "Create link"}
      </button>
    </div>
  );
}