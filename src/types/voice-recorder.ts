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
  /** Auto-stop when sustained silence is detected (default true). */
  autoStopOnSilence?: boolean;
  /** Silence threshold (RMS, 0..1). Default 0.02. */
  silenceThreshold?: number;
  /** How long silence must persist before auto-stop, in ms. Default 2200. */
  silenceTimeoutMs?: number;
  /** Show an editable preview before emitting the transcript (default true). */
  editBeforeAccept?: boolean;
}

export type VoiceRecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "review"
  | "done"
  | "error"
  | "unsupported";
