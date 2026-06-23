import { Heart, Sparkles, Droplet } from "lucide-react";
import type { VoiceEmotion } from "@/lib/emotion.functions";

type Props = {
  emotion: VoiceEmotion | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
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

export function EmotionInsight({ emotion, loading, error, className = "" }: Props) {
  if (!emotion && !loading && !error) return null;

  return (
    <div
      className={`glass animate-fade-in rounded-2xl p-4 ${className}`}
      style={{
        background:
          "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.06), oklch(0.82 0.14 82 / 0.01))",
      }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          What I&apos;m hearing
        </p>
        <Sparkles className="h-3.5 w-3.5 text-gold/70" />
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-gold/80" />
          <span>Listening between the words…</span>
        </div>
      )}

      {error && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">{error}</p>
      )}

      {emotion && !loading && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: `color-mix(in oklch, ${EMOTION_TONE[emotion.primaryEmotion].hue} 18%, transparent)`,
                color: EMOTION_TONE[emotion.primaryEmotion].hue,
                border: `1px solid color-mix(in oklch, ${EMOTION_TONE[emotion.primaryEmotion].hue} 40%, transparent)`,
              }}
            >
              <Heart className="h-3 w-3" />
              {EMOTION_TONE[emotion.primaryEmotion].label}
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
                }}
              >
                <Droplet className="h-2.5 w-2.5" />
                tears nearby
              </span>
            )}
          </div>
          <p
            className="text-sm leading-relaxed text-foreground/85"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {emotion.summary}
          </p>
        </div>
      )}
    </div>
  );
}