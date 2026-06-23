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