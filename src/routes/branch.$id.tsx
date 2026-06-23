import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Leaf, Sparkles, Calendar, Tag, Share2, Check } from "lucide-react";
import { useState } from "react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { useMetabyx } from "@/lib/store";
import { notify } from "@/lib/feedback";

export const Route = createFileRoute("/branch/$id")({
  head: () => ({
    meta: [
      { title: "Branch · METABYX" },
      { name: "description", content: "How a branch was noticed and metabolized." },
    ],
  }),
  component: BranchDetailPage,
  notFoundComponent: () => (
    <PhoneFrame>
      <StatusBar title="BRANCH" />
      <p className="text-sm text-muted-foreground">This branch is no longer in your library.</p>
      <Link to="/library" className="text-xs text-gold underline">
        Back to library
      </Link>
    </PhoneFrame>
  ),
});

function fmtDate(t: number) {
  return new Date(t).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BranchDetailPage() {
  const { id } = Route.useParams();
  const state = useMetabyx();
  const branch = state.branches.find((b) => b.id === id);
  if (!branch) throw notFound();
  const safeBranch = branch;
  const done = safeBranch.status === "metabolized";
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/branch/${id}` : "";
    const data = { title: `METABYX · ${safeBranch.title}`, text: safeBranch.detail, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        notify.info("Shared");
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      notify.saved("Link copied", "Paste it anywhere to revisit this branch.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      // navigator.share rejects with AbortError when the user dismisses the
      // share sheet — that's a deliberate "no", not a failure to surface.
      if (err instanceof Error && err.name === "AbortError") return;
      notify.error("Couldn't share link", "Try copying the address bar instead.");
    }
  }

  return (
    <PhoneFrame>
      <StatusBar title="BRANCH" />

      <header className="flex items-center justify-between">
        <Link
          to="/library"
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          {done ? "Metabolized" : "Open"}
        </p>
        <button
          type="button"
          onClick={share}
          aria-label={copied ? "Link copied" : "Share branch link"}
          className="glass flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95"
        >
          {copied ? (
            <Check className="h-4 w-4 text-gold" />
          ) : (
            <Share2 className="h-4 w-4 text-foreground" />
          )}
        </button>
      </header>

      <section className="flex flex-col items-center text-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-60 blur-2xl"
            style={{
              background: done ? "var(--gradient-gold)" : "radial-gradient(circle, var(--indigo-glow), transparent 70%)",
            }}
          />
          <div className="glass-strong relative flex h-20 w-20 items-center justify-center rounded-full">
            {done ? (
              <CheckCircle2 className="h-7 w-7 text-gold" />
            ) : (
              <Leaf className="h-7 w-7 text-gold" />
            )}
          </div>
        </div>
        <h1
          className="mt-4 text-2xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {branch.title}
        </h1>
        <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">{branch.detail}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-gold" />
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Category</p>
          </div>
          <p className="mt-1 text-sm capitalize text-foreground">{branch.category}</p>
        </div>
        <div className="glass rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-gold" />
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Noticed</p>
          </div>
          <p className="mt-1 text-xs text-foreground">{fmtDate(branch.createdAt)}</p>
        </div>
      </section>

      {done ? (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">How it integrated</p>

          {typeof branch.rating === "number" && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Integration depth
              </p>
              <div className="mt-3 flex items-center justify-between">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= (branch.rating ?? 0);
                  return (
                    <div
                      key={n}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium"
                      style={
                        on
                          ? {
                              background: "var(--gradient-gold)",
                              color: "var(--primary-foreground)",
                              boxShadow: "var(--shadow-gold)",
                            }
                          : { background: "oklch(1 0 0 / 0.06)", color: "var(--muted-foreground)" }
                      }
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {branch.reflection ? (
            <div
              className="rounded-2xl p-5"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.12), oklch(0.82 0.14 82 / 0.02))",
                border: "1px solid oklch(0.82 0.14 82 / 0.35)",
                boxShadow: "var(--shadow-gold)",
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                <p className="text-[10px] uppercase tracking-[0.3em] text-gold">The new story</p>
              </div>
              <p
                className="mt-3 text-base leading-relaxed text-foreground"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                "{branch.reflection}"
              </p>
            </div>
          ) : (
            <p className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
              Closed without a written reflection.
            </p>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This branch is still open. A guided session helps it settle.
          </p>
          <Link
            to="/session"
            className="flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold"
            style={{
              background: "var(--gradient-gold)",
              color: "var(--primary-foreground)",
              boxShadow: "var(--shadow-gold)",
            }}
          >
            <Sparkles className="h-4 w-4" />
            Walk it through
          </Link>
        </section>
      )}
    </PhoneFrame>
  );
}
