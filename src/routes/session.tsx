import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Footprints,
  Heart,
  Leaf,
  Sparkles,
  PenLine,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { VoiceInputButton } from "@/components/voice-input-button";
import { suggestPaths } from "@/lib/gcmp.functions";
import { analyzeVoiceEmotion, type VoiceEmotion } from "@/lib/emotion.functions";
import { EmotionInsight } from "@/components/emotion-insight";
import {
  metabolizeBranch,
  todaysOpenBranches,
  useMetabyx,
  type Branch,
} from "@/lib/store";

export const Route = createFileRoute("/session")({
  head: () => ({
    meta: [
      { title: "Guided Session · METABYX" },
      {
        name: "description",
        content: "Guided Counterfactual Metabolism Protocol — a calm 5-phase practice.",
      },
    ],
  }),
  component: SessionPage,
});

type Path = {
  id: "action" | "story" | "symbolic" | "prayer";
  icon: typeof Footprints;
  title: string;
  blurb: string;
  guidance: string[];
};

type Suggestion = {
  id: Path["id"];
  title: string;
  description: string;
  firstStep: string;
};

const PATHS: Path[] = [
  {
    id: "action",
    icon: Footprints,
    title: "Take an action",
    blurb: "A small concrete move that loosens the branch.",
    guidance: [
      "Name the smallest possible next step — under 2 minutes.",
      "Do it now, or place it on tomorrow's calendar with a time.",
      "Notice the relief of moving, not the size of the move.",
    ],
  },
  {
    id: "story",
    icon: PenLine,
    title: "Write a new story",
    blurb: "Re-author the meaning so the branch can settle.",
    guidance: [
      "Find the old sentence you've been telling yourself.",
      "Rewrite it in a kinder, truer voice.",
      "Read the new sentence aloud, slowly, three times.",
    ],
  },
  {
    id: "symbolic",
    icon: Leaf,
    title: "Symbolic gesture",
    blurb: "An embodied act that marks the shift.",
    guidance: [
      "Choose a small symbol — a candle, a stone, an exhale.",
      "Hold or perform it while naming what you release.",
      "Let the gesture stand in for the work, then return.",
    ],
  },
  {
    id: "prayer",
    icon: Heart,
    title: "Reflection or prayer",
    blurb: "Hand the branch to something larger than yourself.",
    guidance: [
      "Sit still. Take three slow breaths through the nose.",
      "Offer the branch up in your own words.",
      "Listen — without expectation — for one quiet sentence back.",
    ],
  },
];

const FRICTIONS = [
  { id: "tight-chest", label: "Tight chest", body: "body" },
  { id: "knot-stomach", label: "Knot in stomach", body: "body" },
  { id: "racing-mind", label: "Racing mind", body: "mind" },
  { id: "heavy", label: "Heaviness", body: "body" },
  { id: "looping", label: "Looping thought", body: "mind" },
  { id: "numb", label: "Numb / blank", body: "mind" },
  { id: "restless", label: "Restless energy", body: "body" },
  { id: "fearful", label: "Quiet fear", body: "mind" },
];

const PHASES = [
  "Identify",
  "Map friction",
  "Explore paths",
  "Walk it through",
  "Close the branch",
] as const;

type Phase = 0 | 1 | 2 | 3 | 4;

function SessionPage() {
  const router = useRouter();
  const state = useMetabyx();
  const openToday = useMemo(() => todaysOpenBranches(state), [state]);
  const suggest = useServerFn(suggestPaths);
  const analyzeEmotion = useServerFn(analyzeVoiceEmotion);

  const [phase, setPhase] = useState<Phase>(0);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    openToday[0]?.id ?? null,
  );
  const [whatIf, setWhatIf] = useState("");
  const [frictions, setFrictions] = useState<Set<string>>(new Set());
  const [frictionNote, setFrictionNote] = useState("");
  const [pathId, setPathId] = useState<Path["id"] | null>(null);
  const [pathDone, setPathDone] = useState(false);
  const [newStory, setNewStory] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestIntro, setSuggestIntro] = useState<string>("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestedFor, setSuggestedFor] = useState<string>("");

  // Emotion analysis per phase (0 = Identify / "Phase 1", 4 = Close / "Phase 5")
  const [emotionByPhase, setEmotionByPhase] = useState<Record<number, VoiceEmotion | null>>({});
  const [emotionLoading, setEmotionLoading] = useState<Record<number, boolean>>({});
  const [emotionError, setEmotionError] = useState<Record<number, string | null>>({});
  const [emotionAnalyzedFor, setEmotionAnalyzedFor] = useState<Record<number, string>>({});

  const activeBranch: Branch | undefined = openToday.find(
    (b) => b.id === selectedBranchId,
  );
  const path = PATHS.find((p) => p.id === pathId) ?? null;
  const activeSuggestion =
    suggestions?.find((s) => s.id === pathId) ?? null;

  // Pre-fill what-if from selected branch
  useEffect(() => {
    if (activeBranch && !whatIf) {
      setWhatIf(`What if ${activeBranch.title.toLowerCase()} — ${activeBranch.detail}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // Fetch personalized paths when entering Phase 3
  useEffect(() => {
    if (phase !== 2) return;
    const sig = JSON.stringify({
      w: whatIf.trim(),
      f: Array.from(frictions).sort(),
      n: frictionNote.trim(),
    });
    if (sig === suggestedFor) return;
    if (!whatIf.trim()) return;
    let cancelled = false;
    setSuggestLoading(true);
    setSuggestError(null);
    suggest({
      data: {
        whatIf: whatIf.trim(),
        frictions: Array.from(frictions),
        frictionNote: frictionNote.trim(),
      },
    })
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.paths);
        setSuggestIntro(res.intro);
        setSuggestedFor(sig);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestError("Could not reach guidance — choose any path that draws you.");
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, whatIf, frictions, frictionNote, suggest, suggestedFor]);

  // Debounced emotional analysis for Phase 0 (whatIf) and Phase 4 (newStory)
  useEffect(() => {
    if (phase !== 0 && phase !== 4) return;
    const text = phase === 0 ? whatIf.trim() : newStory.trim();
    if (text.length < 24) return;
    if (emotionAnalyzedFor[phase] === text) return;

    const previousContext =
      phase === 4
        ? [
            whatIf ? `Branch: ${whatIf}` : "",
            frictions.size ? `Friction: ${Array.from(frictions).join(", ")}` : "",
            frictionNote ? `Note: ${frictionNote}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const handle = setTimeout(() => {
      setEmotionLoading((m) => ({ ...m, [phase]: true }));
      setEmotionError((m) => ({ ...m, [phase]: null }));
      analyzeEmotion({ data: { transcription: text, previousContext } })
        .then((res) => {
          setEmotionByPhase((m) => ({ ...m, [phase]: res }));
          setEmotionAnalyzedFor((m) => ({ ...m, [phase]: text }));
        })
        .catch(() => {
          setEmotionError((m) => ({
            ...m,
            [phase]: "Couldn't read the tone just now — your words still land.",
          }));
        })
        .finally(() => {
          setEmotionLoading((m) => ({ ...m, [phase]: false }));
        });
    }, 1400);

    return () => clearTimeout(handle);
  }, [phase, whatIf, newStory, frictions, frictionNote, analyzeEmotion, emotionAnalyzedFor]);

  function next() {
    setPhase((p) => (Math.min(4, p + 1) as Phase));
  }
  function back() {
    if (phase === 0) router.navigate({ to: "/" });
    else setPhase((p) => (Math.max(0, p - 1) as Phase));
  }

  function finish() {
    if (activeBranch) {
      const reflection = [
        newStory.trim(),
        path ? `Path: ${path.title}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      metabolizeBranch(activeBranch.id, 5, reflection);
    }
    router.navigate({ to: "/" });
  }

  const canAdvance =
    (phase === 0 && whatIf.trim().length > 0) ||
    (phase === 1 && (frictions.size > 0 || frictionNote.trim().length > 0)) ||
    (phase === 2 && pathId !== null) ||
    (phase === 3 && pathDone) ||
    (phase === 4 && newStory.trim().length > 0);

  return (
    <PhoneFrame>
      <StatusBar title="GCMP" />

      <header className="flex items-center justify-between">
        <button
          onClick={back}
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex flex-col items-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Phase {phase + 1} of 5
          </p>
          <p className="text-xs text-gold">{PHASES[phase]}</p>
        </div>
        <Link
          to="/"
          className="text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Exit
        </Link>
      </header>

      <PhaseProgress phase={phase} />

      <div key={phase} className="animate-fade-in">
        {phase === 0 && (
          <IdentifyPhase
            openBranches={openToday}
            selectedBranchId={selectedBranchId}
            onSelectBranch={(id) => {
              setSelectedBranchId(id);
              setWhatIf("");
            }}
            whatIf={whatIf}
            setWhatIf={setWhatIf}
          >
            <EmotionInsight
              emotion={emotionByPhase[0] ?? null}
              loading={emotionLoading[0]}
              error={emotionError[0]}
            />
          </IdentifyPhase>
        )}
        {phase === 1 && (
          <FrictionPhase
            frictions={frictions}
            toggle={(id) => {
              const n = new Set(frictions);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              setFrictions(n);
            }}
            note={frictionNote}
            setNote={setFrictionNote}
          />
        )}
        {phase === 2 && (
          <PathsPhase
            pathId={pathId}
            onPick={setPathId}
            suggestions={suggestions}
            intro={suggestIntro}
            loading={suggestLoading}
            error={suggestError}
          />
        )}
        {phase === 3 && path && (
          <WalkPhase
            path={path}
            suggestion={activeSuggestion}
            done={pathDone}
            onDone={() => setPathDone(true)}
          />
        )}
        {phase === 4 && (
          <ClosePhase
            whatIf={whatIf}
            newStory={newStory}
            setNewStory={setNewStory}
          >
            <EmotionInsight
              emotion={emotionByPhase[4] ?? null}
              loading={emotionLoading[4]}
              error={emotionError[4]}
            />
          </ClosePhase>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {phase < 4 ? (
          <button
            onClick={next}
            disabled={!canAdvance}
            className="flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition-transform active:scale-[0.99] disabled:opacity-40"
            style={{
              background: "var(--gradient-gold)",
              color: "var(--primary-foreground)",
              boxShadow: "var(--shadow-gold)",
            }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={!canAdvance}
            className="flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition-transform active:scale-[0.99] disabled:opacity-40"
            style={{
              background: "var(--gradient-gold)",
              color: "var(--primary-foreground)",
              boxShadow: "var(--shadow-gold)",
            }}
          >
            <Check className="h-4 w-4" />
            Close the branch
          </button>
        )}
        <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          Breathe. There is no hurry.
        </p>
      </div>

    </PhoneFrame>
  );
}

function PhaseProgress({ phase }: { phase: Phase }) {
  return (
    <div className="flex items-center gap-1.5">
      {PHASES.map((label, i) => {
        const active = i <= phase;
        return (
          <div key={label} className="flex-1">
            <div
              className="h-1 rounded-full transition-all duration-700"
              style={{
                background: active
                  ? "var(--gradient-gold)"
                  : "oklch(1 0 0 / 0.08)",
                boxShadow: i === phase ? "var(--shadow-gold)" : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function IdentifyPhase({
  openBranches,
  selectedBranchId,
  onSelectBranch,
  whatIf,
  setWhatIf,
  children,
}: {
  openBranches: Branch[];
  selectedBranchId: string | null;
  onSelectBranch: (id: string | null) => void;
  whatIf: string;
  setWhatIf: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          What is the <span className="text-gold italic">"what if"</span> thought right now?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Begin where the branch lives in language. One sentence is enough.
        </p>
      </div>

      {openBranches.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Or choose an existing branch
          </p>
          <div className="flex flex-wrap gap-2">
            {openBranches.map((b) => {
              const on = b.id === selectedBranchId;
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBranch(on ? null : b.id)}
                  className={`glass rounded-full px-3 py-1.5 text-xs transition-all ${on ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)]" : "opacity-70"}`}
                >
                  <span className="text-foreground">{b.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-4">
        <textarea
          value={whatIf}
          onChange={(e) => setWhatIf(e.target.value)}
          placeholder="What if I'm not ready for the conversation tomorrow…"
          rows={5}
          className="w-full resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          style={{ fontFamily: "Fraunces, serif" }}
        />
        <div className="mt-2 flex justify-end">
          <VoiceInputButton value={whatIf} onChange={setWhatIf} />
        </div>
      </div>
      {children}
    </section>
  );
}

function FrictionPhase({
  frictions,
  toggle,
  note,
  setNote,
}: {
  frictions: Set<string>;
  toggle: (id: string) => void;
  note: string;
  setNote: (v: string) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          How does it <span className="text-gold italic">land</span> in body and mind?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap what you notice. Nothing more to do than name it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FRICTIONS.map((f) => {
          const on = frictions.has(f.id);
          return (
            <button
              key={f.id}
              onClick={() => toggle(f.id)}
              className={`glass flex items-center justify-between rounded-2xl px-3 py-3 text-left transition-all hover-scale ${on ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)]" : "opacity-70"}`}
            >
              <span className="text-sm text-foreground">{f.label}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {f.body}
              </span>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Anything else?
          </p>
          <VoiceInputButton value={note} onChange={setNote} compact />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A short word for what's underneath…"
          rows={2}
          className="mt-1 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>
    </section>
  );
}

function PathsPhase({
  pathId,
  onPick,
  suggestions,
  intro,
  loading,
  error,
}: {
  pathId: Path["id"] | null;
  onPick: (id: Path["id"]) => void;
  suggestions: Suggestion[] | null;
  intro: string;
  loading: boolean;
  error: string | null;
}) {
  const list: { meta: Path; sug?: Suggestion }[] = suggestions
    ? suggestions
        .map((s) => {
          const meta = PATHS.find((p) => p.id === s.id);
          return meta ? { meta, sug: s } : null;
        })
        .filter((x): x is { meta: Path; sug: Suggestion } => x !== null)
    : PATHS.map((p) => ({ meta: p }));

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Your <span className="text-gold italic">integration paths</span>.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading
            ? "Listening to what you shared…"
            : error
              ? error
              : intro ||
                "Read each slowly. Choose the one your body leans toward."}
        </p>
      </div>

      {loading && (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="glass animate-pulse rounded-2xl px-4 py-5"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="h-3 w-1/3 rounded-full bg-white/10" />
              <div className="mt-2 h-2 w-2/3 rounded-full bg-white/5" />
              <div className="mt-2 h-2 w-1/2 rounded-full bg-white/5" />
            </li>
          ))}
        </ul>
      )}

      {!loading && (
      <ul className="flex flex-col gap-3">
        {list.map(({ meta, sug }, i) => {
          const { id, icon: Icon, title, blurb } = meta;
          const on = id === pathId;
          return (
            <li
              key={id}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}
            >
              <button
                onClick={() => onPick(id)}
                className={`glass flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left transition-all ${on ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)]" : "opacity-80 hover:opacity-100"}`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: on
                      ? "var(--gradient-gold)"
                      : "oklch(0.82 0.14 82 / 0.12)",
                    border: on ? "none" : "1px solid oklch(0.82 0.14 82 / 0.25)",
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color: on
                        ? "var(--primary-foreground)"
                        : "var(--gold)",
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {sug?.title || title}
                  </p>
                  <p
                    className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                    style={{ fontFamily: "Fraunces, serif" }}
                  >
                    {sug?.description || blurb}
                  </p>
                  {sug?.firstStep && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-[oklch(0.82_0.14_82/0.25)] bg-[oklch(0.82_0.14_82/0.06)] px-2.5 py-1.5">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
                      <p className="text-[11px] leading-snug text-foreground/85">
                        <span className="text-[9px] uppercase tracking-wider text-gold">
                          First step ·{" "}
                        </span>
                        {sug.firstStep}
                      </p>
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

function WalkPhase({
  path,
  suggestion,
  done,
  onDone,
}: {
  path: Path;
  suggestion: Suggestion | null;
  done: boolean;
  onDone: () => void;
}) {
  const Icon = path.icon;
  const steps = suggestion?.firstStep
    ? [suggestion.firstStep, ...path.guidance]
    : path.guidance;
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: "var(--primary-foreground)" }}
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Your path</p>
          <h1
            className="text-xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {suggestion?.title || path.title}
          </h1>
        </div>
      </div>

      {suggestion?.description && (
        <p
          className="text-sm leading-relaxed text-muted-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {suggestion.description}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li
            key={i}
            className="glass animate-fade-in rounded-2xl px-4 py-3.5"
            style={{ animationDelay: `${i * 120}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{
                  background: "oklch(0.82 0.14 82 / 0.15)",
                  color: "var(--gold)",
                }}
              >
                {i + 1}
              </span>
              <p
                className="text-sm leading-relaxed text-foreground"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {step}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <button
        onClick={onDone}
        className={`glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition-all ${done ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)]" : ""}`}
      >
        {done ? (
          <>
            <Check className="h-4 w-4 text-gold" />
            <span className="text-foreground">I walked it through</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 text-gold" />
            <span className="text-foreground">Mark as walked</span>
          </>
        )}
      </button>
    </section>
  );
}

function ClosePhase({
  whatIf,
  newStory,
  setNewStory,
  children,
}: {
  whatIf: string;
  newStory: string;
  setNewStory: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Close it with a <span className="text-gold italic">new sentence</span>.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One or two lines. The truer story you can hold now.
        </p>
      </div>

      {whatIf && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            The old branch
          </p>
          <p
            className="mt-2 text-sm leading-relaxed text-muted-foreground line-through decoration-[oklch(0.82_0.14_82/0.5)]"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {whatIf}
          </p>
        </div>
      )}

      <div
        className="rounded-2xl p-4"
        style={{
          background: "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.12), oklch(0.82 0.14 82 / 0.02))",
          border: "1px solid oklch(0.82 0.14 82 / 0.35)",
          boxShadow: "var(--shadow-gold)",
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">The new story</p>
          <VoiceInputButton value={newStory} onChange={setNewStory} compact />
        </div>
        <textarea
          value={newStory}
          onChange={(e) => setNewStory(e.target.value)}
          placeholder="I am allowed to begin gently. Tomorrow will meet me as I am…"
          rows={5}
          className="mt-2 w-full resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          style={{ fontFamily: "Fraunces, serif" }}
        />
      </div>
    </section>
  );
}