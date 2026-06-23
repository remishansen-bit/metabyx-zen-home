import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Loader2,
  Check,
  AlertCircle,
  Keyboard,
  X,
  RotateCcw,
} from "lucide-react";
import type { VoiceRecorderProps, VoiceRecorderState } from "@/types/voice-recorder";

/**
 * Premium glassmorphic voice recorder.
 *
 * Records via MediaRecorder, draws a live Web Audio waveform on canvas,
 * then ships the blob to /api/transcribe (Whisper via Lovable AI Gateway)
 * and returns the transcript through `onTranscription`.
 */
export function VoiceRecorder({
  onTranscription,
  onError,
  language = "nb-NO",
  className = "",
  compact = false,
  maxSeconds = 120,
  ariaLabel,
  autoStopOnSilence = true,
  silenceThreshold = 0.02,
  silenceTimeoutMs = 2200,
  editBeforeAccept = true,
}: VoiceRecorderProps) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);
  const cancelledRef = useRef(false);
  const historyRef = useRef<number[]>([]);
  const lastSpeechAtRef = useRef<number>(0);
  const speakingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const autoStoppedRef = useRef(false);

  // Detect support once on mount
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setState("unsupported");
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const apply = () => {
        setReducedMotion(mq.matches);
        reducedMotionRef.current = mq.matches;
      };
      apply();
      mq.addEventListener?.("change", apply);
      return () => {
        mq.removeEventListener?.("change", apply);
        mountedRef.current = false;
        cleanup();
      };
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    try {
      mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      void audioCtxRef.current?.close();
    } catch {}
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    historyRef.current = [];

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      // Keep canvas backing-store size in sync with CSS size each frame
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      analyser.getByteTimeDomainData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Compute current RMS amplitude (0..1)
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const amp = Math.min(1, Math.pow(rms * 2.4, 0.85));

      // --- Voice activity detection ---
      const now = performance.now();
      const isSpeech = rms > silenceThreshold;
      if (isSpeech) {
        lastSpeechAtRef.current = now;
        if (!speakingRef.current) {
          speakingRef.current = true;
          setSpeaking(true);
        }
      } else if (speakingRef.current && now - lastSpeechAtRef.current > 350) {
        speakingRef.current = false;
        setSpeaking(false);
      }
      // Auto-stop after sustained silence (only after some real speech captured)
      if (
        autoStopOnSilence &&
        lastSpeechAtRef.current > 0 &&
        now - lastSpeechAtRef.current > silenceTimeoutMs &&
        (Date.now() - startedAtRef.current) > 1500
      ) {
        autoStoppedRef.current = true;
        stop();
        return;
      }

      // Scroll a history buffer — voice-memo style left-to-right flow
      const barGap = 3 * dpr;
      const barW = 2 * dpr;
      const stride = barW + barGap;
      const barCount = Math.max(8, Math.floor(w / stride));
      historyRef.current.push(amp);
      if (historyRef.current.length > barCount) {
        historyRef.current.splice(0, historyRef.current.length - barCount);
      }

      // Faint baseline
      ctx.strokeStyle = "oklch(0.82 0.14 82 / 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Gradient shifts toward gold when the user is speaking,
      // sits in calm indigo when silent.
      const speakingNow = speakingRef.current;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      if (speakingNow) {
        grad.addColorStop(0, "oklch(0.72 0.13 265 / 0.85)");
        grad.addColorStop(0.5, "oklch(0.9 0.15 82 / 1)");
        grad.addColorStop(1, "oklch(0.72 0.13 265 / 0.85)");
      } else {
        grad.addColorStop(0, "oklch(0.7 0.1 265 / 0.55)");
        grad.addColorStop(0.5, "oklch(0.78 0.1 265 / 0.75)");
        grad.addColorStop(1, "oklch(0.7 0.1 265 / 0.55)");
      }
      ctx.fillStyle = grad;
      if (!reducedMotionRef.current) {
        ctx.shadowColor = speakingNow
          ? "oklch(0.88 0.14 82 / 0.55)"
          : "oklch(0.72 0.13 265 / 0.35)";
        ctx.shadowBlur = (speakingNow ? 10 : 5) * dpr;
      } else {
        ctx.shadowBlur = 0;
      }

      const history = historyRef.current;
      const offset = Math.max(0, barCount - history.length);
      for (let i = 0; i < history.length; i++) {
        const a = history[i];
        // Newest bars (right side) are brightest
        const ageBoost = 0.6 + 0.4 * (i / Math.max(1, history.length - 1));
        const barH = Math.max(2 * dpr, a * h * 0.92 * ageBoost);
        const x = (offset + i) * stride + barGap / 2;
        const y = (h - barH) / 2;
        roundedBar(ctx, x, y, barW, barH, barW / 2);
      }
      ctx.shadowBlur = 0;
    };
    render();
  }, []);

  async function start() {
    if (state === "recording" || state === "processing") return;
    setErrorMsg(null);
    autoStoppedRef.current = false;
    lastSpeechAtRef.current = 0;
    speakingRef.current = false;
    setSpeaking(false);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("error");
      const msg = "Mikrofontilgang nektet. Tillat mikrofonen, eller skriv i stedet.";
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (t) => MediaRecorder.isTypeSupported(t),
    );
    if (!mimeType) {
      stream.getTracks().forEach((t) => t.stop());
      setState("error");
      const msg = "Denne nettleseren støtter ikke et passende lydformat.";
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void handleStop();

    // Web Audio analyser for waveform
    try {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const audioCtx = new AC();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        sourceRef.current = source;
        analyserRef.current = analyser;
      }
    } catch {
      // Waveform is decorative — recording still works without it
    }

    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= maxSeconds) stop();
    }, 200);

    recorder.start(250);
    setState("recording");
    // Wait a frame so canvas is in the DOM before drawing
    requestAnimationFrame(() => drawWaveform());
  }

  function stop() {
    cancelledRef.current = false;
    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function cancel() {
    cancelledRef.current = true;
    chunksRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      void audioCtxRef.current?.close();
    } catch {}
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    setElapsed(0);
    setErrorMsg(null);
    setState("idle");
  }

  async function handleStop() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      chunksRef.current = [];
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      await audioCtxRef.current?.close();
    } catch {}
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;

    const blob = new Blob(chunksRef.current, {
      type: mediaRecorderRef.current?.mimeType || "audio/webm",
    });
    chunksRef.current = [];

    if (blob.size < 1024) {
      setState("error");
      const msg = "Opptaket var tomt. Hold inne lenger og prøv igjen.";
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    setState("processing");
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      form.append("file", blob, `recording.${ext}`);
      form.append("language", language);

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };
      if (!mountedRef.current) return;

      if (!res.ok || !json.text) {
        const msg = json.error || "Klarte ikke å transkribere lydopptaket.";
        setState("error");
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      if (editBeforeAccept) {
        setDraft(json.text);
        setState("review");
      } else {
        onTranscription(json.text);
        setState("done");
        setTimeout(() => mountedRef.current && setState("idle"), 1600);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Nettverksfeil under transkripsjon.";
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
    }
  }

  function acceptDraft() {
    const text = draft.trim();
    if (!text) {
      const msg = "Teksten er tom. Spill inn på nytt eller skriv inn en tekst.";
      setErrorMsg(msg);
      setState("error");
      onError?.(msg);
      return;
    }
    onTranscription(text);
    setDraft("");
    setState("done");
    setTimeout(() => mountedRef.current && setState("idle"), 1400);
  }

  if (state === "unsupported") {
    return (
      <div
        className={`glass inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] text-muted-foreground ${className}`}
      >
        <Keyboard className="h-3.5 w-3.5" />
        <span>Stemmeopptak støttes ikke — skriv i stedet.</span>
      </div>
    );
  }

  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isDone = state === "done";
  const isError = state === "error";
  const isReview = state === "review";

  return (
    <div
      className={`glass relative overflow-hidden rounded-3xl transition-all duration-500 ease-out ${
        compact ? "p-3" : "p-4"
      } ${className}`}
      style={{
        background: isRecording
          ? "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.10), oklch(0.82 0.14 82 / 0.02))"
          : isProcessing
            ? "linear-gradient(135deg, oklch(0.75 0.08 240 / 0.10), oklch(0.75 0.08 240 / 0.02))"
            : isError
              ? "linear-gradient(135deg, oklch(0.7 0.14 25 / 0.10), oklch(0.7 0.14 25 / 0.02))"
              : isReview
                ? "linear-gradient(135deg, oklch(0.72 0.13 265 / 0.08), oklch(0.88 0.14 82 / 0.04))"
                : undefined,
        boxShadow: isRecording ? "var(--shadow-gold)" : undefined,
      }}
      aria-live="polite"
    >
      {/* Ambient breathing glow during record */}
      {isRecording && !reducedMotion && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-10"
          style={{
            background:
              "radial-gradient(circle at 30% 50%, oklch(0.82 0.14 82 / 0.22), transparent 65%)",
            animation: "vr-breathe 3.6s ease-in-out infinite",
          }}
        />
      )}

      {/* Review (editable transcription preview) — full-width row */}
      {isReview && (
        <div className="animate-fade-in flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Forhåndsvisning
            </p>
            <span className="text-[10px] text-muted-foreground">
              Rediger om noe ble feil
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            aria-label="Transkribert tekst — rediger før du godtar"
            className="min-h-[88px] w-full resize-y rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
            style={{
              border: "1px solid oklch(1 0 0 / 0.08)",
              fontFamily: "Fraunces, serif",
            }}
            placeholder="Tom transkripsjon — skriv her i stedet."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setState("idle");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              style={{ border: "1px solid oklch(1 0 0 / 0.08)" }}
            >
              <X className="h-3.5 w-3.5" />
              Avbryt
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft("");
                void start();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-foreground transition-colors"
              style={{
                border: "1px solid oklch(1 0 0 / 0.1)",
                background: "oklch(1 0 0 / 0.04)",
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Ta opp på nytt
            </button>
            <button
              type="button"
              onClick={acceptDraft}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-semibold text-foreground transition-all active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.4), oklch(0.72 0.13 265 / 0.32))",
                border: "1px solid oklch(1 0 0 / 0.12)",
                boxShadow:
                  "0 0 18px oklch(0.88 0.14 82 / 0.35), inset 0 0 0 1px oklch(0.88 0.14 82 / 0.25)",
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Bruk teksten
            </button>
          </div>
        </div>
      )}

      {!isReview && (
      <div className="flex items-center gap-3">
        {/* Main control button */}
        <button
          type="button"
          onClick={isRecording ? cancel : start}
          disabled={isProcessing}
          aria-label={
            ariaLabel ??
            (isRecording ? "Avbryt opptak" : isProcessing ? "Behandler" : "Start opptak")
          }
          className={`relative flex shrink-0 items-center justify-center rounded-full transition-all duration-300 active:scale-95 disabled:cursor-not-allowed ${
            compact ? "h-10 w-10" : "h-12 w-12"
          }`}
          style={{
            background: isRecording
              ? "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.35), oklch(0.82 0.14 82 / 0.12))"
              : isProcessing
                ? "linear-gradient(135deg, oklch(0.75 0.08 240 / 0.3), oklch(0.75 0.08 240 / 0.1))"
                : isDone
                  ? "linear-gradient(135deg, oklch(0.72 0.16 145 / 0.3), oklch(0.72 0.16 145 / 0.1))"
                  : isError
                    ? "linear-gradient(135deg, oklch(0.7 0.14 25 / 0.25), oklch(0.7 0.14 25 / 0.08))"
                    : "linear-gradient(135deg, oklch(0.85 0.02 80 / 0.18), oklch(0.85 0.02 80 / 0.04))",
            border: "1px solid oklch(1 0 0 / 0.08)",
            boxShadow: isRecording
              ? "0 0 24px oklch(0.82 0.14 82 / 0.45), inset 0 0 0 1px oklch(0.82 0.14 82 / 0.35)"
              : undefined,
          }}
        >
          {/* Pulsing halo when recording */}
          {isRecording && (
            <>
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid oklch(0.82 0.14 82 / 0.5)",
                  animation: "vr-pulse 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite",
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid oklch(0.82 0.14 82 / 0.35)",
                  animation: "vr-pulse 1.6s 0.55s cubic-bezier(0.22, 1, 0.36, 1) infinite",
                }}
              />
            </>
          )}

          {isRecording ? (
            <X className="h-4 w-4 text-foreground/80" />
          ) : isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin text-[oklch(0.8_0.08_240)]" />
          ) : isDone ? (
            <Check className="h-5 w-5 text-[oklch(0.78_0.16_145)]" />
          ) : isError ? (
            <AlertCircle className="h-5 w-5 text-[oklch(0.78_0.14_25)]" />
          ) : (
            <Mic className="h-5 w-5 text-foreground" />
          )}
        </button>

        {/* Visualizer / status area */}
        <div className="relative min-h-[44px] flex-1">
          {/* Idle / done / error labels */}
          {(state === "idle" || isDone || isError) && (
            <div className="animate-fade-in flex h-full flex-col justify-center gap-1">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {isDone ? "Ferdig" : isError ? "Noe gikk galt" : "Stemmeopptak"}
              </p>
              <p
                className="text-xs leading-snug text-foreground/80"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {isDone
                  ? "Lyden er transkribert."
                  : isError
                    ? (errorMsg ?? "Prøv igjen, eller skriv i stedet.")
                    : "Trykk for å snakke. Norsk støttes."}
              </p>
              {isError && (
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-foreground transition-all active:scale-95"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.35), oklch(0.72 0.13 265 / 0.28))",
                      border: "1px solid oklch(1 0 0 / 0.12)",
                      boxShadow:
                        "0 0 12px oklch(0.88 0.14 82 / 0.25), inset 0 0 0 1px oklch(0.88 0.14 82 / 0.2)",
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Prøv igjen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live waveform + timer while recording */}
          {isRecording && (
            <div className="animate-fade-in flex h-full items-center gap-2">
              <div className="relative h-11 flex-1">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full rounded-lg"
                  style={{
                    background:
                      "linear-gradient(180deg, oklch(0.72 0.13 265 / 0.05), oklch(0.82 0.14 82 / 0.04), oklch(0.72 0.13 265 / 0.05))",
                    boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.04)",
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 top-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] transition-colors duration-300"
                  style={{
                    color: speaking
                      ? "oklch(0.92 0.14 82)"
                      : "oklch(0.78 0.08 265)",
                    background: speaking
                      ? "oklch(0.88 0.14 82 / 0.15)"
                      : "oklch(0.72 0.13 265 / 0.12)",
                  }}
                >
                  <span
                    className="inline-block h-1 w-1 rounded-full"
                    style={{
                      background: speaking
                        ? "oklch(0.9 0.15 82)"
                        : "oklch(0.78 0.08 265)",
                      animation:
                        speaking && !reducedMotion
                          ? "vr-tick 0.9s ease-in-out infinite"
                          : undefined,
                    }}
                  />
                  {speaking ? "Snakker" : "Lytter"}
                </span>
              </div>
              <span
                className="font-mono text-[11px] tabular-nums text-gold/90"
                style={
                  reducedMotion
                    ? undefined
                    : { animation: "vr-tick 1s ease-in-out infinite" }
                }
                aria-label={`Tid ${elapsed} sekunder`}
              >
                {formatTime(elapsed)}
              </span>
              <button
                type="button"
                onClick={stop}
                aria-label="Fullfør opptak"
                className="group relative ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-foreground transition-all duration-300 active:scale-95"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.35), oklch(0.72 0.13 265 / 0.28))",
                  border: "1px solid oklch(1 0 0 / 0.12)",
                  boxShadow:
                    "0 0 18px oklch(0.88 0.14 82 / 0.35), inset 0 0 0 1px oklch(0.88 0.14 82 / 0.25)",
                }}
              >
                <Check className="h-3.5 w-3.5" />
                <span>Ferdig</span>
              </button>
            </div>
          )}

          {/* Processing shimmer */}
          {isProcessing && (
            <div className="animate-fade-in flex h-full flex-col justify-center">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Transkriberer
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="relative inline-flex h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                  <span
                    className="absolute inset-y-0 left-0 w-1/3 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, oklch(0.85 0.08 240), transparent)",
                      animation: "vr-shimmer 1.4s linear infinite",
                    }}
                  />
                </span>
                <span className="text-[10px] text-muted-foreground">Whisper lytter…</span>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      <style>{`
        @keyframes vr-pulse {
          0%   { transform: scale(1);    opacity: 0.9; }
          80%  { transform: scale(1.55); opacity: 0;   }
          100% { transform: scale(1.6);  opacity: 0;   }
        }
        @keyframes vr-breathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.06); }
        }
        @keyframes vr-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%);  }
        }
        @keyframes vr-tick {
          0%, 100% { opacity: 0.65; }
          50%      { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vr-no-motion, .vr-no-motion * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(1, "0")}:${s.toString().padStart(2, "0")}`;
}

function roundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}