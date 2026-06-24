import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { RequireAuth, useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import { useCircles } from "@/lib/circles";
import {
  createPost,
  deletePost,
  usePosts,
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

function CircleDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { tier, loading: subLoading } = useSubscription();
  const allowed = canAccess(tier, "pro");

  const circles = useCircles();
  const circle = circles.find((c) => c.id === id);
  const posts = usePosts(id);
  const [prefs, setPrefs] = useSharePrefs();
  const auth = useAuth();
  const state = useMetabyx();

  const displayName = auth.profile?.display_name ?? "Friend";
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CirclePost["kind"]>("reflection");
  const [anonymous, setAnonymous] = useState(prefs.defaultAnonymous);
  const [shareProgress, setShareProgress] = useState(
    prefs.defaultShareProgress && prefs.allowProgressVisibility,
  );

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
            aria-label="Back to circles"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </Link>
          <span className="w-9" aria-hidden />
          <span className="w-9" aria-hidden />
        </header>
        <PaywallLockedCard
          required="pro"
          title="Circle threads are part of Pro"
          description="Share reflections and BMR insights inside small rooms — anonymous when you want it."
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
            aria-label="Back to circles"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </Link>
        </header>
        <div className="glass rounded-2xl p-5 text-center text-sm text-muted-foreground">
          That circle isn't on this device. Open it from your Circles list.
        </div>
      </PhoneFrame>
    );
  }

  const Visibility = circle.visibility === "private" ? Lock : Globe;

  const submit = () => {
    try {
      createPost({
        circleId: circle.id,
        body,
        kind,
        authorName: displayName,
        anonymous,
        shareProgress: shareProgress && prefs.allowProgressVisibility,
        progress: shareProgress && prefs.allowProgressVisibility ? progress : undefined,
      });
      setBody("");
      notify.saved("Posted", anonymous ? "Shared anonymously." : "Shared with the circle.");
    } catch (err) {
      notify.error("Couldn't post", err instanceof Error ? err.message : "Try again.");
    }
  };

  return (
    <PhoneFrame>
      <StatusBar title="CIRCLE" />

      <header className="flex items-center justify-between">
        <Link
          to="/circles"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="Back to circles"
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
                <k.icon className="h-3 w-3" /> {k.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder={
            kind === "reflection"
              ? "A few words on what you're metabolising right now…"
              : kind === "insight"
                ? "A BMR insight or pattern you've noticed…"
                : "Something supportive for the circle…"
          }
          className="glass mt-2 w-full resize-none rounded-2xl bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex flex-col gap-1.5">
          <ToggleRow
            icon={anonymous ? EyeOff : Eye}
            label={anonymous ? "Posting anonymously" : `Posting as ${displayName}`}
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
                ? "Share my BMR snapshot"
                : "Progress sharing is off in your prefs"
            }
            checked={shareProgress && prefs.allowProgressVisibility}
            disabled={!prefs.allowProgressVisibility}
            onChange={(v) => {
              setShareProgress(v);
              setPrefs({ defaultShareProgress: v });
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {body.length}/600
          </p>
          <button
            onClick={submit}
            disabled={!body.trim()}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-background disabled:opacity-40"
            style={{ background: "var(--gradient-gold)" }}
          >
            <Send className="h-3.5 w-3.5" /> Post
          </button>
        </div>
      </section>

      <section className="glass rounded-2xl p-3">
        <ToggleRow
          icon={prefs.allowProgressVisibility ? Eye : EyeOff}
          label="Let circles see my progress when I share it"
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
          Thread · {posts.length}
        </p>
        {posts.length === 0 ? (
          <div className="glass rounded-2xl p-4 text-center text-xs text-muted-foreground">
            No posts yet. Be the first to drop a reflection.
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} onDelete={() => deletePost(p.id)} />)
        )}
      </section>
    </PhoneFrame>
  );
}

const KINDS: { value: CirclePost["kind"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "reflection", label: "Reflect", icon: Sparkles },
  { value: "insight", label: "Insight", icon: Lightbulb },
  { value: "support", label: "Support", icon: Heart },
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

function PostCard({ post, onDelete }: { post: CirclePost; onDelete: () => void }) {
  const Icon =
    post.kind === "reflection" ? Sparkles : post.kind === "insight" ? Lightbulb : Heart;
  return (
    <article className="glass rounded-2xl p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[oklch(0.82_0.14_82/0.12)]">
            <Icon className="h-3.5 w-3.5 text-gold" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">{post.authorName}</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              {post.kind} · {relative(post.createdAt)}
            </p>
          </div>
        </div>
        <button
          onClick={onDelete}
          aria-label="Delete post"
          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          delete
        </button>
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {post.body}
      </p>
      {post.shareProgress && post.progress && (
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