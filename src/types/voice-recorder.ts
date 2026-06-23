export interface VoiceRecorderProps {
  /** Called with the final transcribed text from Whisper. */
  onTranscription: (text: string) => void;
  /** Called when something fails (mic denied, transcription error, etc). */
  onError?: (message: string) => void;
  /** BCP-47 language code. Defaults to Norwegian ('nb-NO'). */
  language?: string;
  /** Additional classes for the outer wrapper. */
  className?: string;
  /** Compact size for tight layouts (smaller pad, no big timer). */
  compact?: boolean;
  /** Max recording duration in seconds (auto-stops). Defaults to 120s. */
  maxSeconds?: number;
  /** Optional accessible label for the main button. */
  ariaLabel?: string;
}

export type VoiceRecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "done"
  | "error"
  | "unsupported";
