import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Mic,
  Loader2,
  Check,
  AlertCircle,
  Keyboard,
  X,
  RotateCcw,
  Settings2,
  Play,
  Pause,
  History,
  Sparkles,
} from "lucide-react";
import type {
  AcceptedRecording,
  PitchInfo,
  VoiceRecorderProps,
  VoiceRecorderState,
} from "@/types/voice-recorder";

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
  enablePlayback = true,
  showSettings = true,
  onAccepted,
  emotion = null,
  showHistory = true,
  historyLimit = 6,
}: VoiceRecorderProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // User override for reduced-motion: 'auto' follows OS preference; 'on'/'off'
  // force the calm mode regardless. Persisted to localStorage.
  const [reducedMotionPref, setReducedMotionPref] =
    useState<"auto" | "on" | "off">("auto");
  // Whether to show the live pitch / stability chip. Persisted across reloads
  // so the user keeps the same calm UI on every session.
  const [showPitch, setShowPitch] = useState(true);
  // Live volume (0..1), throttled — drives the small VAD bars.
  const [volume, setVolume] = useState(0);
  // EMA-smoothed pitch stability shown to the user — raw values are jumpy.
  const [smoothedStability, setSmoothedStability] = useState(0);
  // Auto-measured ambient noise floor (RMS, 0..1). Used by calibration.
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  // Snapshot of pitch at end of recording — surfaced in the review panel.
  const [pitchSnapshot, setPitchSnapshot] = useState<{
    hz: number;
    stability: number;
    category: "low" | "medium" | "high";
  } | null>(null);
  // Throttled aria-live announcements (speaking changes, low confidence).
  const [liveMessage, setLiveMessage] = useState("");
  const lastLiveAtRef = useRef(0);
  const lastLiveMsgRef = useRef("");
  // User-tunable VAD (persisted). Falls back to props.
  const [userThreshold, setUserThreshold] = useState<number>(silenceThreshold);
  const [userSilenceMs, setUserSilenceMs] = useState<number>(silenceTimeoutMs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Live pitch state, updated at ~5Hz during recording.
  const [pitch, setPitch] = useState<PitchInfo>({
    hz: null,
    category: "unknown",
    stability: 0,
  });
  // Accepted recordings — kept in state for replay, persisted (text only) to localStorage.
  const [history, setHistory] = useState<AcceptedRecording[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const historyAudioRefs = useRef<Map<string, HTMLAudioElement | null>>(new Map());
  // Focus-trap refs for the review panel.
  const reviewRootRef = useRef<HTMLDivElement | null>(null);

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
  // Refs that mirror the latest VAD settings so the animation loop
  // can read fresh values without re-allocating the rAF closure.
  const thresholdRef = useRef(silenceThreshold);
  const silenceMsRef = useRef(silenceTimeoutMs);
  // Cached canvas CSS size — updated via ResizeObserver, not per-frame.
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  // Throttle: target ~30fps on low-end devices, full rAF otherwise.
  const lowEndRef = useRef(false);
  const lastDrawAtRef = useRef(0);
  // Capped DPR to avoid burning fillrate on retina mobile.
  const dprRef = useRef(1);
  // ---- Pitch detection refs ----
  // Dedicated time-domain buffer sized for autocorrelation (≥2048 samples).
  const pitchBufRef = useRef<Float32Array | null>(null);
  // Recent pitch samples (Hz) used to compute stability over a sliding window.
  const pitchHistoryRef = useRef<number[]>([]);
  // Throttle pitch updates to keep React renders cheap (~5Hz).
  const lastPitchAtRef = useRef(0);
  // Last volume push to React — keeps re-renders at ~12Hz.
  const lastVolumeAtRef = useRef(0);
  // Smoothed stability mirror so the rAF loop reads without re-creating closures.
  const smoothedStabilityRef = useRef(0);

  // Detect low-end devices once. Conservative heuristics.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const cores = (navigator.hardwareConcurrency as number | undefined) ?? 8;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    lowEndRef.current = cores <= 4 || mem <= 2;
    const rawDpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    // Cap DPR: 1 on low-end, 1.5 elsewhere — visually identical for thin bars.
    dprRef.current = lowEndRef.current ? 1 : Math.min(rawDpr, 1.5);
  }, []);

  // Load persisted VAD settings.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("metabyx.vr.vad");
      if (raw) {
        const v = JSON.parse(raw) as {
          threshold?: number;
          silenceMs?: number;
          noiseFloor?: number;
        };
        if (typeof v.threshold === "number") {
          setUserThreshold(v.threshold);
          thresholdRef.current = v.threshold;
        }
        if (typeof v.silenceMs === "number") {
          setUserSilenceMs(v.silenceMs);
          silenceMsRef.current = v.silenceMs;
        }
        if (typeof v.noiseFloor === "number") {
          setNoiseFloor(v.noiseFloor);
        }
      }
    } catch {}
  }, []);

  // Load persisted UI prefs (reduced-motion override + pitch display) so the
  // recorder always opens in the same calm configuration the user picked last.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("metabyx.vr.prefs");
      if (!raw) return;
      const v = JSON.parse(raw) as {
        reducedMotionPref?: "auto" | "on" | "off";
        showPitch?: boolean;
      };
      if (v.reducedMotionPref === "on" || v.reducedMotionPref === "off" || v.reducedMotionPref === "auto") {
        setReducedMotionPref(v.reducedMotionPref);
      }
      if (typeof v.showPitch === "boolean") setShowPitch(v.showPitch);
    } catch {}
  }, []);

  // Re-apply reduced-motion whenever the override changes (the mount-time
  // matchMedia listener captures the initial value only).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const effective =
      reducedMotionPref === "on"
        ? true
        : reducedMotionPref === "off"
          ? false
          : mq.matches;
    setReducedMotion(effective);
    reducedMotionRef.current = effective;
  }, [reducedMotionPref]);

  // Persist UI prefs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "metabyx.vr.prefs",
        JSON.stringify({ reducedMotionPref, showPitch }),
      );
    } catch {}
  }, [reducedMotionPref, showPitch]);

  // Keep refs in sync with state.
  useEffect(() => {
    thresholdRef.current = userThreshold;
    silenceMsRef.current = userSilenceMs;
  }, [userThreshold, userSilenceMs]);

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
        const osPref = mq.matches;
        const effective =
          reducedMotionPref === "on"
            ? true
            : reducedMotionPref === "off"
              ? false
              : osPref;
        setReducedMotion(effective);
        reducedMotionRef.current = effective;
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
    resizeObsRef.current?.disconnect();
    resizeObsRef.current = null;
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

  // Free any blob URL when it changes or unmounts (avoid memory leak).
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    historyRef.current = [];
    lastDrawAtRef.current = 0;

    // Observe canvas CSS size and resize the backing-store off the rAF loop.
    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      const dpr = dprRef.current;
      const tW = Math.max(1, Math.floor(rect.width * dpr));
      const tH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== tW || canvas.height !== tH) {
        canvas.width = tW;
        canvas.height = tH;
      }
    };
    syncCanvasSize();
    try {
      const ro = new ResizeObserver(syncCanvasSize);
      ro.observe(canvas);
      resizeObsRef.current = ro;
    } catch {
      // ResizeObserver missing — fall back to a one-shot sync; size rarely changes mid-record.
    }

    // Throttle to ~30fps on low-end devices to keep main thread free.
    // Reduced-motion users get a calmer ~20fps update — visually steady,
    // less peripheral movement.
    const minFrameMs = reducedMotionRef.current ? 50 : lowEndRef.current ? 33 : 0;

    const render = (ts?: number) => {
      rafRef.current = requestAnimationFrame(render);
      const now = ts ?? performance.now();
      if (minFrameMs && now - lastDrawAtRef.current < minFrameMs) return;
      lastDrawAtRef.current = now;
      const dpr = dprRef.current;

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

      // Throttled volume push — feeds the "Speaking…" bars.
      if (now - lastVolumeAtRef.current > 80) {
        lastVolumeAtRef.current = now;
        setVolume(amp);
      }

      // --- Voice activity detection ---
      const isSpeech = rms > thresholdRef.current;
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
        now - lastSpeechAtRef.current > silenceMsRef.current &&
        (Date.now() - startedAtRef.current) > 1500
      ) {
        autoStoppedRef.current = true;
        stop();
        return;
      }

      // --- Pitch detection (throttled to ~5Hz) ---
      // Only attempt to find a fundamental when there's actual voice energy.
      // Skipping on silence avoids wasted CPU and noisy "Hz" jitter.
      if (isSpeech && now - lastPitchAtRef.current > 200) {
        lastPitchAtRef.current = now;
        const ctxAudio = audioCtxRef.current;
        if (ctxAudio) {
          if (!pitchBufRef.current) {
            // Backing store typed as ArrayBuffer (not SharedArrayBuffer)
            // to satisfy Web Audio API typings.
            pitchBufRef.current = new Float32Array(
              new ArrayBuffer(analyser.fftSize * 4),
            );
          }
          const buf = pitchBufRef.current as Float32Array<ArrayBuffer>;
          analyser.getFloatTimeDomainData(buf);
          const hz = estimatePitchAutocorrelation(buf, ctxAudio.sampleRate);
          if (hz !== null) {
            // Maintain a sliding window of recent pitch samples for stability.
            const hist = pitchHistoryRef.current;
            hist.push(hz);
            if (hist.length > 20) hist.shift();
            const stability = pitchStability(hist);
            // EMA smoothing — fast on rise, gentle on decay, prevents jitter.
            const prev = smoothedStabilityRef.current;
            const alpha = stability > prev ? 0.35 : 0.15;
            const nextSmoothed = prev + (stability - prev) * alpha;
            smoothedStabilityRef.current = nextSmoothed;
            setSmoothedStability(nextSmoothed);
            setPitch({ hz, category: pitchCategory(hz), stability });
          }
        }
      } else if (!isSpeech && pitchHistoryRef.current.length && now - lastPitchAtRef.current > 600) {
        // Decay history when user goes quiet so the badge can fade.
        pitchHistoryRef.current = [];
        setPitch({ hz: null, category: "unknown", stability: 0 });
        // Decay smoothed stability gently so the bar doesn't snap to zero.
        smoothedStabilityRef.current = smoothedStabilityRef.current * 0.6;
        setSmoothedStability((s) => s * 0.6);
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
      // shadowBlur is the single most expensive op here — skip on low-end & reduced-motion.
      if (!reducedMotionRef.current && !lowEndRef.current) {
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
    // Free any previous playback URL when re-recording.
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setState("error");
      const msg = describeMicError(t, err);
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

    // Web Audio analyser for waveform — smaller FFT on low-end.
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
        analyser.fftSize = lowEndRef.current ? 512 : 1024;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        sourceRef.current = source;
        analyserRef.current = analyser;
        // Pre-allocate the pitch buffer matching analyser.fftSize. Backed by a
        // plain ArrayBuffer so it satisfies getFloatTimeDomainData typings.
        pitchBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        pitchHistoryRef.current = [];
        lastPitchAtRef.current = 0;
        setPitch({ hz: null, category: "unknown", stability: 0 });
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
    // Snapshot pitch before tearing down the analyser so we can surface
    // a summary in the review panel ("avg 178 Hz, stable").
    const hist = pitchHistoryRef.current;
    if (hist.length >= 4) {
      const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
      setPitchSnapshot({
        hz: avg,
        stability: smoothedStabilityRef.current,
        category: pitchCategory(avg),
      });
    } else {
      setPitchSnapshot(null);
    }
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
    resizeObsRef.current?.disconnect();
    resizeObsRef.current = null;

    const blob = new Blob(chunksRef.current, {
      type: mediaRecorderRef.current?.mimeType || "audio/webm",
    });
    chunksRef.current = [];

    if (blob.size < 1024) {
      setState("error");
      const msg = t("voice.errEmptyRec");
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    // Keep an object URL for the playback step in review.
    if (enablePlayback) {
      try {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } catch {}
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
        const msg = describeTranscribeError(t, res.status, json.error);
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
        err instanceof Error ? err.message : t("voice.errNetwork");
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
    }
  }

  function acceptDraft() {
    const text = draft.trim();
    if (!text) {
      const msg = t("voice.errEmptyText");
      setErrorMsg(msg);
      setState("error");
      onError?.(msg);
      return;
    }
    onTranscription(text);
    // Build a history entry — keep the blob URL alive (do NOT revoke) so the
    // user can replay it from the history list later in the same session.
    const entry: AcceptedRecording = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      transcript: text,
      createdAt: Date.now(),
      audioUrl: audioUrl ?? undefined,
      mimeType: mediaRecorderRef.current?.mimeType,
      emotion: emotion ?? undefined,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, Math.max(1, historyLimit));
      // Revoke any URL that drops off the end so we don't leak memory.
      const dropped = prev.slice(Math.max(0, historyLimit - 1));
      for (const old of dropped) {
        if (old.audioUrl && !next.some((n) => n.audioUrl === old.audioUrl)) {
          try {
            URL.revokeObjectURL(old.audioUrl);
          } catch {}
        }
      }
      return next;
    });
    onAccepted?.(entry);
    // Do not setAudioUrl(null) — history keeps the reference. We just clear
    // the "current draft" pointer to avoid double-controls in the idle state.
    setAudioUrl(null);
    setDraft("");
    setState("done");
    setTimeout(() => mountedRef.current && setState("idle"), 1400);
  }

  // Persist *text* history to localStorage. Audio URLs are session-scoped
  // (blob: URLs die on reload), so we store the transcript + metadata only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const minimal = history.map(({ audioUrl: _omit, ...rest }) => rest);
      window.localStorage.setItem("metabyx.vr.history", JSON.stringify(minimal));
    } catch {}
  }, [history]);

  // Restore history (text only) once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("metabyx.vr.history");
      if (!raw) return;
      const parsed = JSON.parse(raw) as AcceptedRecording[];
      if (Array.isArray(parsed)) {
        setHistory(parsed.slice(0, Math.max(1, historyLimit)));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke any active blob URLs when the component unmounts.
  useEffect(() => {
    return () => {
      for (const h of history) {
        if (h.audioUrl) {
          try {
            URL.revokeObjectURL(h.audioUrl);
          } catch {}
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Focus trap inside the review panel ----
  // While reviewing, Tab cycles among focusable controls within the panel.
  useEffect(() => {
    if (state !== "review") return;
    const root = reviewRootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], textarea, input, select, audio[controls], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [state]);

  // Persist VAD settings whenever they change (debounced via effect coalescing).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "metabyx.vr.vad",
        JSON.stringify({
          threshold: userThreshold,
          silenceMs: userSilenceMs,
          noiseFloor,
        }),
      );
    } catch {}
  }, [userThreshold, userSilenceMs, noiseFloor]);

  // Root-level keyboard shortcuts: Esc cancels recording / closes review;
  // Cmd/Ctrl+Enter accepts the draft in review.
  //
  // Hardened so typing in the review textarea is never hijacked:
  //   - Esc always cancels/closes, even from inside the textarea.
  //   - Plain Enter is left alone (textarea inserts a newline).
  //   - Cmd/Ctrl + Enter accepts — modifier is required, so IME composition
  //     and normal typing pass through untouched.
  //   - We also ignore the event while an IME composition is active (so
  //     pressing Enter to commit Norwegian dead-keys never accepts by accident).
  const onRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // `isComposing` is true mid-IME; skip all shortcuts in that case.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (state === "recording") {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    } else if (state === "review") {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDraft("");
        setState("idle");
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        acceptDraft();
      }
    }
  };

  // Push a short SR-only announcement, throttled and deduped so the live
  // region doesn't spam screen readers as VAD flips on/off rapidly.
  const announce = useCallback((msg: string) => {
    const now = performance.now();
    if (msg === lastLiveMsgRef.current) return;
    if (now - lastLiveAtRef.current < 900) return;
    lastLiveMsgRef.current = msg;
    lastLiveAtRef.current = now;
    setLiveMessage(msg);
  }, []);

  // Announce speaking transitions during recording.
  useEffect(() => {
    if (state !== "recording") return;
    announce(speaking ? t("voice.announceSpeaking") : t("voice.announceSilence"));
  }, [speaking, state, announce]);

  // Announce low pitch-confidence fallback.
  useEffect(() => {
    if (state !== "recording") return;
    if (pitch.hz != null && smoothedStability < 0.2) {
      announce(t("voice.announceLowConf"));
    }
  }, [pitch.hz, smoothedStability, state, announce]);

  // Gently announce emotion summaries when the parent supplies one in the
  // review step. Low-confidence tearfulness gets a calmer, slower message
  // rather than an alarming "crying detected" cue.
  useEffect(() => {
    if (state !== "review" || !emotion) return;
    const tearsConf = emotion.tearfulness?.confidence ?? 0;
    const lowConfTears = emotion.tearfulness?.value && tearsConf < 0.5;
    if (lowConfTears) {
      announce(t("voice.announceTense"));
      return;
    }
    if (emotion.summary) {
      announce(`${t("voice.emotion")}: ${emotion.summary}`);
    } else if (emotion.primaryEmotion) {
      announce(`${t("voice.emotion")}: ${emotion.primaryEmotion}`);
    }
  }, [state, emotion, announce]);

  // Sample ambient noise for ~1.4s and set the VAD threshold just above it.
  // The mic must be open — we briefly start a stream if needed and tear it
  // down afterwards. Updates `noiseFloor` and `userThreshold` together.
  const calibrateNoiseFloor = useCallback(async () => {
    if (calibrating || state === "recording" || state === "processing") return;
    setCalibrating(true);
    setErrorMsg(null);
    let localStream: MediaStream | null = null;
    let localCtx: AudioContext | null = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error(t("voice.errAudioCtx"));
      localCtx = new AC();
      const source = localCtx.createMediaStreamSource(localStream);
      const analyser = localCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      const samples: number[] = [];
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          samples.push(Math.sqrt(sum / buf.length));
          if (performance.now() - started < 1400) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        };
        tick();
      });
      // Use 90th percentile to ignore short spikes, then add headroom.
      samples.sort((a, b) => a - b);
      const p90 = samples[Math.floor(samples.length * 0.9)] ?? 0;
      const floor = Math.max(0.003, Math.min(0.04, p90));
      const threshold = Math.max(0.008, Math.min(0.08, floor * 1.8));
      setNoiseFloor(floor);
      setUserThreshold(threshold);
      thresholdRef.current = threshold;
      announce(
        t("voice.noiseMeasured", { pct: (floor * 100).toFixed(1) }),
      );
    } catch (err) {
      const msg = describeMicError(t, err);
      setErrorMsg(msg);
      onError?.(msg);
    } finally {
      try {
        await localCtx?.close();
      } catch {}
      localStream?.getTracks().forEach((t) => t.stop());
      setCalibrating(false);
    }
  }, [calibrating, state, announce, onError]);

  // Memoized human label for the speaking indicator (also used by SR).
  const vadStatusLabel = useMemo(
    () => (speaking ? t("voice.speakingNow") : t("voice.listeningForVoice")),
    [speaking, t],
  );

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
      role="group"
      aria-label={ariaLabel ?? t("voice.ariaDefault")}
      onKeyDown={onRootKeyDown}
    >
      {/* SR-only live regions: polite for status, assertive for errors. */}
      <span className="sr-only" aria-live="polite">
        {isRecording
          ? t("voice.statusRecording", { vad: vadStatusLabel, seconds: elapsed })
          : isProcessing
            ? t("voice.statusTranscribing")
            : isDone
              ? t("voice.statusDone")
              : isReview
                ? t("voice.statusReview")
                : ""}
      </span>
      <span className="sr-only" role="alert" aria-live="assertive">
        {isError && errorMsg ? errorMsg : ""}
      </span>
      {/* Dedicated live region for throttled, deduped VAD + pitch updates. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

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
        <div
          ref={reviewRootRef}
          role="dialog"
          aria-label={t("voice.statusReview")}
          aria-modal="false"
          className="animate-fade-in flex flex-col gap-3 focus-visible:outline-none"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("voice.preview")}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {t("voice.editIfWrong")}
            </span>
          </div>

          {/* Audio playback — lets the user verify the recording before accepting. */}
          {enablePlayback && audioUrl && (
            <div
              className="flex items-center gap-2 rounded-xl px-2.5 py-2"
              style={{
                background: "oklch(1 0 0 / 0.04)",
                border: "1px solid oklch(1 0 0 / 0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const el = audioElRef.current;
                  if (!el) return;
                  if (el.paused) void el.play();
                  else el.pause();
                }}
                aria-label={isPlaying ? t("voice.pausePlayback") : t("voice.playRecording")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.3), oklch(0.72 0.13 265 / 0.22))",
                  border: "1px solid oklch(1 0 0 / 0.12)",
                }}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 text-foreground" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5 text-foreground" />
                )}
              </button>
              <audio
                ref={audioElRef}
                src={audioUrl}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                controls
                className="h-8 flex-1"
                style={{ colorScheme: "dark" }}
              />
            </div>
          )}

          {/* Pitch summary — captured at the end of recording. */}
          {pitchSnapshot && (
            <div
              role="group"
              aria-label={t("voice.pitchSummaryAria", { hz: Math.round(pitchSnapshot.hz), pct: Math.round(pitchSnapshot.stability * 100) })}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
              style={{
                background: "oklch(1 0 0 / 0.03)",
                border: "1px solid oklch(1 0 0 / 0.08)",
              }}
            >
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                  {t("voice.pitch")}
                </span>
                <span
                  className="text-sm text-foreground"
                  style={{ fontFamily: "Fraunces, serif" }}
                >
                  {Math.round(pitchSnapshot.hz)} Hz
                  <span className="ml-1.5 text-[10px] capitalize text-muted-foreground">
                    · {pitchCategoryLabel(t, pitchSnapshot.category)}
                  </span>
                </span>
              </div>
              <div className="flex min-w-[120px] flex-col items-end">
                <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                  {t("voice.variation")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-1 w-14 overflow-hidden rounded-full"
                    style={{ background: "oklch(1 0 0 / 0.08)" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.round(pitchSnapshot.stability * 100)}%`,
                        background:
                          "linear-gradient(90deg, oklch(0.72 0.13 265 / 0.7), oklch(0.88 0.14 82 / 0.9))",
                      }}
                    />
                  </span>
                  <span className="text-[11px] text-foreground/80">
                    {stabilityLabel(t, pitchSnapshot.stability)}
                  </span>
                </span>
              </div>
            </div>
          )}

          <div className={emotion ? "grid grid-cols-1 gap-3 md:grid-cols-[1fr_minmax(180px,220px)]" : ""}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            aria-label={t("voice.transcribedTextAria")}
            autoFocus
            className="min-h-[88px] w-full resize-y rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{
              border: "1px solid oklch(1 0 0 / 0.08)",
              fontFamily: "Fraunces, serif",
            }}
            placeholder={t("voice.emptyPlaceholder")}
          />
          {emotion && (
            <aside
              aria-label={t("voice.emotionAria")}
              className="flex flex-col gap-2 rounded-xl p-3"
              style={{
                background:
                  "linear-gradient(160deg, oklch(0.72 0.13 265 / 0.10), oklch(0.88 0.14 82 / 0.05))",
                border: "1px solid oklch(1 0 0 / 0.08)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-gold/80" />
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {t("voice.emotion")}
                </p>
              </div>
              {emotion.primaryEmotion && (
                <p
                  className="text-sm capitalize text-foreground"
                  style={{ fontFamily: "Fraunces, serif" }}
                >
                  {emotion.primaryEmotion}
                  {emotion.emotionalIntensity && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      · {emotion.emotionalIntensity}
                    </span>
                  )}
                </p>
              )}
              {emotion.summary && (
                <p className="text-[11px] leading-relaxed text-foreground/75">
                  {emotion.summary}
                </p>
              )}
              {emotion.tearfulness?.value && (
                <p className="text-[10px] text-muted-foreground">
                  {t("voice.tearSign", { pct: Math.round((emotion.tearfulness.confidence ?? 0) * 100) })}
                </p>
              )}
            </aside>
          )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("voice.tipAccept")}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setState("idle");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
              style={{ border: "1px solid oklch(1 0 0 / 0.08)" }}
            >
              <X className="h-3.5 w-3.5" />
              {t("voice.cancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft("");
                void start();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
              style={{
                border: "1px solid oklch(1 0 0 / 0.1)",
                background: "oklch(1 0 0 / 0.04)",
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("voice.retake")}
            </button>
            <button
              type="button"
              onClick={acceptDraft}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-semibold text-foreground transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/80"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.4), oklch(0.72 0.13 265 / 0.32))",
                border: "1px solid oklch(1 0 0 / 0.12)",
                boxShadow:
                  "0 0 18px oklch(0.88 0.14 82 / 0.35), inset 0 0 0 1px oklch(0.88 0.14 82 / 0.25)",
              }}
            >
              <Check className="h-3.5 w-3.5" />
              {t("voice.useText")}
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
            (isRecording
              ? t("voice.mainCancelAria")
              : isProcessing
                ? t("voice.mainProcessingAria")
                : t("voice.mainStartAria"))
          }
          className={`relative flex shrink-0 items-center justify-center rounded-full transition-all duration-300 active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 ${
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
          {isRecording && !reducedMotion && (
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
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {isDone ? t("voice.idleTitleDone") : isError ? t("voice.idleTitleError") : t("voice.idleTitleVoice")}
                </p>
                {showSettings && state === "idle" && (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((s) => !s)}
                    aria-expanded={settingsOpen}
                    aria-controls="vr-settings"
                    aria-label={t("voice.adjustAria")}
                    className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p
                className="text-xs leading-snug text-foreground/80"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {isDone
                  ? t("voice.idleDoneMsg")
                  : isError
                    ? (errorMsg ?? t("voice.idleErrorFallback"))
                    : t("voice.idleTapToSpeak")}
              </p>
              {isError && (
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void start()}
                    aria-label={t("voice.tryAgainAria")}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-foreground transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.35), oklch(0.72 0.13 265 / 0.28))",
                      border: "1px solid oklch(1 0 0 / 0.12)",
                      boxShadow:
                        "0 0 12px oklch(0.88 0.14 82 / 0.25), inset 0 0 0 1px oklch(0.88 0.14 82 / 0.2)",
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("voice.tryAgain")}
                  </button>
                  {audioUrl && enablePlayback && (
                    <button
                      type="button"
                      onClick={() => {
                        const el = audioElRef.current;
                        if (el) {
                          if (el.paused) void el.play();
                          else el.pause();
                        }
                      }}
                      aria-label={t("voice.listenLastAria")}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                      style={{ border: "1px solid oklch(1 0 0 / 0.08)" }}
                    >
                      <Play className="h-3 w-3" />
                      {t("voice.listenLast")}
                    </button>
                  )}
                  {audioUrl && (
                    <audio
                      ref={audioElRef}
                      src={audioUrl}
                      preload="metadata"
                      className="sr-only"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  )}
                </div>
              )}
              {settingsOpen && state === "idle" && (
                <div
                  id="vr-settings"
                  className="animate-fade-in mt-2 grid grid-cols-1 gap-2 rounded-xl p-3"
                  style={{
                    background: "oklch(1 0 0 / 0.03)",
                    border: "1px solid oklch(1 0 0 / 0.08)",
                  }}
                >
                  <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center justify-between">
                      <span>{t("voice.sensitivity")}</span>
                      <span className="tabular-nums text-foreground/70">
                        {userThreshold.toFixed(3)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0.005}
                      max={0.08}
                      step={0.001}
                      value={userThreshold}
                      onChange={(e) => setUserThreshold(parseFloat(e.target.value))}
                      aria-label={t("voice.sensitivityAria")}
                      className="accent-[oklch(0.88_0.14_82)]"
                    />
                    <span className="text-[9px] text-muted-foreground/80">
                      {t("voice.sensitivityHint")}
                    </span>
                  </label>
                  {/* Noise-floor calibration: samples ambient RMS for ~1.4s
                      and sets the threshold just above it. */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[10px] text-muted-foreground">
                        {t("voice.noiseFloor")}
                      </span>
                      <span className="text-[9px] text-muted-foreground/70">
                        {noiseFloor != null
                          ? t("voice.noiseMeasured", { pct: (noiseFloor * 100).toFixed(1) })
                          : t("voice.noiseNotCalibrated")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void calibrateNoiseFloor()}
                      disabled={calibrating}
                      aria-label={t("voice.calibrateAria")}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-foreground transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.28), oklch(0.72 0.13 265 / 0.22))",
                        border: "1px solid oklch(1 0 0 / 0.12)",
                      }}
                    >
                      {calibrating ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("voice.calibrating")}
                        </>
                      ) : (
                        <>
                          <Settings2 className="h-3 w-3" />
                          {t("voice.calibrate")}
                        </>
                      )}
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center justify-between">
                      <span>{t("voice.silenceBefore")}</span>
                      <span className="tabular-nums text-foreground/70">
                        {(userSilenceMs / 1000).toFixed(1)}s
                      </span>
                    </span>
                    <input
                      type="range"
                      min={800}
                      max={6000}
                      step={100}
                      value={userSilenceMs}
                      onChange={(e) => setUserSilenceMs(parseInt(e.target.value, 10))}
                      aria-label={t("voice.silenceAria")}
                      className="accent-[oklch(0.72_0.13_265)]"
                    />
                  </label>
                  {/* Calm-mode + pitch display toggles. Persisted so the
                      recorder always opens in the same configuration. */}
                  <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[10px] text-muted-foreground">{t("voice.calmMode")}</span>
                      <span className="text-[9px] text-muted-foreground/70">
                        {t("voice.calmHint")}
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t("voice.calmAria")}
                      className="inline-flex overflow-hidden rounded-full text-[10px]"
                      style={{ border: "1px solid oklch(1 0 0 / 0.1)" }}
                    >
                      {(["auto", "on", "off"] as const).map((opt) => {
                        const on = reducedMotionPref === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setReducedMotionPref(opt)}
                            className="px-2 py-1 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                            style={
                              on
                                ? {
                                    background:
                                      "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.28), oklch(0.72 0.13 265 / 0.22))",
                                    color: "oklch(0.95 0.02 90)",
                                  }
                                : { color: "oklch(0.7 0.02 265)" }
                            }
                          >
                            {opt === "auto" ? t("voice.calmAuto") : opt === "on" ? t("voice.calmOn") : t("voice.calmOff")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="flex min-w-0 flex-col">
                      <span>{t("voice.showPitch")}</span>
                      <span className="text-[9px] text-muted-foreground/70">
                        {t("voice.showPitchHint")}
                      </span>
                    </span>
                    <span className="relative inline-block h-4 w-7 shrink-0">
                      <input
                        type="checkbox"
                        checked={showPitch}
                        onChange={(e) => setShowPitch(e.target.checked)}
                        aria-label={t("voice.showPitchAria")}
                        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <span
                        aria-hidden
                        className="block h-4 w-7 rounded-full transition-colors"
                        style={{
                          background: showPitch
                            ? "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.55), oklch(0.72 0.13 265 / 0.4))"
                            : "oklch(1 0 0 / 0.08)",
                          border: "1px solid oklch(1 0 0 / 0.12)",
                        }}
                      />
                      <span
                        aria-hidden
                        className="absolute top-0.5 left-0.5 block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                        style={{
                          transform: showPitch ? "translateX(12px)" : "translateX(0)",
                        }}
                      />
                    </span>
                  </label>
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
                  role="status"
                  aria-label={vadStatusLabel}
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
                    aria-hidden
                    className="inline-flex items-end gap-[2px]"
                    style={{ height: 8 }}
                  >
                    {[0, 1, 2, 3].map((i) => {
                      // Each bar lights up at progressively higher thresholds.
                      const lit = speaking && volume > 0.06 + i * 0.08;
                      const h = lit
                        ? Math.max(2, Math.min(8, 2 + volume * 10 - i))
                        : 2;
                      return (
                        <span
                          key={i}
                          className="block w-[2px] rounded-full"
                          style={{
                            height: `${h}px`,
                            background: lit
                              ? "oklch(0.9 0.15 82)"
                              : "oklch(0.78 0.08 265 / 0.55)",
                            transition: reducedMotion
                              ? undefined
                              : "height 120ms ease-out, background 200ms ease-out",
                          }}
                        />
                      );
                    })}
                  </span>
                  {speaking ? t("voice.vadSpeaking") : t("voice.vadListening")}
                </span>
              </div>
            {/* Pitch / stability chip + supportive cue */}
            {showPitch && pitch.hz != null && (
              <div
                role="status"
                aria-label={t("voice.pitchAria", { hz: Math.round(pitch.hz), pct: Math.round(smoothedStability * 100) })}
                className="hidden flex-col items-end gap-0.5 sm:flex"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-1 w-10 overflow-hidden rounded-full bg-white/8"
                    style={{ background: "oklch(1 0 0 / 0.08)" }}
                  >
                    <span
                      className={`block h-full rounded-full ${
                        reducedMotion ? "" : "transition-[width,background] duration-500 ease-out"
                      }`}
                      style={{
                        width: `${Math.round(smoothedStability * 100)}%`,
                        background:
                          "linear-gradient(90deg, oklch(0.72 0.13 265 / 0.7), oklch(0.88 0.14 82 / 0.9))",
                      }}
                    />
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-foreground/70">
                    {Math.round(pitch.hz)} Hz
                  </span>
                </div>
                {/* Low-confidence fallback — when we don't have enough stable
                    samples yet, prefer a calm waiting message over a noisy cue. */}
                {smoothedStability < 0.2 || pitch.stability === 0 ? (
                  <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70">
                    {t("voice.listeningClearer")}
                  </span>
                ) : pitchCue(t, { hz: pitch.hz, stability: smoothedStability }) && (
                  <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                    {pitchCue(t, { hz: pitch.hz, stability: smoothedStability })}
                  </span>
                )}
              </div>
            )}
              <span
                className="font-mono text-[11px] tabular-nums text-gold/90"
                style={
                  reducedMotion
                    ? undefined
                    : { animation: "vr-tick 1s ease-in-out infinite" }
                }
                aria-label={t("voice.timeAria", { seconds: elapsed })}
              >
                {formatTime(elapsed)}
              </span>
              <button
                type="button"
                onClick={stop}
                aria-label={t("voice.finishRecAria")}
                className="group relative ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-foreground transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/80"
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

      {/* Keyboard shortcuts hint — visible during recording & review so users
          know how to confirm or cancel without reaching for the mouse. */}
      {(isRecording || isReview) && (
        <p className="mt-2 hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 sm:flex">
          <Keyboard aria-hidden className="h-3 w-3" />
          <span>
            <kbd className="rounded bg-white/10 px-1 py-0.5">Esc</kbd>{" "}
            {isRecording ? "avbryt" : "lukk"}
            <span className="mx-1.5 text-foreground/30">·</span>
            <kbd className="rounded bg-white/10 px-1 py-0.5">⌘</kbd>/
            <kbd className="rounded bg-white/10 px-1 py-0.5">Ctrl</kbd>+
            <kbd className="rounded bg-white/10 px-1 py-0.5">Enter</kbd>{" "}
            {isRecording ? "godta" : "bruk"}
          </span>
        </p>
      )}

      {/* Recording history — replay & revisit previously accepted transcripts. */}
      {showHistory && state === "idle" && history.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            aria-controls="vr-history"
            className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded"
          >
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Tidligere opptak ({history.length})
            </span>
            <span className="text-foreground/50">{historyOpen ? "−" : "+"}</span>
          </button>
          {historyOpen && (
            <ul id="vr-history" className="mt-2 flex flex-col gap-1.5">
              {history.map((h) => {
                const isPlayingThis = playingId === h.id;
                return (
                  <li
                    key={h.id}
                    className="flex items-start gap-2 rounded-xl p-2.5"
                    style={{
                      background: "oklch(1 0 0 / 0.03)",
                      border: "1px solid oklch(1 0 0 / 0.06)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const el = historyAudioRefs.current.get(h.id);
                        if (!el) return;
                        // Pause any other history audio first.
                        for (const [oid, oel] of historyAudioRefs.current) {
                          if (oid !== h.id && oel && !oel.paused) oel.pause();
                        }
                        if (el.paused) void el.play();
                        else el.pause();
                      }}
                      disabled={!h.audioUrl}
                      aria-label={
                        h.audioUrl
                          ? isPlayingThis
                            ? "Pause avspilling"
                            : "Spill av opptaket"
                          : "Lyden er ikke lenger tilgjengelig"
                      }
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.88 0.14 82 / 0.22), oklch(0.72 0.13 265 / 0.18))",
                        border: "1px solid oklch(1 0 0 / 0.1)",
                      }}
                    >
                      {isPlayingThis ? (
                        <Pause className="h-3 w-3 text-foreground" />
                      ) : (
                        <Play className="ml-0.5 h-3 w-3 text-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className="line-clamp-2 text-[12px] leading-snug text-foreground/85"
                        style={{ fontFamily: "Fraunces, serif" }}
                      >
                        {h.transcript}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                        <span>{formatHistoryDate(t, h.createdAt)}</span>
                        {h.emotion?.primaryEmotion && (
                          <span className="capitalize text-foreground/60">
                            · {h.emotion.primaryEmotion}
                          </span>
                        )}
                        {!h.audioUrl && <span>· kun tekst</span>}
                      </div>
                    </div>
                    {h.audioUrl && (
                      <audio
                        ref={(el) => {
                          if (el) historyAudioRefs.current.set(h.id, el);
                          else historyAudioRefs.current.delete(h.id);
                        }}
                        src={h.audioUrl}
                        preload="metadata"
                        onPlay={() => setPlayingId(h.id)}
                        onPause={() =>
                          setPlayingId((p) => (p === h.id ? null : p))
                        }
                        onEnded={() =>
                          setPlayingId((p) => (p === h.id ? null : p))
                        }
                        className="sr-only"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Map a getUserMedia DOMException into actionable, localized guidance.
 * Each branch describes WHAT failed and WHAT to do next.
 */
function describeMicError(t: TFn, err: unknown): string {
  const name =
    err instanceof DOMException
      ? err.name
      : err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return t("voice.micDenied");
    case "NotFoundError":
    case "OverconstrainedError":
      return t("voice.micNotFound");
    case "NotReadableError":
      return t("voice.micBusy");
    case "AbortError":
      return t("voice.micDisconnected");
    case "TypeError":
      return t("voice.micInsecure");
    default:
      return t("voice.micUnknown");
  }
}

/**
 * Map a transcribe API failure into actionable, localized guidance.
 */
function describeTranscribeError(t: TFn, status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) {
    return t("voice.trUnauth");
  }
  if (status === 413) {
    return t("voice.trTooLong");
  }
  if (status === 415) {
    return t("voice.trUnsupported");
  }
  if (status === 429) {
    return t("voice.trTooMany");
  }
  if (status >= 500) {
    return t("voice.trServerDown");
  }
  return serverMessage || t("voice.trFallback");
}
/* ------------------------------------------------------------------ */
/*  Pitch detection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Estimate the fundamental frequency of a voice signal using normalized
 * autocorrelation (a.k.a. ACF / NSDF-lite). Cheap and reasonably robust
 * for speech in the 60–500 Hz range.
 *
 * Algorithm:
 *   1. Compute signal RMS — abort if too weak (avoids garbage on silence).
 *   2. For each candidate lag τ in [minTau, maxTau], compute
 *        r(τ) = Σ x[i] * x[i+τ]  (i = 0..N-1-τ)
 *      The first prominent peak of r(τ) corresponds to one period of
 *      the fundamental, so f₀ = sampleRate / τ.
 *   3. Refine the peak with parabolic interpolation around the bin.
 *
 * We bound the search to 60–500 Hz to cover adult speech and avoid
 * doubling/halving errors at the extremes.
 */
function estimatePitchAutocorrelation(
  buf: Float32Array<ArrayBuffer>,
  sampleRate: number,
): number | null {
  const N = buf.length;
  // RMS gate — bail out on quiet frames.
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.01) return null;

  const minHz = 60;
  const maxHz = 500;
  const maxTau = Math.floor(sampleRate / minHz);
  const minTau = Math.floor(sampleRate / maxHz);
  if (maxTau >= N) return null;

  // Compute autocorrelation for every candidate lag.
  // We track the largest peak that is also a local maximum.
  let bestTau = -1;
  let bestVal = 0;
  let prev = 0;
  let rising = false;
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < N - tau; i++) sum += buf[i] * buf[i + tau];
    if (sum > prev) {
      rising = true;
    } else if (rising && sum < prev) {
      // We just crossed a local max at tau - 1.
      if (prev > bestVal) {
        bestVal = prev;
        bestTau = tau - 1;
      }
      rising = false;
    }
    prev = sum;
  }
  if (bestTau < 0) return null;

  // Parabolic interpolation around bestTau for sub-bin accuracy.
  const yLeft = autocorrAt(buf, bestTau - 1);
  const yMid = bestVal;
  const yRight = autocorrAt(buf, bestTau + 1);
  const denom = yLeft - 2 * yMid + yRight;
  const shift = denom === 0 ? 0 : (0.5 * (yLeft - yRight)) / denom;
  const refinedTau = bestTau + shift;

  const hz = sampleRate / refinedTau;
  if (hz < minHz || hz > maxHz) return null;
  return hz;
}

function autocorrAt(buf: Float32Array<ArrayBuffer>, tau: number): number {
  if (tau <= 0 || tau >= buf.length) return 0;
  let s = 0;
  for (let i = 0; i < buf.length - tau; i++) s += buf[i] * buf[i + tau];
  return s;
}

/** Stability ∈ [0,1] — 1 means rock-steady pitch, 0 means very erratic. */
function pitchStability(samples: number[]): number {
  if (samples.length < 4) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean <= 0) return 0;
  let varSum = 0;
  for (const s of samples) varSum += (s - mean) * (s - mean);
  const stdev = Math.sqrt(varSum / samples.length);
  const cv = stdev / mean; // coefficient of variation
  // Map cv: 0 → 1 (perfect), 0.15+ → 0 (very wobbly). Smooth in between.
  return Math.max(0, Math.min(1, 1 - cv / 0.15));
}

function pitchCategory(hz: number): "low" | "medium" | "high" {
  if (hz < 140) return "low";
  if (hz < 230) return "medium";
  return "high";
}

/** Localized label for the pitch category shown in the review summary. */
function pitchCategoryLabel(t: TFn, c: "low" | "medium" | "high" | "unknown"): string {
  return t(`voice.pitchCat.${c}`);
}

/** Plain-language stability label for the review summary. */
function stabilityLabel(t: TFn, stability: number): string {
  if (stability >= 0.7) return t("voice.stab.steady");
  if (stability >= 0.4) return t("voice.stab.even");
  if (stability >= 0.2) return t("voice.stab.uneven");
  return t("voice.stab.unsteady");
}

/** Light, supportive cue derived from pitch stability + category. */
export function pitchCue(t: TFn, p: { hz: number | null; stability: number }): string | null {
  if (p.hz == null) return null;
  if (p.stability > 0.75) return t("voice.cue.calmSteady");
  if (p.stability > 0.45) return t("voice.cue.even");
  if (p.stability > 0.2) return t("voice.cue.variation");
  return t("voice.cue.tense");
}

/** Compact relative date: "just now", "12 min", "3 h", or locale date. */
function formatHistoryDate(t: TFn, ts: number): string {
  const diffMs = Date.now() - ts;
  const s = Math.floor(diffMs / 1000);
  if (s < 30) return t("voice.justNow");
  if (s < 60) return t("voice.secondsAgo", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("voice.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("voice.hoursAgo", { n: h });
  return new Date(ts).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}
