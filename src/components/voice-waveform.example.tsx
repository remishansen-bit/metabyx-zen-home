import { useEffect, useRef, useState } from "react";
import { VoiceWaveform } from "./voice-waveform";

/**
 * Reference usage for `<VoiceWaveform />`. Not registered in routing —
 * import a panel directly into any screen that needs a calm, ambient
 * voice visualisation.
 *
 * Three patterns are demonstrated:
 *   1. Live mic stream    — pass a `MediaStream`, component owns the analyser.
 *   2. Synthetic intensity — drive amplitude from a number (0..1) when no
 *      stream is available (e.g. avatar talking, remote VAD score).
 *   3. Reduced motion     — opt into the calmer ~20fps profile globally
 *      or per-instance.
 */

/** Example A — live microphone stream. */
export function VoiceWaveformLiveMicExample() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let s: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((media) => {
        s = media;
        setStream(media);
      })
      .catch(() => {});
    return () => {
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="glass flex h-14 items-center gap-3 rounded-2xl p-2">
      <button
        type="button"
        onClick={() => setSpeaking((s) => !s)}
        className="rounded-full px-3 py-1 text-[11px] text-foreground/80"
        style={{ background: "oklch(1 0 0 / 0.06)" }}
      >
        Toggle speaking
      </button>
      <div className="h-10 flex-1">
        <VoiceWaveform stream={stream} speaking={speaking} />
      </div>
    </div>
  );
}

/** Example B — synthetic intensity (no mic). Drives the bar history with a
 *  caller-controlled amplitude. Useful for AI agents speaking, demo modes,
 *  or visualising remote VAD scores from a websocket. */
export function VoiceWaveformSyntheticExample() {
  const [intensity, setIntensity] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Smooth sinusoidal "voice" — purely decorative.
    const tick = (t: number) => {
      const v = 0.45 + 0.35 * Math.sin(t / 280) + 0.18 * Math.sin(t / 90);
      setIntensity(Math.max(0, Math.min(1, v)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="glass h-12 rounded-2xl p-1">
      <VoiceWaveform
        intensity={intensity}
        speaking={intensity > 0.45}
        ariaLabel="Demo-bølgeform"
      />
    </div>
  );
}

/** Example C — reduced-motion + low-end profile. Caps render to ~20fps,
 *  drops shadow effects, and respects the user's OS preference automatically
 *  if your wrapper passes `reducedMotion` from `prefers-reduced-motion`. */
export function VoiceWaveformCalmExample({
  stream,
}: {
  stream?: MediaStream | null;
}) {
  return (
    <div className="glass h-10 rounded-2xl p-1">
      <VoiceWaveform
        stream={stream ?? null}
        reducedMotion
        lowEnd
        speaking={false}
        ariaLabel="Rolig stemmebølge"
      />
    </div>
  );
}

/** Full gallery — drop this into any route to preview all three patterns. */
export function VoiceWaveformExamplesGallery() {
  return (
    <div className="flex flex-col gap-3">
      <VoiceWaveformLiveMicExample />
      <VoiceWaveformSyntheticExample />
      <VoiceWaveformCalmExample />
    </div>
  );
}