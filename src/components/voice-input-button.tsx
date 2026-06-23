import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

type Props = {
  onResult: (text: string) => void;
  lang?: string;
  className?: string;
  compact?: boolean;
};

export function VoiceInputButton({
  onResult,
  lang = "nb-NO",
  className = "",
  compact = false,
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) setSupported(false);
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  function toggle() {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      const text = (finalText + interim).trim();
      if (text) onResult(text);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isListening ? "Stopp opptak" : "Snakk inn tekst"}
      className={`glass inline-flex items-center gap-1.5 rounded-full transition-all active:scale-95 ${
        compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"
      } ${
        isListening
          ? "ring-1 ring-[oklch(0.82_0.14_82/0.7)]"
          : "opacity-80 hover:opacity-100"
      } ${className}`}
      style={
        isListening
          ? {
              background:
                "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.18), oklch(0.82 0.14 82 / 0.04))",
              boxShadow: "var(--shadow-gold)",
            }
          : undefined
      }
    >
      {isListening ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.82_0.14_82/0.7)]" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          <MicOff className="h-3 w-3 text-gold" />
          <span className="uppercase tracking-wider text-gold">Lytter…</span>
        </>
      ) : (
        <>
          <Mic className="h-3 w-3 text-foreground" />
          <span className="uppercase tracking-wider text-foreground">Snakk</span>
        </>
      )}
    </button>
  );
}