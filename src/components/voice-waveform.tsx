import { useEffect, useRef } from "react";

export interface VoiceWaveformProps {
  /** MediaStream to visualise. When null, the canvas renders an idle baseline. */
  stream?: MediaStream | null;
  /** True when the speaker is actively talking — shifts gradient toward gold. */
  speaking?: boolean;
  /**
   * Optional 0..1 hint of perceived loudness. Ignored when a `stream` is
   * provided (the component computes its own from the analyser).
   */
  intensity?: number;
  /** Calm down rendering — lower FPS, no shadowBlur, no shimmer. */
  reducedMotion?: boolean;
  /** Force the low-end profile (smaller FFT, ~30fps). Auto-detected otherwise. */
  lowEnd?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Reusable, decorative voice waveform. Self-contained — owns its AudioContext,
 * AnalyserNode and rAF loop. Safe to drop into any screen that already has a
 * MediaStream (mic, remote peer, etc.).
 *
 * Visual style matches the VoiceRecorder card: scrolling rounded bars in a
 * left-to-right history, indigo at rest, warm gold when `speaking`.
 */
export function VoiceWaveform({
  stream,
  speaking = false,
  intensity,
  reducedMotion = false,
  lowEnd,
  className = "",
  ariaLabel = "Live stemmebølge",
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxAudioRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const historyRef = useRef<number[]>([]);
  const speakingRef = useRef(speaking);
  const intensityRef = useRef(intensity ?? 0);

  // Keep latest visual props readable inside the rAF closure without re-binding.
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  useEffect(() => {
    intensityRef.current = intensity ?? 0;
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Detect device capability once per mount.
    const cores = (navigator.hardwareConcurrency as number | undefined) ?? 8;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    const isLow = lowEnd ?? (cores <= 4 || mem <= 2);
    const dpr = isLow ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const minFrameMs = reducedMotion ? 50 : isLow ? 33 : 0;

    // Cache canvas size — avoid per-frame getBoundingClientRect.
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      const tW = Math.max(1, Math.floor(rect.width * dpr));
      const tH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== tW || canvas.height !== tH) {
        canvas.width = tW;
        canvas.height = tH;
      }
    };
    syncSize();
    try {
      const ro = new ResizeObserver(syncSize);
      ro.observe(canvas);
      roRef.current = ro;
    } catch {}

    // Hook up Web Audio only when a stream is provided.
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    if (stream) {
      try {
        const AC =
          (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctxAudio = new AC();
          const source = ctxAudio.createMediaStreamSource(stream);
          const analyser = ctxAudio.createAnalyser();
          analyser.fftSize = isLow ? 512 : 1024;
          analyser.smoothingTimeConstant = 0.78;
          source.connect(analyser);
          ctxAudioRef.current = ctxAudio;
          srcRef.current = source;
          analyserRef.current = analyser;
          dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }
      } catch {
        // Decorative — silently fall back to an idle baseline.
      }
    }

    const drawCtx = canvas.getContext("2d", { alpha: true });
    if (!drawCtx) return;
    let last = 0;
    historyRef.current = [];

    const render = (ts?: number) => {
      rafRef.current = requestAnimationFrame(render);
      const now = ts ?? performance.now();
      if (minFrameMs && now - last < minFrameMs) return;
      last = now;

      const w = canvas.width;
      const h = canvas.height;
      drawCtx.clearRect(0, 0, w, h);

      let amp = 0;
      const analyser = analyserRef.current;
      if (analyser && dataArray) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        amp = Math.min(1, Math.pow(rms * 2.4, 0.85));
      } else {
        amp = intensityRef.current;
      }

      const barGap = 3 * dpr;
      const barW = 2 * dpr;
      const stride = barW + barGap;
      const barCount = Math.max(8, Math.floor(w / stride));
      const hist = historyRef.current;
      hist.push(amp);
      if (hist.length > barCount) hist.splice(0, hist.length - barCount);

      // Faint baseline so an empty card never feels broken.
      drawCtx.strokeStyle = "oklch(0.82 0.14 82 / 0.12)";
      drawCtx.lineWidth = 1;
      drawCtx.beginPath();
      drawCtx.moveTo(0, h / 2);
      drawCtx.lineTo(w, h / 2);
      drawCtx.stroke();

      const speakingNow = speakingRef.current;
      const grad = drawCtx.createLinearGradient(0, 0, w, 0);
      if (speakingNow) {
        grad.addColorStop(0, "oklch(0.72 0.13 265 / 0.85)");
        grad.addColorStop(0.5, "oklch(0.9 0.15 82 / 1)");
        grad.addColorStop(1, "oklch(0.72 0.13 265 / 0.85)");
      } else {
        grad.addColorStop(0, "oklch(0.7 0.1 265 / 0.55)");
        grad.addColorStop(0.5, "oklch(0.78 0.1 265 / 0.75)");
        grad.addColorStop(1, "oklch(0.7 0.1 265 / 0.55)");
      }
      drawCtx.fillStyle = grad;
      if (!reducedMotion && !isLow) {
        drawCtx.shadowColor = speakingNow
          ? "oklch(0.88 0.14 82 / 0.55)"
          : "oklch(0.72 0.13 265 / 0.35)";
        drawCtx.shadowBlur = (speakingNow ? 10 : 5) * dpr;
      } else {
        drawCtx.shadowBlur = 0;
      }

      const offset = Math.max(0, barCount - hist.length);
      for (let i = 0; i < hist.length; i++) {
        const a = hist[i];
        const ageBoost = 0.6 + 0.4 * (i / Math.max(1, hist.length - 1));
        const barH = Math.max(2 * dpr, a * h * 0.92 * ageBoost);
        const x = (offset + i) * stride + barGap / 2;
        const y = (h - barH) / 2;
        const r = barW / 2;
        // Inline rounded-rect — small enough that a helper would just add overhead.
        drawCtx.beginPath();
        drawCtx.moveTo(x + r, y);
        drawCtx.lineTo(x + barW - r, y);
        drawCtx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        drawCtx.lineTo(x + barW, y + barH - r);
        drawCtx.quadraticCurveTo(x + barW, y + barH, x + barW - r, y + barH);
        drawCtx.lineTo(x + r, y + barH);
        drawCtx.quadraticCurveTo(x, y + barH, x, y + barH - r);
        drawCtx.lineTo(x, y + r);
        drawCtx.quadraticCurveTo(x, y, x + r, y);
        drawCtx.closePath();
        drawCtx.fill();
      }
      drawCtx.shadowBlur = 0;
    };
    render();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;
      try {
        srcRef.current?.disconnect();
        analyserRef.current?.disconnect();
        void ctxAudioRef.current?.close();
      } catch {}
      srcRef.current = null;
      analyserRef.current = null;
      ctxAudioRef.current = null;
    };
  }, [stream, reducedMotion, lowEnd]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={`h-full w-full rounded-lg ${className}`}
      style={{
        background:
          "linear-gradient(180deg, oklch(0.72 0.13 265 / 0.05), oklch(0.82 0.14 82 / 0.04), oklch(0.72 0.13 265 / 0.05))",
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.04)",
      }}
    />
  );
}