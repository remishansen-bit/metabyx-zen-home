import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MicOff as MicOffIcon, RotateCcw, Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  value: string;
  onChange: (text: string) => void;
  lang?: string;
  className?: string;
  compact?: boolean;
  /** Called when user taps "Skriv i stedet" to fall back to typing. */
  onFallbackToType?: () => void;
};

export function VoiceInputButton({
  value,
  onChange,
  lang = "nb-NO",
  className = "",
  compact = false,
  onFallbackToType,
}: Props) {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const baseRef = useRef("");

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
    setError(null);
    const recognition = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;

    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      const spoken = (finalText + interim).trim();
      if (spoken) onChange(baseRef.current + spoken);
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      const code = e?.error ?? "unknown";
      const msg =
        code === "not-allowed" || code === "service-not-allowed"
          ? t("voiceInput.blocked")
          : code === "no-speech"
            ? t("voiceInput.noSpeech")
            : code === "network"
              ? t("voiceInput.network")
              : t("voiceInput.generic");
      setError(msg);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      setError(t("voiceInput.startFailed"));
    }
  }

  if (!supported) {
    return (
      <div
        className={`glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] text-muted-foreground ${className}`}
        title={t("voiceInput.unsupportedTitle")}
      >
        <MicOffIcon className="h-3 w-3" />
        <span>{t("voiceInput.unsupported")}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={isListening ? t("voiceInput.stopAria") : error ? t("voiceInput.retryAria") : t("voiceInput.speakAria")}
        className={`glass inline-flex items-center gap-1.5 rounded-full transition-all active:scale-95 ${
          compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"
        } ${
          isListening
            ? "ring-1 ring-[oklch(0.82_0.14_82/0.7)]"
            : "opacity-80 hover:opacity-100"
        }`}
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
            <span className="uppercase tracking-wider text-gold">{t("voiceInput.listening")}</span>
          </>
        ) : error ? (
          <>
            <RotateCcw className="h-3 w-3 text-foreground" />
            <span className="uppercase tracking-wider text-foreground">{t("voiceInput.tryAgain")}</span>
          </>
        ) : (
          <>
            <Mic className="h-3 w-3 text-foreground" />
            <span className="uppercase tracking-wider text-foreground">{t("voiceInput.speak")}</span>
          </>
        )}
      </button>

      {error && !isListening && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground animate-fade-in">
          <span className="max-w-[180px] text-right leading-snug">{error}</span>
          {onFallbackToType && (
            <button
              type="button"
              onClick={onFallbackToType}
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-foreground/80 hover:bg-white/10"
            >
              <Keyboard className="h-3 w-3" />
              {t("voiceInput.typeInstead")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}