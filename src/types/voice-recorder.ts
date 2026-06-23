export interface VoiceRecorderProps {
  /** Called with the final transcribed text from Whisper. */
  onTranscription: (text: string) => void;
  /**
   * Called after a recording has been accepted by the user with an
   * optional audio playback URL (kept alive for the session).
   */
  onAccepted?: (entry: AcceptedRecording) => void;
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
  /** Show an in-card audio player in the review step (default true). */
  enablePlayback?: boolean;
  /** Show the VAD settings toggle (sensitivity + silence threshold). Default true. */
  showSettings?: boolean;
  /**
   * Optional emotion analysis result for the *current* transcription.
   * Parent computes this from the transcript and passes it back to be
   * rendered next to the editor in the review step.
   */
  emotion?: VoiceEmotion | null;
  /** Show recent recordings list (default true). */
  showHistory?: boolean;
  /** Max number of history entries to retain (default 6). */
  historyLimit?: number;
}

export type VoiceRecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "review"
  | "done"
  | "error"
  | "unsupported";

/** Coarse emotion shape — matches `analyzeVoiceEmotion`. */
export interface VoiceEmotion {
  primaryEmotion?: string;
  emotionalIntensity?: "low" | "medium" | "high";
  tearfulness?: { value: boolean; confidence: number };
  summary?: string;
}

export interface AcceptedRecording {
  id: string;
  transcript: string;
  createdAt: number;
  /** Per-session blob URL — only valid until the page unloads. */
  audioUrl?: string;
  /** MIME type of the audio blob. */
  mimeType?: string;
  emotion?: VoiceEmotion | null;
}

/** Pitch snapshot exposed to the UI. */
export interface PitchInfo {
  /** Estimated fundamental frequency in Hz, or null if undetected. */
  hz: number | null;
  /** Coarse category for display. */
  category: "low" | "medium" | "high" | "unknown";
  /**
   * Stability in 0..1 — higher = steadier pitch. Derived from the
   * coefficient of variation of recent pitch samples.
   */
  stability: number;
}
