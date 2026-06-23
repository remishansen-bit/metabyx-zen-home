import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("mobile viewport sizing (min-h-screen → min-h-dvh)", () => {
  const files = [
    "src/components/phone-frame.tsx",
    "src/routes/__root.tsx",
  ];
  it.each(files)("%s uses min-h-dvh and no min-h-screen", (file) => {
    const src = read(file);
    expect(src).toMatch(/min-h-dvh/);
    expect(src).not.toMatch(/min-h-screen/);
  });
});

describe("prefers-reduced-motion fallback", () => {
  const css = read("src/styles.css");

  it("declares a prefers-reduced-motion: reduce media query", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("tones down animation + transition durations globally", () => {
    const block = css
      .split("@media (prefers-reduced-motion: reduce)")[1]
      ?.split("}")
      .slice(0, 6)
      .join("}");
    expect(block).toBeTruthy();
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  it("disables the rise/fade/pulse micro-animations", () => {
    const tail = css.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";
    expect(tail).toMatch(/\.animate-rise/);
    expect(tail).toMatch(/\.animate-fade-in/);
    expect(tail).toMatch(/\.animate-pulse/);
    expect(tail).toMatch(/animation:\s*none\s*!important/);
  });
});

describe("VoiceRecorder accessibility surface across GCMP phases", () => {
  const session = read("src/routes/session.tsx");

  it("renders VoiceRecorder in Phase 1, 2, and 5 with an ariaLabel", () => {
    const labels = session.match(/ariaLabel="[^"]+"/g) ?? [];
    // Phase 1 (identify), Phase 2 (friction), Phase 5 (close)
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(session).toMatch(/Record the what-if branch/);
    expect(session).toMatch(/Record what you notice/);
    expect(session).toMatch(/Record the closing story/);
  });

  it("keeps the Back control keyboard-focusable with an aria-label", () => {
    expect(session).toMatch(/aria-label="Back"/);
  });
});

describe("VoiceInputButton low-confidence updates are screen-reader polite", () => {
  const voiceBtn = read("src/components/voice-input-button.tsx");
  it("uses polite aria-live patterns (no assertive shouting)", () => {
    expect(voiceBtn).not.toMatch(/aria-live=["']assertive["']/);
  });
  it("exposes mic state via accessible labels", () => {
    expect(voiceBtn).toMatch(/aria-label=/);
  });
});

describe("global toast surface (sonner) is mounted once at the root", () => {
  const root = read("src/routes/__root.tsx");
  it("imports and renders the Toaster inside RootComponent", () => {
    expect(root).toMatch(/from "..\/components\/ui\/sonner"/);
    expect(root).toMatch(/<Toaster[\s\S]*\/>/);
  });
  it("uses calm defaults (top-center, modest duration)", () => {
    expect(root).toMatch(/position="top-center"/);
    expect(root).toMatch(/duration=\{3500\}/);
  });
});

describe("global feedback helper wires the four key flows", () => {
  it("re-uses notify for library import / export / pdf / share / save", () => {
    const lib = read("src/routes/library.tsx");
    const branch = read("src/routes/branch.$id.tsx");
    const session = read("src/routes/session.tsx");
    for (const src of [lib, branch, session]) {
      expect(src).toMatch(/from "@\/lib\/feedback"/);
    }
    expect(lib).toMatch(/notify\.(loading|done|failed|saved|error)/);
    expect(branch).toMatch(/notify\.(saved|error|info)/);
    expect(session).toMatch(/notify\.(saved|error)/);
  });
});

describe("Phase 5 recap voice-over fails gracefully", () => {
  const session = read("src/routes/session.tsx");
  const stream = read("src/lib/tts-stream.ts");

  it("starts only from a user gesture (no auto-play on mount)", () => {
    // The play function is wired to onClick — there is no effect that calls
    // streamTts on render, which is what keeps it autoplay-safe and
    // friendly to prefers-reduced-motion users.
    expect(session).not.toMatch(/useEffect\([^)]*streamTts/);
    expect(session).toMatch(/onClick=\{playState === "playing" \? stop : play\}/);
  });

  it("surfaces the server's error message instead of a generic status code", () => {
    expect(stream).toMatch(/payload\?\.error/);
    expect(session).toMatch(/notify\.error\("Voice-over unavailable"/);
  });

  it("ignores user-initiated aborts so stopping playback isn't an error", () => {
    expect(session).toMatch(/AbortError/);
  });
});