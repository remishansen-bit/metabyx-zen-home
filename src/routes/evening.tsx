import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Moon } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { VoiceRecorder } from "@/components/voice-recorder";
import { metabolizeBranch, todaysAllBranches, useMetabyx, type Branch } from "@/lib/store";

export const Route = createFileRoute("/evening")({
  head: () => ({
    meta: [
      { title: "Evening Reflection · METABYX" },
      { name: "description", content: "Notice which branches you metabolized today." },
    ],
  }),
  component: EveningPage,
});

function EveningPage() {
  const router = useRouter();
  const state = useMetabyx();
  const todays = useMemo(() => todaysAllBranches(state), [state]);
  const open = todays.filter((b) => b.status === "open");
  const [activeId, setActiveId] = useState<string | null>(open[0]?.id ?? null);
  const [rating, setRating] = useState(4);
  const [reflection, setReflection] = useState("");

  const active: Branch | undefined = todays.find((b) => b.id === activeId);
  const remainingOpen = open.filter((b) => b.id !== activeId);

  function handleMetabolize() {
    if (!active) return;
    metabolizeBranch(active.id, rating, reflection.trim());
    setReflection("");
    setRating(4);
    if (remainingOpen.length > 0) {
      setActiveId(remainingOpen[0].id);
    } else {
      router.navigate({ to: "/" });
    }
  }

  function handleSkip() {
    if (remainingOpen.length > 0) setActiveId(remainingOpen[0].id);
    else router.navigate({ to: "/" });
  }

  const metabolizedCount = todays.filter((b) => b.status === "metabolized").length;

  return (
    <PhoneFrame>
      <StatusBar title="EVENING" />

      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Reflection</p>
        <div className="glass flex h-10 w-10 items-center justify-center rounded-full">
          <Moon className="h-4 w-4 text-gold" />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Which branches have you <span className="text-gold italic">metabolized</span> today?
        </h1>
        <p className="text-sm text-muted-foreground">
          {metabolizedCount} of {todays.length} integrated so far.
        </p>
      </section>

      {todays.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No branches planted today. Begin with a morning check-in to notice what's open.
          </p>
          <Link
            to="/morning"
            className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: "var(--gradient-gold)", color: "var(--primary-foreground)" }}
          >
            Morning check-in
          </Link>
        </div>
      )}

      {todays.length > 0 && open.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center">
          <p
            className="text-base text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Every branch metabolized. Rest well.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Your BMR closed at {state.lastBmr}.
          </p>
        </div>
      )}

      {active && (
        <section className="flex flex-col gap-4">
          <div className="glass rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold">
              {active.category} · branch
            </p>
            <p
              className="mt-2 text-xl font-light text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {active.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{active.detail}</p>
          </div>

          <div className="glass rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              How fully did you metabolize it?
            </p>
            <div className="mt-3 flex items-center justify-between">
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= rating;
                return (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-all"
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
                    <span className="text-sm font-medium">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Lingered</span>
              <span>Integrated</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              A short reflection
            </p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="One sentence on what you noticed…"
              rows={3}
              className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>

          {/* Voice reflection: full transcription preview before it is
              appended to the reflection above. */}
          <details className="glass rounded-2xl px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              <span>Speak the reflection aloud</span>
              <span className="text-gold">+ Voice</span>
            </summary>
            <div className="mt-3">
              <VoiceRecorder
                language="en-US"
                compact
                showHistory={false}
                ariaLabel="Record the evening reflection"
                onTranscription={(t) =>
                  setReflection(reflection ? `${reflection.trim()} ${t}` : t)
                }
              />
            </div>
          </details>

          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="glass flex-1 rounded-2xl px-4 py-3 text-sm text-foreground"
            >
              Still open
            </button>
            <button
              onClick={handleMetabolize}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-transform active:scale-[0.99]"
              style={{
                background: "var(--gradient-gold)",
                color: "var(--primary-foreground)",
                boxShadow: "var(--shadow-gold)",
              }}
            >
              <Check className="h-4 w-4" />
              Metabolized
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {remainingOpen.length > 0 && (
            <p className="text-center text-[11px] uppercase tracking-wider text-muted-foreground">
              {remainingOpen.length} branch{remainingOpen.length === 1 ? "" : "es"} to revisit
            </p>
          )}
        </section>
      )}

    </PhoneFrame>
  );
}