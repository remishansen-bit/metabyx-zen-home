import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Mic, MicOff, Sparkles, Check, Loader2 } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { useVoiceInput } from "@/lib/use-voice-input";
import { VoiceRecorder } from "@/components/voice-recorder";
import { refineBranches } from "@/lib/checkin.functions";
import { addBranches } from "@/lib/store";
import { useFeatureGate } from "@/hooks/useFeatureGate";

export const Route = createFileRoute("/morning")({
  head: () => ({
    meta: [
      { title: "Morning Check-in · METABYX" },
      { name: "description", content: "Notice the open branches you carry into the day." },
    ],
  }),
  component: () => (<RequireAuth><MorningPage /></RequireAuth>),
});

type RefineResult = Awaited<ReturnType<typeof refineBranches>>;

function MorningPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefineResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const voice = useVoiceInput((t) => setText(t));
  const gate = useFeatureGate();

  async function handleRefine() {
    if (!text.trim()) return;
    if (
      !gate.ensure("plus", {
        feature: "AI refinement is part of Plus",
        description:
          "Plus rephrases your raw words into gentle, named branches you can carry into the day.",
      })
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await refineBranches({ data: { rawText: text.trim() } });
      setResult(out);
      setSelected(new Set(out.branches.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!result) return;
    const picks = result.branches.filter((_, i) => selected.has(i));
    if (picks.length === 0) return;
    addBranches(picks);
    router.navigate({ to: "/" });
  }

  return (
    <PhoneFrame>
      <StatusBar title="MORNING" />

      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Check-in</p>
        <div className="h-10 w-10" />
      </header>

      <section className="flex flex-col gap-3">
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          What <span className="text-gold italic">open branches</span> do you notice today?
        </h1>
        <p className="text-sm text-muted-foreground">
          Speak freely. Nothing to fix yet — only to notice.
        </p>
      </section>

      {!result && (
        <>
          <div className="glass rounded-2xl p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="A meeting I'm anxious about, a friend I haven't called, the run I keep postponing…"
              rows={6}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between border-t border-[oklch(1_0_0/0.08)] pt-3">
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                disabled={!voice.supported}
                className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
              >
                {voice.listening ? (
                  <>
                    <MicOff className="h-3.5 w-3.5 text-gold" />
                    <span>Listening…</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-gold" />
                    <span>{voice.supported ? "Speak" : "Voice unavailable"}</span>
                  </>
                )}
              </button>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {text.length} chars
              </span>
            </div>
          </div>

          {/* Richer voice flow: full transcription with editable preview
              before it lands in the textarea above. */}
          <details className="glass rounded-2xl px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              <span>Speak the check-in aloud</span>
              <span className="text-gold">+ Voice</span>
            </summary>
            <div className="mt-3">
              <VoiceRecorder
                language="en-US"
                compact
                showHistory={false}
                ariaLabel="Record the morning check-in"
                onTranscription={(t) =>
                  setText(text ? `${text.trim()} ${t}` : t)
                }
              />
            </div>
          </details>

          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
              {error}
            </p>
          )}

          <button
            onClick={handleRefine}
            disabled={!text.trim() || loading}
            className="relative overflow-hidden rounded-2xl px-5 py-4 text-left transition-transform active:scale-[0.99] disabled:opacity-40"
            style={{
              background: "var(--gradient-gold)",
              boxShadow: "var(--shadow-gold)",
              color: "var(--primary-foreground)",
            }}
          >
            <div className="flex items-center gap-3">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {loading ? "Refining branches…" : "Refine with METABYX"}
                </p>
                <p className="text-xs opacity-80">AI distills what's truly there</p>
              </div>
            </div>
          </button>
        </>
      )}

      {result && (
        <section className="flex flex-col gap-4">
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Reflection</p>
            <p
              className="mt-2 text-sm leading-relaxed text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {result.summary}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Tap to keep · {selected.size} of {result.branches.length}
            </p>
            <ul className="flex flex-col gap-2">
              {result.branches.map((b, i) => {
                const on = selected.has(i);
                return (
                  <li key={i}>
                    <button
                      onClick={() => {
                        const next = new Set(selected);
                        if (on) next.delete(i);
                        else next.add(i);
                        setSelected(next);
                      }}
                      className={`glass flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-all ${on ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)]" : "opacity-60"}`}
                    >
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-transparent" : "border-[oklch(1_0_0/0.2)]"}`}
                        style={on ? { background: "var(--gradient-gold)" } : undefined}
                      >
                        {on && <Check className="h-3 w-3 text-[oklch(0.2_0.05_280)]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{b.title}</p>
                        <p className="text-xs text-muted-foreground">{b.detail}</p>
                        <span className="mt-1 inline-block text-[10px] uppercase tracking-wider text-gold">
                          {b.category}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            onClick={handleSave}
            disabled={selected.size === 0}
            className="rounded-2xl px-5 py-4 text-sm font-semibold transition-transform active:scale-[0.99] disabled:opacity-40"
            style={{
              background: "var(--gradient-gold)",
              boxShadow: "var(--shadow-gold)",
              color: "var(--primary-foreground)",
            }}
          >
            Plant these branches · update BMR
          </button>
          <button
            onClick={() => {
              setResult(null);
              setSelected(new Set());
            }}
            className="glass rounded-2xl px-5 py-3 text-xs text-muted-foreground"
          >
            Start over
          </button>
        </section>
      )}

    </PhoneFrame>
  );
}