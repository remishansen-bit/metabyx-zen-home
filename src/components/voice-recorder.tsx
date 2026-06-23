import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Check } from "lucide-react";
import type { VoiceRecorderProps, VoiceRecorderState } from "@/types/voice-recorder";

export function VoiceRecorder({
  onResult,
  lang = "nb-NO",
  className = "",
  compact = false,
  ariaLabel = "Snakk inn tekst",
}: VoiceRecorderProps) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setState("unsupported");
    return () => {
      stopRecognition();
    };
  }, []);

  function stopRecognition() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {}
  }

  function toggle() {
    if (state === "listening") {
      stopRecognition();
      setState("done");
      if (transcriptRef.current.trim()) {
        onResult(transcriptRef.current.trim());
      }
      timeoutRef.current = setTimeout(() => {
        setState("idle");
        transcriptRef.current = "";
      }, 1800);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setState("unsupported");
      return;
    }

    transcriptRef.current = "";
    const recognition = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      transcriptRef.current = text;
    };

    recognition.onerror = () => {
      setState((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognition.onend = () => {
      setState((prev) => {
        if (prev === "listening") {
          if (transcriptRef.current.trim()) {
            onResult(transcriptRef.current.trim());
          }
          return "done";
        }
        return prev;
      });
      timeoutRef.current = setTimeout(() => {
        setState("idle");
        transcriptRef.current = "";
      }, 1800);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState("listening");
    } catch {
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  const isListening = state === "listening";
  const isDone = state === "done";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={ariaLabel}
      className={[
        "glass group relative inline-flex items-center gap-2 overflow-hidden rounded-full transition-all active:scale-95",
        compact ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-[11px]",
        isListening
          ? "ring-1 ring-[oklch(0.82_0.14_82/0.7)]"
          : "opacity-90 hover:opacity-100",
        className,
      ].join(" ")}
      style={
        isListening
          ? {
              background:
                "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.18), oklch(0.82 0.14 82 / 0.04))",
              boxShadow: "var(--shadow-gold)",
            }
          : isDone
            ? {
                background:
                  "linear-gradient(135deg, oklch(0.65 0.18 145 / 0.16), oklch(0.65 0.18 145 / 0.04))",
              }
            : undefined
      }
    >
      {/* Soft glow behind the icon when listening */}
      {isListening && (
        <span
          className="pointer-events-none absolute inset-0 -z-10 animate-pulse"
          style={{
            background:
              "radial-gradient(circle at 30% 50%, oklch(0.82 0.14 82 / 0.18), transparent 60%)",
          }}
        />
      )}

      {/* Waveform / pulsing indicator */}
      <span className="relative flex h-4 w-4 items-center justify-center">
        {isListening ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.82_0.14_82/0.55)]" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
          </>
        ) : isDone ? (
          <Check className="h-3.5 w-3.5 text-[oklch(0.72_0.18_145)]" />
        ) : (
          <Mic className="h-3.5 w-3.5 text-foreground" />
        )}
      </span>

      {/* Waveform bars while listening */}
      {isListening && (
        <span className="mr-1 flex items-end gap-[3px]" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-gold"
              style={{
                height: "10px",
                animation: "voice-wave 0.9s ease-in-out infinite alternate",
                animationDelay: `${i * 110}ms`,
              }}
            />
          ))}
        </span>
      )}

      <span
        className={[
          "font-medium uppercase tracking-wider",
          isListening ? "text-gold" : isDone ? "text-[oklch(0.72_0.18_145)]" : "text-foreground",
        ].join(" ")}
      >
        {isListening ? "Lytter…" : isDone ? "Ferdig" : "Snakk"}
      </span>

      {isListening && (
        <MicOff className="h-3 w-3 text-gold opacity-70 transition-opacity group-hover:opacity-100" />
      )}

      <style>{`
        @keyframes voice-wave {
          0% { transform: scaleY(0.35); opacity: 0.55; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </button>
  );
}
