import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Send,
  Sparkles,
  EyeOff,
  Eye,
  Lock,
  Globe,
  Heart,
  Lightbulb,
  MessageCircle,
  Activity,
  Flame,
  Loader2,
  Pencil,
  Trash2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { RequireAuth, useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import { useCircles } from "@/lib/circles";
import {
  createPost,
  deletePost,
  editPost,
  listPostsPage,
  useSharePrefs,
  type CirclePost,
} from "@/lib/circle-thread";
import { useMetabyx } from "@/lib/store";
import { useSubscription } from "@/hooks/useSubscription";
import { canAccess } from "@/lib/feature-access";
import { PaywallLockedCard } from "@/components/PaywallSheet";

export const Route = createFileRoute("/circles/$id")({
  head: () => ({ meta: [{ title: "Circle · METABYX" }] }),
  component: () => (
    <RequireAuth>
      <CircleDetailPage />
    </RequireAuth>
  ),
});

const PAGE_SIZE = 8;
const POSTS_CHANGE_EVENT = "metabyx:circle:posts:change";

function CircleDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { tier, loading: subLoading } = useSubscription();
  const allowed = canAccess(tier, "pro");

  const circles = useCircles();
  const circle = circles.find((c) => c.id === id);
  const [prefs, setPrefs] = useSharePrefs();
  const auth = useAuth();
  const state = useMetabyx();

  const displayName = auth.profile?.display_name ?? t("circleThread.friend");
  const authorId = auth.user?.id ?? "";

  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CirclePost["kind"]>("reflection");
  const [anonymous, setAnonymous] = useState(prefs.defaultAnonymous);
  const [shareProgress, setShareProgress] = useState(
    prefs.defaultShareProgress && prefs.allowProgressVisibility,
  );
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [lastFailedDraft, setLastFailedDraft] = useState<{
    body: string;
    kind: CirclePost["kind"];
    anonymous: boolean;
    shareProgress: boolean;
  } | null>(null);

  // Optimistic posts that haven't yet been persisted to the store. Real
  // post on success replaces the entry; on failure we remove it.
  const [pending, setPending] = useState<CirclePost[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, "edit" | "delete">>({});

  // Pagination cursor.
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [page, setPage] = useState<{ posts: CirclePost[]; nextBefore: number | null }>(
    () => listPostsPage(id, { limit: PAGE_SIZE }),
  );
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      setPageLoading(true);
      setPageError(null);
      try {
        setPage(listPostsPage(id, { limit }));
      } catch (err) {
        setPageError(err instanceof Error ? err.message : t("circleThread.couldNotLoadPosts"));
      } finally {
        setPageLoading(false);
      }
    };
    sync();
    window.addEventListener(POSTS_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(POSTS_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id, limit]);

  const progress = useMemo(
    () => ({
      bmr: state.lastBmr,
      streak: state.bmrHistory?.length ?? 0,
    }),
    [state.lastBmr, state.bmrHistory],
  );

  if (!subLoading && !allowed) {
    return (
      <PhoneFrame>
        <StatusBar title="CIRCLE" />
        <header className="flex items-center justify-between">
          <Link
            to="/circles"
            className="glass flex h-9 w-9 items-center justify-center rounded-full"
            aria-label={t("circleThread.backAria")}
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </Link>
          <span className="w-9" aria-hidden />
          <span className="w-9" aria-hidden />
        </header>
        <PaywallLockedCard
          required="pro"
          title={t("circleThread.paywallTitle")}
          description={t("circleThread.paywallDesc")}
          onUnlock={() => navigate({ to: "/settings" })}
        />
      </PhoneFrame>
    );
  }

  if (!circle) {
    return (
      <PhoneFrame>
        <StatusBar title="CIRCLE" />
        <header className="flex items-center">
          <Link
            to="/circles"
            className="glass flex h-9 w-9 items-center justify-center rounded-full"
            aria-label={t("circleThread.backAria")}
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </Link>
        </header>
        <div className="glass rounded-2xl p-5 text-center text-sm text-muted-foreground">
          {t("circleThread.notOnDevice")}
        </div>
      </PhoneFrame>
    );
  }

  const Visibility = circle.visibility === "private" ? Lock : Globe;

  const submit = async () => {
    if (posting) return;
    setPostError(null);
    setLastFailedDraft(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setPostError(t("circleThread.addWordsFirst"));
      return;
    }
    const optimistic: CirclePost = {
      id: `pending-${Date.now()}`,
      circleId: circle.id,
      body: trimmed,
      kind,
      authorId: authorId || "local",
      authorName: anonymous ? t("circleThread.anonymous") : displayName,
      anonymous,
      shareProgress: shareProgress && prefs.allowProgressVisibility,
      progress:
        shareProgress && prefs.allowProgressVisibility ? progress : undefined,
      createdAt: Date.now(),
    };
    setPending((p) => [optimistic, ...p]);
    setPosting(true);
    try {
      // Tiny await so loading state is visible even with a synchronous store.
      await new Promise((r) => setTimeout(r, 60));
      createPost({
        circleId: circle.id,
        body: trimmed,
        kind,
        authorName: displayName,
        authorId: authorId || "local",
        anonymous,
        shareProgress: shareProgress && prefs.allowProgressVisibility,
        progress:
          shareProgress && prefs.allowProgressVisibility ? progress : undefined,
      });
      setBody("");
      notify.saved(
        t("circleThread.postedTitle"),
        anonymous ? t("circleThread.postedAnon") : t("circleThread.postedToCircle"),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("circleThread.couldNotPostShort");
      setPostError(msg);
      setLastFailedDraft({
        body: trimmed,
        kind,
        anonymous,
        shareProgress: shareProgress && prefs.allowProgressVisibility,
      });
      notify.error(
        t("circleThread.couldNotPost"),
        err instanceof Error ? err.message : t("circleThread.tryAgain"),
      );
    } finally {
      // Drop the optimistic placeholder either way — the store-backed list
      // will include the new post if the write succeeded.
      setPending((p) => p.filter((x) => x.id !== optimistic.id));
      setPosting(false);
    }
  };

  const retryFailedPost = () => {
    if (!lastFailedDraft) return;
    setBody(lastFailedDraft.body);
    setKind(lastFailedDraft.kind);
    setAnonymous(lastFailedDraft.anonymous);
    setShareProgress(lastFailedDraft.shareProgress);
    setLastFailedDraft(null);
    setPostError(null);
    // Submit on the next tick so state updates flush first.
    setTimeout(() => void submit(), 0);
  };

  const onEdit = async (post: CirclePost, next: string) => {
    setBusyIds((s) => ({ ...s, [post.id]: "edit" }));
    try {
      await new Promise((r) => setTimeout(r, 50));
      editPost(post.id, authorId || "local", next);
      notify.saved(t("circleThread.updatedTitle"), t("circleThread.postEdited"));
    } catch (err) {
      notify.error(
        t("circleThread.couldNotEdit"),
        err instanceof Error ? err.message : t("circleThread.tryAgain"),
      );
      throw err;
    } finally {
      setBusyIds((s) => {
        const { [post.id]: _drop, ...rest } = s;
        return rest;
      });
    }
  };

  const onDelete = async (post: CirclePost) => {
    setBusyIds((s) => ({ ...s, [post.id]: "delete" }));
    try {
      await new Promise((r) => setTimeout(r, 50));
      deletePost(post.id, authorId || "local");
      notify.info(t("circleThread.deletedTitle"), t("circleThread.postRemoved"));
    } catch (err) {
      notify.error(
        t("circleThread.couldNotDelete"),
        err instanceof Error ? err.message : t("circleThread.tryAgain"),
      );
    } finally {
      setBusyIds((s) => {
        const { [post.id]: _drop, ...rest } = s;
        return rest;
      });
    }
  };

  const visiblePosts = [
    ...pending.filter((p) => p.circleId === circle.id),
    ...page.posts.filter((p) => !pending.some((x) => x.id === p.id)),
  ];

  return (
    <PhoneFrame>
      <StatusBar title="CIRCLE" />

      <header className="flex items-center justify-between">
        <Link
          to="/circles"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label={t("circleThread.backAria")}
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div className="flex items-center gap-1.5">
          <Visibility className="h-3 w-3 text-muted-foreground" />
          <h1
            className="max-w-[180px] truncate text-base font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {circle.name}
          </h1>
        </div>
        <span className="w-9" aria-hidden />
      </header>

      <section className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
        {circle.hint}
      </section>

      {/* Composer */}
      <section className="glass-strong rounded-3xl p-4">
        <div className="flex gap-1.5">
          {KINDS.map((k) => {
            const active = kind === k.value;
            return (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] uppercase tracking-[0.2em] transition-all ${active ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "glass text-muted-foreground"}`}
              >
                <k.icon className="h-3 w-3" /> {t(k.labelKey)}
              </button>
            );
          })}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          maxLength={600}
          aria-label={t("circleThread.composerAria", { kind: t(`circleThread.kind${kind === "reflection" ? "Reflect" : kind === "insight" ? "Insight" : "Support"}`), name: circle.name })}
          aria-invalid={Boolean(postError)}
          aria-describedby={postError ? "composer-error" : undefined}
          placeholder={
            kind === "reflection"
              ? t("circleThread.placeholderReflection")
              : kind === "insight"
                ? t("circleThread.placeholderInsight")
                : t("circleThread.placeholderSupport")
          }
          className="glass mt-2 w-full resize-none rounded-2xl bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-gold"
        />
        <div className="mt-2 flex flex-col gap-1.5">
          <ToggleRow
            icon={anonymous ? EyeOff : Eye}
            label={anonymous ? t("circleThread.anonymously") : t("circleThread.postingAs", { name: displayName })}
            checked={anonymous}
            onChange={(v) => {
              setAnonymous(v);
              setPrefs({ defaultAnonymous: v });
            }}
          />
          <ToggleRow
            icon={Activity}
            label={
              prefs.allowProgressVisibility
                ? t("circleThread.shareSnapshot")
                : t("circleThread.shareOff")
            }
            checked={shareProgress && prefs.allowProgressVisibility}
            disabled={!prefs.allowProgressVisibility}
            onChange={(v) => {
              setShareProgress(v);
              setPrefs({ defaultShareProgress: v });
            }}
          />
        </div>
        {postError && (
          <div
            id="composer-error"
            role="alert"
            aria-live="polite"
            className="mt-2 flex items-center justify-between gap-2"
          >
            <p className="inline-flex items-center gap-1.5 text-[11px] text-rose-300">
              <AlertCircle className="h-3 w-3" /> {postError}
            </p>
            {lastFailedDraft && (
              <button
                type="button"
                onClick={retryFailedPost}
                className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-gold"
              >
                <Loader2 className="h-3 w-3" /> {t("circleThread.retry")}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("circleThread.charsCount", { count: body.length })}
          </p>
          <button
            onClick={submit}
            disabled={posting || !body.trim()}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-background disabled:opacity-40"
            style={{ background: "var(--gradient-gold)" }}
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {posting ? t("circleThread.postingState") : t("circleThread.post")}
          </button>
        </div>
      </section>

      <section className="glass rounded-2xl p-3">
        <ToggleRow
          icon={prefs.allowProgressVisibility ? Eye : EyeOff}
          label={t("circleThread.letCirclesSee")}
          checked={prefs.allowProgressVisibility}
          onChange={(v) => {
            setPrefs({ allowProgressVisibility: v });
            if (!v) setShareProgress(false);
          }}
        />
      </section>

      {/* Thread */}
      <section className="flex flex-col gap-2 pb-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("circleThread.thread", { count: visiblePosts.length })}
        </p>
        {pageError ? (
          <div role="alert" className="glass rounded-2xl p-4 text-center text-xs text-rose-300">
            <p className="inline-flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" /> {pageError}
            </p>
            <button
              onClick={() => setPage(listPostsPage(id, { limit }))}
              className="glass mx-auto mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-foreground"
            >
              <Loader2 className="h-3 w-3" /> {t("circleThread.retry")}
            </button>
          </div>
        ) : pageLoading && visiblePosts.length === 0 ? (
          <PostSkeletons count={3} />
        ) : visiblePosts.length === 0 ? (
          <div className="glass rounded-2xl p-4 text-center text-xs text-muted-foreground">
            {t("circleThread.noPostsYet")}
          </div>
        ) : (
          visiblePosts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              canManage={p.authorId === (authorId || "local")}
              busy={busyIds[p.id] ?? null}
              pending={p.id.startsWith("pending-")}
              onEdit={(next) => onEdit(p, next)}
              onDelete={() => onDelete(p)}
            />
          ))
        )}
        {page.nextBefore && !pageLoading && (
          <button
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            aria-label={t("circleThread.loadOlderAria")}
            className="glass mx-auto mt-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" /> {t("circleThread.loadOlder")}
          </button>
        )}
        {pageLoading && visiblePosts.length > 0 && <PostSkeletons count={2} />}
      </section>
    </PhoneFrame>
  );
}

const KINDS: {
  value: CirclePost["kind"];
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "reflection", labelKey: "circleThread.kindReflect", icon: Sparkles },
  { value: "insight", labelKey: "circleThread.kindInsight", icon: Lightbulb },
  { value: "support", labelKey: "circleThread.kindSupport", icon: Heart },
];

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${disabled ? "opacity-50" : "hover:bg-foreground/5"}`}
    >
      <span className="flex items-center gap-2 text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
      </span>
      <span
        aria-hidden
        className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-[oklch(0.82_0.14_82/0.6)]" : "bg-foreground/15"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all ${checked ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function PostCard({
  post,
  canManage,
  busy,
  pending,
  onEdit,
  onDelete,
}: {
  post: CirclePost;
  canManage: boolean;
  busy: "edit" | "delete" | null;
  pending: boolean;
  onEdit: (next: string) => Promise<void>;
  onDelete: () => void;
}) {
  const Icon =
    post.kind === "reflection" ? Sparkles : post.kind === "insight" ? Lightbulb : Heart;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [error, setError] = useState<string | null>(null);

  const saveEdit = async () => {
    setError(null);
    try {
      await onEdit(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  };

  return (
    <article
      className={`glass rounded-2xl p-4 transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[oklch(0.82_0.14_82/0.12)]">
            <Icon className="h-3.5 w-3.5 text-gold" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">{post.authorName}</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              {post.kind} ·{" "}
              {pending
                ? "sending…"
                : `${relative(post.createdAt)}${post.editedAt ? " · edited" : ""}`}
            </p>
          </div>
        </div>
        {canManage && !pending && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setDraft(post.body);
                setEditing((v) => !v);
                setError(null);
              }}
              aria-label="Edit post"
              disabled={busy !== null}
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {busy === "edit" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Pencil className="h-3 w-3" />
              )}
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete post"
              disabled={busy !== null}
              className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-rose-300 disabled:opacity-40"
            >
              {busy === "delete" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
      </header>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={600}
            className="glass w-full resize-none rounded-2xl bg-transparent px-3 py-2.5 text-sm text-foreground outline-none"
          />
          {error && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-300">
              <AlertCircle className="h-3 w-3" /> {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="glass rounded-xl px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-background"
              style={{ background: "var(--gradient-gold)" }}
            >
              {busy === "edit" && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {post.body}
        </p>
      )}
      {post.shareProgress && post.progress && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {typeof post.progress.bmr === "number" && (
            <Chip icon={Activity} label={`BMR ${post.progress.bmr}`} />
          )}
          {typeof post.progress.streak === "number" && post.progress.streak > 0 && (
            <Chip icon={Flame} label={`${post.progress.streak}d streak`} />
          )}
        </div>
      )}
      <div className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <MessageCircle className="h-3 w-3" /> in circle
      </div>
    </article>
  );
}

function Chip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.82_0.14_82/0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function PostSkeletons({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass animate-pulse rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-foreground/10" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-24 rounded bg-foreground/10" />
              <div className="h-2 w-16 rounded bg-foreground/10" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-2 w-full rounded bg-foreground/10" />
            <div className="h-2 w-5/6 rounded bg-foreground/10" />
            <div className="h-2 w-3/4 rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}