import { Heart, Sparkles, Droplet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceEmotion } from "@/lib/emotion.functions";

type Props = {
  emotion: VoiceEmotion | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** GCMP phase index (0 Identify .. 4 Close) — tunes the supportive line. */
  phase?: 0 | 1 | 2 | 3 | 4;
};

const EMOTION_HUE: Record<VoiceEmotion["primaryEmotion"], string> = {
  sadness: "oklch(0.72 0.08 250)",
  anxiety: "oklch(0.78 0.12 70)",
  anger: "oklch(0.72 0.16 30)",
  guilt: "oklch(0.7 0.08 300)",
  shame: "oklch(0.68 0.1 320)",
  fear: "oklch(0.74 0.12 280)",
  grief: "oklch(0.7 0.06 240)",
  hope: "oklch(0.82 0.14 145)",
  relief: "oklch(0.85 0.1 170)",
  tenderness: "oklch(0.85 0.08 20)",
  neutral: "oklch(0.8 0.02 250)",
};

const EMOTION_LABEL_KEY: Record<VoiceEmotion["primaryEmotion"], string> = {
  sadness: "emotion.emoSadness",
  anxiety: "emotion.emoAnxiety",
  anger: "emotion.emoAnger",
  guilt: "emotion.emoGuilt",
  shame: "emotion.emoShame",
  fear: "emotion.emoFear",
  grief: "emotion.emoGrief",
  hope: "emotion.emoHope",
  relief: "emotion.emoRelief",
  tenderness: "emotion.emoTenderness",
  neutral: "emotion.emoNeutral",
};

const INTENSITY_KEY: Record<VoiceEmotion["intensity"], string> = {
  low: "emotion.intensitySoft",
  medium: "emotion.intensityPresent",
  high: "emotion.intensityStrong",
};

/**
 * Returns a phase-aware, emotion-aware supportive line. Keep it short,
 * second-person, never clinical or prescriptive.
 */
function supportiveKey(
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
        return strong ? "emotion.closeStrongSad" : "emotion.closeSoftSad";
      case "anxiety":
      case "fear":
        return strong ? "emotion.closeStrongAnx" : "emotion.closeSoftAnx";
      case "anger":
        return "emotion.closeAnger";
      case "guilt":
      case "shame":
        return "emotion.closeGuilt";
      case "hope":
      case "relief":
        return "emotion.closeHope";
      case "tenderness":
        return "emotion.closeTenderness";
      default:
        return soft ? "emotion.closeSoftDefault" : "emotion.closeStrongDefault";
    }
  }
  switch (emotion) {
    case "sadness":
    case "grief":
      return strong ? "emotion.idStrongSad" : "emotion.idSoftSad";
    case "anxiety":
    case "fear":
      return strong ? "emotion.idStrongAnx" : "emotion.idSoftAnx";
    case "anger":
      return "emotion.idAnger";
    case "guilt":
    case "shame":
      return "emotion.idGuilt";
    case "hope":
      return "emotion.idHope";
    case "relief":
      return "emotion.idRelief";
    case "tenderness":
      return "emotion.idTenderness";
    default:
      return soft ? "emotion.idSoftDefault" : "emotion.idStrongDefault";
  }
}

export function EmotionInsight({ emotion, loading, error, className = "", phase = 0 }: Props) {
  const { t } = useTranslation();
  if (!emotion && !loading && !error) return null;

  const supportive = useMemo(
    () =>
      emotion ? t(supportiveKey(emotion.primaryEmotion, emotion.intensity, phase)) : "",
    [emotion, phase, t],
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

  const tone = emotion
    ? { label: t(EMOTION_LABEL_KEY[emotion.primaryEmotion]), hue: EMOTION_HUE[emotion.primaryEmotion] }
    : null;

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
          {t("emotion.hearing")}
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
          <span>{t("emotion.listening")}</span>
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
              {t(INTENSITY_KEY[emotion.intensity])}
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
                {t("emotion.tearsNearby")}
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