export interface VoiceRecorderProps {
  /** Called with the final transcribed text when recording stops. */
  onResult: (text: string) => void;
  /** BCP-47 language code. Defaults to Norwegian ('nb-NO'). */
  lang?: string;
  /** Additional classes for the outer button. */
  className?: string;
  /** Compact size for tight layouts. */
  compact?: boolean;
  /** Optional accessible label. Defaults to "Snakk inn tekst". */
  ariaLabel?: string;
}

export type VoiceRecorderState = "idle" | "listening" | "done" | "unsupported";
