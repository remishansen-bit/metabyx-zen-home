import { Heart, Sparkles, Droplet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { VoiceEmotion } from "@/lib/emotion.functions";

type Props = {
  emotion: VoiceEmotion | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** GCMP phase index (0 Identify .. 4 Close) — tunes the supportive line. */
  phase?: 0 | 1 | 2 | 3 | 4;
};

const EMOTION_TONE: Record<
  VoiceEmotion["primaryEmotion"],
  { label: string; hue: string }
> = {
  sadness: { label: "Sadness", hue: "oklch(0.72 0.08 250)" },
  anxiety: { label: "Anxiety", hue: "oklch(0.78 0.12 70)" },
  anger: { label: "Anger", hue: "oklch(0.72 0.16 30)" },
  guilt: { label: "Guilt", hue: "oklch(0.7 0.08 300)" },
  shame: { label: "Shame", hue: "oklch(0.68 0.1 320)" },
  fear: { label: "Fear", hue: "oklch(0.74 0.12 280)" },
  grief: { label: "Grief", hue: "oklch(0.7 0.06 240)" },
  hope: { label: "Hope", hue: "oklch(0.82 0.14 145)" },
  relief: { label: "Relief", hue: "oklch(0.85 0.1 170)" },
  tenderness: { label: "Tenderness", hue: "oklch(0.85 0.08 20)" },
  neutral: { label: "Steady", hue: "oklch(0.8 0.02 250)" },
};

const INTENSITY_LABEL: Record<VoiceEmotion["intensity"], string> = {
  low: "soft",
  medium: "present",
  high: "strong",
};

/**
 * Returns a phase-aware, emotion-aware supportive line. Keep it short,
 * second-person, never clinical or prescriptive.
 */
function supportiveLine(
  emotion: VoiceEmotion["primaryEmotion"],
  intensity: VoiceEmotion["intensity"],
  phase: 0 | 1 | 2 | 3 | 4 = 0,
): string {
  const isClose = phase === 4;
  const strong = intensity === "high";
  const soft = intensity === "low";

  if (isClose) {
    switch (emotion) {
      case "sadness":
      case "grief":
        return strong
          ? "La det få lov å være tungt mens du skriver — det nye blir ikke mindre sant av det."
          : "Du trenger ikke trøste sorgen for å gå videre. Skriv det milde, sanne.";
      case "anxiety":
      case "fear":
        return strong
          ? "Pusten først, så ordene. Den nye setningen får komme stille."
          : "Skriv noe litt tryggere enn frykten — bare et halvt steg er nok.";
      case "anger":
        return "Sinnet har sagt sitt. La det nye språket være varmt, ikke pent.";
      case "guilt":
      case "shame":
        return "Du får snakke til deg selv som til noen du er glad i.";
      case "hope":
      case "relief":
        return "Den nye historien har allerede begynt. Skriv den i din egen takt.";
      case "tenderness":
        return "Hold ømheten mens du skriver. Det blir et godt sted å lande.";
      default:
        return soft
          ? "En rolig setning er nok. Du trenger ikke pynte på den."
          : "Skriv det som vil hvile i deg i kveld.";
    }
  }

  // Phase 1 / Identify
  switch (emotion) {
    case "sadness":
    case "grief":
      return strong
        ? "Det er mye her. Du trenger ikke løse noe nå — bare se det."
        : "Sorgen får være med. Den hører hjemme i prosessen.";
    case "anxiety":
    case "fear":
      return strong
        ? "Pusten din får sette tempoet. Vi har god tid."
        : "Det er trygt å bare navngi det — ingen krav, ingen løsning enda.";
    case "anger":
      return "Sinnet peker på noe viktig. Vi metaboliserer det sammen, sakte.";
    case "guilt":
    case "shame":
      return "Du møter deg selv mildt her. Skammen får ikke siste ordet.";
    case "hope":
      return "Håpet teller også som data. Det får være med oss.";
    case "relief":
      return "Lettelsen sier noe sant. Merk hvor i kroppen den sitter.";
    case "tenderness":
      return "Ømheten er en god kompasspil for resten av økten.";
    default:
      return soft
        ? "Ingenting trenger å være stort. Bare merk hva som er der."
        : "Det er bra du satte ord på det. Vi går videre i ditt tempo.";
  }
}

export function EmotionInsight({ emotion, loading, error, className = "", phase = 0 }: Props) {
  if (!emotion && !loading && !error) return null;

  const supportive = useMemo(
    () =>
      emotion ? supportiveLine(emotion.primaryEmotion, emotion.intensity, phase) : "",
    [emotion, phase],
  );

  // Word-by-word stagger for the summary line.
  const summaryWords = useMemo(
    () => (emotion?.summary ? emotion.summary.split(/(\s+)/) : []),
    [emotion?.summary],
  );

  // Slight delay before revealing the supportive line for a calmer rhythm.
  const [showSupportive, setShowSupportive] = useState(false);
  useEffect(() => {
    if (!emotion) return setShowSupportive(false);
    const t = setTimeout(() => setShowSupportive(true), 450);
    return () => clearTimeout(t);
  }, [emotion]);

  const tone = emotion ? EMOTION_TONE[emotion.primaryEmotion] : null;

  return (
    <div
      className={`glass relative overflow-hidden rounded-2xl p-4 transition-all duration-500 ease-out ${className}`}
      style={{
        background: tone
          ? `linear-gradient(135deg, color-mix(in oklch, ${tone.hue} 10%, transparent), color-mix(in oklch, ${tone.hue} 2%, transparent))`
          : "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.06), oklch(0.82 0.14 82 / 0.01))",
        borderColor: tone
          ? `color-mix(in oklch, ${tone.hue} 28%, transparent)`
          : undefined,
        animation: "ei-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
      aria-live="polite"
    >
      {/* Slow ambient breathing glow tinted to the emotion */}
      {tone && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${tone.hue} 0%, transparent 65%)`,
            opacity: 0.18,
            animation: "ei-breathe 6s ease-in-out infinite",
          }}
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          What I&apos;m hearing
        </p>
        <Sparkles
          className="h-3.5 w-3.5 text-gold/70"
          style={{ animation: emotion ? "ei-twinkle 3.4s ease-in-out infinite" : undefined }}
        />
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold/80" />
          </span>
          <span>Listening between the words…</span>
        </div>
      )}

      {error && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">{error}</p>
      )}

      {emotion && !loading && tone && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-transform"
              style={{
                background: `color-mix(in oklch, ${tone.hue} 18%, transparent)`,
                color: tone.hue,
                border: `1px solid color-mix(in oklch, ${tone.hue} 40%, transparent)`,
                animation: "ei-chip 600ms cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
            >
              <Heart className="h-3 w-3" />
              {tone.label}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {INTENSITY_LABEL[emotion.intensity]}
            </span>
            {emotion.distress.cryingOrTears && emotion.distress.confidence >= 0.5 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  background: "oklch(0.7 0.08 240 / 0.12)",
                  color: "oklch(0.85 0.06 240)",
                  border: "1px solid oklch(0.7 0.08 240 / 0.35)",
                  animation: "ei-chip 700ms 120ms cubic-bezier(0.22, 1, 0.36, 1) both",
                }}
              >
                <Droplet className="h-2.5 w-2.5" />
                tears nearby
              </span>
            )}
          </div>
          <p
            className="text-sm leading-relaxed text-foreground/90"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {summaryWords.map((w, i) =>
              /^\s+$/.test(w) ? (
                <span key={i}>{w}</span>
              ) : (
                <span
                  key={i}
                  className="inline-block"
                  style={{
                    animation: "ei-word 520ms cubic-bezier(0.22, 1, 0.36, 1) both",
                    animationDelay: `${Math.min(i, 18) * 38}ms`,
                  }}
                >
                  {w}
                </span>
              ),
            )}
          </p>

          {supportive && (
            <p
              className={`text-[12px] italic leading-relaxed transition-all duration-700 ease-out ${
                showSupportive ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
              style={{
                color: `color-mix(in oklch, ${tone.hue} 60%, oklch(0.92 0.02 80))`,
                fontFamily: "Fraunces, serif",
              }}
            >
              {supportive}
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes ei-rise {
          0%   { opacity: 0; transform: translateY(6px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ei-word {
          0%   { opacity: 0; transform: translateY(4px); filter: blur(2px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes ei-chip {
          0%   { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ei-breathe {
          0%, 100% { opacity: 0.14; transform: scale(1); }
          50%      { opacity: 0.24; transform: scale(1.08); }
        }
        @keyframes ei-twinkle {
          0%, 100% { opacity: 0.55; transform: rotate(0deg); }
          50%      { opacity: 1;    transform: rotate(8deg); }
        }
      `}</style>
    </div>
  );
}