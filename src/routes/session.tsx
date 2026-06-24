import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation, Trans } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Footprints,
  Heart,
  Leaf,
  Sparkles,
  PenLine,
  Volume2,
  Square,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { VoiceInputButton } from "@/components/voice-input-button";
import { VoiceRecorder } from "@/components/voice-recorder";
import { ScreenTransition } from "@/components/feedback";
import { suggestPaths } from "@/lib/gcmp.functions";
import { analyzeVoiceEmotion, type VoiceEmotion } from "@/lib/emotion.functions";
import { EmotionInsight } from "@/components/emotion-insight";
import { streamTts, type TtsController } from "@/lib/tts-stream";
import { notify } from "@/lib/feedback";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { canAccess } from "@/lib/feature-access";
import {
  metabolizeBranch,
  todaysOpenBranches,
  useMetabyx,
  logEmotionEvent,
  computeBmr,
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
  validateSearch: (s: Record<string, unknown>) => ({
    phase:
      typeof s.phase === "string" && /^[1-5]$/.test(s.phase)
        ? (Number(s.phase) - 1)
        : typeof s.phase === "number" && s.phase >= 1 && s.phase <= 5
          ? s.phase - 1
          : undefined,
    branchId: typeof s.branchId === "string" ? s.branchId : undefined,
  }),
  component: () => (<RequireAuth><SessionPage /></RequireAuth>),
});

type PathId = "action" | "story" | "symbolic" | "prayer";
type Path = {
  id: PathId;
  icon: typeof Footprints;
};

type Suggestion = {
  id: PathId;
  title: string;
  description: string;
  firstStep: string;
};

const PATHS: Path[] = [
  { id: "action", icon: Footprints },
  { id: "story", icon: PenLine },
  { id: "symbolic", icon: Leaf },
  { id: "prayer", icon: Heart },
];

const FRICTIONS: { id: string; labelKey: string; body: "body" | "mind" }[] = [
  { id: "tight-chest", labelKey: "tightChest", body: "body" },
  { id: "knot-stomach", labelKey: "knotStomach", body: "body" },
  { id: "racing-mind", labelKey: "racingMind", body: "mind" },
  { id: "heavy", labelKey: "heavy", body: "body" },
  { id: "looping", labelKey: "looping", body: "mind" },
  { id: "numb", labelKey: "numb", body: "mind" },
  { id: "restless", labelKey: "restless", body: "body" },
  { id: "fearful", labelKey: "fearful", body: "mind" },
];

const PHASE_KEYS = [
  "identify",
  "mapFriction",
  "explorePaths",
  "walkThrough",
  "closeBranchPhase",
] as const;

type Phase = 0 | 1 | 2 | 3 | 4;

function SessionPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const search = Route.useSearch();
  const state = useMetabyx();
  const openToday = useMemo(() => todaysOpenBranches(state), [state]);
  const suggest = useServerFn(suggestPaths);
  const analyzeEmotion = useServerFn(analyzeVoiceEmotion);
  const gate = useFeatureGate();
  const aiAllowed = canAccess(gate.tier, "plus");

  const [phase, setPhase] = useState<Phase>(
    (search.phase as Phase | undefined) ?? 0,
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    search.branchId ?? openToday[0]?.id ?? null,
  );
  const [whatIf, setWhatIf] = useState("");
  const [frictions, setFrictions] = useState<Set<string>>(new Set());
  const [frictionNote, setFrictionNote] = useState("");
  const [pathId, setPathId] = useState<PathId | null>(null);
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

  // Post-session recap: shown after finish() so the user can see what was
  // saved and the updated BMR before returning home.
  const [recap, setRecap] = useState<{ branch: Branch; bmr: number; reflection: string } | null>(null);

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
    if (!aiAllowed) {
      setSuggestions(null);
      setSuggestIntro("");
      setSuggestError(null);
      setSuggestLoading(false);
      setSuggestedFor(sig);
      gate.show("plus", {
        feature: t("sessionFull.paths.aiFeature"),
        description: t("sessionFull.paths.aiDescription"),
      });
      return;
    }
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
        setSuggestError(t("sessionFull.paths.errorFallback"));
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, whatIf, frictions, frictionNote, suggest, suggestedFor, aiAllowed, gate, t]);

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
          try {
            logEmotionEvent({
              phase,
              primaryEmotion: res.primaryEmotion,
              intensity: res.intensity,
              tears: res.distress.cryingOrTears,
              tearsConfidence: res.distress.confidence,
              summary: res.summary,
              sourceText: text.slice(0, 280),
            });
          } catch {}
        })
        .catch(() => {
          setEmotionError((m) => ({
            ...m,
            [phase]: t("voice.announceTense"),
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
    if (!activeBranch) {
      router.navigate({ to: "/" });
      return;
    }
    const reflection = [
      newStory.trim(),
      path ? `${t("sessionFull.finish.pathLabel")}: ${t(`sessionFull.path.${path.id}.title`)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    metabolizeBranch(activeBranch.id, 5, reflection);
    notify.saved(t("sessionFull.finish.savedTitle"), `${activeBranch.title}`);
    // Compute BMR against the just-mutated branch list so the recap shows the
    // post-session score (the live store updates a tick later via the hook).
    const projected: Branch = { ...activeBranch, status: "metabolized", rating: 5, reflection };
    const others = state.branches.filter((b) => b.id !== activeBranch.id);
    const bmr = computeBmr({ ...state, branches: [projected, ...others] });
    setRecap({ branch: projected, bmr, reflection });
  }

  if (recap) {
    return (
      <PhoneFrame>
        <StatusBar title="GCMP" />
        <RecapView recap={recap} onDone={() => router.navigate({ to: "/" })} />
      </PhoneFrame>
    );
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
          aria-label={t("sessionFull.ariaBack")}
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex flex-col items-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("sessionFull.eyebrowPhase", { n: phase + 1 })}
          </p>
          <p className="text-xs text-gold">{t(`sessionFull.phase.${PHASE_KEYS[phase]}`)}</p>
        </div>
        <Link
          to="/"
          className="text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          {t("sessionFull.exit")}
        </Link>
      </header>

      <PhaseProgress phase={phase} />

      <ScreenTransition phase={`phase-${phase}`}>
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
              phase={0}
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
              phase={4}
            />
          </ClosePhase>
        )}
      </ScreenTransition>

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
            {t("sessionFull.continue")}
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
            {t("sessionFull.closeBranch")}
          </button>
        )}
        <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("sessionFull.breathe")}
        </p>
      </div>

      {gate.paywall}
    </PhoneFrame>
  );
}

function PhaseProgress({ phase }: { phase: Phase }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      {PHASE_KEYS.map((key, i) => {
        const active = i <= phase;
        return (
          <div key={key} className="flex-1" aria-label={t(`sessionFull.phase.${key}`)}>
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
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          <Trans
            i18nKey="sessionFull.identify.titleFull"
            defaults='{{pre}} <1>{{hi}}</1> {{post}}'
            values={{
              pre: t("sessionFull.identify.titlePre"),
              hi: t("sessionFull.identify.titleHi"),
              post: t("sessionFull.identify.titlePost"),
            }}
            components={{ 1: <span className="text-gold italic" /> }}
          />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sessionFull.identify.subtitle")}
        </p>
      </div>

      {openBranches.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("sessionFull.identify.orExisting")}
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
          placeholder={t("sessionFull.identify.placeholder")}
          rows={5}
          className="w-full resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          style={{ fontFamily: "Fraunces, serif" }}
        />
        <div className="mt-2 flex justify-end">
          <VoiceInputButton value={whatIf} onChange={setWhatIf} />
        </div>
      </div>

      {/* Optional richer voice recorder for Phase 1. Lands transcript into
          the textarea above, where it remains fully editable. */}
      <details className="glass rounded-2xl px-4 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <span>{t("sessionFull.identify.speakAloud")}</span>
          <span className="text-gold">{t("sessionFull.identify.voiceLabel")}</span>
        </summary>
        <div className="mt-3">
          <VoiceRecorder
            language="en-US"
            compact
            showHistory={false}
            ariaLabel={t("sessionFull.identify.recordAria")}
            onTranscription={(text) =>
              setWhatIf(whatIf ? `${whatIf.trim()} ${text}` : text)
            }
          />
        </div>
      </details>
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
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          <Trans
            i18nKey="sessionFull.friction.titleFull"
            defaults='{{pre}} <1>{{hi}}</1> {{post}}'
            values={{
              pre: t("sessionFull.friction.titlePre"),
              hi: t("sessionFull.friction.titleHi"),
              post: t("sessionFull.friction.titlePost"),
            }}
            components={{ 1: <span className="text-gold italic" /> }}
          />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sessionFull.friction.subtitle")}
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
              <span className="text-sm text-foreground">{t(`sessionFull.frictionLabel.${f.labelKey}`)}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {t(`sessionFull.frictionBody.${f.body}`)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("sessionFull.friction.anythingElse")}
          </p>
          <VoiceInputButton value={note} onChange={setNote} compact />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("sessionFull.friction.placeholder")}
          rows={2}
          className="mt-1 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>

      {/* Optional richer voice recorder for Phase 2. Transcript appends to
          the note above and stays editable before continuing. */}
      <details className="glass rounded-2xl px-4 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <span>{t("sessionFull.friction.describeAloud")}</span>
          <span className="text-gold">{t("sessionFull.identify.voiceLabel")}</span>
        </summary>
        <div className="mt-3">
          <VoiceRecorder
            language="en-US"
            compact
            showHistory={false}
            ariaLabel={t("sessionFull.friction.recordAria")}
            onTranscription={(text) =>
              setNote(note ? `${note.trim()} ${text}` : text)
            }
          />
        </div>
      </details>
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
  pathId: PathId | null;
  onPick: (id: PathId) => void;
  suggestions: Suggestion[] | null;
  intro: string;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
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
          <Trans
            i18nKey="sessionFull.paths.titleFull"
            defaults='{{pre}} <1>{{hi}}</1>{{post}}'
            values={{
              pre: t("sessionFull.paths.titlePre"),
              hi: t("sessionFull.paths.titleHi"),
              post: t("sessionFull.paths.titlePost"),
            }}
            components={{ 1: <span className="text-gold italic" /> }}
          />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading
            ? t("sessionFull.paths.listening")
            : error
              ? error
              : intro || t("sessionFull.paths.defaultIntro")}
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
          const { id, icon: Icon } = meta;
          const title = t(`sessionFull.path.${id}.title`);
          const blurb = t(`sessionFull.path.${id}.blurb`);
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
  const { t } = useTranslation();
  const Icon = path.icon;
  const guidance = [
    t(`sessionFull.path.${path.id}.g1`),
    t(`sessionFull.path.${path.id}.g2`),
    t(`sessionFull.path.${path.id}.g3`),
  ];
  const steps: string[] = suggestion?.firstStep
    ? [suggestion.firstStep, ...guidance]
    : guidance;
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
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{t("sessionFull.walk.yourPath")}</p>
          <h1
            className="text-xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {suggestion?.title || t(`sessionFull.path.${path.id}.title`)}
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
            <span className="text-foreground">{t("sessionFull.walk.walked")}</span>
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
  children?: ReactNode;
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

      {/* Optional richer voice recorder: live waveform, pitch + emotion cues,
          editable transcript before it lands in the textarea above. */}
      <details className="glass rounded-2xl px-4 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <span>Speak the new story aloud</span>
          <span className="text-gold">+ Voice</span>
        </summary>
        <div className="mt-3">
          <VoiceRecorder
            language="en-US"
            compact
            showHistory={false}
            ariaLabel="Record the closing story"
            onTranscription={(text) =>
              setNewStory(newStory ? `${newStory.trim()} ${text}` : text)
            }
          />
        </div>
      </details>
      {children}
    </section>
  );
}
function RecapView({
  recap,
  onDone,
}: {
  recap: { branch: Branch; bmr: number; reflection: string };
  onDone: () => void;
}) {
  const ctlRef = useRef<TtsController | null>(null);
  const [playState, setPlayState] = useState<"idle" | "playing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const narrative = useMemo(() => {
    const r = recap.reflection?.trim();
    return [
      `You noticed ${recap.branch.title}.`,
      r ? `You closed it with this thought: ${r}` : "You let it settle, gently.",
      `Your metabolic rhythm today is ${recap.bmr}. It is held now. Rest well.`,
    ].join(" ");
  }, [recap]);

  useEffect(() => () => ctlRef.current?.stop(), []);

  const play = () => {
    // The voice-over is always user-initiated — never auto-started — so it
    // respects browser autoplay rules and users who prefer reduced motion
    // (the `prefers-reduced-motion: reduce` CSS already kills the rest of
    // the app's micro-animations). Nothing here starts without a click.
    if (typeof window !== "undefined" && !("AudioContext" in window)) {
      const msg = "This browser can't play the voice-over.";
      setErrorMsg(msg);
      setPlayState("error");
      notify.error(msg);
      return;
    }
    ctlRef.current?.stop();
    setErrorMsg(null);
    setPlayState("playing");
    const ctl = streamTts(narrative, { voice: "sage" });
    ctlRef.current = ctl;
    ctl.done
      .then(() => setPlayState((s) => (s === "playing" ? "idle" : s)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Voice-over failed.";
        setErrorMsg(msg);
        setPlayState("error");
        notify.error("Voice-over unavailable", msg);
      });
  };
  const stop = () => {
    ctlRef.current?.stop();
    ctlRef.current = null;
    setPlayState("idle");
  };

  return (
    <section className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-gold)" }}
        >
          <Check className="h-6 w-6" style={{ color: "var(--primary-foreground)" }} />
        </div>
        <p className="text-[10px] uppercase tracking-[0.35em] text-gold">Branch metabolized</p>
        <h1
          className="text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          It is <span className="text-gold italic">held now</span>.
        </h1>
      </header>

      <div className="glass rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Saved to library</p>
        <p
          className="mt-2 text-base leading-relaxed text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {recap.branch.title}
        </p>
        {recap.reflection && (
          <p
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {recap.reflection}
          </p>
        )}
      </div>

      <div
        className="rounded-2xl p-4 text-center"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.12), oklch(0.82 0.14 82 / 0.02))",
          border: "1px solid oklch(0.82 0.14 82 / 0.35)",
          boxShadow: "var(--shadow-gold)",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Updated BMR</p>
        <p
          className="mt-1 text-5xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {recap.bmr}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Your metabolic rhythm, today.</p>
      </div>

      <button
        type="button"
        onClick={playState === "playing" ? stop : play}
        aria-label={
          playState === "playing"
            ? "Stop closing voice-over"
            : playState === "error"
              ? "Retry closing voice-over"
              : "Play closing voice-over"
        }
        className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground transition-all active:scale-[0.99]"
      >
        {playState === "playing" ? (
          <>
            <Square className="h-4 w-4 text-gold" />
            Stop voice-over
          </>
        ) : (
          <>
            <Volume2 className="h-4 w-4 text-gold" />
            {playState === "error" ? "Try voice-over again" : "Play closing voice-over"}
          </>
        )}
      </button>
      {errorMsg && (
        <p role="status" className="-mt-3 text-center text-[11px] text-muted-foreground">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Link
          to="/library"
          className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground"
        >
          Open the library
        </Link>
        <button
          onClick={onDone}
          className="flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition-transform active:scale-[0.99]"
          style={{
            background: "var(--gradient-gold)",
            color: "var(--primary-foreground)",
            boxShadow: "var(--shadow-gold)",
          }}
        >
          Return home
        </button>
      </div>
    </section>
  );
}
